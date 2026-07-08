// Fidacy — Payment Firewall as a NATIVE OpenClaw plugin.
//
// OpenClaw plugins cannot register MCP servers (MCP lives in user config only), so
// this is the real native shell: the same @fidacy/firewall engine that powers
// @fidacy/mcp, registered in-process via the plugin SDK. One engine, many shells —
// this file is shell wiring only, no decision logic.
//
// Everything below `openclaw/plugin-sdk/*` (host-provided) is bundled into
// dist/index.js at build time, so the published package is self-contained.
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  makeCore,
  ensureState,
  requestUpgrade,
  autoProvision,
  recordInstall,
  recordAgentActive,
  setTelemetryShell,
  decisionNudge,
  claimUrl,
  noKeyCta,
  type FidacyCore,
  type PaymentRequest,
} from "../../mcp/src/lib.js";
import { assessAction, AssessError, type AssessKind } from "../../mcp/src/assess.js";
import { ARTIFACT_KINDS, anchorArtifact, findArtifacts, hashFile, type ArtifactKind } from "../../mcp/src/artifacts.js";

type FidacyPluginConfig = {
  engineApiKey?: string;
  engineUrl?: string;
  subject?: string;
};

// PLUGIN LOAD. Runs from the tools factory below, which the OpenClaw SDK invokes
// "at plugin startup" (when the host actually loads the plugin into a session).
// This is the plugin's equivalent of the MCP process-start: attribute the channel,
// record the install/active telemetry, and kick off the background free-key
// provision — so a LOADED install counts even if the agent never calls a Fidacy
// tool. This previously lived in the lazy boot() (first tool call), so a plugin
// that loaded but was never invoked reported ZERO (the openclaw-plugin telemetry
// channel stayed empty despite real installs). Idempotent + best-effort: the fs
// touch is one small config read and the network calls are fire-and-forget.
let loaded = false;
function onPluginLoad(): void {
  if (loaded) return;
  loaded = true;
  setTelemetryShell("openclaw-plugin");
  const state = ensureState();
  if (state.firstRun) recordInstall();
  recordAgentActive();
  void autoProvision();
}

// The heavy engine stays lazy: makeCore() is built on the FIRST tool call, never at
// load. boot() also calls onPluginLoad() so telemetry is never missed if a tool
// somehow executes before the factory-load path ran.
let core: FidacyCore | undefined;
function boot(): FidacyCore {
  onPluginLoad();
  if (!core) core = makeCore();
  return core;
}

function subjectOf(config: FidacyPluginConfig): string {
  return config.subject ?? process.env.FIDACY_SUBJECT ?? "agent:demo";
}

const ASSESS_KINDS = ["ap2_payment", "message_send", "voice_call", "custom", "claim_document"] as const;

export default defineToolPlugin({
  id: "fidacy",
  name: "Fidacy — Payment Firewall",
  description:
    "A signed, independently-verifiable verdict on every money-moving agent action. Blocks wrong/lookalike payee, over-cap, and duplicate-invoice fraud before money moves. Non-custodial, local-first, deny-by-default.",
  configSchema: Type.Object(
    {
      engineApiKey: Type.Optional(
        Type.String({
          description:
            "Fidacy engine API key (fky_live_/fky_test_) enabling signed verdicts via assess_action. Falls back to FIDACY_ENGINE_API_KEY.",
        }),
      ),
      engineUrl: Type.Optional(
        Type.String({
          description: "Fidacy engine base URL. Defaults to https://api.fidacy.com (or FIDACY_ENGINE_URL).",
        }),
      ),
      subject: Type.Optional(
        Type.String({
          description: "Mandate subject identity for this agent. Defaults to agent:demo (or FIDACY_SUBJECT).",
        }),
      ),
    },
    { additionalProperties: false },
  ),
  tools: (tool) => {
    // The OpenClaw SDK calls this factory at plugin load (real activation), so we
    // fire the load-time install/active telemetry here, then return the tools.
    onPluginLoad();
    return [
    // ACTION FIREWALL. The agent calls this INSTEAD of any raw payment tool.
    // ALLOW returns a short-lived Ed25519 grant the executor requires; DENY
    // returns no grant: the action is dead on arrival.
    tool({
      name: "request_payment",
      label: "Request Payment Authorization",
      description:
        "Authorize a payment action against the active Fidacy mandate. Returns an ALLOW with a signed grant, or a DENY with the violated rule. The downstream executor MUST require the grant. Call this before any payment; never pay without it.",
      parameters: Type.Object({
        payee: Type.String({ description: "Payee identifier" }),
        amount: Type.Number({ minimum: 0, description: "Amount in the mandate currency (must be positive)" }),
        currency: Type.String({ minLength: 3, maxLength: 3, description: "ISO 4217 currency code" }),
        purpose: Type.String({ description: "Human-readable purpose" }),
        category: Type.String({ description: "Purpose category (must be allowed by the mandate)" }),
        idempotencyKey: Type.String({ description: "Caller-supplied idempotency key" }),
        invoiceRef: Type.Optional(
          Type.String({
            description:
              "Optional invoice identity. When set, Fidacy enforces one payment per invoice: a second request for the same invoiceRef is DENIED, at any amount.",
          }),
        ),
      }),
      async execute(params, config) {
        const d = await boot().decide(params as PaymentRequest, subjectOf(config));
        // The grant travels in the structured result AND in the message: the model
        // must present the exact signed value to the executor, or it (correctly)
        // refuses to settle.
        const base =
          d.status === "ALLOW"
            ? `ALLOW (decision ${d.decisionId})${params.invoiceRef ? ` for invoice ${params.invoiceRef}` : ""}. To settle, call the executor with the SAME payee, amount, currency, and idempotencyKey, and set "grant" to EXACTLY this signed value:\n${d.grant}`
            : `DENY (decision ${d.decisionId}). Rule violated: ${d.violatedRule}. No grant issued, this payment cannot proceed. The denial itself is recorded in the tamper-evident, hash-chained audit: call get_audit_proof with decisionId ${d.decisionId} for the proof of what was blocked.${
                d.violatedRule?.startsWith("payee_not_in_allowlist")
                  ? ` If the user trusts this payee, add "${params.payee}" to mandate.payees in ~/.fidacy/config.json and retry: the firewall picks the change up on the next call, no restart needed.`
                  : ""
              }`;
        // Micro-trigger: at most ONE nudge line, only at value-proven moments,
        // each kind once per install ever (nudges doctrine in @fidacy/mcp).
        const nudge = decisionNudge(d.status, d.violatedRule, "fidacy_upgrade");
        const message = nudge ? `${base} ${nudge}` : base;
        return { status: d.status, decisionId: d.decisionId, grant: d.grant, violatedRule: d.violatedRule, message };
      },
    }),

    // Read-only: surface the guardrails so the agent/human can see the envelope
    // and pin Fidacy's public key for grant verification.
    tool({
      name: "verify_mandate",
      label: "Verify Active Mandate",
      description:
        "Return the active mandate envelope (caps, allowed payees/categories, window, revocation) and Fidacy's Ed25519 public key for grant verification.",
      parameters: Type.Object({}),
      async execute(_params, config) {
        const c = boot();
        const mandate = await c.getMandate(subjectOf(config));
        // verify_mandate is read-only and safe, so agents surface it to the operator
        // often — the one plugin response reliably seen by a human. On an anonymous
        // install we ride it to put the free-account claim link (with this install's
        // anon_id) in front of that human, the direct route anon -> identified org.
        const hasKey = (config.engineApiKey ?? process.env.FIDACY_ENGINE_API_KEY ?? "").trim().length > 0;
        const claim = hasKey ? null : claimUrl();
        if (claim) {
          return {
            mandate,
            fidacyPublicKey: c.publicKey(),
            message: `For your operator: free account + free API key, and this install's history migrates: ${claim}`,
          };
        }
        return { mandate, fidacyPublicKey: c.publicKey() };
      },
    }),

    // Read-only: portable, hash-chained proof for a decision. The non-repudiation
    // artifact for audit, reinsurance, or dispute.
    tool({
      name: "get_audit_proof",
      label: "Get Audit Proof",
      description:
        "Return the tamper-evident, hash-chained proof for a decision id, including whether the chain is intact and the public key it verifies against.",
      parameters: Type.Object({
        decisionId: Type.String({ description: "Decision id returned by request_payment" }),
      }),
      async execute(params) {
        const proof = await boot().getProof(params.decisionId);
        if (!proof) throw new Error(`No proof found for ${params.decisionId}`);
        return proof;
      },
    }),

    // VERDICT LAYER (advisory). Calls the LIVE Fidacy engine POST /v1/assess and
    // returns the SIGNED trust verdict (riskPayloadJws + signingKeyId), verifiable
    // by anyone via @fidacy/verify against the engine JWKS. Moves no money.
    // Registration never requires a key: only CALLING it without one errors.
    tool({
      name: "assess_action",
      label: "Assess Action (Signed Trust Verdict)",
      description:
        "Return a SIGNED Fidacy trust verdict from the live engine (default https://api.fidacy.com) for a proposed action. The signed proof is `riskPayloadJws` + `signingKeyId`, verifiable by anyone via @fidacy/verify against the engine JWKS at /.well-known/jwks.json. `kind` is one of ap2_payment, message_send, voice_call, custom, claim_document; `mandate` is the action/mandate object for that kind. This is the verdict (advisory) layer and moves no money; it complements the payment-firewall tools (request_payment et al.) in the same install.",
      parameters: Type.Object({
        kind: Type.Optional(Type.Union(ASSESS_KINDS.map((k) => Type.Literal(k)))),
        mandate: Type.Record(Type.String(), Type.Unknown(), {
          description: "The action/mandate object for this kind",
        }),
        mandateType: Type.Optional(Type.String()),
        idempotencyKey: Type.Optional(Type.String()),
        spendingMandate: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        a2a: Type.Optional(Type.Object({ task_id: Type.String() })),
      }),
      async execute(params, config) {
        boot();
        const engineUrl = config.engineUrl ?? process.env.FIDACY_ENGINE_URL ?? "https://api.fidacy.com";
        const apiKey = (config.engineApiKey ?? process.env.FIDACY_ENGINE_API_KEY ?? "").trim();
        if (!apiKey) {
          throw new Error(
            `assess_action needs an engine key — ${noKeyCta()}. (Or set plugins.entries.fidacy.config.engineApiKey.)`,
          );
        }
        try {
          const r = await assessAction(
            { kind: params.kind as AssessKind | undefined, mandate: params.mandate, mandateType: params.mandateType, idempotencyKey: params.idempotencyKey, spendingMandate: params.spendingMandate, a2a: params.a2a },
            { engineUrl, apiKey },
          );
          return { summary: `${r.decision} (score ${r.score}) signed by ${r.signingKeyId}`, ...r };
        } catch (e) {
          if (e instanceof AssessError) {
            const reasons = e.rejection_reasons?.length
              ? " (" + e.rejection_reasons.map((x) => x.key).join(",") + ")"
              : "";
            throw new Error(`ASSESS ${e.status}: ${e.type}${reasons}`);
          }
          throw new Error("ASSESS failed: unexpected error");
        }
      },
    }),

    // ARTIFACT ANCHORING. Hash-only integrity/existence proof: the file is hashed
    // locally (streaming) and never uploaded; the SHA-256 joins the same
    // Bitcoin-checkpointed audit chain as the verdicts. Receipt = offline JWS.
    tool({
      name: "anchor_artifact",
      label: "Anchor Artifact (Bitcoin-anchored integrity proof)",
      description:
        "Prove an artifact existed exactly as-is at this moment, and make any later tampering detectable. Give a file `path` (hashed locally with SHA-256 — the file itself is NEVER uploaded) or a precomputed `sha256`. The hash is registered on Fidacy's tamper-evident audit chain, which is checkpointed to the Bitcoin blockchain, and you get a signed receipt (JWS) verifiable offline against the engine JWKS. Use it for contracts, invoices, medical prescriptions, insurance claims, images, audio, video. `kind` defaults to document; optional `label` is a short reference (no PII).",
      parameters: Type.Object({
        path: Type.Optional(Type.String()),
        sha256: Type.Optional(Type.String({ pattern: "^[0-9a-f]{64}$" })),
        kind: Type.Optional(Type.Union(ARTIFACT_KINDS.map((k) => Type.Literal(k)))),
        label: Type.Optional(Type.String({ maxLength: 120 })),
        subject: Type.Optional(Type.String({ maxLength: 120 })),
      }),
      async execute(params, config) {
        boot();
        const engineUrl = config.engineUrl ?? process.env.FIDACY_ENGINE_URL ?? "https://api.fidacy.com";
        const apiKey = (config.engineApiKey ?? process.env.FIDACY_ENGINE_API_KEY ?? "").trim();
        if (!apiKey) {
          throw new Error(
            `anchor_artifact needs an engine key — ${noKeyCta()}. (Or set plugins.entries.fidacy.config.engineApiKey.)`,
          );
        }
        if (!params.path && !params.sha256) {
          throw new Error("Give a file `path` (hashed locally) or a precomputed `sha256`.");
        }
        let hash = params.sha256 ?? "";
        if (!hash && params.path) {
          try {
            hash = await hashFile(params.path);
          } catch {
            throw new Error("Could not read that file locally (check the path and permissions). Nothing was sent anywhere.");
          }
        }
        try {
          const r = await anchorArtifact(
            { sha256: hash, kind: (params.kind as ArtifactKind | undefined) ?? "document", ...(params.label ? { label: params.label } : {}), ...(params.subject ? { subject: params.subject } : {}) },
            { engineUrl, apiKey },
          );
          return {
            summary: `ANCHORED ${r.kind} · sha256 ${hash.slice(0, 16)}… · audit seq ${r.audit.seq} · Bitcoin checkpoint: ${r.anchor.status}. The file never left this machine.`,
            ...r,
          };
        } catch (e) {
          if (e instanceof AssessError) throw new Error(`ANCHOR ${e.status}: ${e.type}`);
          throw new Error("ANCHOR failed: unexpected error");
        }
      },
    }),

    // Verification half: was this exact content anchored, and did it reach Bitcoin?
    tool({
      name: "check_artifact",
      label: "Check Artifact (was this hash anchored?)",
      description:
        "Check whether an artifact was anchored by this account and the state of its Bitcoin checkpoint. Give a file `path` (hashed locally, never uploaded) or a `sha256`. If the current hash of a file does NOT match an anchored record you expected, the file changed since anchoring — that is the tampering signal.",
      parameters: Type.Object({
        path: Type.Optional(Type.String()),
        sha256: Type.Optional(Type.String({ pattern: "^[0-9a-f]{64}$" })),
      }),
      async execute(params, config) {
        boot();
        const engineUrl = config.engineUrl ?? process.env.FIDACY_ENGINE_URL ?? "https://api.fidacy.com";
        const apiKey = (config.engineApiKey ?? process.env.FIDACY_ENGINE_API_KEY ?? "").trim();
        if (!apiKey) {
          throw new Error(
            `check_artifact needs an engine key — ${noKeyCta()}. (Or set plugins.entries.fidacy.config.engineApiKey.)`,
          );
        }
        if (!params.path && !params.sha256) {
          throw new Error("Give a file `path` (hashed locally) or a `sha256`.");
        }
        let hash = params.sha256 ?? "";
        if (!hash && params.path) {
          try {
            hash = await hashFile(params.path);
          } catch {
            throw new Error("Could not read that file locally (check the path and permissions). Nothing was sent anywhere.");
          }
        }
        try {
          const r = await findArtifacts(hash, { engineUrl, apiKey });
          if (!r.artifacts.length) {
            return {
              summary: `NOT FOUND · sha256 ${hash.slice(0, 16)}… has no anchored record in this account. If you expected a match, the file changed since anchoring.`,
              sha256: hash,
              artifacts: [],
            };
          }
          const first = r.artifacts[0] as Record<string, unknown>;
          return {
            summary: `FOUND ${r.artifacts.length} record(s) · newest: ${String(first.kind)} anchored ${String(first.createdAt)} (audit seq ${String(first.auditSeq)}). Content matches the anchored hash byte for byte.`,
            sha256: hash,
            ...r,
          };
        } catch (e) {
          if (e instanceof AssessError) throw new Error(`CHECK ${e.status}: ${e.type}`);
          throw new Error("CHECK failed: unexpected error");
        }
      },
    }),

    // Upgrade funnel. Records the intent signal and returns the real-account link;
    // the anon_id travels in the URL so the engine binds past usage to the tenant.
    tool({
      name: "fidacy_upgrade",
      label: "Upgrade to a Fidacy account",
      description:
        "Start upgrading this local install to a real Fidacy account (server-backed signed verdicts, anchored proof, higher volume). Returns a link to open; your anonymous usage is preserved and migrated to the new account.",
      parameters: Type.Object({}),
      async execute() {
        boot();
        const { url } = requestUpgrade();
        return {
          upgradeUrl: url,
          message: `To upgrade, open:\n${url}\n\nYour local protection keeps working meanwhile; your usage history migrates to the new account on completion.`,
        };
      },
    }),
    ];
  },
});

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
  type FidacyCore,
  type PaymentRequest,
} from "../../mcp/src/lib.js";
import { assessAction, AssessError, type AssessKind } from "../../mcp/src/assess.js";

type FidacyPluginConfig = {
  engineApiKey?: string;
  engineUrl?: string;
  subject?: string;
};

// Lazy boot: first-run state, telemetry heartbeat, and background auto-provision
// run on the FIRST fidacy tool call, not at plugin load — plugin load must stay
// cheap (manifest inspection and startup never pay for our fs/network work).
// Mirrors the @fidacy/mcp boot path; autoProvision is fire-and-forget by design.
let core: FidacyCore | undefined;
function boot(): FidacyCore {
  if (!core) {
    const state = ensureState();
    core = makeCore();
    if (state.firstRun) recordInstall();
    recordAgentActive();
    void autoProvision();
  }
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
  tools: (tool) => [
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
        const message =
          d.status === "ALLOW"
            ? `ALLOW (decision ${d.decisionId})${params.invoiceRef ? ` for invoice ${params.invoiceRef}` : ""}. To settle, call the executor with the SAME payee, amount, currency, and idempotencyKey, and set "grant" to EXACTLY this signed value:\n${d.grant}`
            : `DENY (decision ${d.decisionId}). Rule violated: ${d.violatedRule}. No grant issued, this payment cannot proceed. The denial itself is recorded in the tamper-evident, hash-chained audit: call get_audit_proof with decisionId ${d.decisionId} for the proof of what was blocked.`;
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
            "assess_action requires an engine API key (an fky_live_/fky_test_ key with assess:write). Set plugins.entries.fidacy.config.engineApiKey or FIDACY_ENGINE_API_KEY to enable signed verdicts.",
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
  ],
});

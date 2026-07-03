// @fidacy/session — conversation receipts for AI chatbots.
//
// Every message is hashed into a running, tamper-evident chain LOCALLY: the
// content never leaves your infrastructure. At session close, only the final
// 64-hex digest is anchored via Fidacy's /v1/artifacts (kind: conversation),
// which rides a tamper-evident audit chain checkpointed to the Bitcoin
// blockchain. Both sides of the conversation can then hold the receipt: the
// company for its audit trail, the customer as proof of exactly what was said.
//
// The digest recipe is PUBLIC and reproducible (see digestTranscript): anyone
// holding the exported transcript recomputes the same hash offline and checks
// it against fidacy.com/verify — no account, no trust in Fidacy required.
//
// Secret safety: the API key is never logged or attached to an error.

import { createHash } from "node:crypto";

export type Role = "user" | "assistant" | "system" | "tool";

/** One exported transcript entry. `i` is the 0-based position, `ts` ISO-8601. */
export interface TranscriptMessage {
  i: number;
  role: Role;
  content: string;
  ts: string;
}

export interface SessionOptions {
  /** Anchored as the artifact kind. Default "conversation". */
  kind?: string;
  /** Short reference for the anchored record (a case id, a ticket number). No PII. */
  label?: string;
  /** Identity of the assistant/agent side. Default "agent:default". */
  subject?: string;
}

export interface AnchorOptions {
  /** Fidacy engine API key (fky_live_/fky_test_) with scope assess:write. */
  apiKey: string;
  /** Engine base URL. Default https://api.fidacy.com. */
  engineUrl?: string;
}

export interface AnchorReceipt {
  artifactId: string;
  kind: string;
  sha256: string;
  subject: string;
  ts: string;
  digest: string;
  audit: { seq: number; hash: string };
  anchor: { status: string };
  receipt: string;
  [k: string]: unknown;
}

const GENESIS = "fidacy.session.v1";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Minimal RFC 8785-style canonical JSON for the flat transcript-message shape:
 * keys sorted lexicographically, no whitespace. Enough for objects of
 * string/number values, which is all the recipe ever hashes.
 */
function canonical(obj: Record<string, string | number>): string {
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(obj[k]!)}`).join(",") + "}";
}

/** Chain step, exposed for verifiers: h_i = sha256(h_prev || "|" || leaf_i). */
export function chainStep(prevHead: string, message: TranscriptMessage): string {
  const leaf = sha256Hex(canonical({ i: message.i, role: message.role, content: message.content, ts: message.ts }));
  return sha256Hex(`${prevHead}|${leaf}`);
}

/**
 * The full public recipe: recompute a transcript's session digest from its
 * exported messages. h_0 = sha256("fidacy.session.v1"); each message advances
 * the chain via chainStep. Returns the final head (the sha256 that gets
 * anchored). An empty transcript returns h_0.
 */
export function digestTranscript(messages: TranscriptMessage[]): string {
  let head = sha256Hex(GENESIS);
  for (const m of messages) head = chainStep(head, m);
  return head;
}

export interface FidacySession {
  /** Append a message to the chain. Returns its transcript index. */
  add(role: Role, content: string, ts?: string): number;
  /** Current chain head (the sha256 that would be anchored right now). */
  digest(): { sha256: string; messages: number };
  /** The exportable transcript: store it, or hand it to the customer with the receipt. */
  export(): { v: string; kind: string; label?: string; subject: string; messages: TranscriptMessage[]; sha256: string };
  /**
   * Anchor the current head via POST /v1/artifacts. Returns the signed receipt.
   * Only the 64-hex digest travels; no message content is ever sent.
   */
  anchor(opts: AnchorOptions): Promise<AnchorReceipt>;
  /** Public verification URL for this session's digest (no account needed). */
  verifyUrl(): string;
}

export function createSession(options: SessionOptions = {}): FidacySession {
  const kind = options.kind ?? "conversation";
  const subject = options.subject ?? "agent:default";
  const messages: TranscriptMessage[] = [];
  let head = sha256Hex(GENESIS);

  return {
    add(role, content, ts) {
      const m: TranscriptMessage = { i: messages.length, role, content, ts: ts ?? new Date().toISOString() };
      messages.push(m);
      head = chainStep(head, m);
      return m.i;
    },

    digest() {
      return { sha256: head, messages: messages.length };
    },

    export() {
      return {
        v: GENESIS,
        kind,
        ...(options.label ? { label: options.label } : {}),
        subject,
        messages: [...messages],
        sha256: head,
      };
    },

    async anchor(opts) {
      const base = (opts.engineUrl ?? "https://api.fidacy.com").replace(/\/+$/, "");
      const u = new URL(base);
      const isLocalHttp =
        u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
      if (u.protocol !== "https:" && !isLocalHttp) {
        throw new Error("engineUrl must be https (or http://localhost for development)");
      }
      const res = await fetch(`${base}/v1/artifacts`, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          sha256: head,
          kind,
          ...(options.label ? { label: options.label } : {}),
          subject,
        }),
      });
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new Error(`anchor failed: HTTP ${res.status}`);
      }
      if (res.status !== 201) {
        const code = typeof (json as Record<string, unknown>)?.error === "string"
          ? String((json as Record<string, unknown>).error)
          : "engine_error";
        throw new Error(`anchor failed: ${code} (HTTP ${res.status})`);
      }
      return json as AnchorReceipt;
    },

    verifyUrl() {
      return `https://fidacy.com/verify?sha256=${head}`;
    },
  };
}

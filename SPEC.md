# The Fidacy Grant

**An open specification for provable payment authorization by AI agents, with a liability allocation rule.**

Version 1.0 (draft) · 2026-07-04 · Apache-2.0 · maintained at [github.com/lucaslubi/fidacy-mcp](https://github.com/lucaslubi/fidacy-mcp)

---

## Why this exists

Enterprises are not blocked from adopting AI agents by model quality. They are blocked by one unanswered question: **when the agent gets it wrong, who takes the loss?**

An agent can be prompt-injected into paying a lookalike payee, paying the same invoice twice, or paying over its limit. Today there is no standard way to prove, to a counterparty, an auditor, an insurer or a court, that a specific payment was or was not authorized. So compliance teams say no, agents stay in demos, and the productivity stays on the table.

The Fidacy Grant closes that gap with two pieces:

1. **A verifiable authorization artifact.** A short-lived, Ed25519-signed grant that binds a specific payment (payee, amount, currency, invoice) to a decision made against a signed mandate. Anyone can verify it offline. No one has to trust Fidacy or any payment rail.
2. **A liability allocation rule.** A simple, adoptable-by-reference rule for who bears the loss when a payment settles with or without a valid grant. This is the same mechanism that drove adoption of 3-D Secure in card payments: the party that skips the check keeps the risk.

Payment rails cannot be the neutral arbiter of their own transactions. Fidacy holds no funds, executes no payments, and profits from no transaction, which is what makes this artifact usable as neutral evidence between parties that do.

## 1. The Grant format

A grant is a compact string of two base64url segments separated by a dot:

```
<payload>.<signature>
```

`payload` is the base64url encoding of the UTF-8 canonical JSON (sorted keys, no whitespace) of:

| Field | Type | Meaning |
|---|---|---|
| `decisionId` | string (UUID) | The decision that produced this grant. Also the key into the audit chain. |
| `subject` | string | The agent identity the mandate authorizes. |
| `payee` | string | The exact payee this grant authorizes. |
| `amount` | number | The exact amount, in `currency` units. |
| `currency` | string | ISO 4217 code. |
| `exp` | number | Expiry, Unix epoch milliseconds. Grants are short-lived (reference: 120 seconds). |
| `invoiceRef` | string (optional) | Invoice identity. When present, one payment per invoice is enforced upstream. |

`signature` is the base64url Ed25519 signature over the raw `payload` segment.

## 2. Verification (normative)

An executor, counterparty or auditor verifies a grant with these checks, in order. All MUST pass.

1. The grant splits into exactly two non-empty segments.
2. The Ed25519 signature verifies over the payload segment against the issuer public key (see key discovery, section 3).
3. `Date.now() <= exp`.
4. `payee`, `amount`, `currency` and `invoiceRef` each equal, exactly, the payment about to be executed. A mismatch in any field invalidates the grant for that payment.

A reference implementation ships in [`@fidacy/verify`](https://www.npmjs.com/package/@fidacy/verify) (open source, zero dependencies) and in `verifyGrant` of the firewall engine. Verification is offline: no call to Fidacy is required.

**Single use.** An executor MUST treat a grant as single-use. The reference executor supports durable redemption so a grant cannot be replayed across process restarts.

## 3. Key discovery

- **Hosted verdicts:** the signing keys are published at `https://api.fidacy.com/.well-known/jwks.json` and as `did:web:fidacy.com`. Multiple keys may be live during rotation.
- **Local-first firewall:** the firewall's public key is returned by its `verify_mandate` tool. For durable local grants, operators pin a stable key (`FIDACY_SIGNING_KEY_B64`).

## 4. The audit chain and the Bitcoin anchor

Every decision, ALLOW and DENY alike, is appended to a hash-chained, tamper-evident audit log. On the hosted tier, the head of this chain is committed to Bitcoin via Merkle batching (RFC 6962) and OpenTimestamps. The result: months later, any party can prove what was decided, and that the record was not rewritten afterward, verifying offline against the Bitcoin blockchain. Not even Fidacy can alter a past decision.

For disputes, the evidence of record is: the grant (or its absence), the decision entry in the audit chain, and the anchor proof.

## 5. The Liability Allocation Rule (v1)

Parties adopt this rule by referencing "Fidacy Grant Liability Rule v1" in their agreements (merchant terms, platform terms, service agreements). It allocates loss for agent-initiated payments between adopting parties:

- **R1.** An executor MUST NOT settle an agent-initiated payment without verifying a valid, matching, unexpired, unredeemed grant.
- **R2.** If a party settles an agent-initiated payment **without** a valid grant, that party bears the resulting loss. Skipping the check keeps the risk.
- **R3.** If a payment settles **with** a val
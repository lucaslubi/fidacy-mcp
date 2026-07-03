# The Fidacy Grant, v1

An open specification for a signed, independently verifiable authorization to move
money (or take a high-consequence action), plus a liability rule that anyone can
adopt by reference.

Status: draft, v1. License: CC BY 4.0. The reference implementation is
[`@fidacy/mcp`](https://www.npmjs.com/package/@fidacy/mcp) and
[`@fidacy/verify`](https://www.npmjs.com/package/@fidacy/verify), both Apache-2.0.

---

## Why this exists

A company that lets an AI agent act at scale runs into one wall, and it is not a
technical wall. It is a liability wall.

The moment your agent can move money, send a binding message, delete data, or
approve a claim, someone has to answer a question that has no good answer today:
when the agent does the wrong thing, who is responsible, and how do you prove what
was authorized? Your own log is not evidence. You wrote it, so you can be accused
of writing it after the fact. Without a neutral, verifiable proof of authorization,
every autonomous action is a liability you personally carry.

This is why adoption stalls. A CFO will not sign off on agents that can spend when
the failure mode is "we lose money and cannot prove it was not our fault." A
compliance officer in a regulated industry will not approve agents at scale when
there is no tamper-evident record they can hand to an auditor or a regulator. So
the company waits, and watches competitors that move faster, and falls behind. In
some markets entire regions are stuck, running their agent strategy years behind,
not because the models are not ready, but because the accountability layer is not
there.

The Fidacy Grant is that layer. It gives every authorized action a proof that
someone other than you can verify, and it defines a rule that shifts the liability
off the party that honored a valid grant. It turns "I cannot let the agent do this,
I would be the one who pays" into "the agent can do this, and if something goes
wrong the proof shows exactly what was and was not authorized." That is the
difference between an agent you supervise by hand and an agent you can trust at
scale.

---

## What a Grant is

A Grant is a short-lived, cryptographically signed statement that a specific action
was authorized against a specific mandate, bound to the exact parameters of that
action. It is issued only when a request passes the firewall (deny-by-default). A
denied request produces no Grant, so an action with no matching Grant is, by
definition, unauthorized.

A Grant is not money and does not move money. It is an authorization proof. The
party that actually settles the payment (the executor, the rail, the PSP) verifies
the Grant before moving funds. This separation is deliberate: the issuer of the
Grant never holds funds, which is what lets it be a neutral third party rather than
an interested one.

## Wire format

A Grant is a single ASCII string with two base64url parts separated by a dot:

```
<body>.<signature>
```

`body` is the base64url encoding of a deterministically serialized JSON payload
(keys serialized in a stable order so the signature is reproducible). `signature`
is the base64url Ed25519 signature over the exact `body` string.

The payload:

```json
{
  "decisionId": "7a0c5bdd-89d0-45b6-b34e-379a6ea8f96c",
  "subject": "agent:treasury-bot",
  "payee": "acme-supplies",
  "amount": 1840.0,
  "currency": "USD",
  "exp": 1782959007399,
  "invoiceRef": "INV-7231"
}
```

| Field        | Type    | Meaning                                                                 |
|--------------|---------|-------------------------------------------------------------------------|
| `decisionId` | string  | Unique id of the decision. Ties the Grant to its audit record.          |
| `subject`    | string  | The agent identity the Grant was issued to.                             |
| `payee`      | string  | The authorized counterparty. The executor MUST match this exactly.      |
| `amount`     | number  | The authorized amount, in `currency` units.                             |
| `currency`   | string  | ISO 4217 code.                                                          |
| `exp`        | number  | Expiry, Unix epoch milliseconds. Grants are short-lived by design.      |
| `invoiceRef` | string? | Optional invoice identity. When present, one Grant per invoice.         |

## Verification (the non-bypass gate)

Any party can verify a Grant offline against the issuer's public key. No call back
to the issuer is required, and no trust in the issuer is required. Verification MUST
check all of the following, and reject on the first failure:

1. The string has exactly two dot-separated, non-empty base64url parts.
2. The Ed25519 signature over `body` verifies against the issuer's pinned public
   key (published at the issuer's JWKS, for the reference issuer
   `https://api.fidacy.com/.well-known/jwks.json`).
3. `now <= exp`. An expired Grant is rejected.
4. `payload.payee`, `payload.amount`, `payload.currency`, and `payload.invoiceRef`
   each equal the parameters of the payment actually about to execute.

Step 4 is what stops a hijacked or hallucinated payment. A Grant authorizes one
exact payment. Swap the payee, change the amount, or replay it for a different
invoice, and the Grant no longer matches, so the executor rejects it. There is no
"close enough."

Reference verifier (`@fidacy/verify` and `@fidacy/firewall`):

```js
import { verifyGrant } from "@fidacy/firewall/grant";

const check = verifyGrant(issuerPublicKeyPem, grant, {
  payee: "acme-supplies",
  amount: 1840.0,
  currency: "USD",
  invoiceRef: "INV-7231",
});
// check.valid === true  → safe to settle
// check.valid === false → check.reason tells you why (invalid_signature,
//                          grant_expired, payee_mismatch, amount_mismatch, …)
```

## The liability rule (adopt by reference)

The Grant is only half of what unblocks adoption. The other half is a rule that
reallocates responsibility, so that honoring the rule is safer than ignoring it.
Any party (a PSP, a marketplace, an executor, an insurer, a merchant) MAY adopt the
following rule by reference in its own terms:

> **Fidacy Grant Liability Rule, v1.**
> A party that settles a payment (or executes a high-consequence action) on behalf
> of an agent SHOULD require a valid Grant, verified per this specification, that
> matches the exact parameters of that action.
>
> 1. If the party settled an action **with** a valid, matching, unexpired Grant,
>    and the action later proves to have been unauthorized, the authorization
>    decision is attributable to the mandate and the issuer's verdict, not to the
>    settling party. The settling party acted on cryptographic proof of
>    authorization and is not the party that mis-authorized.
> 2. If the party settled an action **without** a valid matching Grant, the party
>    accepted the action on its own authority, and the resulting loss is attributed
>    to that party.
>
> The tamper-evident, hash-chained audit that backs each `decisionId` (optionally
> anchored to an external timestamp such as Bitcoin via OpenTimestamps) is the
> evidence of record for resolving which of the two cases applies.

This is the same mechanism that drove adoption of card-network liability shift: not
because anyone loved the extra step, but because without it you ate the loss. The
rule turns the Grant from "nice to have" into "the thing your counterparty asks you
for," which is how a verification layer becomes standard.

Nothing here is legal advice, and adopting the rule does not create a contract with
Fidacy. It is a shared convention two parties can point at, the way two servers
point at TLS without either one owning it.

## Relationship to AP2 and x402

The Fidacy Grant does not replace payment-authorization protocols like Google's AP2
or settlement protocols like x402. It complements them. AP2 defines a signed
*mandate* format governed by the payment networks. The Fidacy Grant is a
*neutral, rail-independent verification and enforcement* over an authorized action,
issued by a party that settles nothing and therefore has no incentive to
mis-certify. Where an AP2 mandate is present, a Fidacy issuer can verify that the
mandate was honored and bind the Grant to it. The networks cannot be the neutral
referee of their own transactions; that is the position this Grant is designed to
fill.

## Non-payment actions

The same structure applies to any high-consequence action: sending an external
message, deleting data, deploying code, approving a claim, signing a document. The
payload substitutes action-specific fields for `payee`/`amount`/`currency`, and the
verification and liability rule are unchanged: a valid matching Grant, or the action
is unauthorized and the loss is the actor's.

## Versioning

This is v1. Breaking changes to the payload shape or verification rules will bump
the version. The reference implementation reports its own version in the MCP
handshake and in the issued audit records.

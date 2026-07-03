# @fidacy/session

Conversation receipts for AI chatbots.

Your support bot talks to customers about claims, prescriptions, refunds,
contracts. When a dispute comes, the question is always the same: what exactly
was said, and can either side prove the transcript wasn't edited after the
fact? A court already answered what happens without proof (Air Canada, 2024:
the airline was held to what its chatbot said).

This SDK gives every session a tamper-evident digest, computed **locally**,
message by message. At session close you anchor the digest through
[Fidacy](https://fidacy.com), where it joins an audit chain checkpointed to the
Bitcoin blockchain, and you get a signed receipt. Hand the verify link to the
customer too: proof both sides can hold is the only proof that settles
arguments.

**The transcript never leaves your infrastructure.** Only a 64-hex SHA-256
travels. That is the whole privacy story, and it is why this works for
hospitals and insurers.

## Install

```bash
npm i @fidacy/session
```

## Get a key (one minute, free)

Anchoring needs a Fidacy engine API key (`fky_live_…`/`fky_test_…`) with the
`assess:write` scope. Sign up free at
[app.fidacy.com](https://app.fidacy.com/signup), open API keys, mint one, and
export it as `FIDACY_ENGINE_API_KEY`. Everything below the anchor call
(hashing, digests, offline verification) works with no key at all.

## Use

```ts
import { createSession } from "@fidacy/session";

const session = createSession({ kind: "conversation", label: "case-4711" });

// wire into your chat loop
session.add("user", "I want to file a claim for water damage.");
session.add("assistant", "I can help. When did it happen?");
session.add("user", "Last Tuesday.");

// at session close: anchor the digest (content never leaves your machine)
const receipt = await session.anchor({ apiKey: process.env.FIDACY_ENGINE_API_KEY! });

// store the transcript + receipt; give the customer the public verify link
const transcript = session.export();
console.log(session.verifyUrl()); // https://fidacy.com/verify?sha256=…
```

## Verify, without trusting anyone

The digest recipe is public. Anyone holding the exported transcript recomputes
it offline:

```ts
import { digestTranscript } from "@fidacy/session";
digestTranscript(transcript.messages) === transcript.sha256; // true, or it was tampered
```

- `h_0 = sha256("fidacy.session.v1")`
- `leaf_i = sha256(canonicalJson({ i, role, content, ts }))`
- `h_i = sha256(h_{i-1} + "|" + leaf_i)`

The final head is what gets anchored. Check any digest at
[fidacy.com/verify](https://fidacy.com/verify) (no account), or via the public
API: `GET https://api.fidacy.com/v1/verify/artifact?sha256=<hex>`. The signed
receipt verifies against the engine JWKS at
`https://api.fidacy.com/.well-known/jwks.json`.

Changing one character of one message, reordering two messages, or dropping a
message produces a different digest. That mismatch is the tampering signal.

## What this is not

Fidacy never sees, stores or judges the conversation content. This is
integrity and existence proof, not content moderation. To gate what your bot
may **commit to** (refunds, quotes, payouts), pair it with the
[Fidacy firewall](https://fidacy.com): promises without a signed grant don't
bind.

Apache-2.0.

# @fidacy/openclaw-plugin

![Fidacy blocks a BEC lookalike-payee payment, then allows the legit one with a signed Ed25519 grant](https://raw.githubusercontent.com/lucaslubi/fidacy-mcp/main/assets/fidacy-firewall-demo.svg)

Fidacy payment firewall as a **native OpenClaw plugin**. Registers five agent tools
in-process (no MCP subprocess, no `npx` spawn):

- `request_payment` — authorize a payment against the active signed mandate.
  ALLOW returns a short-lived Ed25519 grant the executor requires; DENY returns the
  violated rule and no grant.
- `verify_mandate` — the active mandate envelope + Fidacy's public key.
- `get_audit_proof` — tamper-evident, hash-chained proof for any decision.
- `assess_action` — a SIGNED trust verdict from the live Fidacy engine
  (requires an engine API key), verifiable by anyone via `@fidacy/verify`.
- `fidacy_upgrade` — upgrade the local install to a real Fidacy account.

Same engine as [`@fidacy/mcp`](https://www.npmjs.com/package/@fidacy/mcp) — one
engine, many shells. Local-first, deny-by-default, non-custodial: Fidacy authorizes,
it never holds funds.

## To everyone who installed Fidacy

You are one of ~170 installs that have made 2,100+ real firewall decisions to
date, over 99% of them blocks. Thank you. Two things worth a minute of your time:

1. **See and claim what YOUR install blocked.** Your install carries a private,
   anonymous id on your machine (we never learn who you are unless you choose to).
   Run `grep anon_id ~/.fidacy/config.json`, then open
   `https://fidacy.com/claim?ref=<that id>`. One click turns your local history
   into a free account with server-signed, Bitcoin-anchored verdicts.

2. **Founding partner, 5 seats.** A full year of the evidence layer at $10,800
   instead of $18,000, wired in by the founder, 30-day full refund:
   [fidacy.com/partners](https://fidacy.com/partners)

Lucas de Lima, founder

## Install (2 minutes)

**Step 1 — get your free API key** at
[app.fidacy.com/signup](https://app.fidacy.com/signup) (free tier, no card).

**Step 2 — install and set the key:**

```bash
openclaw plugins install @fidacy/openclaw-plugin
```

Plugin config (`plugins.entries.fidacy.config`):

```json
{
  "engineApiKey": "fky_live_...",
  "engineUrl": "https://api.fidacy.com",
  "subject": "agent:my-agent"
}
```

`engineApiKey` enables signed verdicts (`assess_action`) and keeps the firewall
active past the anonymous trial. Environment variables (`FIDACY_ENGINE_API_KEY`,
`FIDACY_ENGINE_URL`, `FIDACY_SUBJECT`) are the fallback. Decisions run locally,
deny-by-default (deny-unknown-payee + per-tx cap); add trusted payees/caps in
`~/.fidacy/config.json`.

**No key yet?** The install works anonymously for its first **20 firewall
decisions**, then fails closed (payments denied with `activation_required`) until
the free key is set. Claim an anonymous install's history:
`grep anon_id ~/.fidacy/config.json`, then open
`https://fidacy.com/claim?ref=<that id>`.

Verify any verdict yourself: https://api.fidacy.com/.well-known/jwks.json

## Prefer MCP instead?

If you'd rather run Fidacy as an MCP server (out-of-process), use
`openclaw mcp add fidacy --command npx --arg -y --arg @fidacy/mcp` — same tools,
same engine. This plugin is the native, in-process variant.

## Build (development)

```bash
pnpm --filter @fidacy/openclaw-plugin build      # esbuild → dist/index.js (self-contained)
pnpm --filter @fidacy/openclaw-plugin typecheck  # tsc against the real openclaw plugin-sdk types
```

`openclaw/plugin-sdk/*` stays external (the host provides it at runtime); everything
else — the shared `@fidacy/firewall` engine and `@fidacy/mcp` shell wiring — is
inlined so the published package is self-contained.

Apache-2.0 · https://fidacy.com

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

## Install

```bash
openclaw plugins install @fidacy/openclaw-plugin
```

Zero config to start (deny-unknown-payee + per-tx cap). Add trusted payees/caps in
`~/.fidacy/config.json`. Optional plugin config (`plugins.entries.fidacy.config`):

```json
{
  "engineApiKey": "fky_live_...",
  "engineUrl": "https://api.fidacy.com",
  "subject": "agent:my-agent"
}
```

`engineApiKey` enables signed verdicts (`assess_action`). Environment variables
(`FIDACY_ENGINE_API_KEY`, `FIDACY_ENGINE_URL`, `FIDACY_SUBJECT`) are the fallback.

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

## Source note

This directory mirrors `packages/openclaw-plugin` from the Fidacy monorepo for
provenance. The build imports the `@fidacy/mcp` shell wiring from its sibling
workspace package (`../../mcp/src/lib.js`), so `pnpm build` runs in the monorepo
context; the published artifact is the self-contained `dist/index.js` produced
there (engine inlined, `openclaw/plugin-sdk/*` external).

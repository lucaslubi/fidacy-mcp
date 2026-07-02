# Changelog

## 0.1.1 — 2026-07-02

- README: animated demo (BEC lookalike-payee DENY → legit ALLOW with signed
  grant) for the ClawHub/npm listing. No code changes.

## 0.1.0 — 2026-07-02

First release. Fidacy payment firewall as a native OpenClaw plugin:

- Five in-process agent tools via `defineToolPlugin` (no MCP subprocess):
  `request_payment`, `verify_mandate`, `get_audit_proof`, `assess_action`,
  `fidacy_upgrade`.
- Same engine as `@fidacy/mcp` (shared `@fidacy/firewall`): deny-by-default
  local mandate, Ed25519 grants, hash-chained audit, duplicate-invoice guard.
- Plugin config (`engineApiKey`, `engineUrl`, `subject`) with `FIDACY_*` env
  fallback; `engineApiKey` enables signed verdicts from the live engine.
- Built against `openclaw@2026.6.11` plugin-sdk types; bundle is self-contained
  (`openclaw/plugin-sdk/*` external, engine inlined).

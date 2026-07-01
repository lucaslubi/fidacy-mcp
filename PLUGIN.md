# ClawHub Plugin listing — Fidacy

**Name:** Fidacy — Payment Firewall for Agents
**Type:** Plugin (MCP server)
**Publisher:** Zeepcode Group (@lucaslubi)
**npm:** `@fidacy/mcp` (latest) · **License:** Apache-2.0 · **Home:** https://fidacy.com

## One-liner
A signed, independently-verifiable verdict on every agent payment — blocks the
wrong payee, over-cap, and duplicate-invoice fraud *before* money moves. Free,
local-first, non-custodial.

## Short description (listing body)
Your OpenClaw agent can be prompt-injected or hallucinate into a payment: wrong
payee, inflated amount, an invoice paid twice. Fidacy is a drop-in MCP server that
gates every money-moving action against a cryptographically signed mandate and
returns a verdict **anyone can verify** against public keys — no need to trust us.
Runs locally, offline, deny-by-default, no account. Upgrade to the hosted core for
multi-tenant mandates and a durable audit anchor.

**Tools:** `request_payment` (ALLOW+signed grant / DENY+rule), `verify_mandate`,
`get_audit_proof` (tamper-evident hash chain), `assess_action` (signed trust
verdict), `upgrade`.

**Pairs with the `fidacy-payment-firewall` skill** — the skill tells the agent to
gate payments through these tools.

## Install (MCP config)
```json
{
  "mcpServers": {
    "fidacy": { "command": "npx", "args": ["-y", "@fidacy/mcp"] }
  }
}
```
Zero config to start (deny-unknown-payee + per-tx cap). Add trusted payees/caps in
`~/.fidacy/config.json`; set `FIDACY_ENGINE_API_KEY` to enable signed verdicts.

## Tags
mcp, payments, security, firewall, trust, verdict, ed25519, ap2, openclaw, agents

## Links
- npm: https://www.npmjs.com/package/@fidacy/mcp
- Verify a verdict yourself: https://api.fidacy.com/.well-known/jwks.json
- Works with: Claude Code, Claude Desktop, OpenClaw, Hermes, Brex CrabTrap

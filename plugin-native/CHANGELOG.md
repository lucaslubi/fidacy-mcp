# Changelog

## 0.2.2

README: a Security and privacy section answering the ClawHub audit point by
point (telemetry and provisioning opt-outs, local state paths, what
FIDACY_SIGNING_KEY_B64 is, no hardcoded secrets in the bundle). No code change.

## 0.2.1

Manifest catch-up: openclaw.plugin.json version was stale (0.1.18) in the 0.2.0
artifact, and the engineApiKey help now points to the free key and explains it
keeps the firewall active past the 20-decision anonymous trial. No code change.

## 0.2.0

Activation gate (same engine as @fidacy/mcp 0.2.0): anonymous installs get 20
free firewall decisions, then request_payment fails closed with DENY
(activation_required) until engineApiKey (plugin config) or
FIDACY_ENGINE_API_KEY is set — free key at fidacy.com/claim, history migrates.
Countdown line on the last 5 free decisions. Keyed installs unaffected.

## 0.1.14 — 2026-07-06

Founder note in the README for the week-one install base: claim your install's
block history at fidacy.com/claim (grep anon_id ~/.fidacy/config.json) and the
founding partner offer. No code changes.

## 0.1.11 — 2026-07-03

- Config hot-reload (shared core) + actionable `payee_not_in_allowlist` DENY.

## 0.1.10 — 2026-07-03

- Artifact tools gain the `conversation` kind (chatbot session digests via
  `@fidacy/session`, conversation receipts).

## 0.1.9 — 2026-07-03

- New tools: `anchor_artifact` and `check_artifact` (hash-only artifact anchoring
  on the Bitcoin-checkpointed audit chain; files never leave the machine).

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

## 0.1.2 — 2026-07-02

- Telemetry: reports `shell: "openclaw-plugin"` + the plugin's own version, so
  ClawHub-native adoption is attributable (was indistinguishable from MCP).
- DENY responses now point to the `fidacy_upgrade` tool.
- Inherits the self-documenting first-run config + friendlier boot line.

## 0.1.3 — 2026-07-02

- Same upgrade micro-trigger system as @fidacy/mcp 0.1.11 (once-per-install,
  value-proven moments only), routed through the fidacy_upgrade tool.

## 0.1.4 — 2026-07-02

- Inherits @fidacy/mcp 0.1.12's restart-durable firewall state: the
  duplicate-invoice (BEC) guard and the spend cap now rehydrate from the local
  audit log at boot, so restarting the agent no longer re-opens a paid invoice
  or resets the running total. Torn-tail audit logs (crash mid-append) are
  salvaged instead of quarantined.

## 0.1.5 — 2026-07-02

- Version sync only: `openclaw.plugin.json` had shipped 0.1.4 with a stale
  manifest version (Plugin Inspector `package-manifest-version-drift` warning).
  No code changes over 0.1.4.

## 0.1.7 — 2026-07-03

- RESTORES the restart-durable firewall state from 0.1.4/0.1.5 (the 0.1.6 icon
  release was built against a stale @fidacy/firewall dist and silently dropped
  the rehydration — caught by the restart behavioral test, now part of the
  release ritual). Keeps the 0.1.6 ClawHub card icon.

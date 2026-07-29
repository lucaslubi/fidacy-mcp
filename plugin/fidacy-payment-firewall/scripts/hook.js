#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config.ts
var config_exports = {};
__export(config_exports, {
  DEMO_PAYEE: () => DEMO_PAYEE,
  auditLogPath: () => auditLogPath,
  configDir: () => configDir,
  configPath: () => configPath,
  ensureState: () => ensureState,
  hasEngineKey: () => hasEngineKey,
  readConfig: () => readConfig,
  resolveMandateRules: () => resolveMandateRules,
  writeConfig: () => writeConfig
});
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
function hasEngineKey(keyOverride) {
  return Boolean((keyOverride ?? process.env.FIDACY_ENGINE_API_KEY ?? "").trim());
}
function configDir() {
  return process.env.FIDACY_CONFIG_DIR ?? join(homedir(), ".fidacy");
}
function configPath() {
  return join(configDir(), "config.json");
}
function auditLogPath() {
  if (process.env.FIDACY_AUDIT_PATH) return process.env.FIDACY_AUDIT_PATH;
  const dir = join(configDir(), "audit");
  try {
    mkdirSync(dir, { recursive: true, mode: 448 });
  } catch {
  }
  return join(dir, "audit.log");
}
function readConfig() {
  const p = configPath();
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (!raw || typeof raw.anon_id !== "string") return null;
    return {
      anon_id: raw.anon_id,
      tier: raw.tier === "paid" ? "paid" : "free",
      api_key: typeof raw.api_key === "string" ? raw.api_key : null,
      mandate: raw.mandate,
      // Install-state passthrough: dropping these on a read→write cycle would
      // reset every once-per-install nudge into an every-time nag.
      created_at: typeof raw.created_at === "string" ? raw.created_at : void 0,
      nudges: raw.nudges && typeof raw.nudges === "object" ? raw.nudges : void 0,
      decisions_count: typeof raw.decisions_count === "number" ? raw.decisions_count : void 0,
      hosted_lapsed_at: typeof raw.hosted_lapsed_at === "string" ? raw.hosted_lapsed_at : void 0,
      operator_email: typeof raw.operator_email === "string" ? raw.operator_email : void 0,
      registered_email: typeof raw.registered_email === "string" ? raw.registered_email : void 0
    };
  } catch {
    return null;
  }
}
function writeConfig(cfg) {
  const dir = configDir();
  mkdirSync(dir, { recursive: true, mode: 448 });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 384 });
}
function ensureState() {
  const existing = readConfig();
  if (existing) return { config: existing, firstRun: false };
  const config = {
    anon_id: randomUUID(),
    tier: "free",
    api_key: null,
    mandate: { payees: [], categories: ["*"], currency: "USD", perTxMax: 2500, maxTotal: 1e4 },
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    writeConfig(config);
  } catch {
  }
  return { config, firstRun: true };
}
function resolveMandateRules(cfg) {
  const m = cfg?.mandate ?? {};
  const envList = (v) => v === void 0 ? void 0 : v.split(",").map((s) => s.trim()).filter(Boolean);
  const envNum = (name, v) => {
    if (v === void 0 || v.trim() === "") return void 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) {
      console.error(
        `[fidacy] ${name}="${v}" is not a positive number, so it cannot be enforced as a cap. Ignoring it and using the safe default. Write digits only, with no thousands separator, currency symbol or unit (e.g. ${name}=2500).`
      );
      return void 0;
    }
    return n;
  };
  const fileNum = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : void 0;
  const payees = envList(process.env.FIDACY_ALLOW_PAYEES) ?? m.payees ?? [];
  return {
    payees: payees.includes(DEMO_PAYEE) ? payees : [...payees, DEMO_PAYEE],
    categories: envList(process.env.FIDACY_ALLOW_CATEGORIES) ?? m.categories ?? ["*"],
    currency: process.env.FIDACY_CURRENCY ?? m.currency ?? "USD",
    perTxMax: envNum("FIDACY_PER_TX_MAX", process.env.FIDACY_PER_TX_MAX) ?? fileNum(m.perTxMax) ?? 2500,
    maxTotal: envNum("FIDACY_MAX_TOTAL", process.env.FIDACY_MAX_TOTAL) ?? fileNum(m.maxTotal) ?? 1e4
  };
}
var DEMO_PAYEE;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    DEMO_PAYEE = "fidacy:demo";
  }
});

// src/evidence.ts
var evidence_exports = {};
__export(evidence_exports, {
  chainStep: () => chainStep,
  digestActions: () => digestActions,
  genesisHead: () => genesisHead,
  queuePending: () => queuePending,
  sessionLabel: () => sessionLabel,
  takePending: () => takePending,
  verifyUrl: () => verifyUrl,
  writeSessionLog: () => writeSessionLog
});
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync as mkdirSync2, readFileSync as readFileSync2, renameSync, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join2 } from "node:path";
function canonical(obj) {
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(obj[k])}`).join(",") + "}";
}
function chainStep(prevHead, a) {
  return sha256(`${prevHead}|${sha256(canonical({ category: a.category, i: a.i, tool: a.tool, ts: a.ts }))}`);
}
function digestActions(actions) {
  let head = sha256(GENESIS);
  for (const a of actions) head = chainStep(head, a);
  return head;
}
function genesisHead() {
  return sha256(GENESIS);
}
function fidacyDir() {
  return join2(configDir(), "sessions");
}
function writeSessionLog(sessionId, actions, head, meta) {
  try {
    const dir = fidacyDir();
    mkdirSync2(dir, { recursive: true, mode: 448 });
    const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "session";
    const path = join2(dir, `${safe}.json`);
    const body = {
      v: "fidacy.observer.v1",
      recipe: 'h_0 = sha256("fidacy.observer.v1"); h_i = sha256(h_prev + "|" + sha256(canonical(action)))',
      sessionId,
      head,
      ...meta,
      actions
    };
    writeFileSync2(path, JSON.stringify(body, null, 2), { mode: 384 });
    return path;
  } catch {
    return null;
  }
}
function queuePending(head, sessionId, at, total = 0, byCategory = {}) {
  try {
    const dir = fidacyDir();
    mkdirSync2(dir, { recursive: true, mode: 448 });
    appendFileSync(join2(dir, "pending-anchors.jsonl"), JSON.stringify({ head, sessionId, at, total, byCategory }) + "\n", {
      mode: 384
    });
  } catch {
  }
}
function takePending(limit = 50) {
  const dir = fidacyDir();
  const path = join2(dir, "pending-anchors.jsonl");
  const taken = join2(dir, "pending-anchors.taking");
  try {
    renameSync(path, taken);
  } catch {
    return [];
  }
  try {
    const lines = readFileSync2(taken, "utf8").split("\n").filter(Boolean);
    const out = [];
    for (const line of lines.slice(-limit)) {
      try {
        const p = JSON.parse(line);
        if (typeof p.head === "string" && /^[0-9a-f]{64}$/.test(p.head)) out.push(p);
      } catch {
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    try {
      writeFileSync2(taken, "");
    } catch {
    }
  }
}
function verifyUrl(head) {
  return `https://fidacy.com/verify?sha256=${head}`;
}
function sessionLabel(sessionId, total, byCategory) {
  const id = sessionId.replace(/[^A-Za-z0-9-]/g, "").slice(0, 8) || "unknown";
  const parts = [`session:${id}`, `n=${total}`];
  for (const [cat, code] of Object.entries(CODE)) {
    const n = byCategory[cat] ?? 0;
    if (n > 0) parts.push(`${code}=${n}`);
  }
  return parts.join(" ").slice(0, 120);
}
var GENESIS, sha256, CODE;
var init_evidence = __esm({
  "src/evidence.ts"() {
    "use strict";
    init_config();
    GENESIS = "fidacy.observer.v1";
    sha256 = (s) => createHash("sha256").update(s).digest("hex");
    CODE = {
      money: "m",
      shell: "s",
      file: "f",
      network: "net",
      message: "msg",
      other: "o"
    };
  }
});

// src/assess.ts
function requireSafeBaseUrl(raw) {
  const trimmed = String(raw ?? "").replace(/\/+$/, "");
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    throw new AssessError({ type: "config_error", status: 0 });
  }
  const isLocalHttp = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  if (u.protocol !== "https:" && !isLocalHttp) {
    throw new AssessError({ type: "config_error", status: 0 });
  }
  return trimmed;
}
var AssessError;
var init_assess = __esm({
  "src/assess.ts"() {
    "use strict";
    AssessError = class extends Error {
      type;
      status;
      details;
      rejection_reasons;
      billing;
      constructor(opts) {
        super(`Fidacy assess error (${opts.type}, HTTP ${opts.status})`);
        this.name = "AssessError";
        this.type = opts.type;
        this.status = opts.status;
        this.details = opts.details;
        this.rejection_reasons = opts.rejection_reasons;
        this.billing = opts.billing;
      }
    };
  }
});

// src/artifacts.ts
var artifacts_exports = {};
__export(artifacts_exports, {
  ARTIFACT_KINDS: () => ARTIFACT_KINDS,
  anchorArtifact: () => anchorArtifact,
  findArtifacts: () => findArtifacts,
  getArtifact: () => getArtifact,
  hashFile: () => hashFile
});
import { createHash as createHash3 } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
async function hashFile(path) {
  const hash = createHash3("sha256");
  await pipeline(createReadStream(path), async function* (source) {
    for await (const chunk of source) {
      hash.update(chunk);
      yield;
    }
  });
  return hash.digest("hex");
}
async function engineFetch(method, pathAndQuery, cfg, body) {
  const base = requireSafeBaseUrl(cfg.engineUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1e4);
  let res;
  try {
    res = await fetch(`${base}${pathAndQuery}`, {
      method,
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        ...body !== void 0 ? { "content-type": "application/json" } : {}
      },
      body: body !== void 0 ? JSON.stringify(body) : void 0,
      signal: controller.signal
    });
  } catch {
    throw new AssessError({ type: "network_error", status: 0 });
  } finally {
    clearTimeout(timer);
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new AssessError({ type: "bad_response", status: res.status });
  }
  if (!res.ok) {
    const type = typeof json?.error === "string" ? String(json.error) : "engine_error";
    throw new AssessError({ type, status: res.status });
  }
  return json;
}
async function anchorArtifact(params, cfg) {
  return await engineFetch("POST", "/v1/artifacts", cfg, params);
}
async function findArtifacts(sha2562, cfg) {
  return await engineFetch("GET", `/v1/artifacts?sha256=${sha2562}`, cfg);
}
async function getArtifact(id, cfg) {
  return await engineFetch("GET", `/v1/artifacts/${id}`, cfg);
}
var ARTIFACT_KINDS;
var init_artifacts = __esm({
  "src/artifacts.ts"() {
    "use strict";
    init_assess();
    ARTIFACT_KINDS = [
      "contract",
      "invoice",
      "prescription",
      "claim",
      "document",
      "image",
      "audio",
      "video",
      "conversation",
      "custom"
    ];
  }
});

// src/hook.ts
init_config();
init_evidence();
import { appendFileSync as appendFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync3, readFileSync as readFileSync3, rmSync } from "node:fs";
import { join as join3 } from "node:path";

// src/observer.ts
init_evidence();
import { createHash as createHash2 } from "node:crypto";
var EXACT = {
  // Fidacy's own money tools, so the report counts what we ourselves gated.
  request_payment: "money",
  assess_action: "money",
  // The common OpenClaw / agent-host tool vocabulary.
  bash: "shell",
  shell: "shell",
  exec: "shell",
  run_command: "shell",
  code_mode_exec: "shell",
  read: "file",
  read_file: "file",
  write: "file",
  write_file: "file",
  edit: "file",
  edit_file: "file",
  apply_patch: "file",
  glob: "file",
  grep: "file",
  ls: "file",
  fetch: "network",
  web_fetch: "network",
  web_search: "network",
  http_request: "network",
  browser: "network",
  send_message: "message",
  reply: "message",
  send_email: "message"
};
var FUZZY = [
  ["payment", "money"],
  ["invoice", "money"],
  ["transfer", "money"],
  ["charge", "money"],
  ["file", "file"],
  ["patch", "file"],
  ["write", "file"],
  ["read", "file"],
  ["fetch", "network"],
  ["http", "network"],
  ["browser", "network"],
  ["search", "network"],
  ["exec", "shell"],
  ["command", "shell"],
  ["shell", "shell"],
  ["mail", "message"],
  ["message", "message"],
  ["send", "message"]
];
function classify(toolName, derivedPaths) {
  const name = toolName.toLowerCase();
  const exact = EXACT[name];
  if (exact) return exact;
  if (derivedPaths && derivedPaths.length > 0) return "file";
  for (const [needle, category] of FUZZY) if (name.includes(needle)) return category;
  return "other";
}
function fingerprint(toolName, derivedPaths) {
  const target = derivedPaths && derivedPaths.length > 0 ? [...derivedPaths].sort().join("\0") : toolName;
  return createHash2("sha256").update(`${toolName}\0${target}`).digest("hex").slice(0, 16);
}
var ACTION_LOG_CAP = 5e3;
function newLedger(sessionId, now) {
  return {
    sessionId,
    startedAt: now,
    byCategory: /* @__PURE__ */ new Map(),
    total: 0,
    toolsSeen: /* @__PURE__ */ new Set(),
    head: genesisHead(),
    actions: [],
    truncated: false
  };
}
function record(ledger, toolName, derivedPaths, failed = false, at = Date.now()) {
  const category = classify(toolName, derivedPaths);
  let tally = ledger.byCategory.get(category);
  if (!tally) {
    tally = { calls: 0, failures: 0, targets: /* @__PURE__ */ new Set() };
    ledger.byCategory.set(category, tally);
  }
  tally.calls += 1;
  if (failed) tally.failures += 1;
  if (derivedPaths && derivedPaths.length > 0 && tally.targets.size < TARGET_CAP) {
    tally.targets.add(fingerprint(toolName, derivedPaths));
  }
  ledger.total += 1;
  if (ledger.toolsSeen.size < TOOLS_CAP) ledger.toolsSeen.add(toolName);
  const action = {
    i: ledger.total,
    category,
    tool: toolName,
    ts: new Date(at).toISOString()
  };
  ledger.head = chainStep(ledger.head, action);
  if (ledger.actions.length < ACTION_LOG_CAP) ledger.actions.push(action);
  else ledger.truncated = true;
}
var TARGET_CAP = 500;
var TOOLS_CAP = 200;
var ORDER = ["money", "shell", "file", "network", "message", "other"];
var LABEL = {
  money: "moved money",
  shell: "ran commands",
  file: "touched files",
  network: "reached the network",
  message: "sent messages",
  other: "other"
};
function renderReport(ledger, now, activated, logPath) {
  if (ledger.total < MIN_ACTIONS_FOR_REPORT) return null;
  const minutes = Math.max(1, Math.round((now - ledger.startedAt) / 6e4));
  const lines = [];
  lines.push(
    `[fidacy] SESSION REPORT \xB7 ${ledger.total} agent actions watched over ${minutes} min \xB7 nothing left this machine`
  );
  for (const category of ORDER) {
    const tally = ledger.byCategory.get(category);
    if (!tally) continue;
    const capped = tally.targets.size >= TARGET_CAP ? "+" : "";
    const parts = [`${tally.calls} ${tally.calls === 1 ? "call" : "calls"}`];
    if (tally.targets.size > 0) parts.push(`${tally.targets.size}${capped} distinct`);
    if (tally.failures > 0) parts.push(`${tally.failures} failed`);
    lines.push(`[fidacy]   ${LABEL[category].padEnd(20)} ${parts.join(" \xB7 ")}`);
  }
  const money = ledger.byCategory.get("money");
  if (!money) {
    lines.push(`[fidacy]   no money-moving action was attempted \xB7 the firewall stayed armed and idle`);
  }
  lines.push(`[fidacy]   digest    ${ledger.head}`);
  if (logPath) lines.push(`[fidacy]   log       ${logPath}${ledger.truncated ? " (partial: action cap reached)" : ""}`);
  lines.push(
    activated ? `[fidacy]   anchored to the audit chain \xB7 verify: ${verifyUrl(ledger.head)}` : `[fidacy]   activate free to anchor this digest so nobody can rewrite it later: https://fidacy.com/claim`
  );
  return lines.join("\n");
}
var MIN_ACTIONS_FOR_REPORT = 5;

// src/telemetry.ts
init_config();
var CLIENT_VERSION = true ? "0.6.4" : "dev";
var currentShell = "mcp";
function setTelemetryShell(shell) {
  currentShell = shell;
}
function telemetryEnabled() {
  const v = (process.env.FIDACY_DISABLE_TELEMETRY ?? "").trim().toLowerCase();
  return !(v === "1" || v === "true" || v === "yes");
}
function endpoint() {
  const base = (process.env.FIDACY_ENGINE_URL ?? "https://api.fidacy.com").replace(/\/$/, "");
  return `${base}/v1/telemetry`;
}
var anonIdCache = null;
function anonId() {
  if (anonIdCache) return anonIdCache;
  anonIdCache = readConfig()?.anon_id ?? null;
  return anonIdCache;
}
var buffer = [];
var flushTimer = null;
var exitHookArmed = false;
function armExitFlush() {
  if (exitHookArmed || typeof process === "undefined" || typeof process.once !== "function") return;
  exitHookArmed = true;
  process.once("beforeExit", () => {
    if (buffer.length > 0) void flush();
  });
}
function record2(type, result, band, capRatio, action) {
  if (!telemetryEnabled()) return;
  armExitFlush();
  buffer.push({
    type,
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    client_version: CLIENT_VERSION,
    shell: currentShell,
    ...result ? { result } : {},
    ...band ? { band } : {},
    ...capRatio ? { cap_ratio: capRatio } : {},
    ...action ? { action } : {}
  });
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      void flush();
    }, 2e3);
    if (typeof flushTimer.unref === "function") flushTimer.unref();
  }
}
async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!telemetryEnabled() || buffer.length === 0) return;
  const id = anonId();
  if (!id) {
    buffer = [];
    return;
  }
  const events = buffer;
  buffer = [];
  try {
    await fetch(endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anon_id: id, events })
    });
  } catch {
  }
}

// src/hook.ts
function pick(obj, ...names) {
  if (!obj) return void 0;
  const want = new Set(names.map((n) => n.toLowerCase().replace(/[_-]/g, "")));
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v && want.has(k.toLowerCase().replace(/[_-]/g, ""))) return v;
  }
  return void 0;
}
function objOf(obj, ...names) {
  if (!obj) return void 0;
  const want = new Set(names.map((n) => n.toLowerCase().replace(/[_-]/g, "")));
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v) && want.has(k.toLowerCase().replace(/[_-]/g, ""))) {
      return v;
    }
  }
  return void 0;
}
var toolNameOf = (p) => pick(p, "tool_name", "toolName", "tool", "name");
var sessionIdOf = (p) => pick(p, "session_id", "sessionId", "sessionID", "session") || "default";
var eventOf = (p) => pick(p, "hook_event_name", "hookEventName", "event", "event_name", "hook");
var toolInputOf = (p) => objOf(p, "tool_input", "toolInput", "input", "params", "arguments");
function trailDir() {
  return join3(configDir(), "sessions");
}
function trailFile(sessionId) {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "session";
  return join3(trailDir(), `${safe}.ndjson`);
}
function pathsOf(input) {
  if (!input) return void 0;
  const out = [];
  for (const k of ["file_path", "path", "notebook_path"]) {
    const v = input[k];
    if (typeof v === "string" && v) out.push(v);
  }
  return out.length ? out : void 0;
}
function onToolCall(raw) {
  const tool = toolNameOf(raw) ?? "unknown";
  const category = classify(tool, pathsOf(toolInputOf(raw)));
  const line = JSON.stringify({ t: tool, c: category, ts: (/* @__PURE__ */ new Date()).toISOString() });
  mkdirSync3(trailDir(), { recursive: true, mode: 448 });
  appendFileSync2(trailFile(sessionIdOf(raw)), line + "\n", { mode: 384 });
}
function ledgerFrom(sessionId, lines) {
  const first = lines.length ? JSON.parse(lines[0]).ts : void 0;
  const ledger = newLedger(sessionId, first ? Date.parse(first) : Date.now());
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      record(ledger, e.t, void 0, false, Date.parse(e.ts));
    } catch {
    }
  }
  return ledger;
}
async function onSessionEnd(raw, anchor) {
  const sessionId = sessionIdOf(raw);
  const file = trailFile(sessionId);
  if (!existsSync2(file)) return;
  const lines = readFileSync3(file, "utf8").split("\n").filter(Boolean);
  try {
    rmSync(file);
  } catch {
  }
  if (lines.length < MIN_ACTIONS_FOR_REPORT) return;
  const ledger = ledgerFrom(sessionId, lines);
  ledger.head = digestActions(ledger.actions);
  const byCategory = {};
  for (const [cat, tally] of ledger.byCategory) byCategory[cat] = tally.calls;
  const now = Date.now();
  const logPath = writeSessionLog(sessionId, ledger.actions, ledger.head, {
    startedAt: new Date(ledger.startedAt).toISOString(),
    endedAt: new Date(now).toISOString(),
    totalActions: ledger.total,
    truncated: ledger.truncated,
    shell: "claude-code",
    byCategory: Object.fromEntries(
      [...ledger.byCategory].map(([k, v]) => [k, { calls: v.calls, failures: v.failures, distinct: v.targets.size }])
    )
  });
  let anchored = false;
  if (anchor) anchored = await anchor(ledger.head, sessionId, byCategory).catch(() => false);
  if (!anchored) queuePending(ledger.head, sessionId, now, ledger.total, byCategory);
  try {
    setTelemetryShell("claude-code");
    record2("install");
    record2("agent_active");
    await flush();
  } catch {
  }
  const report = renderReport(ledger, now, anchored, logPath);
  if (report) console.error(report);
}
async function runHook(anchor) {
  const body = await readStdin();
  let p;
  try {
    p = JSON.parse(body);
  } catch {
    return;
  }
  try {
    const event = (eventOf(p) ?? "").toLowerCase().replace(/[_-]/g, "");
    if (event.includes("sessionend") || event === "stop" || event.includes("sessionclose")) {
      await onSessionEnd(p, anchor);
    } else if (toolNameOf(p)) {
      onToolCall(p);
    }
  } catch {
  }
}
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    const done = () => resolve(data);
    const timer = setTimeout(done, 2e3);
    timer.unref?.();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => data += c);
    process.stdin.on("end", () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on("error", done);
  });
}

// src/hook-cli.ts
await runHook(async (head, sessionId, byCategory) => {
  try {
    const [{ anchorArtifact: anchorArtifact2 }, { ensureState: ensureState2 }, { sessionLabel: sessionLabel2 }] = await Promise.all([
      Promise.resolve().then(() => (init_artifacts(), artifacts_exports)),
      Promise.resolve().then(() => (init_config(), config_exports)),
      Promise.resolve().then(() => (init_evidence(), evidence_exports))
    ]);
    const cfg = ensureState2().config;
    const apiKey = (cfg.api_key || process.env.FIDACY_ENGINE_API_KEY || "").trim();
    if (!apiKey) return false;
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
    await anchorArtifact2(
      {
        sha256: head,
        kind: "custom",
        label: sessionLabel2(sessionId, total, byCategory),
        // Which install produced it. A random UUID this machine minted, tied to
        // no person and no hostname: the fleet view answers "which agent", never
        // "which employee".
        subject: `agent:${String(cfg.anon_id ?? "unknown").slice(0, 8)}`
      },
      { engineUrl: process.env.FIDACY_ENGINE_URL ?? "https://api.fidacy.com", apiKey }
    );
    return true;
  } catch {
    return false;
  }
});

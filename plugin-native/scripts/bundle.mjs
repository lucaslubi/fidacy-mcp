// Self-contained build for @fidacy/openclaw-plugin.
//
// `openclaw/plugin-sdk/*` MUST stay external: the host provides it at runtime and
// the module identity matters (registering against a second copy would be invisible
// to the host). Everything else — the shared @fidacy/firewall engine, the
// @fidacy/mcp shell wiring imported from source, typebox, zod — is inlined so the
// published package needs zero runtime dependencies.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  // The inlined telemetry reports THIS plugin's version as client_version (paired
  // with shell:"openclaw-plugin"), injected from package.json at build time.
  define: { __FIDACY_CLIENT_VERSION__: JSON.stringify(pkg.version) },
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["openclaw", "openclaw/*"],
  sourcemap: false,
  legalComments: "none",
});
console.log("[bundle] esbuild done — dist/index.js self-contained (plugin-sdk external)");

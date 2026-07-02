// Self-contained build for @fidacy/openclaw-plugin.
//
// `openclaw/plugin-sdk/*` MUST stay external: the host provides it at runtime and
// the module identity matters (registering against a second copy would be invisible
// to the host). Everything else — the shared @fidacy/firewall engine, the
// @fidacy/mcp shell wiring imported from source, typebox, zod — is inlined so the
// published package needs zero runtime dependencies.
import { build } from "esbuild";

await build({
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

// Smoke test do pacote PUBLICADO: sobe o servidor como um host faria e confere
// o contrato MCP por stdio. Nao testa o codigo desta arvore de proposito: o que
// quebra cliente e um publish ruim, e so o artefato publicado prova isso.
import { spawn } from "node:child_process";

const bin = process.env.FIDACY_BIN ?? "fidacy-mcp";
const proc = spawn(bin, [], { stdio: ["pipe", "pipe", "inherit"] });

let buf = "";
const respostas = new Map();
proc.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const linha = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!linha) continue;
    try {
      const msg = JSON.parse(linha);
      if (msg.id !== undefined) respostas.set(msg.id, msg);
    } catch {
      // Linhas nao-JSON no stdout seriam violacao do transporte; o teste abaixo pega.
    }
  }
});

const envia = (id, method, params = {}) =>
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");

const espera = async (id, ms = 20000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) {
    if (respostas.has(id)) return respostas.get(id);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`sem resposta para id ${id} em ${ms}ms`);
};

const falha = (m) => {
  console.error("FALHOU:", m);
  proc.kill();
  process.exit(1);
};

envia(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "ci-smoke", version: "1.0" },
});
const init = await espera(1);
if (!init.result?.serverInfo?.name) falha("initialize sem serverInfo");
console.log("initialize ok:", init.result.serverInfo.name, init.result.serverInfo.version);

proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

envia(2, "tools/list");
const tools = await espera(2);
const lista = tools.result?.tools ?? [];
if (lista.length === 0) falha("tools/list vazio");
// As tools que um host precisa encontrar para o produto fazer sentido.
for (const obrigatoria of ["assess_action", "request_payment", "verify_mandate"]) {
  if (!lista.some((t) => t.name === obrigatoria)) falha(`tool ausente: ${obrigatoria}`);
}
for (const t of lista) {
  if (!t.description) falha(`tool sem description: ${t.name}`);
  if (!t.inputSchema) falha(`tool sem inputSchema: ${t.name}`);
}
console.log(`tools/list ok: ${lista.length} tools, todas com description e schema`);

proc.kill();
console.log("SMOKE OK");

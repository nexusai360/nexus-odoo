// F6 Onda 2 , gate de QUALIDADE da ativacao do retrieval (guard E2E=1, CUSTA tokens).
// Criterio CORRETO (revisado 2026-06-08): NAO-REGRESSAO do corte. Para cada pergunta,
// roda runAgent em SHADOW (catalogo inteiro) e em ACTIVE (catalogo cortado) e exige que
// o conjunto de tools chamadas em active CONTENHA todas as tools que o shadow chamou.
// Ou seja: cortar o catalogo nao pode fazer o agente PERDER uma ferramenta que ele usaria
// com o catalogo cheio. (Comparar com a tool "ideal" do golden era errado: em entradas de
// cobertura o agente escolhe outra tool valida ate com catalogo cheio.)
// Requer MCP acessivel (sessao streamable-HTTP): rodar no full-stack (container mcp do dev
// recriado a partir da raiz principal com .env, ou prod). Sem MCP => INCONCLUSIVO (exit 2).
//   E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-under-active.e2e.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { runAgent } from "../run-agent";
import { createConversation } from "../conversation";
import { GoldenSchema, type GoldenEntry } from "./golden-schema";

if (process.env.E2E !== "1") {
  console.log("SKIP golden-under-active (E2E=1 para rodar)");
  process.exit(0);
}

const N = Number(process.env.GATE_N ?? 16);
const golden: GoldenEntry[] = GoldenSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json"), "utf8")),
);
const amostra = golden
  .filter((e) => e.classe === "prosseguir" && e.toolEsperada)
  .sort((a, b) => a.id.localeCompare(b.id))
  .slice(0, N);

async function resolverUserId(): Promise<string> {
  if (process.env.F6_USER_ID) return process.env.F6_USER_ID;
  const u = await prisma.user.findFirst({
    where: { platformRole: "super_admin" },
    select: { id: true },
  });
  if (!u) throw new Error("Nenhum super_admin no banco; defina F6_USER_ID");
  return u.id;
}

async function toolsChamadas(convId: string): Promise<Set<string>> {
  const rows = await prisma.llmUsage.findMany({
    where: { conversationId: convId },
    select: { toolNames: true, toolCallsCount: true },
  });
  return new Set(rows.flatMap((r) => r.toolNames ?? []));
}

async function rodar(
  userId: string,
  pergunta: string,
  modo: "shadow" | "active",
  lixo: string[],
): Promise<{ ok: boolean; tools: Set<string> }> {
  const conv = await createConversation(userId, "in_app");
  lixo.push(conv.id);
  try {
    const res = await runAgent({
      userMessage: pergunta,
      conversationId: conv.id,
      userId,
      channel: "in_app",
      isPlayground: false,
      source: "bubble",
      routerOverride: { enabled: true, toolRetrieval: modo },
    });
    if (!res || res.ok !== true) return { ok: false, tools: new Set() };
    return { ok: true, tools: await toolsChamadas(conv.id) };
  } catch {
    return { ok: false, tools: new Set() };
  }
}

async function main(): Promise<void> {
  const userId = await resolverUserId();
  const lixo: string[] = [];
  const regressoes: string[] = [];
  let okPares = 0;
  let toolCallsTotal = 0;
  let inconclusivos = 0;

  for (let idx = 0; idx < amostra.length; idx++) {
    const e = amostra[idx];
    const sh = await rodar(userId, e.pergunta, "shadow", lixo);
    const ac = await rodar(userId, e.pergunta, "active", lixo);
    toolCallsTotal += sh.tools.size + ac.tools.size;
    if (!sh.ok || !ac.ok) {
      inconclusivos += 1;
      console.warn(`[gate] ${e.id}: par inconclusivo (shadow.ok=${sh.ok} active.ok=${ac.ok})`);
      continue;
    }
    okPares += 1;
    // Regressao: active perdeu alguma tool que o shadow (catalogo cheio) usou.
    const perdidas = [...sh.tools].filter((t) => !ac.tools.has(t));
    if (perdidas.length > 0) {
      regressoes.push(
        `${e.id}: active PERDEU [${perdidas.join(",")}] (shadow=[${[...sh.tools].join(",")}] active=[${[...ac.tools].join(",")}])`,
      );
    } else {
      console.log(
        `[gate] ${e.id}: OK (shadow=[${[...sh.tools].join(",")}] active=[${[...ac.tools].join(",")}])`,
      );
    }
  }

  if (lixo.length) await prisma.conversation.deleteMany({ where: { id: { in: lixo } } });

  // Fidelidade: sem nenhuma tool em nenhum modo, o MCP nao carregou.
  if (toolCallsTotal === 0) {
    console.error(
      "INCONCLUSIVO: 0 tool calls , MCP indisponivel nesta execucao. Rode no full-stack (container mcp do dev recriado da raiz principal com .env, ou prod).",
    );
    process.exit(2);
  }
  if (okPares === 0) {
    console.error("INCONCLUSIVO: nenhum par shadow/active completou.");
    process.exit(2);
  }
  if (regressoes.length > 0) {
    console.error(`FALHA: ${regressoes.length} regressao(oes) do corte (active perdeu tool do shadow):\n` + regressoes.join("\n"));
    process.exit(1);
  }
  console.log(
    `OK , ${okPares} pares sem regressao (active nunca perdeu tool que o shadow usou). Inconclusivos: ${inconclusivos}.`,
  );
  process.exit(0);
}

void main();

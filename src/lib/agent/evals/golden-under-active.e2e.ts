// F6 Onda 2 , gate de QUALIDADE da ativacao do retrieval (guard E2E=1, CUSTA tokens).
// Roda runAgent com routerOverride active (catalogo cortado) e verifica, por consulta:
// (a) a toolEsperada foi chamada (via LlmUsage.toolNames); (b) onde houver kpiOuro
// nao-volatil com match exato, o valor ouro aparece na resposta. A prova RIGOROSA de
// que o corte preserva a tool certa e o retrieval.e2e.ts (recall@K offline); este
// harness e a confirmacao ponta-a-ponta via runAgent com o catalogo de fato cortado.
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

const golden: GoldenEntry[] = GoldenSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json"), "utf8")),
);
const amostra = golden
  .filter((e) => e.classe === "prosseguir" && e.toolEsperada)
  .sort((a, b) => a.id.localeCompare(b.id))
  .slice(0, 24);

async function resolverUserId(): Promise<string> {
  if (process.env.F6_USER_ID) return process.env.F6_USER_ID;
  const u = await prisma.user.findFirst({
    where: { platformRole: "super_admin" },
    select: { id: true },
  });
  if (!u) throw new Error("Nenhum super_admin no banco; defina F6_USER_ID");
  return u.id;
}

async function main(): Promise<void> {
  const userId = await resolverUserId();
  const convIdsCriadas: string[] = [];
  const falhas: string[] = [];
  for (let idx = 0; idx < amostra.length; idx++) {
    const e = amostra[idx];
    const conv = await createConversation(userId, "in_app");
    const convId = conv.id;
    convIdsCriadas.push(convId);
    const res = await runAgent({
      userMessage: e.pergunta,
      conversationId: convId,
      userId,
      channel: "in_app",
      isPlayground: false,
      source: "bubble",
      routerOverride: { enabled: true, toolRetrieval: "active" },
    });
    if (!res || res.ok !== true) {
      falhas.push(`${e.id}: runAgent {ok:false}`);
      continue;
    }
    const rows = await prisma.llmUsage.findMany({
      where: { conversationId: convId },
      select: { toolNames: true },
    });
    const chamadas = new Set(rows.flatMap((r) => r.toolNames ?? []));
    if (!chamadas.has(e.toolEsperada!)) {
      falhas.push(
        `${e.id}: tool ${e.toolEsperada} NAO chamada sob active (catalogo cortado escondeu?) chamou=${[...chamadas].join(",")}`,
      );
      continue;
    }
    // Checagem de numero quando ha kpiOuro nao-volatil com match exato.
    if (e.kpiOuro?.length && !e.volatil) {
      for (const k of e.kpiOuro) {
        if ((k.match ?? "exato") !== "exato") continue;
        const alvo = String(k.valor);
        if (!res.message.includes(alvo)) {
          falhas.push(`${e.id}.${k.chave}: valor ouro ${alvo} ausente na resposta sob active`);
        }
      }
    }
  }
  if (convIdsCriadas.length) {
    await prisma.conversation.deleteMany({ where: { id: { in: convIdsCriadas } } });
  }

  if (falhas.length) {
    console.error(`FALHA gate active (${falhas.length}):\n` + falhas.join("\n"));
    process.exit(1);
  }
  console.log(
    `OK , ${amostra.length} consultas sob retrieval=active: tool esperada chamada e numero ouro presente`,
  );
  process.exit(0);
}

void main();

// scripts/f4l-l3-smoke.ts
// Smoke test da fase L3: roda algumas perguntas reais pelo agente Nex
// (gpt-5.4-nano) contra o MCP, para confirmar a cadeia LLM + MCP + cache
// antes de montar a bateria de mil requisições.
// Uso: tsx --env-file=.env.local scripts/f4l-l3-smoke.ts
import { prisma } from "../src/lib/prisma";
import { createConversation } from "../src/lib/agent/conversation";
import { runAgent } from "../src/lib/agent/run-agent";

const USER_ID = "794e5207-599a-47b9-b84b-e68f07acf479"; // owner super_admin

async function ask(q: string): Promise<void> {
  const conv = await createConversation(USER_ID, "playground");
  const t = Date.now();
  const r = await runAgent({
    conversationId: conv.id,
    userId: USER_ID,
    userMessage: q,
    channel: "playground",
    isPlayground: true,
  });
  console.log(`\nP: ${q}`);
  if (r.ok) {
    console.log(`R: ${r.message}`);
    console.log(
      `   [${Date.now() - t}ms · tokens ${r.usage.tokensInput}/${r.usage.tokensOutput}]`,
    );
  } else {
    console.log(`ERRO: ${r.error}`);
  }
}

async function main(): Promise<void> {
  await ask("Quantos serviços existem no catálogo de serviços?");
  await ask("Qual o valor total de estoque a custo?");
  await ask("Liste 3 regras de preço de produtos.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[l3-smoke] FALHA:", err);
  process.exit(1);
});

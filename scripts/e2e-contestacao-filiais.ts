/**
 * scripts/e2e-contestacao-filiais.ts , E2E do fix "papagaio engessado"
 * (onda 3 do Nex Especialista: regra 5b de contestacao + skip V3/V5 via
 * CONTESTACAO_RE + ressalva de cobertura em filiais_listar).
 *
 * Reproduz o caso real do log: usuario pergunta filiais, conteste o numero,
 * e o agente NAO pode papagaiar a mesma resposta , deve reagir a contestacao
 * (reconsultar/explicar cobertura/registrar a divergencia).
 *
 * Custo: ~2 turnos do mini (~US$0,01). Uso:
 *   npx tsx --env-file=.env.local scripts/e2e-contestacao-filiais.ts
 */
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agent/run-agent";
import { createConversation } from "@/lib/agent/conversation";

async function turno(conversationId: string, userId: string, msg: string) {
  const tools: string[] = [];
  const r = await runAgent({
    conversationId,
    userId,
    userMessage: msg,
    channel: "backtest",
    isPlayground: false,
    source: "bubble",
    onEvent: (evt) => {
      if (evt.type === "tool_call") tools.push((evt as { toolName: string }).toolName);
    },
  });
  if (!r.ok) throw new Error(`runAgent falhou: ${JSON.stringify(r).slice(0, 200)}`);
  return { texto: r.message, tools };
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { isActive: true, platformRole: "super_admin" },
    select: { id: true },
  });
  if (!user) throw new Error("sem super_admin ativo");
  const conv = await createConversation(user.id, "backtest");

  const t1 = await turno(conv.id, user.id, "quantas filiais o grupo tem?");
  console.log(`\n[T1] tools=${t1.tools.join(",")}\n${t1.texto}\n`);

  const t2 = await turno(conv.id, user.id, "esse numero esta errado, sao 15 filiais");
  console.log(`\n[T2 contestacao] tools=${t2.tools.join(",")}\n${t2.texto}\n`);

  // Gate anti-papagaio: a resposta da contestacao nao pode ser igual a T1 e
  // precisa REAGIR , reconsultar a tool OU trazer explicacao nova (cobertura/
  // fonte/distincao matriz x filial x empresas). No caso real validado o mini
  // reconsultou e explicou "15 empresas = 9 matrizes + 6 filiais".
  const papagaio = t2.texto.trim() === t1.texto.trim();
  const reage =
    /cobertur|cadastr|fonte|odoo|registr|diverg|confer|atualiz|matriz|empresas/i.test(t2.texto);
  const reconsultou = t2.tools.length > 0;
  console.log(`papagaio=${papagaio} reage=${reage} reconsultou=${reconsultou}`);
  await prisma.$disconnect();
  if (papagaio || (!reage && !reconsultou)) {
    console.error("E2E CONTESTACAO FALHOU");
    process.exit(1);
  }
  console.log("E2E CONTESTACAO OK");
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });

/**
 * scripts/e2e-user-profile.ts , E2E da Onda 1 da personalizacao por usuario, contra Postgres real.
 *
 * Semeia um usuario sintetico (com PII nas mensagens + tool calls de breakdown), roda o
 * agregador deterministico REAL (mesmo SQL do job do worker), e valida:
 *  1. agregacao: preferredDomains + afinidade de breakdown (faturamento por empresa) batem;
 *  2. NAO-VERBATIM: nenhum literal de PII (CNPJ/valor/nome) vaza nos labels nem no bloco do prompt;
 *  3. injecao cache-safe: o bloco do perfil entra apos o system, sem tocar o systemPromptBase;
 *  4. calibracao (G5): conta usuarios reais elegiveis hoje (read-only).
 * Ao final, LIMPA tudo que semeou. Falha (exit 1) em qualquer assercao.
 *
 * Uso: npx tsx --env-file=.env.local scripts/e2e-user-profile.ts
 */
import { prisma } from "@/lib/prisma";
import { rodarProfileAggregate } from "@/worker/agent-intelligence/profile-aggregate";
import { formatUserProfileBlock } from "@/lib/agent/user-profile/format";
import { TEMAS } from "@/lib/agent/user-profile/normalizar-pergunta";
import { montarConversa } from "@/lib/agent/prompt/montar-conversa";
import { selectEligible, type CandidateStat } from "@/lib/agent/user-profile/candidates";

let falhas = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ok , ${msg}`);
  } else {
    console.error(`  FALHA , ${msg}`);
    falhas++;
  }
}

const PII = { nome: "Smartfit", cnpj: "11.222.333", valor: "1.250.000" };

async function seed(): Promise<{ userId: string; conversationId: string }> {
  const sufixo = Math.floor(Date.now() % 1_000_000); // Date.now ok em script (nao em workflow)
  const user = await prisma.user.create({
    data: { email: `e2e-perfil-${sufixo}@local.test`, password: "x", name: "E2E Perfil" },
  });
  const conv = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: "E2E perfil",
      topicTags: ["faturamento", "estoque"],
      channel: "in_app",
    },
  });

  const userMsg = (content: string) => ({
    conversationId: conv.id,
    role: "user" as const,
    content,
  });
  const toolMsg = (toolName: string) => ({
    conversationId: conv.id,
    role: "assistant" as const,
    content: "resposta",
    toolCalls: [{ name: toolName, arguments: {} }],
  });

  // >= 12 mensagens. Perguntas com PII -> devem normalizar para "faturamento"/"estoque".
  const msgs = [
    userMsg(`qual o faturamento por empresa da ${PII.nome} CNPJ ${PII.cnpj}/0001-44?`),
    toolMsg("fiscal_faturamento_por_empresa"),
    userMsg(`e o faturamento por empresa no valor de ${PII.valor},00 deste mes?`),
    toolMsg("fiscal_faturamento_por_empresa"),
    userMsg("faturamento por empresa de novo, por favor"),
    toolMsg("fiscal_faturamento_por_empresa"),
    userMsg("agora o faturamento por cfop"),
    toolMsg("fiscal_faturamento_por_cfop"),
    userMsg("quanto tem no estoque do produto X12345?"),
    toolMsg("estoque_saldo_produto"),
    userMsg("e o estoque do armazem central?"),
    toolMsg("estoque_saldo_produto"),
    userMsg("obrigado"),
    userMsg("resume aí, direto ao ponto"),
    userMsg("só o total, por favor, sem detalhe"),
    userMsg("faturamento por empresa outra vez"),
  ];
  for (const m of msgs) {
    await prisma.message.create({ data: m });
  }
  return { userId: user.id, conversationId: conv.id };
}

async function cleanup(userId: string, conversationId: string) {
  await prisma.userAgentProfile.deleteMany({ where: { userId } });
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversation.deleteMany({ where: { id: conversationId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function main() {
  console.log("E2E perfil de interacao , semeando usuario sintetico...");
  const { userId, conversationId } = await seed();
  try {
    // 0. calibracao (G5) ANTES de rodar o agregador (depois do build o usuario deixa de ser
    // "elegivel para rebuild", pois nao ha mensagem nova desde o profileBuiltAt).
    const stats0 = await prisma.$queryRawUnsafe<
      { userId: string; conversations: number; messages: number; lastMessageMs: number; profileBuiltMs: number | null }[]
    >(`
      SELECT c.user_id AS "userId", COUNT(DISTINCT c.id)::int AS "conversations", COUNT(m.id)::int AS "messages",
             EXTRACT(EPOCH FROM MAX(m.created_at)) * 1000 AS "lastMessageMs",
             EXTRACT(EPOCH FROM uap.profile_built_at) * 1000 AS "profileBuiltMs"
      FROM conversations c JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN user_agent_profiles uap ON uap.user_id = c.user_id
      WHERE c.user_id IS NOT NULL GROUP BY c.user_id, uap.profile_built_at
    `);
    const elegiveis0 = selectEligible(
      stats0.map((s) => ({
        userId: s.userId,
        conversations: Number(s.conversations),
        messages: Number(s.messages),
        lastMessageMs: Number(s.lastMessageMs),
        profileBuiltMs: s.profileBuiltMs == null ? null : Number(s.profileBuiltMs),
      })) as CandidateStat[],
    );
    console.log(`  [calibracao] usuarios elegiveis no DB (inclui o semeado): ${elegiveis0.length}`);
    check(elegiveis0.includes(userId), "o usuario semeado e elegivel (pipeline encontra candidato)");

    // 1. roda o agregador deterministico REAL (mesmo SQL do job)
    const r = await rodarProfileAggregate(prisma);
    check(r.atualizados >= 1, `agregador atualizou >=1 perfil (atualizados=${r.atualizados})`);

    const row = await prisma.userAgentProfile.findUnique({ where: { userId } });
    check(!!row, "perfil gravado para o usuario semeado");
    if (!row) throw new Error("perfil nao gravado");

    const preferredDomains = (row.preferredDomains as string[]) ?? [];
    const prefs = row.presentationPrefs as Record<string, { breakdownPreferido?: string }>;
    const recurring = row.recurringQuestions as { label: string }[];

    check(preferredDomains.includes("fiscal"), `preferredDomains inclui fiscal (${preferredDomains.join(",")})`);
    check(row.verbosidade === "curto", `verbosidade detectada = curto (got ${row.verbosidade})`);
    check(preferredDomains.includes("estoque"), "preferredDomains inclui estoque");
    check(
      prefs?.faturamento?.breakdownPreferido === "empresa",
      `afinidade de breakdown: faturamento por empresa (got ${JSON.stringify(prefs?.faturamento)})`,
    );
    check(
      recurring.every((q) => (TEMAS as readonly string[]).includes(q.label)),
      `recurringQuestions sao temas do vocabulario fechado (${recurring.map((q) => q.label).join(",")})`,
    );

    // 2. NAO-VERBATIM: nenhum literal de PII no perfil nem no bloco do prompt
    const bloco = formatUserProfileBlock({
      topTopics: (row.topTopics as { topic: string; score: number; lastSeenAt: string }[]) ?? [],
      topKeywords: [],
      preferredDomains,
      recurringQuestions: recurring as { label: string; count: number; lastSeenAt: string }[],
      presentationPrefs: prefs,
    });
    const serial = JSON.stringify({ recurring, prefs, preferredDomains }) + bloco;
    for (const [k, v] of Object.entries(PII)) {
      check(!serial.includes(v), `nao vaza PII (${k}="${v}") no perfil/bloco`);
    }
    check(!/\d{4,}/.test(bloco), "bloco do prompt sem sequencias longas de digitos");

    // 3. injecao cache-safe
    const semPerfil = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "2026-06-19",
    });
    const comPerfil = montarConversa({
      systemPromptBase: "REGRAS FIXAS",
      historyMessages: [],
      userMessage: "oi",
      agoraBrt: "2026-06-19",
      perfilUsuarioTexto: bloco,
    });
    check(
      semPerfil.conversation[0].content === comPerfil.conversation[0].content,
      "systemPromptBase identico com e sem perfil (cache key intacta)",
    );
    check(
      comPerfil.conversation[1].content.includes("[Preferências deste usuário]"),
      "bloco do perfil injetado logo apos o system",
    );
    check(
      bloco.includes("PREFERENCIAS de apresentacao") && bloco.includes("atenda a pergunta"),
      "bloco contem a clausula de precedencia (preferencia nao sobrepoe o turno)",
    );

  } finally {
    await cleanup(userId, conversationId);
    await prisma.$disconnect();
  }

  if (falhas > 0) {
    console.error(`\nE2E FALHOU: ${falhas} assercao(oes).`);
    process.exit(1);
  }
  console.log("\nE2E perfil OK , agregacao + nao-verbatim + injecao cache-safe verdes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

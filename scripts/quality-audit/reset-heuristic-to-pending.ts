#!/usr/bin/env tsx
/**
 * Volta para PENDENTE as avaliacoes que foram classificadas pelo CRON
 * HEURISTICO (judgeVersion='heuristica-agente-nex-v1'), para que sejam
 * RE-JULGADAS pela forma correta (Claude Code headless, via o botao "Avaliar
 * pendentes" ou o cron host-side). Preserva ajustes humanos: quem ja tem
 * human_status NAO e' tocado (a correcao manual e' a fonte da verdade).
 *
 *   (sem flag)  -> dry-run: so conta quantas seriam resetadas.
 *   --apply     -> aplica o reset (status=PENDENTE, limpa patterns/razoes,
 *                  judgeVersion volta pro default de pendente).
 *
 * Depois do --apply, dispare o juizo: clique "Avaliar pendentes" no app local
 * OU rode o fluxo do docs/quality-judge-playbook.md.
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

const HEURISTIC_VERSION = "heuristica-agente-nex-v1";
const PENDING_JUDGE_VERSION = "claude-pericia-v1";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const where = {
    judgeVersion: HEURISTIC_VERSION,
    humanStatus: null,
  } as const;

  const alvo = await prisma.conversationQualityEvaluation.count({ where });
  const ajustadasManualmente =
    await prisma.conversationQualityEvaluation.count({
      where: { judgeVersion: HEURISTIC_VERSION, NOT: { humanStatus: null } },
    });

  console.log(
    `Heuristicas (sem ajuste humano) a resetar: ${alvo}\n` +
      `Heuristicas preservadas (com ajuste humano): ${ajustadasManualmente}`,
  );

  if (!apply) {
    console.log("\nDRY-RUN. Rode com --apply para resetar de fato.");
    return;
  }

  const res = await prisma.conversationQualityEvaluation.updateMany({
    where,
    data: {
      status: "PENDENTE",
      patterns: [],
      razoes: "",
      judgeVersion: PENDING_JUDGE_VERSION,
    },
  });

  console.log(
    `\nResetadas para PENDENTE: ${res.count}. ` +
      `Agora dispare o juizo (Claude Code) para re-avaliar.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

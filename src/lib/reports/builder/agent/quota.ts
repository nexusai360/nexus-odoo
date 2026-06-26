// src/lib/reports/builder/agent/quota.ts
// E3 , Teto de consumo do agente construtor. Soma o LlmUsage com
// origin="construtor" numa janela movel e bloqueia acima do teto. Isola o
// custo do construtor do resto do agente (Nex), via a tag de origem do billing.
//
// O teto e uma constante no codigo (proposito: proteger contra custo
// desenfreado). O BuilderLlmConfig com tetoTokensPeriodo foi cortado na
// correcao de 26/06 (config de modelo virou card em AgentSettings); o teto
// passa a ser ajustavel aqui ate haver demanda por config em banco.
import { prisma } from "@/lib/prisma";

/** Teto de tokens (input+output) consumidos pelo construtor na janela. */
export const TETO_TOKENS_PERIODO = 5_000_000;
/** Janela movel (em dias) sobre a qual o consumo e somado. */
export const JANELA_DIAS = 30;

export type ResultadoQuota = { ok: true } | { ok: false; motivo: string };

/**
 * Verifica se o construtor ainda esta dentro do teto de tokens da janela.
 * O `userId` e aceito para auditoria/escopo futuro; o teto atual e global
 * (protege o custo total da feature).
 */
export async function verificarQuota(_userId: string): Promise<ResultadoQuota> {
  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000);
  const agg = await prisma.llmUsage.aggregate({
    _sum: { tokensInput: true, tokensOutput: true },
    where: { origin: "construtor", createdAt: { gte: desde } },
  });
  const consumido =
    (agg._sum.tokensInput ?? 0) + (agg._sum.tokensOutput ?? 0);
  if (consumido >= TETO_TOKENS_PERIODO) {
    return {
      ok: false,
      motivo: `Teto de uso do construtor atingido (${consumido.toLocaleString(
        "pt-BR",
      )} de ${TETO_TOKENS_PERIODO.toLocaleString("pt-BR")} tokens nos ultimos ${JANELA_DIAS} dias). Tente novamente mais tarde.`,
    };
  }
  return { ok: true };
}

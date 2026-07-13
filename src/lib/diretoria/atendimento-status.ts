import type { PrismaClient } from "@/generated/prisma/client";

/**
 * O quanto de cada pedido ainda falta entregar vem de um campo computado do Odoo, que
 * um job dedicado traz uma vez por dia (`src/worker/sync/atendimento.ts`). Enquanto esse
 * job nao tiver completado ao menos uma vez, o cache nao sabe o que ja foi entregue.
 *
 * A regra e simples e existe para evitar um numero pior do que o bug original:
 *
 *   - job JA completou  -> TODAS as consultas usam a quantidade a atender.
 *   - job NUNCA completou -> TODAS caem na quantidade cheia, e a tela avisa.
 *
 * O que NAO pode acontecer e misturar. Se o job morre no meio (OOM, timeout, Odoo fora
 * do ar), parte dos itens fica com a quantidade a atender preenchida e parte nao. Somar
 * os dois no mesmo total produz um numero que nao e nem a demanda cheia nem a demanda
 * real , e ninguem consegue explicar de onde ele veio. Por isso o corte e por marcador
 * de build, nao linha a linha.
 */
export interface StatusAtendimento {
  /** true quando o job ja completou ao menos uma vez: pode confiar nas colunas. */
  ok: boolean;
  /** quando o job completou pela ultima vez. */
  em: Date | null;
}

/** Chave do marcador gravado pelo job de atendimento em `fato_build_state`. */
export const CHAVE_BUILD_ATENDIMENTO = "job_atendimento";

export async function atendimentoSincronizado(
  prisma: PrismaClient,
): Promise<StatusAtendimento> {
  const estado = await prisma.fatoBuildState.findUnique({
    where: { fato: CHAVE_BUILD_ATENDIMENTO },
    select: { ultimoBuildAt: true },
  });

  return { ok: estado != null, em: estado?.ultimoBuildAt ?? null };
}

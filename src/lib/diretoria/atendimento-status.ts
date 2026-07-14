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
  /** true quando o job completou RECENTEMENTE: pode confiar nas colunas. */
  ok: boolean;
  /** quando o job completou pela ultima vez. */
  em: Date | null;
}

/**
 * O job e diario. Se ele nao completa ha mais de dois dias, o dado congelou (Odoo fora,
 * timeout, lock ocupado) e nao da mais para confiar nas colunas , um pedido ja entregue
 * voltaria a ser contado como pendente, e a tela diria "sincronizado". Passado esse prazo,
 * a plataforma volta ao valor cheio COM aviso, que e honesto, em vez de um numero errado
 * que parece certo.
 */
const VALIDADE_MS = 48 * 60 * 60_000;

/** Chave do marcador gravado pelo job de atendimento em `fato_build_state`. */
export const CHAVE_BUILD_ATENDIMENTO = "job_atendimento";

export async function atendimentoSincronizado(
  prisma: PrismaClient,
): Promise<StatusAtendimento> {
  const estado = await prisma.fatoBuildState.findUnique({
    where: { fato: CHAVE_BUILD_ATENDIMENTO },
    select: { ultimoBuildAt: true },
  });

  const em = estado?.ultimoBuildAt ?? null;
  const fresco = em != null && Date.now() - em.getTime() < VALIDADE_MS;
  return { ok: fresco, em };
}

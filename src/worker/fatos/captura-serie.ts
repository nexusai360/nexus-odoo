// src/worker/fatos/captura-serie.ts
// Infra comum das capturas de serie (preco e saldo): contagem de recusas seguidas e os
// tamanhos de lote que mantem o bootstrap dentro dos limites do Postgres.
//
// Por que lote: na PRIMEIRA captura (base) o delta e o fato inteiro (~12k preco, ~4,6k saldo).
// - createMany de 12k linhas x ~10 colunas passaria de 65.535 bind params (limite Int16 do PG);
// - updateMany com um OR de 12k objetos e um WHERE booleano gigante (parse caro, risco de
//   stack depth). Alem disso, na base nem HA vigente para desmarcar , o UPDATE so roda quando
//   ja existe vigente (vigentes.length > 0). Ambos vao em lotes para nunca estourar.
import type { PrismaClient } from "../../generated/prisma/client";

/** Linhas por INSERT: 12k / 500 = 24 lotes; cada lote ~5k params, folgado sob 65.535. */
export const LOTE_INSERT = 500;
/** Chaves por UPDATE de desmarca: OR de 500 objetos e barato e seguro. */
export const LOTE_UPDATE = 500;

export function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

/** Quantas rodadas recusadas consecutivas houve (do topo), para a rota de saida do dead-state. */
export async function recusadasSeguidas(
  prisma: PrismaClient,
  serie: string,
): Promise<number> {
  const ultimas = await prisma.fatoCapturaRodada.findMany({
    where: { serie },
    orderBy: { capturadoEm: "desc" },
    select: { status: true },
    take: 50,
  });
  let n = 0;
  for (const r of ultimas) {
    if (r.status === "recusada") n++;
    else break;
  }
  return n;
}

export async function temBaseAnterior(
  prisma: PrismaClient,
  serie: string,
): Promise<boolean> {
  const n = await prisma.fatoCapturaRodada.count({
    where: { serie, status: { in: ["ok", "base"] } },
  });
  return n > 0;
}

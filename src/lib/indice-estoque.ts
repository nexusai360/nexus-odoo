// src/lib/indice-estoque.ts
//
// INDICE DE VALORIZACAO DO ESTOQUE , configuravel em Configuracao > Diretoria > Vendas
// (AppSetting `diretoria.indice_valor_estoque`).
//
// O valor do estoque a custo (quantidade x preco_custo) e DIVIDIDO por este indice para chegar
// ao numero que a diretoria acompanha. Padrao 0,95 (decisao do dono, 2026-07-12).
//
// Mesmo desenho da data de inicio das analises (src/lib/corte-dados.ts): cache de processo com
// TTL curto, para as consultas (sincronas) nao dependerem de I/O, e um ponto de hidratacao nos
// boundaries. Quem tem `prisma` chama `getIndiceEstoque`; o caminho quente le `indiceAtual()`.

import type { PrismaClient } from "@/generated/prisma/client";

/** Chave do AppSetting (categoria "diretoria"). */
export const INDICE_ESTOQUE_KEY = "diretoria.indice_valor_estoque";

/** Indice usado enquanto ninguem configurou nada (decisao do dono, 2026-07-12). */
export const INDICE_ESTOQUE_PADRAO = 0.95;

/** Faixa aceita: divisor precisa ser positivo e nao pode inflar o estoque sem limite. */
export const INDICE_ESTOQUE_MIN = 0.01;
export const INDICE_ESTOQUE_MAX = 10;

let indiceEmMemoria = INDICE_ESTOQUE_PADRAO;
let lidoEm = 0;
const TTL_MS = 60_000;

/** O indice vigente conhecido por este processo (sincrono). */
export function indiceAtual(): number {
  return indiceEmMemoria;
}

/** Le o indice configurado (cache de 60s) e atualiza o valor em memoria. */
export async function getIndiceEstoque(prisma: PrismaClient): Promise<number> {
  const agora = Date.now();
  if (agora - lidoEm < TTL_MS) return indiceEmMemoria;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: INDICE_ESTOQUE_KEY } });
    const bruto = typeof row?.value === "number" ? row.value : Number(row?.value);
    indiceEmMemoria = indiceValido(bruto) ? bruto : INDICE_ESTOQUE_PADRAO;
  } catch {
    // Banco indisponivel: mantem o ultimo valor conhecido.
    indiceEmMemoria = indiceEmMemoria || INDICE_ESTOQUE_PADRAO;
  }
  lidoEm = agora;
  return indiceEmMemoria;
}

/** Forca a releitura na proxima chamada (usado ao salvar a configuracao). */
export function invalidarCacheIndice(): void {
  lidoEm = 0;
}

export function indiceValido(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= INDICE_ESTOQUE_MIN &&
    v <= INDICE_ESTOQUE_MAX
  );
}

/**
 * Aplica o indice ao valor a custo. Divisao (nao multiplicacao): com 0,95, o valor sobe ~5,3%.
 * Indice invalido nunca zera o KPI , cai no padrao.
 */
export function aplicarIndice(valorACusto: number, indice: number = indiceEmMemoria): number {
  const i = indiceValido(indice) ? indice : INDICE_ESTOQUE_PADRAO;
  return valorACusto / i;
}

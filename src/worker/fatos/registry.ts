// src/worker/fatos/registry.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { rebuildFatoEstoqueSaldo } from "./fato-estoque-saldo";
import { rebuildFatoEstoqueMovimento } from "./fato-estoque-movimento";
import { rebuildFatoProdutoParado } from "./fato-produto-parado";
import { rebuildFatoFinanceiroSaldo } from "./fato-financeiro-saldo";
import { rebuildFatoFinanceiroMovimento } from "./fato-financeiro-movimento";
import { rebuildFatoFinanceiroTitulo } from "./fato-financeiro-titulo";
import { rebuildFatoPedido } from "./fato-pedido";
import { rebuildFatoPedidoParcela } from "./fato-pedido-parcela";

export interface FatoBuilderEntry {
  nome: string;
  cycle: "snapshot" | "incremental";
  run: (prisma: PrismaClient) => Promise<number>;
}

export const FATO_BUILDERS: FatoBuilderEntry[] = [
  { nome: "fato_estoque_saldo", cycle: "snapshot", run: rebuildFatoEstoqueSaldo },
  { nome: "fato_estoque_movimento", cycle: "snapshot", run: rebuildFatoEstoqueMovimento },
  { nome: "fato_produto_parado", cycle: "snapshot", run: rebuildFatoProdutoParado },
  { nome: "fato_financeiro_saldo", cycle: "snapshot", run: rebuildFatoFinanceiroSaldo },
  { nome: "fato_financeiro_movimento", cycle: "incremental", run: rebuildFatoFinanceiroMovimento },
  { nome: "fato_financeiro_titulo", cycle: "incremental", run: rebuildFatoFinanceiroTitulo },
  { nome: "fato_pedido", cycle: "incremental", run: rebuildFatoPedido },
  { nome: "fato_pedido_parcela", cycle: "incremental", run: rebuildFatoPedidoParcela },
];

/**
 * Executa todos os builders do `cycle` dado. Isola falhas: um builder com erro
 * não impede os demais de rodar.
 */
export async function runBuilders(
  prisma: PrismaClient,
  cycle: "snapshot" | "incremental",
  builders: FatoBuilderEntry[] = FATO_BUILDERS,
): Promise<void> {
  for (const { nome, cycle: builderCycle, run } of builders) {
    if (builderCycle !== cycle) continue;
    try {
      const n = await run(prisma);
      console.log(`[worker] ${nome} reconstruído: ${n} linhas`);
    } catch (err) {
      console.error(`[worker] falha ao reconstruir ${nome}:`, err);
    }
  }
}

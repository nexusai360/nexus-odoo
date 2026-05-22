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
import { rebuildFatoNotaFiscal } from "./fato-nota-fiscal";
import { rebuildFatoNotaFiscalItem } from "./fato-nota-fiscal-item";
import { rebuildFatoParceiro } from "./fato-parceiro";
import { rebuildFatoContaContabil } from "./fato-conta-contabil";
import { rebuildFatoPreco } from "./fato-preco";
import { rebuildFatoServico } from "./fato-servico";

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
  { nome: "fato_nota_fiscal", cycle: "incremental", run: rebuildFatoNotaFiscal },
  { nome: "fato_nota_fiscal_item", cycle: "incremental", run: rebuildFatoNotaFiscalItem },
  { nome: "fato_parceiro", cycle: "incremental", run: rebuildFatoParceiro },
  { nome: "fato_conta_contabil", cycle: "incremental", run: rebuildFatoContaContabil },
  { nome: "fato_preco", cycle: "incremental", run: rebuildFatoPreco },
  { nome: "fato_servico", cycle: "incremental", run: rebuildFatoServico },
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

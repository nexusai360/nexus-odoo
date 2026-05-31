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
import { rebuildFatoApuracao } from "./fato-apuracao";
import { rebuildFatoCartaCorrecao } from "./fato-carta-correcao";
import { rebuildFatoCertificado } from "./fato-certificado";
import { rebuildFatoReferencia } from "./fato-referencia";
import { rebuildFatoProduto } from "./fato-produto";
import { rebuildFatoDfe } from "./fato-dfe";
import { rebuildFatoPedidoHistorico } from "./fato-pedido-historico";
import { rebuildFatoFinanceiroLancamentoItem } from "./fato-financeiro-lancamento-item";
import { rebuildFatoContabilContaReferencial } from "./fato-contabil-conta-referencial";
import { rebuildFatoContabilLancamento } from "./fato-contabil-lancamento";
import { rebuildFatoContabilLancamentoItem } from "./fato-contabil-lancamento-item";
import { rebuildFatoMdfe } from "./fato-mdfe";
import { rebuildFatoReinfEvento } from "./fato-reinf-evento";
import { rebuildFatoRetornoItem } from "./fato-retorno-item";
import { rebuildFatoRetornoBancario } from "./fato-retorno-bancario";
import { rebuildFatoRemessaBancaria } from "./fato-remessa-bancaria";
import { rebuildFatoCarteiraCobranca } from "./fato-carteira-cobranca";
import { rebuildFatoCheque } from "./fato-cheque";
import { rebuildFatoPix } from "./fato-pix";
import { rebuildFatoCotacao } from "./fato-cotacao";
import { rebuildFatoComissao } from "./fato-comissao";
import { rebuildFatoProducaoProcesso } from "./fato-producao-processo";

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
  { nome: "fato_apuracao", cycle: "incremental", run: rebuildFatoApuracao },
  { nome: "fato_carta_correcao", cycle: "incremental", run: rebuildFatoCartaCorrecao },
  { nome: "fato_certificado", cycle: "incremental", run: rebuildFatoCertificado },
  { nome: "fato_referencia", cycle: "incremental", run: rebuildFatoReferencia },
  // Catalogo canonico de produtos (3787 linhas). Cycle incremental para
  // pegar produtos novos rapidamente; truncate+insert do builder garante
  // consistencia com raw_sped_produto.
  { nome: "fato_produto", cycle: "incremental", run: rebuildFatoProduto },
  // O1 (onda DF-e): notas de fornecedores capturadas eletronicamente.
  { nome: "fato_dfe", cycle: "incremental", run: rebuildFatoDfe },
  // O3 (onda Pedido): historico de transicao de etapas do pedido.
  { nome: "fato_pedido_historico", cycle: "incremental", run: rebuildFatoPedidoHistorico },
  // O4 (onda Financeiro): itens do lancamento (DRE gerencial por conta).
  { nome: "fato_financeiro_lancamento_item", cycle: "incremental", run: rebuildFatoFinanceiroLancamentoItem },
  // B1 (onda contábil). Ordem: cabeçalho antes do item (o item lê o tipo do
  // cabeçalho e a natureza de fato_conta_contabil, ambos buildados antes).
  { nome: "fato_contabil_conta_referencial", cycle: "incremental", run: rebuildFatoContabilContaReferencial },
  { nome: "fato_contabil_lancamento", cycle: "incremental", run: rebuildFatoContabilLancamento },
  { nome: "fato_contabil_lancamento_item", cycle: "incremental", run: rebuildFatoContabilLancamentoItem },
  // B2 (onda fiscal complementar). Estruturais: hoje 0 linhas (MDF-e/REINF não
  // operados no Odoo). Registrados para auto-buildarem quando passarem a operar.
  { nome: "fato_mdfe", cycle: "incremental", run: rebuildFatoMdfe },
  { nome: "fato_reinf_evento", cycle: "incremental", run: rebuildFatoReinfEvento },
  // B3 (cobrança bancária). retorno.item depende do raw já sincronizado.
  { nome: "fato_retorno_item", cycle: "incremental", run: rebuildFatoRetornoItem },
  { nome: "fato_retorno_bancario", cycle: "incremental", run: rebuildFatoRetornoBancario },
  { nome: "fato_remessa_bancaria", cycle: "incremental", run: rebuildFatoRemessaBancaria },
  { nome: "fato_carteira_cobranca", cycle: "incremental", run: rebuildFatoCarteiraCobranca },
  { nome: "fato_cheque", cycle: "incremental", run: rebuildFatoCheque },
  { nome: "fato_pix", cycle: "incremental", run: rebuildFatoPix },
  // B4 (comercial: cotação + comissão). Estruturais (0 reg hoje; auto-ativam).
  { nome: "fato_cotacao", cycle: "incremental", run: rebuildFatoCotacao },
  { nome: "fato_comissao", cycle: "incremental", run: rebuildFatoComissao },
  // B5 (produção). producao.processo (1 reg hoje).
  { nome: "fato_producao_processo", cycle: "incremental", run: rebuildFatoProducaoProcesso },
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

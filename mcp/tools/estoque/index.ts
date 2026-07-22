// mcp/tools/estoque/index.ts
// Índice do domínio de estoque. Exporta o array de tools.
// Preenchido nas tasks 4c.4,4c.9 (uma tool por arquivo).
import type { ToolEntry } from "../../catalog/types.js";
import { estoqueSaldoProduto } from "./saldo-produto.js";
import { estoqueCoberturaDias } from "./cobertura-dias.js";
import { estoqueValorArmazem } from "./valor-armazem.js";
import { estoqueEntradasSaidas } from "./entradas-saidas.js";
import { estoqueTopMovimentados } from "./top-movimentados.js";
import { estoqueProdutosParados } from "./produtos-parados.js";
import { estoqueConcentracao } from "./concentracao.js";
import { estoqueProdutosSaldoZero } from "./produtos-saldo-zero.js";
import { estoqueLocaisPorProduto } from "./locais-por-produto.js";
import { estoqueMinimoMaximo } from "./minimo-maximo.js";
import { estoqueComparativo } from "./comparativo.js";
import { estoqueComposicaoKit } from "./composicao-kit.js";
import { estoqueEvolucaoPreco } from "./evolucao-preco.js";
import { estoqueEvolucaoSaldo } from "./evolucao-saldo.js";

export const estoqueTools: ToolEntry[] = [
  estoqueSaldoProduto as ToolEntry,
  estoqueCoberturaDias as ToolEntry,
  estoqueValorArmazem as ToolEntry,
  estoqueEntradasSaidas as ToolEntry,
  estoqueTopMovimentados as ToolEntry,
  estoqueProdutosParados as ToolEntry,
  estoqueConcentracao as ToolEntry,
  estoqueProdutosSaldoZero as ToolEntry,
  estoqueLocaisPorProduto as ToolEntry,
  // B6 , estoque mín/máx
  estoqueMinimoMaximo as ToolEntry,
  // 2026-06-19 , comparativo entre datas (série histórica de snapshots)
  estoqueComparativo as ToolEntry,
  // 2026-07-19 , composição de valor dos kits (estrutura vs painel)
  estoqueComposicaoKit as ToolEntry,
  // 2026-07-22 , séries temporais (histórico já gravado): evolução de preço e de saldo
  estoqueEvolucaoPreco as ToolEntry,
  estoqueEvolucaoSaldo as ToolEntry,
];

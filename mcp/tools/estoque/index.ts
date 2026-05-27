// mcp/tools/estoque/index.ts
// Índice do domínio de estoque. Exporta o array de tools.
// Preenchido nas tasks 4c.4,4c.9 (uma tool por arquivo).
import type { ToolEntry } from "../../catalog/types.js";
import { estoqueSaldoProduto } from "./saldo-produto.js";
import { estoqueValorArmazem } from "./valor-armazem.js";
import { estoqueEntradasSaidas } from "./entradas-saidas.js";
import { estoqueTopMovimentados } from "./top-movimentados.js";
import { estoqueProdutosParados } from "./produtos-parados.js";
import { estoqueConcentracao } from "./concentracao.js";
import { estoqueProdutosSaldoZero } from "./produtos-saldo-zero.js";
import { estoqueLocaisPorProduto } from "./locais-por-produto.js";

export const estoqueTools: ToolEntry[] = [
  estoqueSaldoProduto as ToolEntry,
  estoqueValorArmazem as ToolEntry,
  estoqueEntradasSaidas as ToolEntry,
  estoqueTopMovimentados as ToolEntry,
  estoqueProdutosParados as ToolEntry,
  estoqueConcentracao as ToolEntry,
  estoqueProdutosSaldoZero as ToolEntry,
  estoqueLocaisPorProduto as ToolEntry,
];

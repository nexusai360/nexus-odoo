// mcp/tools/estoque/index.ts
// Índice do domínio de estoque. Exporta o array de tools.
// Preenchido nas tasks 4c.4–4c.9 (uma tool por arquivo).
import type { ToolEntry } from "../../catalog/types.js";
import { estoqueSaldoProduto } from "./saldo-produto.js";
import { estoqueValorArmazem } from "./valor-armazem.js";
import { estoqueEntradasSaidas } from "./entradas-saidas.js";

export const estoqueTools: ToolEntry[] = [
  estoqueSaldoProduto,
  estoqueValorArmazem,
  estoqueEntradasSaidas,
];

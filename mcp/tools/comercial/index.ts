// mcp/tools/comercial/index.ts
// Exporta o array de tools do domínio comercial.
import type { ToolEntry } from "../../catalog/types.js";
import { comercialPedidosPeriodo } from "./pedidos-periodo.js";
import { comercialPedidosPorEtapa } from "./pedidos-por-etapa.js";
import { comercialPedidosPorVendedor } from "./pedidos-por-vendedor.js";
import { comercialPedidosAtrasados } from "./pedidos-atrasados.js";
import { comercialParcelasAVencer } from "./parcelas-a-vencer.js";
import { comercialPrecoProduto } from "./preco-produto.js";
import { comercialPrecoTabela } from "./preco-tabela.js";
import { comercialContarPedidos } from "./contar-pedidos.js";
import { comercialContarRegrasPreco } from "./contar-regras-preco.js";
import { comercialPedidosListarTopValor } from "./pedidos-listar-top-valor.js";

export const comercialTools: ToolEntry[] = [
  comercialPedidosPeriodo as ToolEntry,
  comercialPedidosPorEtapa as ToolEntry,
  comercialPedidosPorVendedor as ToolEntry,
  comercialPedidosAtrasados as ToolEntry,
  comercialParcelasAVencer as ToolEntry,
  comercialPrecoProduto as ToolEntry,
  comercialPrecoTabela as ToolEntry,
  comercialContarPedidos as ToolEntry,
  comercialContarRegrasPreco as ToolEntry,
  comercialPedidosListarTopValor as ToolEntry,
];

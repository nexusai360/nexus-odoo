// mcp/tools/comercial/index.ts
// Exporta o array de tools do domínio comercial.
import type { ToolEntry } from "../../catalog/types.js";
import { comercialPedidosPeriodo } from "./pedidos-periodo.js";
import { comercialPedidosPorEtapa } from "./pedidos-por-etapa.js";

export const comercialTools: ToolEntry[] = [
  comercialPedidosPeriodo as ToolEntry,
  comercialPedidosPorEtapa as ToolEntry,
];

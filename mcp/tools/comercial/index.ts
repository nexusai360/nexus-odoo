// mcp/tools/comercial/index.ts
// Exporta o array de tools do domínio comercial.
import type { ToolEntry } from "../../catalog/types.js";
import { comercialPedidosPeriodo } from "./pedidos-periodo.js";

export const comercialTools: ToolEntry[] = [
  comercialPedidosPeriodo as ToolEntry,
];

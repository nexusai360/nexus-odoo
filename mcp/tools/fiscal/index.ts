// mcp/tools/fiscal/index.ts
// Índice do domínio fiscal. Exporta o array de tools.
import type { ToolEntry } from "../../catalog/types.js";
import { fiscalFaturamentoPeriodo } from "./faturamento-periodo.js";

export const fiscalTools: ToolEntry[] = [
  fiscalFaturamentoPeriodo as ToolEntry,
];

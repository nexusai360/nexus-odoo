// mcp/tools/fiscal/index.ts
// Índice do domínio fiscal. Exporta o array de tools.
import type { ToolEntry } from "../../catalog/types.js";
import { fiscalFaturamentoPeriodo } from "./faturamento-periodo.js";
import { fiscalNotasEmitidas } from "./notas-emitidas.js";

export const fiscalTools: ToolEntry[] = [
  fiscalFaturamentoPeriodo as ToolEntry,
  fiscalNotasEmitidas as ToolEntry,
];

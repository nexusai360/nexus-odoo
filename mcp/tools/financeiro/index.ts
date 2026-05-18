// mcp/tools/financeiro/index.ts
// Índice do domínio de financeiro. Exporta o array de tools.
// Preenchido nas tasks 4d.1-t … 4d.7-t (uma tool por arquivo).
import type { ToolEntry } from "../../catalog/types.js";
import { financeiroSaldoContas } from "./saldo-contas.js";

export const financeiroTools: ToolEntry[] = [
  financeiroSaldoContas as ToolEntry,
];

// mcp/tools/contabil/index.ts
// Índice do domínio contábil. Exporta o array de tools (2 tools , E.4/E.5).
import type { ToolEntry } from "../../catalog/types.js";
import { contabilPlanoDeContas } from "./plano-de-contas.js";
import { contabilEstruturaConta } from "./estrutura-conta.js";

export const contabilTools: ToolEntry[] = [
  contabilPlanoDeContas as ToolEntry,
  contabilEstruturaConta as ToolEntry,
];

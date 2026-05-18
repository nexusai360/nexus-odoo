// mcp/tools/contabil/index.ts
// Índice do domínio contábil. Exporta o array de tools.
import type { ToolEntry } from "../../catalog/types.js";
import { contabilPlanoDeContas } from "./plano-de-contas.js";

export const contabilTools: ToolEntry[] = [contabilPlanoDeContas as ToolEntry];

// mcp/tools/caminho3/index.ts
// Índice das tools do Caminho 3 (lacunas + BI avançado).
import type { ToolEntry } from "../../catalog/types.js";
import { registrarLacuna } from "./registrar-lacuna.js";

export const caminho3Tools: ToolEntry[] = [
  registrarLacuna as ToolEntry,
];

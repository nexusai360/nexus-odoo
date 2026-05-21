// mcp/tools/crm/index.ts
// Índice do domínio crm. Exporta o array de tools.
import type { ToolEntry } from "../../catalog/types.js";
import { crmResPartnerGet } from "./res-partner-get.js";

export const crmTools: ToolEntry[] = [
  crmResPartnerGet as ToolEntry,
];

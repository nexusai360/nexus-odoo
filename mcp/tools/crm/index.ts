// mcp/tools/crm/index.ts
// Índice do domínio crm. Exporta o array de tools (leitura + escrita).
import type { ToolEntry } from "../../catalog/types.js";
import { crmResPartnerGet } from "./res-partner-get.js";
import { crmResPartnerCreate } from "./res-partner-create.js";

export const crmTools: ToolEntry[] = [
  crmResPartnerGet as ToolEntry,
  // Write tool , discriminada em runtime por `operation: "write"` (isWriteToolEntry).
  // O modo interno (Agente Nex) não a enxerga: visibleTools filtra por `dominio`,
  // que write tools não têm. O modo externo a libera por capability da chave.
  crmResPartnerCreate as unknown as ToolEntry,
];

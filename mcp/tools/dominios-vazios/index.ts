// mcp/tools/dominios-vazios/index.ts
// Agrega as tools de domínios sem dado operacional no Odoo da Matrix.
// Todas são sempreVisivel: true e não consultam fato algum.
import type { ToolEntry } from "../../catalog/types.js";
import { rhStatusDominio } from "./rh-status-dominio.js";

export const dominiosVaziosTools: ToolEntry[] = [
  rhStatusDominio as ToolEntry,
];

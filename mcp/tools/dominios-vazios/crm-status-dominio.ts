// mcp/tools/dominios-vazios/crm-status-dominio.ts
// Tool MCP: crm_status_dominio
// Domínio sem dado operacional , resposta honesta estruturada.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";

const inputSchema = z.object({});

const outputSchema = z.object({
  dominio: z.literal("crm"),
  operado: z.literal(false),
  registros: z.literal(0),
  mensagem: z.string(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const crmStatusDominio: ToolEntry<Input, Output> = {
  id: "crm_status_dominio",
  sempreVisivel: true,
  descricao:
    "Informa o status do domínio CRM no Odoo da Matrix: módulo existente mas não operado (0 registros).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, _ctx) => ({
    dominio: "crm" as const,
    operado: false as const,
    registros: 0 as const,
    mensagem:
      "O domínio CRM existe no Odoo da Matrix mas não é operado , 0 registros. " +
      "Quando a Matrix passar a usar o módulo, este domínio ganha tools de consulta.",
  }),
};

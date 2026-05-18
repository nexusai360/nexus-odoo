// mcp/tools/dominios-vazios/producao-status-dominio.ts
// Tool MCP: producao_status_dominio
// Domínio sem dado operacional — resposta honesta estruturada.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";

const inputSchema = z.object({});

const outputSchema = z.object({
  dominio: z.literal("producao"),
  operado: z.literal(false),
  registros: z.literal(0),
  mensagem: z.string(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const producaoStatusDominio: ToolEntry<Input, Output> = {
  id: "producao_status_dominio",
  sempreVisivel: true,
  descricao:
    "Informa o status do domínio Produção no Odoo da Matrix: módulo existente mas não operado (0 registros).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, _ctx) => ({
    dominio: "producao" as const,
    operado: false as const,
    registros: 0 as const,
    mensagem:
      "O domínio Produção existe no Odoo da Matrix mas não é operado — 0 registros. " +
      "Quando a Matrix passar a usar o módulo, este domínio ganha tools de consulta.",
  }),
};

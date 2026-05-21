// mcp/tools/crm/res-partner-get.ts
// Tool MCP: crm.res_partner.get — leitura do CACHE local (rawResPartner).
// NÃO toca o Odoo — lê do Postgres interno conforme decisão canônica #1 e #2.

import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";

const inputSchema = z.object({
  /** ID interno do res.partner no Odoo (odooId no cache). */
  id: z.number().int().positive(),
});

const outputSchema = z.union([
  z.object({
    found: z.literal(true),
    record: z.unknown(),
  }),
  z.object({
    found: z.literal(false),
    record: z.null(),
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const crmResPartnerGet: ToolEntry<Input, Output> = {
  id: "crm.res_partner.get",
  dominio: "crm",
  descricao:
    "Retorna o registro raw de um res.partner pelo seu ID do Odoo. " +
    "Lê do cache local (rawResPartner) — não consulta o Odoo ao vivo. " +
    "Retorna o campo `data` (JSON bruto sincronizado) e metadados de sync.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  addedInVersion: 2,
  handler: async (input, ctx) => {
    const record = await ctx.prisma.rawResPartner.findUnique({
      where: { odooId: input.id },
    });

    if (!record) {
      return { found: false, record: null };
    }

    return { found: true, record };
  },
};

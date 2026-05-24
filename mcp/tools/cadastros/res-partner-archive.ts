// mcp/tools/cadastros/res-partner-archive.ts
// Tool MCP de ESCRITA: cadastros.res_partner.archive
//
// Arquiva (soft delete) um parceiro definindo active=false.
// Reversivel via cadastros.res_partner.update {active: true}.
// Requer capability archive:cadastros.

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { PARTNER_SNAPSHOT_FIELDS } from "../../lib/fields/partner-fields.js";
import { buildExamples } from "../../lib/build-tool-examples.js";

const inputSchema = z.object({
  id: z.number().int().positive(),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.record(z.string(), z.unknown()).nullable();
type OdooRecord = Record<string, unknown> | null;

export const cadastrosResPartnerArchive: WriteToolEntry<Input, OdooRecord> = {
  id: "cadastros.res_partner.archive",
  operation: "write",
  module: "cadastros",
  descricao:
    "Arquiva (desativa) um parceiro definindo active=false. Reversivel: chame " +
    "cadastros.res_partner.update com {active: true}. Use cadastros.res_partner.delete " +
    "para remocao permanente.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  capability: { module: "cadastros", action: "archive" },
  sensitive: false,
  odooModel: "res.partner",
  affectsModels: ["res.partner"],
  eventName: "cadastros.res_partner.archived",
  requiresExternalAuth: true,
  addedInVersion: 2,
  examples: buildExamples({
    toolId: "cadastros.res_partner.archive",
    sampleInput: { id: 16426 },
  }),

  handler: async (input, ctx): Promise<WriteToolResult<OdooRecord>> => {
    const { odoo } = ctx;
    const before = await odoo.read("res.partner", [input.id], [...PARTNER_SNAPSHOT_FIELDS]);
    const snapshotBefore = (before[0] as OdooRecord) ?? null;

    await odoo.write("res.partner", [input.id], { active: false });

    const after = await odoo.read("res.partner", [input.id], [...PARTNER_SNAPSHOT_FIELDS]);
    const snapshotAfter = (after[0] as OdooRecord) ?? null;

    return { id: input.id, data: snapshotAfter, snapshotBefore, snapshotAfter };
  },
};

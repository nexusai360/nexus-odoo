// mcp/tools/cadastros/res-partner-delete.ts
// Tool MCP de ESCRITA: cadastros.res_partner.delete
//
// Remove permanentemente um parceiro (Odoo unlink). IRREVERSIVEL.
// Se houver registros vinculados (pedidos, lancamentos, etc), o Odoo
// rejeita com FK constraint -> ParceiroEmUsoError.
//
// Para desativar reversivelmente, use cadastros.res_partner.archive.

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { PARTNER_SNAPSHOT_FIELDS } from "../../lib/fields/partner-fields.js";
import { buildExamples } from "../../lib/build-tool-examples.js";
import { ParceiroEmUsoError } from "../../lib/errors.js";
import { OdooValidationError } from "@/worker/odoo/errors.js";

const inputSchema = z.object({
  id: z.number().int().positive(),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.record(z.string(), z.unknown()).nullable();
type OdooRecord = Record<string, unknown> | null;

export const cadastrosResPartnerDelete: WriteToolEntry<Input, OdooRecord> = {
  id: "cadastros.res_partner.delete",
  operation: "write",
  module: "cadastros",
  descricao:
    "Remove permanentemente um parceiro (unlink). IRREVERSIVEL. Falha com " +
    "ParceiroEmUsoError se houver pedidos/lancamentos/usuarios vinculados. " +
    "Para desativacao reversivel, use cadastros.res_partner.archive.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  capability: { module: "cadastros", action: "delete" },
  sensitive: true,
  odooModel: "res.partner",
  affectsModels: ["res.partner"],
  eventName: "cadastros.res_partner.deleted",
  requiresExternalAuth: true,
  addedInVersion: 2,
  examples: buildExamples({
    toolId: "cadastros.res_partner.delete",
    sampleInput: { id: 16426 },
  }),

  handler: async (input, ctx): Promise<WriteToolResult<OdooRecord>> => {
    const { odoo } = ctx;

    const before = await odoo.read("res.partner", [input.id], [...PARTNER_SNAPSHOT_FIELDS]);
    const snapshotBefore = (before[0] as OdooRecord) ?? null;

    try {
      await odoo.unlink("res.partner", [input.id]);
    } catch (e) {
      if (
        e instanceof OdooValidationError &&
        /foreign key constraint|res_partner/i.test(e.message)
      ) {
        throw new ParceiroEmUsoError(input.id, e.message);
      }
      throw e;
    }

    return { id: input.id, data: null, snapshotBefore, snapshotAfter: null };
  },
};

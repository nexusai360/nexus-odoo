// mcp/tools/cadastros/res-partner-category-set-tags.ts
// Tool MCP de ESCRITA: cadastros.res_partner_category.set_tags
//
// Associa tags (res.partner.category) a um parceiro.
// Modes:
//   - add (default): adiciona as tags (idempotente, sem remover existentes)
//   - remove: remove as tags listadas (idempotente)
//   - replace: substitui TODAS as tags existentes pelas listadas (DESTRUTIVO)
//
// Sintaxe Odoo m2m validada empiricamente em scripts/e2e/teste-J-many2many-syntax.py.

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { PARTNER_SNAPSHOT_FIELDS } from "../../lib/fields/partner-fields.js";
import { buildExamples } from "../../lib/build-tool-examples.js";

const inputSchema = z.object({
  partner_id: z.number().int().positive(),
  category_ids: z.array(z.number().int().positive()).min(1),
  mode: z.enum(["add", "remove", "replace"]).default("add"),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.record(z.string(), z.unknown()).nullable();
type OdooRecord = Record<string, unknown> | null;

export const cadastrosResPartnerCategorySetTags: WriteToolEntry<Input, OdooRecord> = {
  id: "cadastros.res_partner_category.set_tags",
  operation: "write",
  module: "cadastros",
  descricao:
    "Gerencia as tags de um parceiro. Modes: 'add' (default, adiciona sem remover), " +
    "'remove' (remove as listadas), 'replace' (DESTRUTIVO: substitui todas pelas listadas). " +
    "ADD/REMOVE sao idempotentes. Use REPLACE com cuidado.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  capability: { module: "cadastros", action: "update" },
  sensitive: false,
  odooModel: "res.partner",
  affectsModels: ["res.partner"],
  eventName: "cadastros.res_partner.tags_set",
  requiresExternalAuth: true,
  addedInVersion: 2,
  examples: buildExamples({
    toolId: "cadastros.res_partner_category.set_tags",
    sampleInput: { partner_id: 16426, category_ids: [1, 2], mode: "add" },
  }),

  handler: async (input, ctx): Promise<WriteToolResult<OdooRecord>> => {
    const { odoo } = ctx;

    const before = await odoo.read("res.partner", [input.partner_id], [...PARTNER_SNAPSHOT_FIELDS]);
    const snapshotBefore = (before[0] as OdooRecord) ?? null;

    let command: unknown;
    if (input.mode === "replace") {
      command = [[6, 0, input.category_ids]];
    } else if (input.mode === "remove") {
      command = input.category_ids.map((id) => [3, id]);
    } else {
      command = input.category_ids.map((id) => [4, id]);
    }
    await odoo.write("res.partner", [input.partner_id], { category_id: command });

    const after = await odoo.read("res.partner", [input.partner_id], [...PARTNER_SNAPSHOT_FIELDS]);
    const snapshotAfter = (after[0] as OdooRecord) ?? null;

    return { id: input.partner_id, data: snapshotAfter, snapshotBefore, snapshotAfter };
  },
};

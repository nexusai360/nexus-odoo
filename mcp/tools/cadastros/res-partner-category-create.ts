// mcp/tools/cadastros/res-partner-category-create.ts
// Tool MCP de ESCRITA: cadastros.res_partner_category.create
//
// Cria uma tag/categoria de parceiro (res.partner.category).
// Idempotente por (name, parent_id): se ja existir, retorna o existente
// com created=false. Em casos de race extrema pode duplicar.

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { CATEGORY_SNAPSHOT_FIELDS } from "../../lib/fields/category-fields.js";
import { buildExamples } from "../../lib/build-tool-examples.js";

const inputSchema = z.object({
  name: z.string().min(1).max(64),
  /** Indice de cor (0-11), opcional. */
  color: z.number().int().min(0).max(11).optional(),
  /** Categoria pai (hierarquia), opcional. */
  parent_id: z.number().int().positive().optional(),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  category: z.record(z.string(), z.unknown()).nullable(),
  created: z.boolean(),
});
type CategoryOutput = z.infer<typeof outputSchema>;

export const cadastrosResPartnerCategoryCreate: WriteToolEntry<Input, CategoryOutput> = {
  id: "cadastros.res_partner_category.create",
  operation: "write",
  module: "cadastros",
  descricao:
    "Cria uma tag/categoria de parceiro (res.partner.category). Idempotente por " +
    "(name, parent_id): se ja existir uma com mesmo nome e mesma categoria pai, " +
    "retorna a existente com created=false. Em race extrema pode duplicar.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  capability: { module: "cadastros", action: "create" },
  sensitive: false,
  odooModel: "res.partner.category",
  affectsModels: ["res.partner.category"],
  eventName: "cadastros.res_partner_category.created",
  requiresExternalAuth: true,
  addedInVersion: 2,
  examples: buildExamples({
    toolId: "cadastros.res_partner_category.create",
    sampleInput: { name: "VIP", color: 1 },
  }),

  handler: async (input, ctx): Promise<WriteToolResult<CategoryOutput>> => {
    const { odoo } = ctx;
    const parentId = input.parent_id ?? false;

    // 1. Idempotencia: busca existente
    const existing = await odoo.searchRead<{ id: number }>(
      "res.partner.category",
      [
        ["name", "=", input.name],
        ["parent_id", "=", parentId],
      ],
      ["id"],
      { limit: 1 },
    );
    if (existing.length > 0) {
      const id = existing[0].id;
      const after = await odoo.read("res.partner.category", [id], [...CATEGORY_SNAPSHOT_FIELDS]);
      const cat = (after[0] as Record<string, unknown>) ?? null;
      return {
        id,
        data: { category: cat, created: false },
        snapshotBefore: null,
        snapshotAfter: cat,
      };
    }

    // 2. Criar nova
    const vals: Record<string, unknown> = { name: input.name };
    if (input.color !== undefined) vals.color = input.color;
    if (input.parent_id !== undefined) vals.parent_id = input.parent_id;
    const id = await odoo.create("res.partner.category", vals);

    const after = await odoo.read("res.partner.category", [id], [...CATEGORY_SNAPSHOT_FIELDS]);
    const cat = (after[0] as Record<string, unknown>) ?? null;

    return {
      id,
      data: { category: cat, created: true },
      snapshotBefore: null,
      snapshotAfter: cat,
    };
  },
};

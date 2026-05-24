// mcp/tools/cadastros/mail-activity-update.ts
// Tool MCP de ESCRITA: cadastros.mail_activity.update
//
// Atualiza campos editaveis de uma atividade existente.
// NAO permite mudar res_model/res_id (atividade nao muda de "dono").

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { ACTIVITY_SNAPSHOT_FIELDS } from "../../lib/fields/activity-fields.js";
import { buildExamples } from "../../lib/build-tool-examples.js";

const inputBase = z.object({
  id: z.number().int().positive(),
  summary: z.string().min(1).max(256).optional(),
  note: z.string().optional(),
  date_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  user_id: z.number().int().positive().optional(),
  activity_type_id: z.number().int().positive().optional(),
});

const inputSchema = inputBase.refine(
  (v) => {
    const keys = Object.keys(v).filter(
      (k) => k !== "id" && (v as Record<string, unknown>)[k] !== undefined,
    );
    return keys.length > 0;
  },
  { message: "Forneca ao menos um campo alem de 'id' para atualizar." },
);
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.record(z.string(), z.unknown()).nullable();
type OdooRecord = Record<string, unknown> | null;

export const cadastrosMailActivityUpdate: WriteToolEntry<Input, OdooRecord> = {
  id: "cadastros.mail_activity.update",
  operation: "write",
  module: "cadastros",
  descricao:
    "Atualiza summary, note, date_deadline, user_id ou activity_type_id de uma " +
    "atividade existente. NAO permite mudar res_model/res_id (atividade nao " +
    "muda de registro alvo). Exige ao menos 1 campo alem de id.",
  inputSchemaShape: inputBase.shape,
  inputSchema,
  outputSchema,
  capability: { module: "cadastros", action: "update" },
  sensitive: false,
  odooModel: "mail.activity",
  affectsModels: ["mail.activity"],
  eventName: "cadastros.mail_activity.updated",
  requiresExternalAuth: true,
  addedInVersion: 2,
  examples: buildExamples({
    toolId: "cadastros.mail_activity.update",
    sampleInput: { id: 11, date_deadline: "2026-06-15", summary: "Reagendado" },
  }),

  handler: async (input, ctx): Promise<WriteToolResult<OdooRecord>> => {
    const { odoo } = ctx;

    const before = await odoo.read("mail.activity", [input.id], [...ACTIVITY_SNAPSHOT_FIELDS]);
    const snapshotBefore = (before[0] as OdooRecord) ?? null;

    const vals: Record<string, unknown> = {};
    if (input.summary !== undefined) vals.summary = input.summary;
    if (input.note !== undefined) vals.note = input.note;
    if (input.date_deadline !== undefined) vals.date_deadline = input.date_deadline;
    if (input.user_id !== undefined) vals.user_id = input.user_id;
    if (input.activity_type_id !== undefined) vals.activity_type_id = input.activity_type_id;
    await odoo.write("mail.activity", [input.id], vals);

    const after = await odoo.read("mail.activity", [input.id], [...ACTIVITY_SNAPSHOT_FIELDS]);
    const snapshotAfter = (after[0] as OdooRecord) ?? null;

    return { id: input.id, data: snapshotAfter, snapshotBefore, snapshotAfter };
  },
};

// mcp/tools/cadastros/mail-activity-create.ts
// Tool MCP de ESCRITA: cadastros.mail_activity.create
//
// Cria uma atividade (tarefa) atrelada a um record qualquer do Odoo.
// Uso tipico: criar tarefa "Ligar para o cliente" em res.partner.
//
// Notas:
//  - res_model e string (ex: "res.partner"); resolvido para ir.model.id via cache.
//  - res_id e validado existencia antes de criar (evita atividades orfas).
//  - note aceita HTML; cliente deve sanitizar ao renderizar (XSS e responsabilidade do consumer).
//  - validacao usa odoo client do worker (sempre autenticado), nao a API key do user.

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { ACTIVITY_SNAPSHOT_FIELDS } from "../../lib/fields/activity-fields.js";
import { buildExamples } from "../../lib/build-tool-examples.js";
import { resolveModelId } from "../../lib/resolve-model-id.js";
import { RegistroNaoEncontradoError } from "../../lib/errors.js";

const inputSchema = z.object({
  res_model: z.string().min(1).max(64),
  res_id: z.number().int().positive(),
  summary: z.string().min(1).max(256),
  note: z.string().optional(),
  /** ISO date YYYY-MM-DD. */
  date_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  user_id: z.number().int().positive(),
  activity_type_id: z.number().int().positive().optional(),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.record(z.string(), z.unknown()).nullable();
type OdooRecord = Record<string, unknown> | null;

export const cadastrosMailActivityCreate: WriteToolEntry<Input, OdooRecord> = {
  id: "cadastros.mail_activity.create",
  operation: "write",
  module: "cadastros",
  descricao:
    "Cria uma atividade/tarefa atrelada a qualquer record Odoo (parceiro, pedido, etc). " +
    "Define prazo (date_deadline), responsavel (user_id), tipo (activity_type_id) " +
    "e descricao (summary + note opcional em HTML). Use cadastros.mail_activity.complete " +
    "para concluir. note aceita HTML; sanitize ao renderizar para o usuario final.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  capability: { module: "cadastros", action: "create" },
  sensitive: false,
  odooModel: "mail.activity",
  affectsModels: ["mail.activity"],
  eventName: "cadastros.mail_activity.created",
  requiresExternalAuth: true,
  addedInVersion: 2,
  examples: buildExamples({
    toolId: "cadastros.mail_activity.create",
    sampleInput: {
      res_model: "res.partner",
      res_id: 16426,
      summary: "Ligar para o cliente",
      note: "<p>Cliente solicitou retorno em 48h.</p>",
      date_deadline: "2026-05-30",
      user_id: 11,
      activity_type_id: 2,
    },
  }),

  handler: async (input, ctx): Promise<WriteToolResult<OdooRecord>> => {
    const { odoo } = ctx;

    // 1. Resolver res_model_id (com cache) — lanca ModeloNaoSuportadoError
    const resModelId = await resolveModelId(odoo, input.res_model);

    // 2. Validar res_id existe no modelo
    const existing = await odoo.searchRead<{ id: number }>(
      input.res_model,
      [["id", "=", input.res_id]],
      ["id"],
      { limit: 1 },
    );
    if (existing.length === 0) {
      throw new RegistroNaoEncontradoError(input.res_model, input.res_id);
    }

    // 3. Criar atividade
    const vals: Record<string, unknown> = {
      res_model_id: resModelId,
      res_id: input.res_id,
      summary: input.summary,
      date_deadline: input.date_deadline,
      user_id: input.user_id,
    };
    if (input.note !== undefined) vals.note = input.note;
    if (input.activity_type_id !== undefined) vals.activity_type_id = input.activity_type_id;

    const id = await odoo.create("mail.activity", vals);

    const after = await odoo.read("mail.activity", [id], [...ACTIVITY_SNAPSHOT_FIELDS]);
    const snapshotAfter = (after[0] as OdooRecord) ?? null;

    return { id, data: snapshotAfter, snapshotBefore: null, snapshotAfter };
  },
};

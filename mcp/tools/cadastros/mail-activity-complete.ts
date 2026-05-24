// mcp/tools/cadastros/mail-activity-complete.ts
// Tool MCP de ESCRITA: cadastros.mail_activity.complete
//
// Marca uma atividade como concluida (mail.activity.action_done).
// Comportamento validado em scripts/e2e/teste-K-activity-done.py:
//   - Sucesso: retorna int (id da mail.message criada). A atividade e REMOVIDA.
//   - Segunda chamada no mesmo id: OdooMissingError -> AtividadeNaoEncontradaError.

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { buildExamples } from "../../lib/build-tool-examples.js";
import { AtividadeNaoEncontradaError } from "../../lib/errors.js";
import { OdooMissingError } from "@/worker/odoo/errors.js";

const inputSchema = z.object({
  id: z.number().int().positive(),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  success: z.boolean(),
  messageId: z.number().int().nullable(),
  completedAt: z.string(),
});
type CompleteOutput = z.infer<typeof outputSchema>;

export const cadastrosMailActivityComplete: WriteToolEntry<Input, CompleteOutput> = {
  id: "cadastros.mail_activity.complete",
  operation: "write",
  module: "cadastros",
  descricao:
    "Conclui uma atividade (action_done). O Odoo cria uma mail.message de feedback " +
    "e REMOVE a atividade (o estado não fica 'done', a atividade é apagada). Uma " +
    "segunda chamada no mesmo id retorna AtividadeNaoEncontradaError.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  capability: { module: "cadastros", action: "transition" },
  sensitive: false,
  odooModel: "mail.activity",
  affectsModels: ["mail.activity", "mail.message"],
  eventName: "cadastros.mail_activity.completed",
  requiresExternalAuth: true,
  addedInVersion: 2,
  examples: buildExamples({
    toolId: "cadastros.mail_activity.complete",
    sampleInput: { id: 11 },
  }),

  handler: async (input, ctx): Promise<WriteToolResult<CompleteOutput>> => {
    const { odoo } = ctx;

    let raw: unknown;
    try {
      raw = await odoo.executeKw("mail.activity", "action_done", [[input.id]]);
    } catch (e) {
      if (e instanceof OdooMissingError) {
        throw new AtividadeNaoEncontradaError(input.id);
      }
      throw e;
    }

    let messageId: number | null = null;
    if (typeof raw === "number") {
      messageId = raw;
    } else if (Array.isArray(raw) && typeof raw[0] === "number") {
      messageId = raw[0] as number;
    }

    const data: CompleteOutput = {
      success: true,
      messageId,
      completedAt: new Date().toISOString(),
    };

    return { id: input.id, data, snapshotBefore: null, snapshotAfter: null };
  },
};

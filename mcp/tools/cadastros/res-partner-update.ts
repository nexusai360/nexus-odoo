// mcp/tools/cadastros/res-partner-update.ts
// Tool MCP de ESCRITA: cadastros.res_partner.update
//
// Atualiza um parceiro existente no Odoo via JSON-RPC oficial.
// Requer API key com capability update:cadastros.
//
// Notas:
//  - whatsapp e alias de mobile (Tauga nao tem campo dedicado). Se ambos
//    forem informados, whatsapp prevalece.
//  - snapshot before e lido por padrao (audit). Pode ser pulado com
//    _skipSnapshotBefore=true em flows de alto volume.
//  - exige pelo menos 1 campo alem de id.

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { PARTNER_SNAPSHOT_FIELDS } from "../../lib/fields/partner-fields.js";
import { buildExamples } from "../../lib/build-tool-examples.js";

// ─── Input schema ─────────────────────────────────────────────────────────────

const inputBase = z.object({
  id: z.number().int().positive(),
  // identidade
  name: z.string().min(1).max(128).optional(),
  is_company: z.boolean().optional(),
  company_type: z.enum(["person", "company"]).optional(),
  company_registry: z.string().optional(),
  vat: z.string().optional(),
  // contato
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  /** Alias de mobile. Se passado junto com mobile, prevalece. */
  whatsapp: z.string().optional(),
  website: z.string().optional(),
  function: z.string().optional(),
  // endereco
  street: z.string().optional(),
  street2: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  country_id: z.number().int().positive().optional(),
  state_id: z.number().int().positive().optional(),
  // categorizacao
  industry_id: z.number().int().positive().optional(),
  title: z.number().int().positive().optional(),
  // flags
  active: z.boolean().optional(),
  customer: z.boolean().optional(),
  supplier: z.boolean().optional(),
  employee: z.boolean().optional(),
  // outros
  lang: z.string().optional(),
  tz: z.string().optional(),
  comment: z.string().optional(),
  ref: z.string().optional(),
  // controle
  _skipSnapshotBefore: z.boolean().default(false),
});

const inputSchema = inputBase
  .transform((v) => {
    const out: Record<string, unknown> = { ...v };
    if (typeof out.whatsapp === "string" && out.whatsapp.length > 0) {
      out.mobile = out.whatsapp;
    }
    delete out.whatsapp;
    return out as z.infer<typeof inputBase> & { mobile?: string };
  })
  .refine(
    (v) => {
      const keys = Object.keys(v).filter(
        (k) => k !== "id" && k !== "_skipSnapshotBefore" && (v as Record<string, unknown>)[k] !== undefined,
      );
      return keys.length > 0;
    },
    { message: "Forneca ao menos um campo alem de 'id' para atualizar." },
  );

type Input = z.infer<typeof inputSchema>;

// ─── Output schema ────────────────────────────────────────────────────────────

const outputSchema = z.record(z.string(), z.unknown()).nullable();
type OdooRecord = Record<string, unknown> | null;

// ─── Tool entry ───────────────────────────────────────────────────────────────

export const cadastrosResPartnerUpdate: WriteToolEntry<Input, OdooRecord> = {
  id: "cadastros.res_partner.update",
  operation: "write",
  module: "cadastros",
  descricao:
    "Atualiza um parceiro (cliente, fornecedor ou contato) existente no Odoo. " +
    "Aceita campos de identidade, contato, endereço, classificação e flags " +
    "(active/customer/supplier/employee). 'whatsapp' é apelido de 'mobile' " +
    "(se ambos forem passados, whatsapp prevalece). O snapshot anterior é lido por padrão; " +
    "use _skipSnapshotBefore=true em fluxos de alto volume.",
  inputSchemaShape: inputBase.shape,
  inputSchema,
  outputSchema,
  capability: { module: "cadastros", action: "update" },
  sensitive: false,
  odooModel: "res.partner",
  affectsModels: ["res.partner"],
  eventName: "cadastros.res_partner.updated",
  requiresExternalAuth: true,
  addedInVersion: 2,
  examples: buildExamples({
    toolId: "cadastros.res_partner.update",
    sampleInput: {
      id: 16426,
      phone: "(11) 4002-8923",
      whatsapp: "(11) 99999-1234",
      comment: "<p>Atualizado em 2026-05-23.</p>",
    },
  }),

  handler: async (input, ctx): Promise<WriteToolResult<OdooRecord>> => {
    const { odoo } = ctx;
    const { id, _skipSnapshotBefore, ...rest } = input as Input & {
      id: number;
      _skipSnapshotBefore?: boolean;
    };

    // 1. Snapshot before (default true)
    let snapshotBefore: OdooRecord = null;
    if (!_skipSnapshotBefore) {
      const rows = await odoo.read("res.partner", [id], [...PARTNER_SNAPSHOT_FIELDS]);
      snapshotBefore = (rows[0] as OdooRecord) ?? null;
    }

    // 2. Write , apenas campos definidos
    const vals: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) vals[k] = v;
    }
    await odoo.write("res.partner", [id], vals);

    // 3. Snapshot after
    const after = await odoo.read("res.partner", [id], [...PARTNER_SNAPSHOT_FIELDS]);
    const snapshotAfter = (after[0] as OdooRecord) ?? null;

    return { id, data: snapshotAfter, snapshotBefore, snapshotAfter };
  },
};

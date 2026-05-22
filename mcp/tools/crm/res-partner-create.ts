// mcp/tools/crm/res-partner-create.ts
// Tool MCP de ESCRITA: crm.res_partner.create
//
// Cria um novo res.partner no Odoo via JSON-RPC e retorna o snapshot pós-criação.
// Requer autenticação externa (API key com capability crm:create).
//
// Fluxo:
//   1. Se external_id fornecido: verificar duplicidade em ir.model.data (ExternalIdAlreadyExistsError se existir).
//   2. odoo.create("res.partner", vals)
//   3. Se external_id: odoo.create("ir.model.data", {...})
//   4. odoo.read("res.partner", [newId], FIELDS_RES_PARTNER) → snapshotAfter
//   5. Retornar WriteToolResult { id: newId, data, snapshotBefore: null, snapshotAfter }

import { z } from "zod";
import type { WriteToolEntry, WriteToolResult } from "../../catalog/types.js";
import { ExternalIdAlreadyExistsError } from "../../lib/errors.js";

// ─── Campos que sempre lemos de volta do Odoo após criar/alterar ─────────────
// TODO: confirmar lista definitiva de campos contra discovery do Odoo (F0).
// Campos comuns do res.partner — discovery a completar.
export const FIELDS_RES_PARTNER = [
  "id",
  "name",
  "is_company",
  "email",
  "phone",
  "street",
  "city",
  "zip",
  "country_id",
  "state_id",
  "active",
  "customer_rank",
  "supplier_rank",
  "write_date",
  // TODO(discovery): confirmar se cnpj_cpf é o campo real ou l10n_br_cnpj_cpf
  "cnpj_cpf",
] as const;

// ─── Input schema ─────────────────────────────────────────────────────────────

const inputSchema = z.object({
  /** Nome do parceiro — obrigatório. */
  name: z.string().min(1).max(128),
  /**
   * CNPJ ou CPF. O campo no Odoo Brasil (OCA) é `cnpj_cpf`.
   * TODO(discovery): confirmar nome exato do campo na instância Tauga.
   */
  cnpj_cpf: z.string().optional(),
  /** Se true, o parceiro é uma empresa (PJ). */
  is_company: z.boolean().default(false),
  /** E-mail do parceiro. */
  email: z.string().email().optional(),
  /** Telefone. */
  phone: z.string().optional(),
  /** Logradouro. */
  street: z.string().optional(),
  /** ID da cidade (many2one res.city). */
  city_id: z.number().int().positive().optional(),
  /** ID do estado (many2one res.country.state). */
  state_id: z.number().int().positive().optional(),
  /**
   * Chave externa para rastreabilidade (ex.: ID do sistema de origem).
   * Máximo 64 chars. Quando fornecido, cria um registro em ir.model.data
   * com name="mcp_external_{external_id}", module="mcp_nexus".
   */
  external_id: z.string().max(64).optional(),
});

type Input = z.infer<typeof inputSchema>;

// ─── Output schema ────────────────────────────────────────────────────────────
//
// WriteToolEntry<I, O> exige: outputSchema: ZodType<O> e handler retorna WriteToolResult<O>.
// O = tipo do dado de negócio (conteúdo de `data` e `snapshotAfter`).
// WriteToolResult<O> = { id, data: O, snapshotBefore, snapshotAfter: O | null }
//
// Usamos z.record para o payload Odoo — campos variáveis por discovery futuro.
const odooRecordSchema = z.record(z.string(), z.unknown()).nullable();

// outputSchema é ZodType<O> onde O = Record<string, unknown> | null
const outputSchema = odooRecordSchema;

type OdooRecord = Record<string, unknown> | null;

// ─── Mapeamento Input → Odoo vals ─────────────────────────────────────────────

function mapInputToOdoo(input: Input): Record<string, unknown> {
  const vals: Record<string, unknown> = {
    name: input.name,
    is_company: input.is_company,
  };

  if (input.cnpj_cpf !== undefined) {
    // TODO(discovery): confirmar nome do campo cnpj_cpf na instância Tauga.
    vals["cnpj_cpf"] = input.cnpj_cpf;
  }
  if (input.email !== undefined) vals["email"] = input.email;
  if (input.phone !== undefined) vals["phone"] = input.phone;
  if (input.street !== undefined) vals["street"] = input.street;
  if (input.city_id !== undefined) vals["city_id"] = input.city_id;
  if (input.state_id !== undefined) vals["state_id"] = input.state_id;

  return vals;
}

// ─── Tool entry ───────────────────────────────────────────────────────────────

export const crmResPartnerCreate: WriteToolEntry<Input, OdooRecord> = {
  id: "crm.res_partner.create",
  operation: "write",
  module: "crm",
  descricao:
    "Cria um novo parceiro (cliente, fornecedor ou contato) no Odoo via JSON-RPC. " +
    "Requer API key com capability crm:create. " +
    "Retorna o snapshot completo do registro criado (snapshotAfter). " +
    "Se external_id for fornecido, garante unicidade via ir.model.data.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  capability: { module: "crm", action: "create" },
  sensitive: false,
  odooModel: "res.partner",
  affectsModels: ["res.partner"],
  eventName: "crm.res_partner.created",
  requiresExternalAuth: true,
  addedInVersion: 2,

  examples: [
    {
      language: "curl",
      description: "Criar empresa via curl",
      code: `curl -X POST https://mcp.exemplo.com.br/mcp \\
  -H "Authorization: Bearer <SERVICE_TOKEN>" \\
  -H "X-Mcp-User-Id: <USER_ID>" \\
  -H "X-Api-Key: <API_KEY>" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "crm.res_partner.create",
      "arguments": {
        "name": "Academia Exemplo Ltda",
        "is_company": true,
        "cnpj_cpf": "12.345.678/0001-99",
        "email": "contato@academia.com.br",
        "phone": "(11) 9999-9999",
        "external_id": "erp-cliente-001"
      }
    }
  }'`,
    },
    {
      language: "n8n",
      description: "Node HTTP Request no n8n apontando para o MCP",
      code: `// Node: HTTP Request
// Method: POST
// URL: {{ $env.MCP_URL }}/mcp
// Headers:
//   Authorization: Bearer {{ $env.MCP_SERVICE_TOKEN }}
//   X-Mcp-User-Id: {{ $env.MCP_USER_ID }}
//   X-Api-Key: {{ $env.MCP_API_KEY }}
//   Idempotency-Key: {{ $json.idempotencyKey }}
// Body (JSON):
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "crm.res_partner.create",
    "arguments": {
      "name": "{{ $json.nome }}",
      "is_company": true,
      "email": "{{ $json.email }}",
      "external_id": "{{ $json.externalId }}"
    }
  }
}`,
    },
    {
      language: "python",
      description: "Criar parceiro com requests",
      code: `import requests, uuid

response = requests.post(
    "https://mcp.exemplo.com.br/mcp",
    headers={
        "Authorization": "Bearer <SERVICE_TOKEN>",
        "X-Mcp-User-Id": "<USER_ID>",
        "X-Api-Key": "<API_KEY>",
        "Idempotency-Key": str(uuid.uuid4()),
        "Content-Type": "application/json",
    },
    json={
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "crm.res_partner.create",
            "arguments": {
                "name": "Academia Exemplo",
                "is_company": True,
                "email": "contato@academia.com.br",
                "external_id": "python-001",
            },
        },
    },
)
data = response.json()
print(data["result"]["id"])`,
    },
    {
      language: "javascript",
      description: "Criar parceiro com fetch",
      code: `const response = await fetch("https://mcp.exemplo.com.br/mcp", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <SERVICE_TOKEN>",
    "X-Mcp-User-Id": "<USER_ID>",
    "X-Api-Key": "<API_KEY>",
    "Idempotency-Key": crypto.randomUUID(),
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "crm.res_partner.create",
      arguments: {
        name: "Academia Exemplo",
        is_company: true,
        email: "contato@academia.com.br",
        external_id: "js-001",
      },
    },
  }),
});
const { result } = await response.json();
console.log("Criado com ID:", result.id);`,
    },
  ],

  handler: async (input, ctx): Promise<WriteToolResult<OdooRecord>> => {
    const { odoo } = ctx;

    // 1. Verificar duplicidade de external_id
    if (input.external_id) {
      const existing = await odoo.searchIrModelData(
        "res.partner",
        `mcp_external_${input.external_id}`,
      );
      if (existing) {
        throw new ExternalIdAlreadyExistsError(input.external_id);
      }
    }

    // 2. Criar res.partner no Odoo
    const vals = mapInputToOdoo(input);
    const newId = await odoo.create("res.partner", vals);

    // 3. Registrar ir.model.data se external_id fornecido
    if (input.external_id) {
      await odoo.create("ir.model.data", {
        name: `mcp_external_${input.external_id}`,
        model: "res.partner",
        module: "mcp_nexus",
        res_id: newId,
        noupdate: true,
      });
    }

    // 4. Ler snapshot pós-criação do Odoo
    const rows = await odoo.read("res.partner", [newId], [...FIELDS_RES_PARTNER]);
    const snapshotAfter = (rows[0] as OdooRecord) ?? null;

    // 5. Retornar resultado padronizado
    return {
      id: newId,
      data: snapshotAfter,
      snapshotBefore: null,
      snapshotAfter,
    };
  },
};

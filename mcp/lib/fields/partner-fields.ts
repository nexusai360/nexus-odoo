// mcp/lib/fields/partner-fields.ts
// Lista canonica de campos do res.partner para snapshot pos-write.
//
// Convencao: campos essenciais + os customizados da Tauga que importam
// para o cliente do MCP (endereco, contato, classificacao).
// Nao inclui binarios (image_*) nem one2many vazios.

/** Campos canonicos do res.partner usados em snapshots (read pos-create/update). */
export const PARTNER_SNAPSHOT_FIELDS = [
  "id",
  "name",
  "display_name",
  "is_company",
  "company_type",
  "email",
  "phone",
  "mobile",
  "website",
  "function",
  "street",
  "street2",
  "city",
  "zip",
  "state_id",
  "country_id",
  "active",
  "customer",
  "supplier",
  "ref",
  "company_registry",
  "vat",
  "industry_id",
  "title",
  "category_id",
  "lang",
  "tz",
  "comment",
  "write_date",
] as const;

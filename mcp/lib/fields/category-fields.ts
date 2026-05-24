// mcp/lib/fields/category-fields.ts
// Campos canonicos para snapshot pos-write de res.partner.category (tags).

/** Campos canonicos de res.partner.category usados em snapshots. */
export const CATEGORY_SNAPSHOT_FIELDS = [
  "id",
  "name",
  "color",
  "parent_id",
  "active",
  "complete_name",
] as const;

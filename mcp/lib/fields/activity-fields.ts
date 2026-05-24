// mcp/lib/fields/activity-fields.ts
// Campos canonicos para snapshot pos-write de mail.activity.

/** Campos canonicos do mail.activity usados em snapshots. */
export const ACTIVITY_SNAPSHOT_FIELDS = [
  "id",
  "res_model",
  "res_id",
  "res_name",
  "activity_type_id",
  "activity_category",
  "summary",
  "note",
  "date_deadline",
  "user_id",
  "state",
  "create_date",
  "write_date",
] as const;

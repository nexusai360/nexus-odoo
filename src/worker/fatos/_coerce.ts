// Coerções compartilhadas dos builders (raw Odoo → fato). Defensivas: campo
// ausente/false/"" vira null; datas Odoo ("YYYY-MM-DD hh:mm:ss") viram Date.
export const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;
export const numStr = (v: unknown): string | null => {
  if (v == null || v === false || v === "") return null;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return null;
};
export const num = (v: unknown): number => (typeof v === "number" ? v : 0);
export const bool = (v: unknown): boolean => v === true;
export const dt = (v: unknown): Date | null =>
  typeof v === "string" && v ? new Date(v.replace(" ", "T")) : null;

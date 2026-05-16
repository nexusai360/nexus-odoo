// src/worker/odoo/datetime.ts
// Helpers de datetime do Odoo. O Odoo armazena e retorna datetimes (write_date,
// create_date, etc.) como strings naive em UTC no formato "YYYY-MM-DD HH:MM:SS".

/** Formata uma Date para o formato de datetime do Odoo: "YYYY-MM-DD HH:MM:SS" (UTC). */
export function odooDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Converte um datetime do Odoo (string naive UTC "YYYY-MM-DD HH:MM:SS") em Date.
 * Retorna null se o valor for vazio, `false` ou inválido.
 */
export function parseWriteDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

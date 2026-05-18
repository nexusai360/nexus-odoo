// src/worker/fatos/odoo-relational.ts

/** Campo many2one do Odoo: [id, "rótulo"] ou [id, false], ou false/null/undefined quando vazio. */
export type OdooM2O = [number, string | false] | false | null | undefined;

/** Extrai o id de um campo relacional; null quando vazio. */
export function relId(v: OdooM2O): number | null {
  return Array.isArray(v) ? v[0] : null;
}

/** Extrai o rótulo de um campo relacional; null quando vazio ou quando o rótulo é false. */
export function relNome(v: OdooM2O): string | null {
  return Array.isArray(v) && typeof v[1] === "string" ? v[1] : null;
}

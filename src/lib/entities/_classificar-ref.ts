import { soDigitos, classificarDocumento } from "./_documento";

export type TipoRef = "id" | "documento" | "codigo_numerico_longo" | "chave_nfe" | "texto";

/**
 * Classifica a referencia digitada pelo usuario (spec 3.3 passo 1 / 4.4). Precedencia:
 * chave NFe (so `^\d{44}$`, nunca 9/41/50 ou com letra) > documento (11/14 digitos via
 * classificarDocumento) > id (`^\d{1,9}$`) > codigo numerico longo (`^\d{10,18}$`, cobre
 * EAN/GTIN; acima de 18 ou com letra cai em texto) > texto.
 */
export function classificarRef(ref: string): TipoRef {
  const r = ref.trim();
  if (/^\d{44}$/.test(r)) return "chave_nfe";
  if (classificarDocumento(r) !== null && soDigitos(r) === r.replace(/\D/g, "") && /\d/.test(r) && !/[a-z]/i.test(r)) {
    return "documento";
  }
  if (/^\d{1,9}$/.test(r)) return "id";
  if (/^\d{10,18}$/.test(r)) return "codigo_numerico_longo";
  return "texto";
}

// src/lib/fiscal/grupo/cnpj.ts
/**
 * Raiz (8 digitos) de um CNPJ (14 digitos) ja-digitos ou mascarado. Null se nao tiver
 * exatamente 14 digitos , um CPF (11) NAO tem raiz de CNPJ (review arquitetura B1).
 */
export function extrairRaizCnpj(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const digits = doc.replace(/\D/g, "");
  return digits.length === 14 ? digits.slice(0, 8) : null;
}

/**
 * Raiz do 1o CNPJ embutido em texto livre. Tolera Unicode (zero-width joiner U+200D,
 * non-breaking hyphen U+2011) que aparece no participante_nome do cache (review fiscal B1):
 * primeiro remove caracteres invisiveis, depois casa 14 digitos no padrao 2-3-3-4-2 com
 * separadores nao-digito flexiveis.
 */
export function extrairRaizCnpjDeTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpo = texto.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const m = limpo.match(/(\d{2})\D?(\d{3})\D?(\d{3})\D{0,2}(\d{4})\D?(\d{2})/);
  if (!m) return null;
  const digits = m.slice(1, 6).join("");
  return digits.length === 14 ? digits.slice(0, 8) : null;
}

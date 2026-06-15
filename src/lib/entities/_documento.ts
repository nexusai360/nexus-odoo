// Normalizacao de documento (CNPJ/CPF): so digitos, imune a mascara e prefixo "BR-".

/** Mantem apenas digitos (descarta "BR-", pontos, barra, traco). Idempotente. */
export function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Classifica pelo numero de digitos: 14 = cnpj, 11 = cpf, qualquer outro = null. */
export function classificarDocumento(s: string): "cnpj" | "cpf" | null {
  const d = soDigitos(s);
  if (d.length === 14) return "cnpj";
  if (d.length === 11) return "cpf";
  return null;
}

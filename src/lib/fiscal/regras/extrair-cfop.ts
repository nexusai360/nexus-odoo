// src/lib/fiscal/regras/extrair-cfop.ts
/**
 * Extrai os 4 digitos iniciais de um cfopNome desnormalizado do item, que vem no
 * padrao "5102 - Venda de mercadoria...". Pura, sem dependencia. Retorna null
 * quando nao ha exatamente 4 digitos no inicio (apos trim).
 */
export function extrairCfop(cfopNome: string | null | undefined): string | null {
  if (!cfopNome) return null;
  const m = cfopNome.trim().match(/^(\d{4})(?!\d)/);
  return m ? m[1] : null;
}

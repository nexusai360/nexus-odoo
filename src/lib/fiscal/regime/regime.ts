/**
 * Regime tributário (Fase 5). Fonte: `sped.empresa.regime_tributario` (selection do
 * Odoo, `store=false` , lido por leitura direcionada no builder do `dim_empresa_regime`).
 *
 * Códigos do Odoo (provados ao vivo na discovery 2026-06-10):
 *   "1"   = Simples Nacional
 *   "2"   = Simples Nacional (excesso de sublimite de receita bruta)
 *   "3"   = Lucro Presumido
 *   "3.1" = Lucro Real
 *   "4"   = MEI
 */

export const REGIME_LABELS: Record<string, string> = {
  "1": "Simples Nacional",
  "2": "Simples Nacional (excesso de sublimite)",
  "3": "Lucro Presumido",
  "3.1": "Lucro Real",
  "4": "MEI",
};

/** Rótulo legível do código de regime; "Regime não informado" quando vazio/desconhecido. */
export function regimeLabel(codigo: string | null | undefined): string {
  const c = (codigo ?? "").trim();
  return REGIME_LABELS[c] ?? "Regime não informado";
}

/**
 * Raiz do CNPJ (8 primeiros dígitos) , a chave do de-para de regime, porque o
 * regime tributário é opção da pessoa jurídica (raiz), e todas as filiais herdam.
 * Tolerante a máscara e a caracteres Unicode invisíveis (ZWJ / hífen não-quebrável)
 * que aparecem nos labels do Odoo (mesma armadilha do F2.5): conta só dígitos.
 * Retorna null quando não há 8 dígitos (ex.: CNPJ ausente).
 */
export function cnpjRaiz(cnpj: string | null | undefined): string | null {
  const digitos = (cnpj ?? "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  return digitos.slice(0, 8);
}

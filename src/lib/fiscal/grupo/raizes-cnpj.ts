// src/lib/fiscal/grupo/raizes-cnpj.ts
/**
 * Raizes de CNPJ (8 digitos) dos estabelecimentos do grupo economico.
 * Fonte: pericia 2026-06-09 §2 (parseado das notas do cache). PONTO DE
 * PARAMETRIZACAO FUTURA: virar tabela/config quando o grupo mudar.
 */
export const RAIZES_GRUPO: ReadonlySet<string> = new Set([
  "07390039", "10557556", "18282961", "33718546", "34161829",
  "34461908", "35156509", "45424185", "62673999",
]);

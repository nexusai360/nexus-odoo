// src/lib/diretoria/nome-empresa.ts
//
// O nome da empresa chega do Odoo com a sigla capitalizada como palavra comum: "Jht DF
// Comércio", "Cs Comércio", "Ijht Premium Car". A sigla é a marca do grupo e tem que aparecer
// como marca: JHT, JDS, JIB, KS, CS, JMF, IJHT.
//
// Conferido no banco de produção (2026-07-14): o Odoo é inconsistente com ele mesmo. Já grava
// "JHT Brasília" com a sigla certa e "Jht DF Comércio" com a sigla errada, no mesmo cadastro.
// Por isso a normalização é nossa, na leitura, e não uma correção pedida ao cliente.

/** Siglas do grupo. Ordem importa: a mais longa primeiro, senão "JHT" comeria o "IJHT". */
const SIGLAS = ["IJHT", "JHT", "JDS", "JIB", "JMF", "KS", "CS"] as const;

/**
 * Coloca a sigla do grupo em caixa alta, preservando o resto do nome.
 *
 * Só troca a palavra INTEIRA (fronteira de palavra), então "Jht" vira "JHT" mas "Jhtx" fica
 * como está, e "Comércio" nunca é tocado.
 */
export function normalizarNomeEmpresa(nome: string): string {
  let saida = nome;
  for (const sigla of SIGLAS) {
    // \b nas duas pontas: pega "Jht" isolado, não o "jht" dentro de outra palavra.
    saida = saida.replace(new RegExp(`\\b${sigla}\\b`, "gi"), sigla);
  }
  return saida;
}

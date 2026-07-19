// src/lib/estoque/historico-preco.ts
// DEPRECADO: o append-por-mudanca virou o nucleo generico `calcularDelta` em delta-serie.ts,
// que trata preco E saldo, baixa e ressurreicao, comparando por string decimal exata (sem a
// tolerancia de centavo que o `precosQueMudaram` original usava). Mantido so como ponteiro.
export { calcularDelta } from "./delta-serie";

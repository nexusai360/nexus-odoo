/**
 * Classifica a pergunta do usuario para UM tema de vocabulario FECHADO (`TEMAS`).
 *
 * Garantia de privacidade POR CONSTRUCAO: a saida e SEMPRE um elemento de `TEMAS`
 * (dicionario fechado) ou null , nunca um trecho derivado do texto do usuario. Logo e
 * impossivel vazar CNPJ/valor/nome proprio no `recurringQuestions.label` (spec 6.5).
 *
 * Modulo PURO. Match por keyword, case/acento-insensivel.
 */

/** Vocabulario fechado de temas (alinhado aos dominios/metricas do catalogo). */
export const TEMAS = [
  "faturamento",
  "receita",
  "impostos",
  "notas fiscais",
  "estoque",
  "produtos",
  "contas a pagar",
  "contas a receber",
  "fluxo de caixa",
  "saldo em conta",
  "titulos vencidos",
  "pedidos por etapa",
  "pedidos por vendedor",
  "pedidos atrasados",
  "clientes",
  "parceiros",
  "plano de contas",
] as const;

export type Tema = (typeof TEMAS)[number];

/** Tema -> palavras-chave que o disparam. A 1a chave que casar define o tema. */
const KEYWORDS: ReadonlyArray<readonly [Tema, readonly string[]]> = [
  ["impostos", ["imposto", "tributo", "icms", "pis", "cofins", "iss"]],
  ["notas fiscais", ["nota fiscal", "notas fiscais", "nfe", "nf-e", "danfe"]],
  ["faturamento", ["faturamento", "faturou", "faturado", "vendas no", "venda no"]],
  ["receita", ["receita", "receitas"]],
  ["contas a pagar", ["contas a pagar", "conta a pagar", "a pagar", "pagamentos a"]],
  ["contas a receber", ["contas a receber", "conta a receber", "a receber", "recebiveis", "recebíveis"]],
  ["fluxo de caixa", ["fluxo de caixa", "caixa projetado", "projecao de caixa"]],
  ["saldo em conta", ["saldo das contas", "saldo em conta", "saldo bancario", "saldo banco"]],
  ["titulos vencidos", ["titulo vencido", "titulos vencidos", "vencidos", "inadimplencia", "atraso de pagamento"]],
  ["estoque", ["estoque", "armazem", "armazém", "saldo de produto", "movimentacao de produto"]],
  ["produtos", ["produto mais", "produtos mais", "item mais", "itens mais", "produto que"]],
  ["pedidos por etapa", ["etapa", "funil", "pedidos parados", "pedido parado", "travado"]],
  ["pedidos por vendedor", ["por vendedor", "vendedor que", "qual vendedor", "ranking de vendedor"]],
  ["pedidos atrasados", ["pedido atrasado", "pedidos atrasados", "pedido em atraso"]],
  ["clientes", ["cliente que", "clientes que", "qual cliente", "quais clientes", "maiores clientes"]],
  ["parceiros", ["parceiro", "parceiros", "fornecedor", "fornecedores"]],
  ["plano de contas", ["plano de contas", "estrutura contabil", "conta contabil"]],
];

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (diacriticos combinantes)
    .replace(/\s+/g, " ")
    .trim();
}

/** Retorna um tema de `TEMAS` ou null. Nunca retorna texto do usuario. */
export function normalizarPergunta(texto: string): Tema | null {
  if (!texto) return null;
  const t = normalizarTexto(texto);
  for (const [tema, kws] of KEYWORDS) {
    for (const kw of kws) {
      if (t.includes(normalizarTexto(kw))) return tema;
    }
  }
  return null;
}

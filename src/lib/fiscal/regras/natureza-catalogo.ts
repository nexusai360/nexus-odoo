// src/lib/fiscal/regras/natureza-catalogo.ts
//
// CATÁLOGO DAS NATUREZAS DE OPERAÇÃO , o que cada documento É, na declaração do próprio Odoo.
//
// De onde isto veio: a perícia de 2026-07-13 (docs/pericia-classificacao-receita-2026-07-13.md),
// pedida pelo dono, que periciou 1.965 notas de saída autorizada contra o banco de produção e
// contra o Odoo ao vivo. A pergunta era "dá para largar a palavra 'venda' no nome da operação
// e classificar pela lógica fiscal?". A resposta: dá, e a chave NÃO é o CFOP.
//
// Por que a natureza, e não o CFOP:
//   - o CFOP mora no ITEM, e o cache perde item (4 vendas reais de R$ 493 mil sem nenhum item);
//   - o CFOP pode estar ERRADO no Odoo (a nota 44030, venda com pedido PV-0788/26, tem os itens
//     lançados com CFOP 6949, "outra saída"). Uma regra de CFOP puro jogaria fora R$ 190.986,33
//     de receita real por causa de um erro de digitação de terceiros;
//   - somando: CFOP puro perderia R$ 684.340,18 de receita real.
// A natureza vive na NOTA (não depende dos itens) e é um ID estável (não um texto redigitado a
// cada emissão). Testada contra o dado real, ela reproduz o faturamento atual CENTAVO A CENTAVO
// (905 notas, R$ 62.647.155,63, ZERO notas perdidas) e ainda recupera a nota complementar.
//
// ESTE CATÁLOGO NÃO É UMA ADIVINHAÇÃO: cada id abaixo foi conferido em produção, com contagem e
// valor. Natureza que não estiver aqui é DESCONHECIDA, e desconhecida vira ALERTA , nunca
// silêncio. Foi o silêncio que deixou R$ 538 mil da venda futura sumirem por quatro meses.

/** Naturezas que SÃO receita de venda a cliente (o destinatário do grupo é filtrado à parte). */
export const NATUREZAS_RECEITA: ReadonlyMap<number, string> = new Map([
  [1, "VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS"],
  [47, "Venda de mercadoria adq ou recebida de terc."],
  [107, "Venda de mercadoria ad ou re de terceiros entregue ao depositário (venda à ordem)"],
  // A REMESSA da venda futura (CFOP x117). É aqui que a receita da venda futura nasce,
  // por decisão do dono (2026-07-13). Ver venda-futura-policy.ts.
  [36, "Venda de mercadoria recebida de terceiros , Entrega futura"],
  // Complemento de PREÇO de uma venda já emitida. É receita adicional, e hoje escapa do
  // faturamento porque o nome da operação não tem a palavra "venda" (R$ 2.697,98 em julho).
  [31, "NOTA COMPLEMENTAR"],
]);

/** Naturezas de saída que NÃO são receita. Mapeadas para que o alerta só dispare no que é novo. */
export const NATUREZAS_NAO_RECEITA: ReadonlyMap<number, string> = new Map([
  [6, "REMESSA DE MERCADORIA OU BEM PARA DEMONSTRACAO"],
  [9, "TRANSFERENCIA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS"],
  [23, "REMESSA PARA DEPOSITO FECHADO OU ARMAZEM GERAL"],
  [24, "REMESSA DE MERCADORIA OU BEM PARA CONSERTO OU REPARO"],
  [27, "RETORNO DE MERCADORIA REMETIDA PARA DEPOSITO FECHADO"],
  // Baixa de bem do ativo, não receita de mercadoria.
  [29, "VENDA DE BEM DO ATIVO IMOBILIZADO"],
  [30, "TRANSFERENCIA DE CREDITO DE ICMS ACUMULADO"],
  [33, "REMESSA DE MERCADORIA OU BEM PARA EXPOSICAO OU FEIRA"],
  // O SIMPLES FATURAMENTO da venda futura (CFOP 5922/6922): cobra o cliente antes de
  // entregar. NÃO é receita no mês em que sai , a receita é a remessa (id 36). Decisão do
  // dono (2026-07-13), final para o assunto.
  [37, "Simples faturamento , venda para entrega futura"],
  [64, "REMESSA EM BONIFICACAO, DOACAO OU BRINDE"],
  [70, "OUTRA SAIDA DE MERCADORIA OU PRESTACAO DE SERVICO"],
  [85, "REMESSA DE MERCADORIA POR CONTA E ORDEM DE TERCEIROS"],
  [98, "Remessa em garantia"],
  [116, "Remessa de componente faltante de mercadoria já faturada"],
]);

/** A natureza está mapeada (de qualquer lado)? Se não estiver, é caso de ALERTA. */
export function naturezaConhecida(naturezaId: number | null): boolean {
  if (naturezaId === null) return false;
  return NATUREZAS_RECEITA.has(naturezaId) || NATUREZAS_NAO_RECEITA.has(naturezaId);
}

/** A natureza declara receita de venda? (não decide sozinha: intragrupo e situação valem à parte) */
export function naturezaEhReceita(naturezaId: number | null): boolean {
  return naturezaId !== null && NATUREZAS_RECEITA.has(naturezaId);
}

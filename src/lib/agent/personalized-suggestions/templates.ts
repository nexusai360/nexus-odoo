/**
 * Mapa de tool id -> pergunta template, usado para gerar sugestoes iniciais
 * personalizadas com base no historico de uso de cada usuario.
 *
 * Regras de redacao das templates (espelha as `WELCOME_SUGGESTIONS`):
 * - Substantivo concreto + metrica explicita + periodo quando aplicavel.
 * - Executavel por uma tool sem clarificacao adicional.
 * - Sem placeholder dinamico na v1 (perguntas fechadas).
 *
 * Tools nao mapeadas sao ignoradas no resultado; o catalogo curado de
 * fallback (`WELCOME_SUGGESTIONS`) cobre o vazio.
 */

export const TOOL_TO_QUESTION: Readonly<Record<string, string>> = {
  // Estoque
  estoque_saldo_produto: "Qual o saldo de estoque dos produtos mais movimentados?",
  estoque_top_movimentados: "Quais 5 produtos mais movimentaram nos últimos 30 dias?",
  estoque_entradas_saidas: "Quais foram as entradas e saídas de estoque nos últimos 30 dias?",
  estoque_produtos_parados: "Quais produtos estão sem movimento há mais de 90 dias?",
  estoque_concentracao: "Onde está concentrado o valor do estoque?",
  estoque_valor_armazem: "Qual o valor total do estoque em armazém?",

  // Financeiro
  financeiro_saldo_contas: "Qual o saldo das contas bancárias hoje?",
  financeiro_caixa_periodo: "Qual o fluxo de caixa do mês corrente?",
  financeiro_fluxo_caixa: "Qual o fluxo de caixa projetado dos próximos 30 dias?",
  financeiro_contas_a_receber: "Quanto temos em contas a receber em aberto?",
  financeiro_contas_a_pagar: "Quanto temos em contas a pagar em aberto?",
  financeiro_titulos_vencidos: "Quais títulos venceram nos últimos 7 dias?",

  // Fiscal
  fiscal_faturamento_periodo: "Quanto faturamos no mês corrente?",
  fiscal_faturamento_por_cliente: "Quais clientes mais compraram este mês?",
  fiscal_notas_emitidas: "Quantas notas fiscais emitimos este mês?",
  fiscal_notas_recebidas: "Quantas notas fiscais recebemos este mês?",
  fiscal_impostos_periodo: "Quanto pagamos em impostos no mês passado?",
  fiscal_produtos_faturados: "Quais produtos mais faturaram este mês?",

  // Comercial
  comercial_pedidos_por_etapa: "Qual a etapa do funil com mais pedidos parados?",
  comercial_pedidos_atrasados: "Quais pedidos de venda estão atrasados?",
  comercial_pedidos_periodo: "Quantos pedidos de venda fechamos este mês?",
  comercial_parcelas_a_vencer: "Quais parcelas vencem nos próximos 7 dias?",
  comercial_pedidos_por_vendedor: "Qual vendedor fechou mais pedidos este mês?",

  // Cadastros / parceiros
  cadastro_buscar_parceiro: "Quais parceiros mais movimentaram este mês?",
  cadastro_parceiros_por_uf: "Em quais estados temos mais parceiros ativos?",
  cadastro_contar_parceiros: "Quantos parceiros temos cadastrados?",

  // Contábil
  contabil_plano_de_contas: "Como está estruturado o plano de contas?",
  contabil_estrutura_conta: "Qual a estrutura da conta de receita?",
};

/**
 * Retorna a pergunta correspondente ao tool id, ou null quando o tool nao
 * tem template definido (caso de tools novas ou de baixa relevancia para o
 * welcome). Caller deve descartar nulls.
 */
export function questionForTool(toolName: string): string | null {
  return TOOL_TO_QUESTION[toolName] ?? null;
}

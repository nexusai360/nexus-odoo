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

import type { ReportDomain } from "@/generated/prisma/client";

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

/**
 * Dominio de negocio (RBAC v2, enum ReportDomain) de cada tool que tem
 * pergunta no welcome. Fonte da verdade para curar/filtrar sugestoes pelos
 * dominios permitidos do usuario. Toda chave de TOOL_TO_QUESTION deve ter
 * entrada aqui (garantido por teste). crm fica de fora: nao ha tool de crm.
 */
export const TOOL_DOMAIN: Readonly<Record<string, ReportDomain>> = {
  estoque_saldo_produto: "estoque",
  estoque_top_movimentados: "estoque",
  estoque_entradas_saidas: "estoque",
  estoque_produtos_parados: "estoque",
  estoque_concentracao: "estoque",
  estoque_valor_armazem: "estoque",
  financeiro_saldo_contas: "financeiro",
  financeiro_caixa_periodo: "financeiro",
  financeiro_fluxo_caixa: "financeiro",
  financeiro_contas_a_receber: "financeiro",
  financeiro_contas_a_pagar: "financeiro",
  financeiro_titulos_vencidos: "financeiro",
  fiscal_faturamento_periodo: "fiscal",
  fiscal_faturamento_por_cliente: "fiscal",
  fiscal_notas_emitidas: "fiscal",
  fiscal_notas_recebidas: "fiscal",
  fiscal_impostos_periodo: "fiscal",
  fiscal_produtos_faturados: "fiscal",
  comercial_pedidos_por_etapa: "comercial",
  comercial_pedidos_atrasados: "comercial",
  comercial_pedidos_periodo: "comercial",
  comercial_parcelas_a_vencer: "comercial",
  comercial_pedidos_por_vendedor: "comercial",
  cadastro_buscar_parceiro: "cadastros",
  cadastro_parceiros_por_uf: "cadastros",
  cadastro_contar_parceiros: "cadastros",
  contabil_plano_de_contas: "contabil",
  contabil_estrutura_conta: "contabil",
};

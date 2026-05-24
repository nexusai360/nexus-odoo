/**
 * Sugestões iniciais do Agente Nex, exibidas quando a sessão da bubble está
 * vazia. Regras de redação (vide SPEC renascimento, seção 4.4):
 *
 * 1. Substantivo concreto + métrica explícita + período quando aplicável.
 * 2. Cada pergunta tem que ser executável por uma tool sem clarificação.
 * 3. Diversidade de domínio (estoque, faturamento, comercial, financeiro).
 *
 * Sem rotação automática na v1. Consistência ganha de variedade.
 * Edição futura via /agente/sugestoes-iniciais para super_admin.
 *
 * Módulo puro. Não importa server-only nem acessa DB.
 */

export const WELCOME_SUGGESTIONS: readonly string[] = [
  "Quantos itens diferentes temos em estoque agora?",
  "Quanto faturamos no mês corrente?",
  "Quais pedidos de venda estão atrasados?",
  "Qual o valor total do estoque em armazém?",
] as const;

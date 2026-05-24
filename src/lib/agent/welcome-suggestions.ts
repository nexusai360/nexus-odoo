/**
 * Sugestões iniciais do Agente Nex, exibidas quando a sessão da bubble está
 * vazia. Duas camadas:
 *
 * 1. WELCOME_SUGGESTIONS: catalogo fixo (legado, usado como fallback final
 *    quando nem perfil de acesso nem historico ajudam).
 * 2. pickWelcomeByRole(role): set por nivel de acesso. super_admin/admin
 *    veem perguntas comerciais/financeiras de alto impacto (faturamento,
 *    produto que mais vendeu, contas a receber), que sao o gatilho de
 *    inicio de conversa mais util antes de termos historico do usuario
 *    para personalizar.
 *
 * Sequencia de prioridade no consumidor (layout protegido):
 *   personalizado (historico do usuario) > pickWelcomeByRole(role) >
 *   WELCOME_SUGGESTIONS (catalogo fixo).
 *
 * Módulo puro. Não importa server-only nem acessa DB.
 */

import type { PlatformRole } from "@/generated/prisma/client";

/** Catalogo fixo, usado como ultima opcao. */
export const WELCOME_SUGGESTIONS: readonly string[] = [
  "Quanto faturamos no mês corrente?",
  "Quanto temos em contas a receber em aberto?",
  "Quais 5 produtos mais venderam este mês?",
  "Qual o valor total do estoque em armazém?",
] as const;

/**
 * Conjunto curado de perguntas iniciais por nivel de acesso. Cada lista
 * tem >=5 itens para o consumidor fatiar pelo `maxSuggestions` do admin
 * (1..5). Ordem reflete prioridade: financeiro/comercial primeiro para
 * gestores, depois estoque/operacional, depois cadastro.
 */
const WELCOME_BY_ROLE: Record<PlatformRole, readonly string[]> = {
  super_admin: [
    "Quanto faturamos no mês corrente?",
    "Qual o produto que mais vendeu este mês?",
    "Quanto temos em contas a receber em aberto?",
    "Quais pedidos de venda estão atrasados?",
    "Qual o valor total do estoque em armazém?",
  ],
  admin: [
    "Quanto faturamos no mês corrente?",
    "Qual o produto que mais vendeu este mês?",
    "Quanto temos em contas a receber em aberto?",
    "Quais pedidos de venda estão atrasados?",
    "Qual o valor total do estoque em armazém?",
  ],
  manager: [
    "Quanto faturamos no mês corrente?",
    "Quais 5 produtos mais venderam nos últimos 30 dias?",
    "Quais pedidos de venda estão atrasados?",
    "Qual o valor total do estoque em armazém?",
    "Quais clientes mais compraram este mês?",
  ],
  viewer: [
    "Qual o valor total do estoque em armazém?",
    "Quantos itens diferentes temos em estoque agora?",
    "Quais 5 produtos mais movimentaram nos últimos 30 dias?",
    "Quais pedidos de venda estão atrasados?",
    "Quanto faturamos no mês corrente?",
  ],
};

/**
 * Devolve um set de sugestoes ordenadas para o role do usuario. Caller
 * fatia pelo `maxSuggestions`. Quando o role nao casa (defensivo), cai no
 * catalogo fixo.
 */
export function pickWelcomeByRole(
  role: PlatformRole | string | null | undefined,
): readonly string[] {
  if (!role) return WELCOME_SUGGESTIONS;
  const set = (WELCOME_BY_ROLE as Record<string, readonly string[]>)[role];
  return set ?? WELCOME_SUGGESTIONS;
}

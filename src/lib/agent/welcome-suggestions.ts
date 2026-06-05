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

import type { PlatformRole, ReportDomain } from "@/generated/prisma/client";

import { TOOL_TO_QUESTION, TOOL_DOMAIN } from "./personalized-suggestions/templates";

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

/**
 * Prioridade de negocio para intercalar dominios no welcome. Fiscal traz
 * faturamento (gatilho de maior valor), depois financeiro/comercial, depois
 * operacional. crm fica por ultimo (e hoje nao tem tool, cai fora na pratica).
 */
const DOMAIN_PRIORITY: readonly ReportDomain[] = [
  "fiscal",
  "financeiro",
  "comercial",
  "estoque",
  "cadastros",
  "contabil",
  "crm",
];

/** Perguntas de um dominio, derivadas da fonte unica TOOL_TO_QUESTION. */
function questionsForDomain(domain: ReportDomain): string[] {
  return Object.entries(TOOL_TO_QUESTION)
    .filter(([toolId]) => TOOL_DOMAIN[toolId] === domain)
    .map(([, q]) => q);
}

/**
 * Sugestoes iniciais curadas pelos dominios permitidos do usuario (RBAC v2).
 * Intercala (round-robin) entre os dominios na ordem de prioridade de negocio,
 * deduplica, capa em `max` (1..5) e cai no fallback por role quando nao ha
 * pergunta elegivel (ex.: usuario so com crm, que nao tem tool).
 */
export function pickWelcomeByDomains(
  allowedDomains: ReportDomain[],
  role: PlatformRole | string | null | undefined,
  max: number,
): readonly string[] {
  const cap = Math.min(Math.max(1, max || 3), 5);
  const ordered = DOMAIN_PRIORITY.filter((d) => allowedDomains.includes(d));
  const buckets = ordered
    .map((d) => questionsForDomain(d))
    .filter((b) => b.length > 0);
  if (buckets.length === 0) return pickWelcomeByRole(role).slice(0, cap);

  const out: string[] = [];
  const seen = new Set<string>();
  let idx = 0;
  while (out.length < cap && buckets.some((b) => b.length > 0)) {
    const b = buckets[idx % buckets.length];
    const q = b.shift();
    if (q && !seen.has(q)) {
      seen.add(q);
      out.push(q);
    }
    idx++;
  }
  return out.length > 0 ? out : pickWelcomeByRole(role).slice(0, cap);
}

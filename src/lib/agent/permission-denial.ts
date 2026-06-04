// RBAC v2 (SPEC §6.2/§6.4): fast-path de recusa do Agente Nex SEM chamada ao
// LLM. Quando a pergunta cai inteiramente em dominio(s) fora do acesso do
// usuario, respondemos com um template pt-br, registramos auditoria e marcamos
// o desfecho da decisao do router como "permission_denied". Custo de LLM = 0.
//
// Este modulo NAO importa buildLlmClient nem abre sessao MCP: a defesa e
// estrutural (camada de auth), nao por prompt.
//
// Spec: docs/superpowers/specs/2026-05-28-rbac-v2-gating-e-dominios-design.md
// Plan: docs/superpowers/plans/2026-05-28-rbac-v2-gating-e-dominios-plan.md (E1)

import { prisma } from "@/lib/prisma";
import { REPORT_DOMAINS } from "@/lib/reports/domains";
import { updateDecision } from "./router/log-decision";
import type { RunAgentResult } from "./run-agent";

/** id -> label dos dominios de relatorio (ex: "financeiro" -> "Financeiro"). */
const DOMAIN_LABELS: ReadonlyMap<string, string> = new Map(
  REPORT_DOMAINS.map((d) => [d.id, d.label]),
);

/**
 * Sanitiza o trecho da pergunta antes de gravar em auditoria:
 *  - trunca em `maxLen` caracteres;
 *  - mascara CPF nu (11 digitos seguidos) e CNPJ nu (14 digitos seguidos) por
 *    "[doc]". NAO mascara documentos formatados (com pontos/tracos) , decisao
 *    MVP (SPEC §6.1, nota): o risco residual e baixo e evita falsos positivos.
 */
export function sanitize(text: string, maxLen = 200): string {
  const masked = text
    .replace(/\b\d{14}\b/g, "[doc]")
    .replace(/\b\d{11}\b/g, "[doc]");
  return masked.length > maxLen ? masked.slice(0, maxLen) : masked;
}

/**
 * Formata uma lista de ids de dominio em texto natural pt-br usando os labels
 * de REPORT_DOMAINS:
 *  - []            -> ""
 *  - ["a"]         -> "A"
 *  - ["a","b"]     -> "A e B"
 *  - ["a","b","c"] -> "A, B e C"
 * Ids desconhecidos caem para o proprio id como fallback.
 */
export function formatDomainList(ids: string[]): string {
  const labels = ids.map((id) => DOMAIN_LABELS.get(id) ?? id);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  const head = labels.slice(0, -1).join(", ");
  const tail = labels[labels.length - 1]!;
  return `${head} e ${tail}`;
}

/** Template puro pt-br da resposta de recusa (SPEC §6.4). Sem travessao. */
function buildTemplate(denied: string[], available: string[]): string {
  const moduloOuModulos = denied.length > 1 ? "esses módulos" : "esse módulo";
  const linhaAjuda =
    available.length > 0
      ? `Posso te ajudar com ${formatDomainList(available)}. Quer seguir por aí?`
      : `Hoje você não tem acesso a nenhum módulo de dados na plataforma. Fale com seu administrador para liberar os módulos que precisar.`;
  return `Vi que sua pergunta toca em ${formatDomainList(denied)} e o seu acesso na plataforma hoje não cobre ${moduloOuModulos}.

${linhaAjuda}`.trim();
}

export interface RespondPermissionDeniedArgs {
  conversationId: string;
  /** Usuario que fez a pergunta (so o id e necessario para a auditoria). */
  userId: string;
  /** Dominios nao-transversais detectados na pergunta que o usuario NAO acessa. */
  deniedDomains: string[];
  /** Dominios que o usuario PODE acessar (para o convite do template). */
  availableDomains: string[];
  /** Id da AgentRouterDecision do turno (marcada como permission_denied). */
  routerDecisionId: string;
  /** Pergunta original , sanitizada antes de ir para auditoria. */
  userQuestion: string;
}

/**
 * Responde a recusa de permissao SEM chamar o LLM:
 *  1. persiste a mensagem do usuario na conversa;
 *  2. persiste a mensagem de assistant com o template;
 *  3. grava AuditLog (action: agent_permission_denied) com snippet sanitizado;
 *  4. marca a AgentRouterDecision do turno com outcome "permission_denied".
 *
 * Retorna um RunAgentResult de sucesso com uso/custo zerados.
 */
export async function respondPermissionDenied(
  args: RespondPermissionDeniedArgs,
): Promise<RunAgentResult> {
  const message = buildTemplate(args.deniedDomains, args.availableDomains);

  // 1 + 2. Persiste o par user/assistant. O fast-path retorna antes do
  // persist normal do run-agent, entao gravamos os dois aqui.
  await prisma.message.create({
    data: {
      conversationId: args.conversationId,
      role: "user",
      content: args.userQuestion,
    },
  });
  const assistantMsg = await prisma.message.create({
    data: {
      conversationId: args.conversationId,
      role: "assistant",
      content: message,
    },
    select: { id: true },
  });

  // 3. Auditoria da recusa (snippet sanitizado).
  await prisma.auditLog.create({
    data: {
      userId: args.userId,
      action: "agent_permission_denied",
      targetType: "agent_conversation",
      targetId: args.conversationId,
      details: {
        questionSnippet: sanitize(args.userQuestion),
        deniedDomains: args.deniedDomains,
        availableDomains: args.availableDomains,
      },
    },
  });

  // 4. Desfecho da decisao do router.
  await updateDecision({
    decisionId: args.routerDecisionId,
    outcome: "permission_denied",
  });

  return {
    ok: true,
    message,
    // B1. Id real da Message do assistant (recusa também é avaliável).
    messageId: assistantMsg.id,
    suggestions: [],
    usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
  };
}

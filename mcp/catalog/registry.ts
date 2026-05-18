// mcp/catalog/registry.ts
// Registry de catálogo: filtro de visibilidade (camada 1) e gate de autorização (camada 2).
import { visibleDomains } from "@/lib/reports/domains.js";
import { DomainDeniedError } from "../lib/failure.js";
import type { UserContext } from "../auth/user-context.js";
import type { ToolEntry } from "./types.js";

/**
 * Camada 1 — tools visíveis para o usuário em tools/list.
 * Regras:
 * - Tool com `sempreVisivel: true` aparece para qualquer usuário (sujeita a gatedRoles).
 * - Tool sem `sempreVisivel`: aparece apenas se o domínio está em visibleDomains(user).
 * - Tool com `gatedRoles`: só aparece se user.role estiver na lista.
 */
export function visibleTools(
  allTools: ToolEntry[],
  user: UserContext,
): ToolEntry[] {
  const domains = visibleDomains(user.role, user.domains);

  return allTools.filter((tool) => {
    // Gate de role — vale para sempreVisivel e para tools normais
    if (tool.gatedRoles && !tool.gatedRoles.includes(user.role as "super_admin" | "admin")) {
      return false;
    }
    // Tool de domínio-neutro: sempre visível (depois do gate de role)
    if (tool.sempreVisivel) return true;
    // Tool de domínio: visível apenas se o domínio está na lista do usuário.
    // tool.dominio pode ser undefined em tools sempreVisivel (já tratadas acima),
    // mas tools sem sempreVisivel devem ter domínio — fallback false protege runtime.
    return tool.dominio !== undefined && domains.includes(tool.dominio);
  });
}

/**
 * Camada 2 — gate de autorização no momento da chamada.
 * Lança DomainDeniedError se o usuário não pode invocar a tool.
 * Regras idênticas a visibleTools, aplicadas num único request.
 */
export function assertToolAllowed(tool: ToolEntry, user: UserContext): void {
  // Gate de role — vale antes de tudo
  if (tool.gatedRoles && !tool.gatedRoles.includes(user.role as "super_admin" | "admin")) {
    throw new DomainDeniedError(
      `Role '${user.role}' não tem acesso à tool '${tool.id}'.`,
    );
  }
  // Tools sempreVisivel passam após o gate de role
  if (tool.sempreVisivel) return;
  // Verificar domínio
  const domains = visibleDomains(user.role, user.domains);
  if (tool.dominio === undefined || !domains.includes(tool.dominio)) {
    throw new DomainDeniedError(
      `Usuário não tem acesso ao domínio '${tool.dominio ?? "desconhecido"}' (tool '${tool.id}').`,
    );
  }
}

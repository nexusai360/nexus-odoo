// mcp/lib/failure.ts
// Mapeamento de exceção para outcome do MCP e mensagens seguras ao agente.
// Nunca vaza detalhe interno nas mensagens retornadas (spec 3.9).
import { ZodError } from "zod";
import type { AuditOutcome } from "./audit.js";

/** Lançada pelo assertToolAllowed quando o domínio/role não é permitido. */
export class DomainDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainDeniedError";
  }
}

/** Mapeia uma exceção para o outcome de auditoria (nunca retorna "ok"). */
export function toOutcome(err: unknown): Exclude<AuditOutcome, "ok"> {
  if (err instanceof ZodError) return "invalid_input";
  if (err instanceof DomainDeniedError) return "denied";
  return "error";
}

/** Devolve mensagem genérica e segura ao agente — sem vazar stack/detalhes internos. */
export function safeErrorMessage(outcome: Exclude<AuditOutcome, "ok">): string {
  switch (outcome) {
    case "denied":
      return "Acesso negado: você não tem permissão para acessar este domínio ou recurso.";
    case "invalid_input":
      return "Parâmetros inválidos: verifique os campos obrigatórios e seus tipos.";
    case "error":
      return "Erro interno ao processar a consulta. Tente novamente em instantes.";
  }
}

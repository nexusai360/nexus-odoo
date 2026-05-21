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

/** Lançada pelo handler do Caminho 3c quando o guard de SQL recusa a query. */
export class SqlGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlGuardError";
  }
}

/** Mapeia uma exceção para o outcome de auditoria (nunca retorna "ok"). */
export function toOutcome(err: unknown): Exclude<AuditOutcome, "ok"> {
  if (err instanceof ZodError) return "invalid_input";
  if (err instanceof DomainDeniedError) return "denied";
  if (err instanceof SqlGuardError) return "invalid_input";
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

/**
 * Descreve uma exceção para o registro de auditoria: código e mensagem.
 *
 * Diferente de `safeErrorMessage` (genérica, devolvida ao agente), esta mensagem
 * é detalhada e vai apenas para o `McpAuditLog` — o operador precisa saber o
 * motivo real do erro ao inspecionar os Logs do painel.
 */
export function describeAuditError(err: unknown): {
  errorCode: string;
  errorMessage: string;
} {
  if (err instanceof ZodError) {
    const detail = err.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    return { errorCode: "validation_error", errorMessage: detail || "Entrada inválida" };
  }
  if (err instanceof DomainDeniedError) {
    return { errorCode: "domain_denied", errorMessage: err.message };
  }
  if (err instanceof SqlGuardError) {
    return { errorCode: "sql_guard", errorMessage: err.message };
  }
  if (err instanceof Error) {
    return { errorCode: "internal_error", errorMessage: err.message };
  }
  return { errorCode: "internal_error", errorMessage: String(err) };
}

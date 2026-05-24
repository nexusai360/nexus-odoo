// mcp/lib/errors.ts
// Classes McpError padronizadas — Anexo C da spec F4 Onda 2 (Bloco J2.0).
//
// Hierarquia:
//   McpError (abstract) ← cada erro concreto com code + httpStatus + details?
//
// Uso: throw new ExternalIdAlreadyExistsError("ext-001")
// O pipeline de tools/call (server.ts) captura McpError e formata a resposta.

// ─── Base abstrata ────────────────────────────────────────────────────────────

export abstract class McpError extends Error {
  /** Código de erro em SCREAMING_SNAKE_CASE — estável para clientes. */
  abstract readonly code: string;
  /** HTTP status semântico para documentação/logging. */
  abstract readonly httpStatus: number;
  /** Detalhe estruturado opcional (seguro para expor ao cliente). */
  readonly details?: object;

  constructor(message: string, details?: object) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    // Compatibilidade com TypeScript extends Error (ES5)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Auth / acesso ────────────────────────────────────────────────────────────

/** 401 — sem credencial ou credencial inválida. */
export class UnauthorizedError extends McpError {
  readonly code = "UNAUTHORIZED" as const;
  readonly httpStatus = 401;
  constructor(message = "Credencial ausente ou inválida.") {
    super(message);
  }
}

/** 403 — operação requer auth externa (API key), mas chegou via auth interna. */
export class ForbiddenViaInternalAuthError extends McpError {
  readonly code = "FORBIDDEN_INTERNAL_AUTH" as const;
  readonly httpStatus = 403;
  constructor(message = "Esta operação requer autenticação externa (API key).") {
    super(message);
  }
}

/** 403 — API key não tem a capability necessária para a operação. */
export class CapabilityMissingError extends McpError {
  readonly code = "CAPABILITY_MISSING" as const;
  readonly httpStatus = 403;
  constructor(module: string, action: string) {
    super(`API key não tem a capability '${module}:${action}'.`, { module, action });
  }
}

// ─── Input / validação ────────────────────────────────────────────────────────

/** 400 — input inválido (além do que o Zod já cobre). */
export class ValidationFailedError extends McpError {
  readonly code = "VALIDATION_FAILED" as const;
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
  }
}

/** 400 — header Idempotency-Key obrigatório ausente. */
export class IdempotencyKeyRequiredError extends McpError {
  readonly code = "IDEMPOTENCY_KEY_REQUIRED" as const;
  readonly httpStatus = 400;
  constructor(message = "Header Idempotency-Key obrigatório não fornecido.") {
    super(message);
  }
}

/** 400 — token em local inseguro (ex.: query string). */
export class TokenInUnsafeLocationError extends McpError {
  readonly code = "TOKEN_IN_UNSAFE_LOCATION" as const;
  readonly httpStatus = 400;
  constructor(location: string) {
    super(`Token encontrado em local inseguro: '${location}'.`, { location });
  }
}

// ─── Idempotência ─────────────────────────────────────────────────────────────

/** 422 — Idempotency-Key já usada com payload diferente. */
export class IdempotencyKeyConflictError extends McpError {
  readonly code = "IDEMPOTENCY_KEY_CONFLICT" as const;
  readonly httpStatus = 422;
  constructor(idempotencyKey: string) {
    super(
      `Idempotency-Key '${idempotencyKey}' já foi usada com payload diferente.`,
      { idempotencyKey },
    );
  }
}

/** 409 — operação em andamento com a mesma Idempotency-Key. */
export class IdempotencyInProgressError extends McpError {
  readonly code = "IDEMPOTENCY_IN_PROGRESS" as const;
  readonly httpStatus = 409;
  constructor(idempotencyKey: string) {
    super(
      `Operação com Idempotency-Key '${idempotencyKey}' já está em andamento.`,
      { idempotencyKey },
    );
  }
}

/** 503 — serviço de idempotência indisponível. */
export class IdempotencyUnavailableError extends McpError {
  readonly code = "IDEMPOTENCY_UNAVAILABLE" as const;
  readonly httpStatus = 503;
  constructor(message = "Serviço de idempotência temporariamente indisponível.") {
    super(message);
  }
}

// ─── Conflitos de negócio ─────────────────────────────────────────────────────

/** 409 — external_id já existe no Odoo. */
export class ExternalIdAlreadyExistsError extends McpError {
  readonly code = "EXTERNAL_ID_ALREADY_EXISTS" as const;
  readonly httpStatus = 409;
  constructor(externalId: string) {
    super(`External ID '${externalId}' já existe.`, { externalId });
  }
}

/** 409 — conflito genérico de negócio. */
export class ConflictError extends McpError {
  readonly code = "CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(message: string) {
    super(message);
  }
}

/** 412 — pré-condição do negócio não satisfeita. */
export class PreconditionFailedError extends McpError {
  readonly code = "PRECONDITION_FAILED" as const;
  readonly httpStatus = 412;
  constructor(message: string) {
    super(message);
  }
}

// ─── Rate limit ───────────────────────────────────────────────────────────────

/** 429 — limite de taxa excedido. */
export class RateLimitedError extends McpError {
  readonly code = "RATE_LIMITED" as const;
  readonly httpStatus = 429;
  constructor(retryAfterSeconds: number) {
    super(`Limite de requisições excedido. Tente novamente em ${retryAfterSeconds}s.`, {
      retryAfterSeconds,
    });
  }
}

// ─── Cadastros + Tarefas (Onda 2 cadastros) ───────────────────────────────────

/** 409 — parceiro tem documentos vinculados; unlink bloqueado pelo Odoo. */
export class ParceiroEmUsoError extends McpError {
  readonly code = "PARCEIRO_EM_USO" as const;
  readonly httpStatus = 409;
  constructor(partnerId: number, originalMessage?: string) {
    super(
      `Parceiro ${partnerId} tem registros vinculados e não pode ser removido. Considere arquivar (active=false).`,
      { partnerId, originalMessage },
    );
  }
}

/** 409 — categoria/tag já existe com mesmo nome no mesmo nível. */
export class CategoriaJaExisteError extends McpError {
  readonly code = "CATEGORIA_JA_EXISTE" as const;
  readonly httpStatus = 409;
  constructor(name: string, existingId: number, parentId: number | null) {
    super(
      `Categoria '${name}' já existe (id=${existingId}).`,
      { name, existingId, parentId },
    );
  }
}

/** 404 — atividade não encontrada (provavelmente já completada ou removida). */
export class AtividadeNaoEncontradaError extends McpError {
  readonly code = "ATIVIDADE_NAO_ENCONTRADA" as const;
  readonly httpStatus = 404;
  constructor(activityId: number) {
    super(
      `Atividade ${activityId} não encontrada (pode ter sido concluída ou removida).`,
      { activityId },
    );
  }
}

/** 400 — modelo Odoo solicitado não existe ou não está acessível. */
export class ModeloNaoSuportadoError extends McpError {
  readonly code = "MODELO_NAO_SUPORTADO" as const;
  readonly httpStatus = 400;
  constructor(modelName: string) {
    super(
      `Modelo Odoo '${modelName}' não existe ou não está acessível.`,
      { modelName },
    );
  }
}

/** 404 — registro alvo de atividade não existe no modelo informado. */
export class RegistroNaoEncontradoError extends McpError {
  readonly code = "REGISTRO_NAO_ENCONTRADO" as const;
  readonly httpStatus = 404;
  constructor(modelName: string, recordId: number) {
    super(
      `Registro id=${recordId} não encontrado em '${modelName}'.`,
      { modelName, recordId },
    );
  }
}

// ─── Erros internos ───────────────────────────────────────────────────────────

/** 500 — wrapping de erro interno inesperado. Não expõe stack ao cliente. */
export class InternalErrorWrap extends McpError {
  readonly code = "INTERNAL_ERROR" as const;
  readonly httpStatus = 500;
  /** Causa original preservada para logging interno. */
  readonly cause: Error;

  constructor(cause: Error) {
    super("Erro interno. Tente novamente em instantes.", {
      originalMessage: cause.message,
    });
    this.cause = cause;
  }
}

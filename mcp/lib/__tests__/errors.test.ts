// mcp/lib/__tests__/errors.test.ts
// TDD para classes McpError padronizadas (Bloco J2.0 , Anexo C da spec).
import {
  McpError,
  UnauthorizedError,
  ForbiddenViaInternalAuthError,
  CapabilityMissingError,
  ValidationFailedError,
  IdempotencyKeyRequiredError,
  IdempotencyKeyConflictError,
  IdempotencyInProgressError,
  IdempotencyUnavailableError,
  ExternalIdAlreadyExistsError,
  PreconditionFailedError,
  RateLimitedError,
  TokenInUnsafeLocationError,
  ConflictError,
  InternalErrorWrap,
} from "../errors.js";

describe("McpError base", () => {
  it("é instância de Error", () => {
    const err = new UnauthorizedError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(McpError);
  });

  it("preserva stack trace", () => {
    const err = new UnauthorizedError();
    expect(err.stack).toBeDefined();
  });
});

describe("classes concretas", () => {
  const cases: Array<[string, McpError, number, string]> = [
    ["UnauthorizedError",              new UnauthorizedError(),                       401, "UNAUTHORIZED"],
    ["ForbiddenViaInternalAuthError",  new ForbiddenViaInternalAuthError(),           403, "FORBIDDEN_INTERNAL_AUTH"],
    ["CapabilityMissingError",         new CapabilityMissingError("crm", "create"),   403, "CAPABILITY_MISSING"],
    ["ValidationFailedError",          new ValidationFailedError("campo inválido"),   400, "VALIDATION_FAILED"],
    ["IdempotencyKeyRequiredError",    new IdempotencyKeyRequiredError(),              400, "IDEMPOTENCY_KEY_REQUIRED"],
    ["IdempotencyKeyConflictError",    new IdempotencyKeyConflictError("key-abc"),    422, "IDEMPOTENCY_KEY_CONFLICT"],
    ["IdempotencyInProgressError",     new IdempotencyInProgressError("key-abc"),     409, "IDEMPOTENCY_IN_PROGRESS"],
    ["IdempotencyUnavailableError",    new IdempotencyUnavailableError(),             503, "IDEMPOTENCY_UNAVAILABLE"],
    ["ExternalIdAlreadyExistsError",   new ExternalIdAlreadyExistsError("ext-001"),   409, "EXTERNAL_ID_ALREADY_EXISTS"],
    ["PreconditionFailedError",        new PreconditionFailedError("já cancelado"),   412, "PRECONDITION_FAILED"],
    ["RateLimitedError",               new RateLimitedError(60),                      429, "RATE_LIMITED"],
    ["TokenInUnsafeLocationError",     new TokenInUnsafeLocationError("query"),       400, "TOKEN_IN_UNSAFE_LOCATION"],
    ["ConflictError",                  new ConflictError("duplicado"),                409, "CONFLICT"],
    ["InternalErrorWrap",              new InternalErrorWrap(new Error("oops")),      500, "INTERNAL_ERROR"],
  ];

  it.each(cases)("%s tem httpStatus e code corretos", (_name, err, httpStatus, code) => {
    expect(err.httpStatus).toBe(httpStatus);
    expect(err.code).toBe(code);
  });

  it("CapabilityMissingError expõe module/action em details", () => {
    const err = new CapabilityMissingError("crm", "create");
    expect(err.details).toEqual({ module: "crm", action: "create" });
  });

  it("ExternalIdAlreadyExistsError expõe externalId em details", () => {
    const err = new ExternalIdAlreadyExistsError("ext-001");
    expect(err.details).toEqual({ externalId: "ext-001" });
  });

  it("RateLimitedError expõe retryAfterSeconds em details", () => {
    const err = new RateLimitedError(60);
    expect(err.details).toEqual({ retryAfterSeconds: 60 });
  });

  it("InternalErrorWrap preserva a causa original", () => {
    const cause = new Error("db error");
    const err = new InternalErrorWrap(cause);
    expect(err.cause).toBe(cause);
    expect(err.details).toEqual({ originalMessage: "db error" });
  });

  it("IdempotencyKeyConflictError expõe idempotencyKey em details", () => {
    const err = new IdempotencyKeyConflictError("key-abc");
    expect(err.details).toEqual({ idempotencyKey: "key-abc" });
  });
});

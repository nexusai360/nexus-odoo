export class OdooError extends Error {}

export class OdooAuthError extends OdooError {}

export interface OdooErrorPayload {
  message?: string;
  data?: { message?: string; name?: string; debug?: string };
}

/**
 * Remove ocorrências de `secret` de uma string, substituindo por "***".
 * No-op se `secret` for vazio. Usado para impedir que a senha do Odoo
 * vaze em mensagens de erro, payloads de fault e logs (CR-03).
 */
export function redactSecret(s: string, secret: string | undefined): string {
  if (!secret) return s;
  return s.split(secret).join("***");
}

export class OdooRpcFault extends OdooError {
  readonly payload: OdooErrorPayload;
  constructor(error: OdooErrorPayload, secret?: string) {
    const data = error?.data ?? {};
    const rawMsg = data.message ?? error?.message ?? JSON.stringify(error);
    const msg = redactSecret(String(rawMsg), secret);
    super(msg.slice(0, 500));
    // O payload é guardado já redigido: data.debug do Odoo costuma ecoar a
    // chamada falha, cujos args começam com [db, uid, password, ...].
    this.payload = redactPayload(error ?? {}, secret);
  }
}

function redactPayload(error: OdooErrorPayload, secret?: string): OdooErrorPayload {
  if (!secret || !error.data) return error;
  const data = { ...error.data };
  if (typeof data.message === "string") data.message = redactSecret(data.message, secret);
  if (typeof data.debug === "string") data.debug = redactSecret(data.debug, secret);
  return { ...error, message: error.message ? redactSecret(error.message, secret) : error.message, data };
}

export function isAccessError(exc: unknown): boolean {
  let texto = String(exc instanceof Error ? exc.message : exc).toLowerCase();
  if (exc instanceof OdooRpcFault) {
    const data = exc.payload.data ?? {};
    texto += " " + String(data.name ?? "").toLowerCase();
    texto += " " + String(data.debug ?? "").toLowerCase();
  }
  return (
    texto.includes("accesserror") ||
    texto.includes("not allowed") ||
    texto.includes("you are not allowed")
  );
}

// ---------------------------------------------------------------------------
// Classes de erro tipadas por fault do Odoo
// ---------------------------------------------------------------------------

export class OdooAccessError extends OdooError {
  code = "odoo_access_denied" as const;
  httpStatus = 403;
}

export class OdooValidationError extends OdooError {
  code = "odoo_validation_failed" as const;
  httpStatus = 422;
}

export class OdooUserError extends OdooError {
  code = "odoo_business_rule" as const;
  httpStatus = 422;
}

export class OdooMissingError extends OdooError {
  code = "odoo_record_not_found" as const;
  httpStatus = 404;
}

export class OdooIntegrityError extends OdooError {
  code = "odoo_integrity_violation" as const;
  httpStatus = 422;
}

export class OdooNotImplementedError extends OdooError {
  code = "odoo_method_not_implemented" as const;
  httpStatus = 422;
}

export class OdooPoolExhaustedError extends OdooError {
  code = "odoo_pool_exhausted" as const;
  httpStatus = 502;
}

export class OdooUnavailableError extends OdooError {
  code = "odoo_unavailable" as const;
  httpStatus = 502;
}

export class OdooInternalError extends OdooError {
  code = "odoo_internal_error" as const;
  httpStatus = 500;
}

// ---------------------------------------------------------------------------
// Fault mapping
// ---------------------------------------------------------------------------

export interface OdooFault {
  code?: number;
  message?: string;
  data?: { name?: string; message?: string };
}

export function mapOdooFault(fault: OdooFault): Error {
  const name = fault.data?.name ?? "";
  const msg = fault.data?.message ?? fault.message ?? "Unknown Odoo error";
  if (/AccessError/i.test(name)) return new OdooAccessError(msg);
  if (/ValidationError/i.test(name)) return new OdooValidationError(msg);
  if (/UserError/i.test(name)) return new OdooUserError(msg);
  if (/MissingError/i.test(name)) return new OdooMissingError(msg);
  if (/IntegrityError/i.test(name)) return new OdooIntegrityError(msg);
  if (/NotImplementedError/i.test(name)) return new OdooNotImplementedError(msg);
  if (/PoolError/i.test(name)) return new OdooPoolExhaustedError(msg);
  return new OdooInternalError(msg);
}

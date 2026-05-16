export class OdooError extends Error {}

export class OdooAuthError extends OdooError {}

export interface OdooErrorPayload {
  message?: string;
  data?: { message?: string; name?: string; debug?: string };
}

export class OdooRpcFault extends OdooError {
  readonly payload: OdooErrorPayload;
  constructor(error: OdooErrorPayload) {
    const data = error?.data ?? {};
    const msg = data.message ?? error?.message ?? JSON.stringify(error);
    super(String(msg).slice(0, 500));
    this.payload = error ?? {};
  }
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

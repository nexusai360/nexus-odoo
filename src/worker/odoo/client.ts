// src/worker/odoo/client.ts
import { OdooError, OdooAuthError, OdooRpcFault } from "./errors";

export interface OdooClientOptions {
  url: string;
  db: string;
  username: string;
  password: string;
  timeoutMs?: number;
  throttleMs?: number;
  retries?: number;
  backoffMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OdooClient {
  private readonly url: string;
  private readonly db: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly throttleMs: number;
  private readonly retries: number;
  private readonly backoffMs: number;
  uid: number | null = null;

  constructor(opts: OdooClientOptions) {
    this.url = opts.url.replace(/\/$/, "");
    this.db = opts.db;
    this.username = opts.username;
    this.password = opts.password;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.throttleMs = opts.throttleMs ?? 150;
    this.retries = opts.retries ?? 3;
    this.backoffMs = opts.backoffMs ?? 1000;
  }

  private async rpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: 1,
    });
    let lastExc: unknown = null;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
        let resp: Response;
        try {
          resp = await fetch(`${this.url}/jsonrpc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        const body = (await resp.json()) as { error?: unknown; result?: T };
        await sleep(this.throttleMs);
        if (body.error) throw new OdooRpcFault(body.error as never);
        return body.result as T;
      } catch (exc) {
        if (exc instanceof OdooRpcFault) throw exc;
        lastExc = exc;
        await sleep(this.backoffMs * 2 ** attempt);
      }
    }
    throw new OdooError(`${service}.${method} falhou após ${this.retries} tentativas: ${lastExc}`);
  }

  version(): Promise<unknown> {
    return this.rpc("common", "version", []);
  }

  async authenticate(): Promise<number> {
    const uid = await this.rpc<number | false>("common", "authenticate", [
      this.db,
      this.username,
      this.password,
      {},
    ]);
    if (!uid) throw new OdooAuthError("Autenticação falhou — verifique ODOO_* no ambiente");
    this.uid = uid;
    return uid;
  }

  executeKw<T>(model: string, method: string, args: unknown[], kwargs: object = {}): Promise<T> {
    if (this.uid == null) throw new OdooError("Cliente não autenticado — chame authenticate()");
    return this.rpc<T>("object", "execute_kw", [
      this.db,
      this.uid,
      this.password,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  /** search_read paginado: busca tudo que casa com o domínio, em páginas. */
  async searchReadPaged(
    model: string,
    domain: unknown[],
    opts: { pageSize?: number; fields?: string[] } = {},
  ): Promise<unknown[]> {
    const pageSize = opts.pageSize ?? 500;
    const out: unknown[] = [];
    let offset = 0;
    for (;;) {
      const result = await this.executeKw<unknown[]>(model, "search_read", [domain], {
        offset,
        limit: pageSize,
        ...(opts.fields ? { fields: opts.fields } : {}),
      });
      out.push(...result);
      if (result.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  /** Retorna só os ids que casam com o domínio (para reconcile). */
  async searchIds(model: string, domain: unknown[] = []): Promise<number[]> {
    return this.executeKw<number[]>(model, "search", [domain]);
  }
}

export function clientFromEnv(): OdooClient {
  const faltando = ["ODOO_URL", "ODOO_DB", "ODOO_USERNAME", "ODOO_PASSWORD"].filter(
    (v) => !process.env[v],
  );
  if (faltando.length) throw new OdooError(`Variáveis ausentes: ${faltando.join(", ")}`);
  return new OdooClient({
    url: process.env.ODOO_URL!,
    db: process.env.ODOO_DB!,
    username: process.env.ODOO_USERNAME!,
    password: process.env.ODOO_PASSWORD!,
  });
}

// src/worker/odoo/client.ts
import {
  OdooError,
  OdooAuthError,
  OdooRpcFault,
  redactSecret,
  mapOdooFault,
  type OdooFault,
} from "./errors";

export {
  OdooError,
  OdooAuthError,
  OdooRpcFault,
  OdooAccessError,
  OdooValidationError,
  OdooUserError,
  OdooMissingError,
  OdooIntegrityError,
  OdooNotImplementedError,
  OdooPoolExhaustedError,
  OdooUnavailableError,
  OdooInternalError,
  mapOdooFault,
} from "./errors";
export type { OdooFault } from "./errors";

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

/** Erro HTTP não-retryável (4xx) — propaga sem novas tentativas. */
class HttpClientError extends OdooError {}

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
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.throttleMs = opts.throttleMs ?? 150;
    this.retries = opts.retries ?? 3;
    this.backoffMs = opts.backoffMs ?? 1000;
  }

  /** Redige a senha de qualquer string antes que ela seja logada/persistida (CR-03). */
  private redact(s: string): string {
    return redactSecret(s, this.password);
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
        // 4xx é erro definitivo (credencial/rota inválida) — não adianta
        // repetir; 5xx e falhas de rede/timeout caem no retry (WR-06).
        if (resp.status >= 400 && resp.status < 500) {
          const corpo = await resp.text().catch(() => "");
          throw new HttpClientError(
            this.redact(`HTTP ${resp.status} ${resp.statusText} em ${service}.${method}: ${corpo.slice(0, 300)}`),
          );
        }
        if (!resp.ok) {
          const corpo = await resp.text().catch(() => "");
          throw new OdooError(
            this.redact(`HTTP ${resp.status} ${resp.statusText} em ${service}.${method}: ${corpo.slice(0, 300)}`),
          );
        }
        const body = (await resp.json()) as { error?: unknown; result?: T };
        await sleep(this.throttleMs);
        if (body.error) {
          const fault = body.error as OdooFault & { data?: { name?: string; message?: string } };
          const rpcFault = new OdooRpcFault(body.error as never, this.password);
          // Se o fault tem data.name reconhecível, lança erro tipado; caso contrário,
          // relança o OdooRpcFault genérico para preservar backward compat.
          const faultName = fault?.data?.name ?? "";
          if (faultName && !/^(false|undefined)$/i.test(faultName)) {
            throw mapOdooFault(fault);
          }
          throw rpcFault;
        }
        return body.result as T;
      } catch (exc) {
        if (exc instanceof OdooRpcFault) throw exc;
        // Erros HTTP 4xx não são retryáveis.
        if (exc instanceof HttpClientError) throw exc;
        lastExc = exc;
        await sleep(this.backoffMs * 2 ** attempt);
      }
    }
    const causa = lastExc instanceof Error ? lastExc.message : String(lastExc);
    throw new OdooError(
      this.redact(`${service}.${method} falhou após ${this.retries} tentativas: ${causa}`),
    );
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
      // order: "id asc" garante uma ordenação estável entre as páginas —
      // sem isso, inserts/deletes durante o pull fazem o offset pular ou
      // duplicar registros (WR-05).
      const result = await this.executeKw<unknown[]>(model, "search_read", [domain], {
        offset,
        limit: pageSize,
        order: "id asc",
        ...(opts.fields ? { fields: opts.fields } : {}),
      });
      out.push(...result);
      if (result.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  /**
   * search_read de uma única página com offset explícito.
   * Retorna os registros da página e um flag indicando se há mais páginas.
   */
  async searchReadPage(
    model: string,
    domain: unknown[],
    opts: { offset: number; pageSize: number; fields?: string[] },
  ): Promise<{ records: unknown[]; hasMore: boolean }> {
    const { offset, pageSize, fields } = opts;
    const records = await this.executeKw<unknown[]>(model, "search_read", [domain], {
      offset,
      limit: pageSize,
      order: "id asc",
      ...(fields ? { fields } : {}),
    });
    return { records, hasMore: records.length >= pageSize };
  }

  /** Retorna só os ids que casam com o domínio, paginado (para reconcile). */
  async searchIds(model: string, domain: unknown[] = []): Promise<number[]> {
    const pageSize = 5000;
    const out: number[] = [];
    let offset = 0;
    for (;;) {
      // search paginado com order estável: uma resposta truncada por limite
      // do servidor não pode deixar `vivos` incompleto e marcar registros
      // vivos como apagados no reconcile (WR-08).
      const page = await this.executeKw<number[]>(model, "search", [domain], {
        offset,
        limit: pageSize,
        order: "id asc",
      });
      out.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Métodos de escrita (Bloco C)
  // ---------------------------------------------------------------------------

  /** Cria um registro no modelo e retorna o id criado. */
  async create(model: string, vals: object): Promise<number> {
    return this.executeKw<number>(model, "create", [vals]);
  }

  /** Atualiza registros pelos ids fornecidos. Retorna true em sucesso. */
  async write(model: string, ids: number[], vals: object): Promise<boolean> {
    return this.executeKw<boolean>(model, "write", [ids, vals]);
  }

  /** Remove registros pelos ids fornecidos. Retorna true em sucesso. */
  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.executeKw<boolean>(model, "unlink", [ids]);
  }

  /** Lê campos específicos dos registros pelos ids fornecidos. */
  async read(model: string, ids: number[], fields: string[]): Promise<object[]> {
    return this.executeKw<object[]>(model, "read", [ids], { fields });
  }

  /**
   * search_read pontual — busca domínio e retorna campos solicitados em uma
   * única chamada RPC (sem paginação; use searchReadPaged para volumes grandes).
   */
  async searchRead<T = object>(
    model: string,
    domain: unknown[],
    fields: string[],
    options: { limit?: number; offset?: number; order?: string } = {},
  ): Promise<T[]> {
    return this.executeKw<T[]>(model, "search_read", [domain], { fields, ...options });
  }

  /** Introspecção do modelo: retorna descritores de campos. */
  async fieldsGet(model: string, attributes?: string[]): Promise<Record<string, object>> {
    const args: unknown[] = attributes ? [false, attributes] : [];
    return this.executeKw<Record<string, object>>(model, "fields_get", args);
  }

  /**
   * Procura um external_id no módulo "mcp_nexus".
   * Retorna { id, res_id } ou null se não encontrado.
   */
  async searchIrModelData(
    model: string,
    externalKey: string,
  ): Promise<{ id: number; res_id: number } | null> {
    const rows = await this.searchRead<{ id: number; res_id: number }>(
      "ir.model.data",
      [["model", "=", model], ["module", "=", "mcp_nexus"], ["name", "=", externalKey]],
      ["id", "res_id"],
      { limit: 1 },
    );
    return rows[0] ?? null;
  }
}

export function clientFromEnv(mode: "read" | "write" = "read"): OdooClient {
  const isWrite = mode === "write";
  const get = (key: string): string => {
    if (isWrite) {
      // USERNAME → ODOO_WRITE_USER; demais: ODOO_WRITE_<KEY>
      const writeEnv = `ODOO_WRITE_${key === "USERNAME" ? "USER" : key}`;
      return process.env[writeEnv] ?? process.env[`ODOO_${key}`] ?? "";
    }
    return process.env[`ODOO_${key}`] ?? "";
  };
  const required = ["URL", "DB", "USERNAME", "PASSWORD"];
  const faltando = required.filter((k) => !get(k));
  if (faltando.length)
    throw new OdooError(`Variáveis ausentes para modo '${mode}': ${faltando.join(", ")}`);
  return new OdooClient({
    url: get("URL"),
    db: get("DB"),
    username: get("USERNAME"),
    password: get("PASSWORD"),
  });
}

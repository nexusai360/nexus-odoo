// mcp/__tests__/harness.ts
// Harness de teste de integração do servidor MCP (4f-4 / Onda F: 33 tools).
//
// Sobe o servidor HTTP real numa porta efêmera. O catálogo real (catalogo) é
// importado diretamente — as tools registradas são as 33 de produção.
//
// Auth é simulada via mocks (validateServiceToken + resolveUserContext) injetados
// ANTES do createHttpServer ser importado, de forma que o servidor use os mocks
// sem banco ou Redis real.
//
// Protocolo: Streamable HTTP (SDK @modelcontextprotocol/sdk/client).
// O client do SDK envia initialize → tools/list em cada connect().

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import type { UserContext } from "../auth/user-context.js";
import type { ReportDomain, PlatformRole } from "@/generated/prisma/client";

export type TestUserProfile = {
  userId: string;
  role: PlatformRole;
  domains: ReportDomain[];
};

/** Perfis de teste — cobrem os 4 roles do RBAC. */
export const TEST_SERVICE_TOKEN = "test-service-token-integration";

export const PROFILES: Record<string, TestUserProfile> = {
  super_admin: {
    userId: "user-super-admin",
    role: "super_admin" as PlatformRole,
    domains: ["estoque", "financeiro"] as ReportDomain[],
  },
  admin: {
    userId: "user-admin",
    role: "admin" as PlatformRole,
    domains: ["estoque", "financeiro"] as ReportDomain[],
  },
  manager: {
    userId: "user-manager",
    role: "manager" as PlatformRole,
    domains: ["estoque", "financeiro"] as ReportDomain[],
  },
  viewer: {
    userId: "user-viewer",
    role: "viewer" as PlatformRole,
    domains: ["estoque"] as ReportDomain[],
  },
  viewer_financeiro: {
    userId: "user-viewer-fin",
    role: "viewer" as PlatformRole,
    domains: ["financeiro"] as ReportDomain[],
  },
  viewer_sem_dominio: {
    userId: "user-viewer-none",
    role: "viewer" as PlatformRole,
    domains: [] as ReportDomain[],
  },
  viewer_comercial: {
    userId: "user-viewer-comercial",
    role: "viewer" as PlatformRole,
    domains: ["comercial"] as ReportDomain[],
  },
};

/** Contextos de usuário que resolveUserContext deve retornar por userId. */
export function makeUserCtx(profile: TestUserProfile): UserContext {
  return {
    userId: profile.userId,
    role: profile.role,
    domains: profile.domains,
  };
}

/** Resultado do `startTestServer` — servidor + URL base + função de parada. */
export interface TestServer {
  server: http.Server;
  baseUrl: string;
  stop: () => Promise<void>;
}

/**
 * Sobe o servidor MCP real numa porta efêmera.
 * Deve ser chamado APÓS os mocks de Jest estarem configurados (jest.mock no topo do arquivo).
 */
export async function startTestServer(): Promise<TestServer> {
  // Import dinâmico para que os mocks do Jest já estejam ativos
  const { createHttpServer } = await import("../server.js");
  const server = createHttpServer();

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const stop = (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return { server, baseUrl, stop };
}

/**
 * Faz uma chamada HTTP direta ao servidor MCP simulando o protocolo Streamable HTTP.
 * Retorna o corpo JSON parseado.
 *
 * O protocolo MCP Streamable HTTP espera:
 *   POST /mcp com Content-Type: application/json
 *   Body: mensagem JSON-RPC (initialize ou tools/list ou tools/call)
 *
 * Nota: o SDK do cliente envia initialize primeiro, depois tools/list. Para simplificar
 * o harness, fazemos chamadas JSON-RPC diretamente sem o SDK client completo.
 */
export async function mcpRequest(
  baseUrl: string,
  body: object,
  userId: string,
  sessionId?: string,
): Promise<{ status: number; body: unknown; sessionId?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "Authorization": `Bearer ${TEST_SERVICE_TOKEN}`,
    "x-mcp-user-id": userId,
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const resp = await fetch(`${baseUrl}/`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const respSessionId = resp.headers.get("mcp-session-id") ?? undefined;

  let parsedBody: unknown;
  const contentType = resp.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    parsedBody = await resp.json();
  } else if (contentType.includes("text/event-stream")) {
    // Para SSE: ler o primeiro evento e parsear
    const text = await resp.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
    parsedBody = dataLine ? JSON.parse(dataLine.slice(6)) : text;
  } else {
    parsedBody = await resp.text();
  }

  return { status: resp.status, body: parsedBody, sessionId: respSessionId };
}

/** JSON-RPC ID sequencial para testes. */
let _rpcId = 1;
export function nextRpcId(): number {
  return _rpcId++;
}
export function resetRpcId(): void {
  _rpcId = 1;
}

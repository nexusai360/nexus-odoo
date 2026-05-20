# F4 Onda 2 — Onda 0 (Fundação MCP Escrita) Implementation Plan

> **Versão:** v1 (pré-review) — aguarda Review crítica #1
> **Spec base:** `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md` v3
> **Para agentes:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar bloco por bloco. Steps usam `- [ ]` para tracking.

**Goal:** Entregar a fundação do servidor MCP com capacidade de **escrita** no Odoo Tauga: schema + auth dual + idempotência + capability check + sync direcionado + painel "Servidor MCP" + 2 tools POC (`crm.res_partner.get` + `crm.res_partner.create`) com testes E2E reais contra `grupojht.teste.tauga.online`.

**Architecture:** Estender o servidor MCP existente em `mcp/` (SDK 1.29.0, StreamableHTTPServerTransport). Adicionar modo EXTERNO de auth (Bearer = ApiKey) coexistindo com modo INTERNO atual (service token + X-Mcp-User-Id). Endpoint único `POST /api/mcp` distingue modos pelo valor do Bearer. WriteToolEntry extends ToolEntry com capability `<acao>:<modulo>`. Sync direcionado via BullMQ pós-write.

**Tech Stack:** TypeScript + Node.js (mcp/ container), Next.js 16 (app/ container), Prisma 7 + Postgres, BullMQ 5 + Redis 7, `@modelcontextprotocol/sdk@^1.29.0` com `StreamableHTTPServerTransport`, Zod 4, `lru-cache`, `json-stable-stringify`, `pino`, Jest, `@modelcontextprotocol/sdk` (test client).

---

## Sequência de execução

**Bloco A** → checklist de validação (não toca código)
**Bloco B** → Schema Prisma + migration
**Bloco C** → Odoo client wrapper (writes)
**Bloco D** → Auth middleware externo + cache LRU
**Bloco E** → Idempotency middleware + lock
**Bloco F** → Capability check no dispatcher + filtro de catálogo
**Bloco G** → Rate limit por apiKey
**Bloco H** → Sync direcionado (worker)
**Bloco I** → Health check endpoint
**Bloco J** → Tools POC (`crm.res_partner.get` + `crm.res_partner.create`)
**Bloco K** → Painel: Visão Geral
**Bloco L** → Painel: Chaves de Acesso (CRUD)
**Bloco M** → Painel: Logs/Audit
**Bloco N** → Painel: Documentação interativa (auto + MDX)
**Bloco O** → Reorganização de menu (Plugar MCPs no Nex; API REST em breve)
**Bloco P** → Testes E2E completos (22 cenários)
**Bloco Q** → Atualização CLAUDE.md + STATUS.md + handoff

> Cada bloco fecha com **commit atômico** (mensagem `feat(f4-onda2-bloco-X): ...`) e pode ser executado por um subagente Sonnet fresh, revisado por Opus entre blocos (conforme `feedback_subagent-model-strategy`).

---

## Bloco A — Checklist de validação pré-execução

> Não toca código. Apenas lê e documenta achados.

### Task A1: Inspecionar `mcp/auth/user-context.ts`

**Files:**
- Read: `mcp/auth/user-context.ts`

- [ ] Ler o arquivo completo.
- [ ] Documentar em `docs/agents/active/claude-f4-onda2-mcp-escrita.md` (seção "Achados Bloco A"): formato do `UserContext`, como ele é resolvido a partir de `X-Mcp-User-Id`, quais campos tem (`id`, `role`, `dominios`).
- [ ] Decidir: o auth middleware externo cria um `UserContext` similar? Ou passa um `ApiKeyContext` separado? Registrar decisão.

### Task A2: Inspecionar `mcp/lib/audit.ts`

**Files:**
- Read: `mcp/lib/audit.ts`
- Read: `mcp/lib/audit.test.ts`

- [ ] Ler arquivos.
- [ ] Documentar: formato atual do audit (tabela usada? `AuditLog` genérico ou outro?), campos gravados, gatilho.
- [ ] Decidir: estender o módulo existente para gravar em `McpAuditLog` (novo modelo Prisma) ou paralelo? Recomendação: criar `McpAuditLog` separado por riqueza de campos diferente (snapshotBefore/After, payload, idempotencyKey). O `mcp/lib/audit.ts` atual pode ser refatorado para escrever em `McpAuditLog`.

### Task A3: Inspecionar `mcp/lib/rate-limit.ts`

**Files:**
- Read: `mcp/lib/rate-limit.ts`
- Read: `mcp/lib/rate-limit.test.ts`

- [ ] Ler arquivos.
- [ ] Documentar: backend (Redis? memória?), key shape, sliding window vs fixed, integração com auth atual.
- [ ] Decidir: estender para per-`apiKeyId` ou reescrever. Se já é Redis sliding window, basta trocar key.

### Task A4: Verificar `prisma/migrations/`

**Files:**
- Bash: `ls prisma/migrations/`

- [ ] Listar migrations existentes (formato: `<timestamp>_<descricao>/migration.sql`).
- [ ] Documentar: a migration nova segue o padrão (criada via `npm run prisma:migrate -- --name f4_onda2_mcp_writes`).

### Task A5: Confirmar `pino` em uso

**Files:**
- Bash: `grep -rn "from 'pino'" src/ mcp/ 2>/dev/null && grep "pino" package.json`

- [ ] Se presente → reusar.
- [ ] Se ausente → adicionar `pino` + `pino-pretty` em `package.json` (Bloco B task B0).

### Task A6: Inspecionar `src/components/integracoes/`

**Files:**
- Read: `src/components/integracoes/` (cards/listagem do painel atual)
- Read: `src/app/(protected)/integracoes/` (rotas)

- [ ] Documentar: estrutura visual dos cards atuais (Canais, MCP, Webhooks, APIs, BI), padrão de navegação (sub-rotas? abas internas?), componentes base reusados.
- [ ] Identificar onde colocar "Servidor MCP" como novo card. Reusar padrão visual.

### Task A7: Mapear sidebar do Agente Nex (onde inserir "Plugar MCPs")

**Files:**
- Read: `src/components/layout/sidebar.tsx`
- Read: `src/components/agent/` (estrutura atual do menu Nex)

- [ ] Documentar: onde estão os submenus do Agente Nex hoje. Identificar local exato para inserir "Plugar MCPs" como novo item.
- [ ] **Antes de tocar:** verificar `docs/agents/active/` — se há outro agente ativo trabalhando em `sidebar.tsx`, coordenar.

### Task A8: Verificar `src/worker/odoo/client.ts`

**Files:**
- Read: `src/worker/odoo/client.ts`

- [ ] Documentar: métodos disponíveis hoje. Provavelmente `search_read` apenas. Listar gaps: `create`, `write`, `unlink`, `execute_kw`, `searchIrModelData`.
- [ ] Decidir: criar wrapper `mcp/odoo/client.ts` reusando o cliente HTTP de `src/worker/odoo/client.ts` OU estender o existente. Recomendação: criar wrapper em `mcp/odoo/` mais alinhado à arquitetura do MCP, importando o cliente base.

### Task A9: Validar `module = mcp_nexus` livre no Odoo Tauga

**Files:**
- Script Python ad-hoc em `discovery/check-mcp-nexus-module.py`

- [ ] Escrever script Python que conecta na base de teste (`grupojht.teste.tauga.online`) via JSON-RPC e executa: `execute_kw("ir.model.data", "search_read", [[["module", "=", "mcp_nexus"]]], {"fields": ["id"]})`.
- [ ] Rodar.
- [ ] Se retorno vazio (`[]`) → confirmado livre. Continuar com `module = "mcp_nexus"`.
- [ ] Se retorno não-vazio → escolher alternativa (`nexus_mcp`, `nexus_mcp_external`) e atualizar a spec.

### Task A10: Commit do Bloco A

- [ ] `git add docs/agents/active/claude-f4-onda2-mcp-escrita.md discovery/check-mcp-nexus-module.py`
- [ ] `git commit -m "chore(f4-onda2-bloco-a): checklist de validação pré-execução

Inspeção do código existente em mcp/ e src/ para ancorar decisões de
implementação. Achados documentados em docs/agents/active/. Confirmado
'mcp_nexus' livre em ir.model.data do Odoo Tauga (teste).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco B — Schema Prisma + Migration

### Task B0: Adicionar dependências NPM (se ausentes — depende de A5)

**Files:**
- Modify: `package.json`

- [ ] Adicionar (somente as que faltam): `lru-cache`, `json-stable-stringify`, `pino`, `pino-pretty`.
- [ ] `npm install`.
- [ ] Verificar `node_modules/` e `package-lock.json` atualizados.

### Task B1: Estender `ApiKey` no schema Prisma

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] Localizar `model ApiKey { ... }` (linha já existente).
- [ ] Adicionar campos novos conforme spec §4.1:
```prisma
model ApiKey {
  // ... campos existentes preservados (id, label, keyHash, last4, scopes, revokedAt, createdById, createdAt)

  // NOVOS
  description       String?
  capabilities      Json      @default("{\"version\":1,\"read\":[],\"write\":{}}")
  capabilitiesVersion Int     @default(1) @map("capabilities_version")
  rateLimit         Int       @default(60) @map("rate_limit")
  active            Boolean   @default(true)
  expiresAt         DateTime? @map("expires_at")
  lastUsedAt        DateTime? @map("last_used_at")
  rotatedAt         DateTime? @map("rotated_at")
  revokedReason     String?   @map("revoked_reason")
  isSystemKey       Boolean   @default(false) @map("is_system_key")
  tenantId          String?   @map("tenant_id") @db.Uuid
  allowedOrigins    Json      @default("[]") @map("allowed_origins")

  auditLogs         McpAuditLog[]

  @@index([active, revokedAt, expiresAt])
  @@index([tenantId, active])
  @@index([last4])
  @@map("api_keys")
}
```
- [ ] Manter `scopes` (deprecated; marcado com `///` comment).

### Task B2: Criar modelo `McpAuditLog`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] Adicionar:
```prisma
model McpAuditLog {
  id              String    @id @default(uuid()) @db.Uuid
  apiKeyId        String?   @map("api_key_id") @db.Uuid
  apiKey          ApiKey?   @relation(fields: [apiKeyId], references: [id])

  authMode        String    @map("auth_mode")
  toolId          String    @map("tool_id")
  operation       String
  module          String?
  action          String?
  capability      String?
  eventName       String?   @map("event_name")

  requestId       String    @map("request_id")
  idempotencyKey  String?   @map("idempotency_key")

  payload         Json?
  result          Json?
  snapshotBefore  Json?     @map("snapshot_before")
  snapshotAfter   Json?     @map("snapshot_after")

  status          String
  httpStatus      Int       @map("http_status")
  errorCode       String?   @map("error_code")
  errorMessage    String?   @map("error_message")

  durationMs      Int       @map("duration_ms")
  ipAddress       String?   @map("ip_address")
  userAgent       String?   @map("user_agent")

  createdAt       DateTime  @default(now()) @map("created_at")

  @@index([apiKeyId, createdAt(sort: Desc)])
  @@index([toolId, createdAt(sort: Desc)])
  @@index([status, createdAt(sort: Desc)])
  @@index([idempotencyKey])
  @@index([module, action, createdAt(sort: Desc)])
  @@index([eventName, createdAt])
  @@map("mcp_audit_logs")
}
```

### Task B3: Criar modelo `McpIdempotencyRecord`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] Adicionar:
```prisma
model McpIdempotencyRecord {
  apiKeyId        String   @map("api_key_id") @db.Uuid
  key             String
  toolId          String   @map("tool_id")
  payloadHash     String   @map("payload_hash")
  result          Json
  status          String
  httpStatus      Int      @map("http_status")
  expiresAt       DateTime @map("expires_at")
  createdAt       DateTime @default(now()) @map("created_at")

  @@id([apiKeyId, key])
  @@index([expiresAt])
  @@map("mcp_idempotency_records")
}
```

### Task B4: Gerar e revisar migration

**Files:**
- Bash: `npm run prisma:migrate -- --name f4_onda2_mcp_writes`

- [ ] Rodar comando — Prisma gera `prisma/migrations/<timestamp>_f4_onda2_mcp_writes/migration.sql`.
- [ ] **Revisar SQL gerado:** garantir que adiciona colunas a `api_keys` (não recria), cria `mcp_audit_logs` e `mcp_idempotency_records`, todos os índices presentes.
- [ ] Se algo estranho → editar o SQL manualmente antes de aplicar.

### Task B5: Aplicar migration

**Files:**
- Bash: `npx prisma migrate dev` (já aplicada pelo comando do B4 em dev)

- [ ] Confirmar tabelas/colunas existem: `psql $DATABASE_URL -c "\\d api_keys" -c "\\d mcp_audit_logs" -c "\\d mcp_idempotency_records"`.
- [ ] Confirmar `npx prisma generate` regenerou os tipos.

### Task B6: Testar geração de tipo TypeScript

**Files:**
- Test: `mcp/lib/__tests__/prisma-types.test.ts`

- [ ] Escrever test simples que importa tipos do Prisma e instancia objetos vazios:
```typescript
// mcp/lib/__tests__/prisma-types.test.ts
import { describe, it, expect } from "@jest/globals";
import type { ApiKey, McpAuditLog, McpIdempotencyRecord } from "@/generated/prisma/client";

describe("F4 Onda 2 — tipos Prisma", () => {
  it("ApiKey tem campos novos", () => {
    const k: Partial<ApiKey> = {
      capabilities: { version: 1, read: [], write: {} } as unknown as ApiKey["capabilities"],
      capabilitiesVersion: 1,
      rateLimit: 60,
      active: true,
      isSystemKey: false,
    };
    expect(k.rateLimit).toBe(60);
  });

  it("McpAuditLog tipo existe", () => {
    const a: Partial<McpAuditLog> = { authMode: "external", operation: "write" };
    expect(a.operation).toBe("write");
  });

  it("McpIdempotencyRecord tipo existe", () => {
    const r: Partial<McpIdempotencyRecord> = { key: "uuid", payloadHash: "sha" };
    expect(r.key).toBe("uuid");
  });
});
```
- [ ] Rodar: `npm test -- mcp/lib/__tests__/prisma-types.test.ts`.
- [ ] Esperado: PASS.

### Task B7: Commit do Bloco B

- [ ] `git add prisma/schema.prisma prisma/migrations/<timestamp>_f4_onda2_mcp_writes/ mcp/lib/__tests__/prisma-types.test.ts package.json package-lock.json`
- [ ] `git commit -m "feat(f4-onda2-bloco-b): schema Prisma para MCP escrita

- ApiKey estendida com capabilities, rateLimit, active, expiresAt,
  lastUsedAt, isSystemKey, tenantId, allowedOrigins, rotatedAt,
  revokedReason, capabilitiesVersion
- McpAuditLog novo (snapshot before/after, authMode, eventName,
  errorCode padronizado, índices para filtros do painel)
- McpIdempotencyRecord novo (chave composta apiKeyId + key)
- Migration f4_onda2_mcp_writes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco C — Odoo Client Wrapper para Writes

### Task C1: Criar arquivo base `mcp/odoo/client.ts`

**Files:**
- Create: `mcp/odoo/client.ts`
- Test: `mcp/odoo/__tests__/client.test.ts`

- [ ] Escrever interface do client:
```typescript
// mcp/odoo/client.ts
export interface OdooWriteClient {
  authenticate(): Promise<number>;          // retorna uid
  create(model: string, vals: object): Promise<number>;
  write(model: string, ids: number[], vals: object): Promise<boolean>;
  unlink(model: string, ids: number[]): Promise<boolean>;
  read(model: string, ids: number[], fields: string[]): Promise<object[]>;
  search(model: string, domain: unknown[], options?: { limit?: number; offset?: number }): Promise<number[]>;
  execute_kw<T>(model: string, method: string, args: unknown[], kwargs?: object): Promise<T>;
  searchIrModelData(model: string, externalKey: string): Promise<{ res_id: number; id: number } | null>;
}

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  password: string;
  timeoutMs?: number;
}
```

### Task C2: TDD — `authenticate` retorna uid válido

**Files:**
- Test: `mcp/odoo/__tests__/client.test.ts`
- Create: `mcp/odoo/client.ts`

- [ ] Escrever test (usando mock de fetch — não bate em Odoo real ainda):
```typescript
import { describe, it, expect, beforeEach } from "@jest/globals";
import { createOdooClient } from "../client";

describe("OdooWriteClient.authenticate", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it("retorna uid válido da resposta JSON-RPC", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ jsonrpc: "2.0", id: 1, result: 42 }),
      ok: true,
    } as Response);

    const client = createOdooClient({
      url: "http://test",
      db: "test_db",
      username: "u",
      password: "p",
    });
    const uid = await client.authenticate();
    expect(uid).toBe(42);
  });

  it("lança em falha de autenticação (result=false)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ jsonrpc: "2.0", id: 1, result: false }),
      ok: true,
    } as Response);

    const client = createOdooClient({ url: "x", db: "x", username: "u", password: "p" });
    await expect(client.authenticate()).rejects.toThrow(/auth/i);
  });
});
```
- [ ] Rodar: FAIL (função não existe).
- [ ] Implementar `createOdooClient` em `mcp/odoo/client.ts` com `authenticate` via `POST /jsonrpc` no método `common.authenticate`.
- [ ] Rodar: PASS.

### Task C3: TDD — `create` chama `execute_kw` com modelo + 'create' + vals

- [ ] Test:
```typescript
it("create envia execute_kw model='res.partner' method='create'", async () => {
  const fetchMock = jest.fn();
  fetchMock
    .mockResolvedValueOnce({ json: async () => ({ result: 42 }), ok: true })  // auth
    .mockResolvedValueOnce({ json: async () => ({ result: 1234 }), ok: true }); // create

  global.fetch = fetchMock;

  const client = createOdooClient({ url: "x", db: "x", username: "u", password: "p" });
  const newId = await client.create("res.partner", { name: "Test" });

  expect(newId).toBe(1234);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const createCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(createCallBody.params.method).toBe("execute_kw");
  expect(createCallBody.params.args[0]).toBe("test_db"); // db
  expect(createCallBody.params.args[3]).toBe("res.partner"); // model
  expect(createCallBody.params.args[4]).toBe("create"); // method
  expect(createCallBody.params.args[5]).toEqual([{ name: "Test" }]);
});
```
- [ ] Rodar: FAIL.
- [ ] Implementar `create` em `mcp/odoo/client.ts`.
- [ ] Rodar: PASS.

### Task C4: TDD — `write` chama `execute_kw` com 'write'

- [ ] Test análogo a C3 mas para `write(model, ids, vals)`.
- [ ] Implementar.
- [ ] PASS.

### Task C5: TDD — `unlink` chama `execute_kw` com 'unlink'

- [ ] Test análogo. Receber `ids: number[]`.
- [ ] Implementar.
- [ ] PASS.

### Task C6: TDD — `read` retorna lista de objetos

- [ ] Test:
```typescript
it("read retorna lista de objetos com campos solicitados", async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ json: async () => ({ result: 42 }), ok: true })
    .mockResolvedValueOnce({
      json: async () => ({
        result: [{ id: 1234, name: "Test", cnpj_cpf: "..." }],
      }),
      ok: true,
    });
  global.fetch = fetchMock;
  const client = createOdooClient({ url: "x", db: "x", username: "u", password: "p" });
  const rows = await client.read("res.partner", [1234], ["name", "cnpj_cpf"]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: 1234, name: "Test" });
});
```
- [ ] Implementar `read`.
- [ ] PASS.

### Task C7: TDD — `searchIrModelData` retorna `{ res_id, id }` ou `null`

- [ ] Test:
```typescript
it("searchIrModelData encontra registro existente", async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ json: async () => ({ result: 42 }), ok: true })
    .mockResolvedValueOnce({
      json: async () => ({
        result: [{ id: 99, res_id: 1234 }],
      }),
      ok: true,
    });
  global.fetch = fetchMock;
  const client = createOdooClient({ url: "x", db: "x", username: "u", password: "p" });
  const found = await client.searchIrModelData("res.partner", "mcp_external_test123");
  expect(found).toEqual({ id: 99, res_id: 1234 });
});

it("searchIrModelData retorna null quando não existe", async () => {
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ json: async () => ({ result: 42 }), ok: true })
    .mockResolvedValueOnce({ json: async () => ({ result: [] }), ok: true });
  global.fetch = fetchMock;
  const client = createOdooClient({ url: "x", db: "x", username: "u", password: "p" });
  const found = await client.searchIrModelData("res.partner", "mcp_external_test123");
  expect(found).toBeNull();
});
```
- [ ] Implementar `searchIrModelData`: usa `search_read("ir.model.data", [["model", "=", model], ["name", "=", externalKey]], ["res_id", "id"])`.
- [ ] PASS.

### Task C8: TDD — Mapeamento de erros Odoo para classes próprias

**Files:**
- Create: `mcp/odoo/errors.ts`
- Test: `mcp/odoo/__tests__/errors.test.ts`

- [ ] Definir classes:
```typescript
// mcp/odoo/errors.ts
export class OdooAccessError extends Error { code = "odoo_access_denied" as const; httpStatus = 403; }
export class OdooValidationError extends Error { code = "odoo_validation_failed" as const; httpStatus = 422; }
export class OdooUserError extends Error { code = "odoo_business_rule" as const; httpStatus = 422; }
export class OdooMissingError extends Error { code = "odoo_record_not_found" as const; httpStatus = 404; }
export class OdooIntegrityError extends Error { code = "odoo_integrity_violation" as const; httpStatus = 422; }
export class OdooNotImplementedError extends Error { code = "odoo_method_not_implemented" as const; httpStatus = 422; }
export class OdooPoolExhaustedError extends Error { code = "odoo_pool_exhausted" as const; httpStatus = 502; }
export class OdooUnavailableError extends Error { code = "odoo_unavailable" as const; httpStatus = 502; }
export class OdooInternalError extends Error { code = "odoo_internal_error" as const; httpStatus = 500; }

export function mapOdooFault(fault: { code?: number; message?: string; data?: { name?: string; message?: string } }): Error {
  const name = fault.data?.name ?? "";
  const msg = fault.data?.message ?? fault.message ?? "Unknown Odoo error";
  if (/AccessError/i.test(name)) return new OdooAccessError(msg);
  if (/ValidationError/i.test(name)) return new OdooValidationError(msg);
  if (/UserError/i.test(name)) return new OdooUserError(msg);
  if (/MissingError/i.test(name)) return new OdooMissingError(msg);
  if (/IntegrityError/i.test(name)) return new OdooIntegrityError(msg);
  if (/NotImplementedError/i.test(name)) return new OdooNotImplementedError(msg);
  return new OdooInternalError(msg);
}
```
- [ ] Test: chamar `mapOdooFault` com cada tipo e verificar instance.
- [ ] Implementar e PASS.

### Task C9: Integrar `mapOdooFault` no client

- [ ] No `mcp/odoo/client.ts`, capturar `result.error` ou faults do JSON-RPC e lançar `mapOdooFault(error)`.
- [ ] Test: fetch retorna `{ error: { data: { name: "odoo.exceptions.AccessError", message: "no access" } } }` → client lança `OdooAccessError`.
- [ ] Implementar.
- [ ] PASS.

### Task C10: TDD — Timeout configurável

- [ ] Test: client com `timeoutMs: 100`; fetch demora 200ms → lança `OdooUnavailableError`.
- [ ] Implementar com `AbortController`.
- [ ] PASS.

### Task C11: Commit Bloco C

- [ ] `git add mcp/odoo/`
- [ ] `git commit -m "feat(f4-onda2-bloco-c): OdooWriteClient wrapper para writes

Cliente JSON-RPC com create/write/unlink/read/search/execute_kw/
searchIrModelData. Classifica erros Odoo em classes próprias
(OdooAccessError, OdooValidationError, OdooUserError, etc) com
mapOdooFault. Timeout configurável via AbortController.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco D — Auth Middleware Externo + Cache LRU

### Task D1: Criar tipo `ApiKeyContext`

**Files:**
- Create: `mcp/auth/api-key-context.ts`

- [ ] Definir:
```typescript
// mcp/auth/api-key-context.ts
import type { ApiKey } from "@/generated/prisma/client";

export interface Capabilities {
  version: number;
  read: string[];
  write: Record<string, string[]>;
}

export interface ApiKeyContext {
  apiKeyId: string;
  label: string;
  last4: string;
  capabilities: Capabilities;
  capabilitiesVersion: number;
  rateLimit: number;
  tenantId: string | null;
  allowedOrigins: string[];
  isSystemKey: boolean;
}

export function apiKeyContextFromRow(row: ApiKey): ApiKeyContext {
  return {
    apiKeyId: row.id,
    label: row.label,
    last4: row.last4,
    capabilities: row.capabilities as unknown as Capabilities,
    capabilitiesVersion: row.capabilitiesVersion,
    rateLimit: row.rateLimit,
    tenantId: row.tenantId,
    allowedOrigins: (row.allowedOrigins as unknown as string[]) ?? [],
    isSystemKey: row.isSystemKey,
  };
}
```

### Task D2: Criar `sha256hex` helper

**Files:**
- Create: `mcp/lib/crypto.ts`
- Test: `mcp/lib/__tests__/crypto.test.ts`

- [ ] Test:
```typescript
it("sha256hex hashes corretamente", () => {
  expect(sha256hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
```
- [ ] Implementar:
```typescript
import { createHash } from "node:crypto";
export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
```
- [ ] PASS.

### Task D3: TDD — Lookup ApiKey por keyHash retorna ApiKeyContext

**Files:**
- Create: `mcp/auth/api-key-lookup.ts`
- Test: `mcp/auth/__tests__/api-key-lookup.test.ts`

- [ ] Test (com mock do Prisma):
```typescript
import { lookupApiKey } from "../api-key-lookup";

it("retorna ApiKeyContext para token válido", async () => {
  const prisma = mockPrisma({
    apiKey: {
      findUnique: jest.fn().mockResolvedValue({
        id: "uuid",
        label: "test",
        last4: "AbCd",
        keyHash: "expected-hash",
        capabilities: { version: 1, read: ["crm"], write: {} },
        capabilitiesVersion: 1,
        rateLimit: 60,
        tenantId: null,
        allowedOrigins: [],
        isSystemKey: false,
        active: true,
        expiresAt: null,
        revokedAt: null,
      }),
    },
  });
  const ctx = await lookupApiKey(prisma, "fake-hash");
  expect(ctx?.apiKeyId).toBe("uuid");
});

it("retorna null para token inválido", async () => {
  const prisma = mockPrisma({ apiKey: { findUnique: jest.fn().mockResolvedValue(null) } });
  const ctx = await lookupApiKey(prisma, "x");
  expect(ctx).toBeNull();
});

it("retorna null para chave revogada/expirada/inativa", async () => {
  const prisma = mockPrisma({
    apiKey: {
      findUnique: jest.fn().mockResolvedValue({
        id: "uuid", revokedAt: new Date(), active: true, expiresAt: null,
        // ...
      }),
    },
  });
  expect(await lookupApiKey(prisma, "x")).toBeNull();
});
```
- [ ] Implementar `lookupApiKey(prisma, tokenHash) → ApiKeyContext | null` com checks de `active=true && revokedAt==null && (expiresAt==null || expiresAt > now())`.
- [ ] PASS.

### Task D4: TDD — Cache LRU com TTL 60s

**Files:**
- Create: `mcp/auth/api-key-cache.ts`
- Test: `mcp/auth/__tests__/api-key-cache.test.ts`

- [ ] Test:
```typescript
import { createApiKeyCache } from "../api-key-cache";

it("hit não chama o loader na segunda chamada", async () => {
  const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 1000 });
  const loader = jest.fn().mockResolvedValue({ apiKeyId: "u" });
  await cache.getOrLoad("hash1", loader);
  await cache.getOrLoad("hash1", loader);
  expect(loader).toHaveBeenCalledTimes(1);
});

it("TTL expirado chama loader de novo", async () => {
  jest.useFakeTimers();
  const cache = createApiKeyCache({ ttlMs: 100, maxSize: 1000 });
  const loader = jest.fn().mockResolvedValue({ apiKeyId: "u" });
  await cache.getOrLoad("h", loader);
  jest.advanceTimersByTime(101);
  await cache.getOrLoad("h", loader);
  expect(loader).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
});

it("invalidate remove entrada", async () => {
  const cache = createApiKeyCache({ ttlMs: 60_000, maxSize: 1000 });
  const loader = jest.fn().mockResolvedValue({ apiKeyId: "u" });
  await cache.getOrLoad("h", loader);
  cache.invalidate("h");
  await cache.getOrLoad("h", loader);
  expect(loader).toHaveBeenCalledTimes(2);
});
```
- [ ] Implementar usando `lru-cache`:
```typescript
import { LRUCache } from "lru-cache";
import type { ApiKeyContext } from "./api-key-context";

export function createApiKeyCache(opts: { ttlMs: number; maxSize: number }) {
  const cache = new LRUCache<string, ApiKeyContext>({ max: opts.maxSize, ttl: opts.ttlMs });
  return {
    async getOrLoad(keyHash: string, loader: () => Promise<ApiKeyContext | null>) {
      const hit = cache.get(keyHash);
      if (hit) return hit;
      const fresh = await loader();
      if (fresh) cache.set(keyHash, fresh);
      return fresh;
    },
    invalidate(keyHash: string) { cache.delete(keyHash); },
    invalidateByApiKeyId(apiKeyId: string) {
      for (const [k, v] of cache.entries()) { if (v.apiKeyId === apiKeyId) cache.delete(k); }
    },
  };
}
```
- [ ] PASS.

### Task D5: TDD — Pub/sub invalidation por apiKeyId (Redis)

**Files:**
- Create: `mcp/auth/api-key-invalidator.ts`
- Test: `mcp/auth/__tests__/api-key-invalidator.test.ts`

- [ ] Test: criar cache; subscriber sintético recebe mensagem `{ apiKeyId: "u" }` no canal `mcp:keys:invalidated`; verificar cache.invalidate chamado.
- [ ] Implementar com `ioredis` (já em uso no projeto?) ou cliente Redis existente em `mcp/lib/redis.ts`.
- [ ] PASS.

### Task D6: TDD — Auth middleware identifica modo INTERNO vs EXTERNO

**Files:**
- Create: `mcp/auth/auth-middleware.ts`
- Test: `mcp/auth/__tests__/auth-middleware.test.ts`

- [ ] Test:
```typescript
it("retorna { mode: 'internal' } quando Bearer = MCP_SERVICE_TOKEN", async () => {
  process.env.MCP_SERVICE_TOKEN = "abc123";
  const result = await authenticate(prisma, cache, "Bearer abc123", "x-user-id");
  expect(result.mode).toBe("internal");
});

it("retorna { mode: 'external', apiKey } quando Bearer = ApiKey conhecida", async () => {
  process.env.MCP_SERVICE_TOKEN = "abc123";
  prisma.apiKey.findUnique.mockResolvedValue({ /* ApiKey válida */ });
  const result = await authenticate(prisma, cache, "Bearer mcp_live_xyz", null);
  expect(result.mode).toBe("external");
  expect(result.apiKey).toBeDefined();
});

it("retorna { mode: 'unauthorized', reason: 'invalid_token' } para Bearer desconhecido", async () => {
  process.env.MCP_SERVICE_TOKEN = "abc123";
  prisma.apiKey.findUnique.mockResolvedValue(null);
  const result = await authenticate(prisma, cache, "Bearer unknown", null);
  expect(result.mode).toBe("unauthorized");
});

it("retorna 'unauthorized' para modo interno sem X-Mcp-User-Id", async () => {
  process.env.MCP_SERVICE_TOKEN = "abc";
  const result = await authenticate(prisma, cache, "Bearer abc", null);
  expect(result.mode).toBe("unauthorized");
});
```
- [ ] Implementar com `timingSafeEqual` para a comparação interna; lookup com cache para a externa.
- [ ] PASS.

### Task D7: TDD — Auth recusa token em URL/body

- [ ] Test: chamar middleware com `Authorization` ausente mas query `?token=xxx` → 400 `token_in_unsafe_location`.
- [ ] Implementar guard no início do middleware.
- [ ] PASS.

### Task D8: TDD — Mascarar token em log

- [ ] Test (com `pino` mock):
```typescript
it("log de auth contém token mascarado", async () => {
  const logs: object[] = [];
  const fakeLogger = { info: (o) => logs.push(o), error: (o) => logs.push(o) };
  await authenticate(prisma, cache, "Bearer mcp_live_aBcD1234EFGH5678", null, fakeLogger);
  const logged = logs[0] as { token?: string };
  expect(logged.token).not.toContain("aBcD1234EFGH5678");
  expect(logged.token).toMatch(/mcp_live_\*+.{4}/); // formato Bearer mcp_live_****5678
});
```
- [ ] Implementar mascaramento no log.
- [ ] PASS.

### Task D9: Commit Bloco D

- [ ] `git add mcp/auth/api-key-* mcp/auth/auth-middleware.ts mcp/auth/__tests__/ mcp/lib/crypto.ts mcp/lib/__tests__/crypto.test.ts`
- [ ] `git commit -m "feat(f4-onda2-bloco-d): auth middleware externo + cache LRU

- ApiKeyContext + lookup com checks de active/expired/revoked
- LRU cache TTL 60s + invalidação pub/sub via Redis
- Middleware único distingue modo interno (timingSafeEqual contra
  MCP_SERVICE_TOKEN) e externo (lookup em ApiKey)
- Token mascarado em logs (formato mcp_live_****<last4>)
- Recusa token em URL/body (400 token_in_unsafe_location)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco E — Idempotency Middleware + Lock Distribuído

### Task E1: Helper de canonicalização JSON determinística

**Files:**
- Create: `mcp/lib/canonical-json.ts`
- Test: `mcp/lib/__tests__/canonical-json.test.ts`

- [ ] Test:
```typescript
it("hashes idênticos para chaves em ordens diferentes", () => {
  const h1 = canonicalHash({ a: 1, b: 2 });
  const h2 = canonicalHash({ b: 2, a: 1 });
  expect(h1).toBe(h2);
});

it("hashes diferentes para payloads diferentes", () => {
  expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }));
});

it("trata arrays preservando ordem", () => {
  expect(canonicalHash({ a: [1, 2] })).not.toBe(canonicalHash({ a: [2, 1] }));
});
```
- [ ] Implementar com `json-stable-stringify`:
```typescript
import stringify from "json-stable-stringify";
import { sha256hex } from "./crypto";
export function canonicalHash(payload: unknown): string {
  return sha256hex(stringify(payload) ?? "");
}
```
- [ ] PASS.

### Task E2: TDD — Lock distribuído Redis (`SET NX EX`)

**Files:**
- Create: `mcp/lib/distributed-lock.ts`
- Test: `mcp/lib/__tests__/distributed-lock.test.ts`

- [ ] Test (com `ioredis-mock` ou redis real em teste integration):
```typescript
it("acquire retorna true na primeira tentativa", async () => {
  expect(await acquire("key1", { ttlSec: 60 })).toBe(true);
});

it("acquire retorna false se já existe", async () => {
  await acquire("key2", { ttlSec: 60 });
  expect(await acquire("key2", { ttlSec: 60 })).toBe(false);
});

it("release remove a key", async () => {
  await acquire("key3", { ttlSec: 60 });
  await release("key3");
  expect(await acquire("key3", { ttlSec: 60 })).toBe(true);
});
```
- [ ] Implementar:
```typescript
export async function acquire(redis: Redis, key: string, opts: { ttlSec: number }) {
  const r = await redis.set(key, "1", "NX", "EX", opts.ttlSec);
  return r === "OK";
}
export async function release(redis: Redis, key: string) {
  await redis.del(key);
}
```
- [ ] PASS.

### Task E3: TDD — Idempotency middleware: header ausente em write

**Files:**
- Create: `mcp/middleware/idempotency.ts`
- Test: `mcp/middleware/__tests__/idempotency.test.ts`

- [ ] Test:
```typescript
it("write sem Idempotency-Key → 400", async () => {
  const result = await checkIdempotency({
    operation: "write",
    apiKeyId: "u",
    toolId: "crm.x.create",
    payload: { a: 1 },
    headers: {},
  });
  expect(result.status).toBe(400);
  expect(result.errorCode).toBe("idempotency_key_required");
});

it("read sem Idempotency-Key → ok (não obrigatório)", async () => {
  const result = await checkIdempotency({
    operation: "read",
    apiKeyId: "u",
    toolId: "crm.x.get",
    payload: { id: 1 },
    headers: {},
  });
  expect(result.status).toBe("proceed");
});
```
- [ ] Implementar.
- [ ] PASS.

### Task E4: TDD — Idempotency: mesma key + mesmo payload → devolve cache

- [ ] Test:
```typescript
it("mesma key + mesmo payloadHash → devolve resultado armazenado", async () => {
  await prisma.mcpIdempotencyRecord.create({
    data: {
      apiKeyId: "u", key: "abc",
      toolId: "crm.x.create", payloadHash: canonicalHash({ a: 1 }),
      result: { id: 99 }, status: "success", httpStatus: 200,
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  const result = await checkIdempotency({
    operation: "write", apiKeyId: "u", toolId: "crm.x.create",
    payload: { a: 1 }, headers: { "idempotency-key": "abc" },
  });
  expect(result.status).toBe("cached");
  expect(result.cachedResult).toEqual({ id: 99 });
});
```
- [ ] Implementar.
- [ ] PASS.

### Task E5: TDD — Idempotency: mesma key + payload diferente → 422

- [ ] Test:
```typescript
it("mesma key + payloadHash diferente → 422 idempotency_key_conflict", async () => {
  await prisma.mcpIdempotencyRecord.create({
    data: {
      apiKeyId: "u", key: "abc",
      toolId: "crm.x.create", payloadHash: canonicalHash({ a: 1 }),
      result: { id: 99 }, status: "success", httpStatus: 200,
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  const result = await checkIdempotency({
    operation: "write", apiKeyId: "u", toolId: "crm.x.create",
    payload: { a: 2 },  // diferente
    headers: { "idempotency-key": "abc" },
  });
  expect(result.status).toBe(422);
  expect(result.errorCode).toBe("idempotency_key_conflict");
});
```
- [ ] Implementar.
- [ ] PASS.

### Task E6: TDD — Idempotency: lock previne race

- [ ] Test simula 2 chamadas paralelas com mesma key. Primeira pega lock e executa; segunda recebe 409 `idempotency_in_progress`.
- [ ] Implementar com `acquire/release` do Bloco E2.
- [ ] PASS.

### Task E7: TDD — Idempotency: Redis indisponível → 503 (fail closed)

- [ ] Test: mock do redis lança erro; middleware retorna `{ status: 503, errorCode: "idempotency_unavailable" }`.
- [ ] Implementar.
- [ ] PASS.

### Task E8: TDD — Persistência do record após handler

**Files:**
- Create: `mcp/middleware/idempotency-store.ts`

- [ ] Test: handler executa com sucesso → `recordIdempotencyResult(...)` salva no DB com `expiresAt = now() + 24h`.
- [ ] Implementar.
- [ ] PASS.

### Task E9: Commit Bloco E

- [ ] `git add mcp/lib/canonical-json.ts mcp/lib/distributed-lock.ts mcp/lib/__tests__/canonical-json.test.ts mcp/lib/__tests__/distributed-lock.test.ts mcp/middleware/idempotency.ts mcp/middleware/idempotency-store.ts mcp/middleware/__tests__/`
- [ ] `git commit -m "feat(f4-onda2-bloco-e): idempotency middleware + lock distribuído

- canonicalHash com json-stable-stringify para SHA-256 determinístico
- Lock distribuído Redis (SET NX EX) com acquire/release
- Middleware: 400 sem key; 422 payload conflict; 409 lock ativo;
  cached para retry idêntico; 503 idempotency_unavailable se Redis cai
- recordIdempotencyResult persiste com TTL 24h
- TDD completo com mocks de prisma e redis

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco F — Capability Check no Dispatcher + Filtro de Catálogo

### Task F1: Estender `ToolEntry` com `WriteToolEntry`

**Files:**
- Modify: `mcp/catalog/types.ts`

- [ ] Adicionar `WriteToolEntry` e `WriteToolHandlerCtx` conforme spec §5.1.
- [ ] Manter `ToolEntry` existente intacto (compat com reads).

### Task F2: Adicionar `requiresExternalAuth: boolean` e `addedInVersion: number` no `ToolEntry`

**Files:**
- Modify: `mcp/catalog/types.ts`

- [ ] Adicionar (opcionais para reads, obrigatórios para writes):
```typescript
export interface ToolEntry<I = unknown, O = unknown> {
  // ... existing
  requiresExternalAuth?: boolean;  // true em WriteToolEntry
  addedInVersion?: number;          // default 1
}
```

### Task F3: TDD — Helper `hasCapability(ctx, capability)`

**Files:**
- Create: `mcp/auth/capability-check.ts`
- Test: `mcp/auth/__tests__/capability-check.test.ts`

- [ ] Test:
```typescript
it("retorna true para read:crm quando capabilities.read inclui 'crm'", () => {
  const ctx: ApiKeyContext = { ...base, capabilities: { version: 1, read: ["crm"], write: {} } };
  expect(hasCapability(ctx, { type: "read", module: "crm" })).toBe(true);
});

it("retorna false para read:crm quando ausente", () => {
  const ctx = { ...base, capabilities: { version: 1, read: [], write: {} } };
  expect(hasCapability(ctx, { type: "read", module: "crm" })).toBe(false);
});

it("retorna true para write:crm:create", () => {
  const ctx = { ...base, capabilities: { version: 1, read: [], write: { crm: ["create"] } } };
  expect(hasCapability(ctx, { type: "write", module: "crm", action: "create" })).toBe(true);
});

it("retorna false para action não listada no módulo", () => {
  const ctx = { ...base, capabilities: { version: 1, read: [], write: { crm: ["create"] } } };
  expect(hasCapability(ctx, { type: "write", module: "crm", action: "delete" })).toBe(false);
});

it("retorna false para ação cuja addedInVersion > capabilitiesVersion da chave", () => {
  const ctx = { ...base, capabilitiesVersion: 1, capabilities: { version: 1, read: [], write: { crm: ["new_action"] } } };
  expect(hasCapability(ctx, { type: "write", module: "crm", action: "new_action" }, { addedInVersion: 2 })).toBe(false);
});
```
- [ ] Implementar.
- [ ] PASS.

### Task F4: TDD — Filtro de catálogo por ApiKeyContext

**Files:**
- Modify: `mcp/catalog/registry.ts`
- Test: `mcp/catalog/__tests__/registry-filter.test.ts`

- [ ] Test:
```typescript
it("visibleToolsForApiKey filtra writes que a chave não tem", () => {
  const catalog: ToolEntry[] = [
    { id: "crm.x.get", operation: "read", capability: { read: "crm" }, /* ... */ },
    { id: "crm.x.create", operation: "write", capability: { write: { module: "crm", action: "create" } }, /* ... */ },
    { id: "crm.x.delete", operation: "write", capability: { write: { module: "crm", action: "delete" } }, /* ... */ },
  ];
  const ctx = { ...base, capabilities: { version: 1, read: ["crm"], write: { crm: ["create"] } } };
  const visible = visibleToolsForApiKey(catalog, ctx);
  expect(visible.map(t => t.id)).toEqual(["crm.x.get", "crm.x.create"]);  // delete excluído
});
```
- [ ] Implementar.
- [ ] PASS.

### Task F5: TDD — Dispatcher rejeita Write no modo interno

**Files:**
- Create: `mcp/dispatcher/check-mode.ts`
- Test: `mcp/dispatcher/__tests__/check-mode.test.ts`

- [ ] Test:
```typescript
it("write no modo interno → 403 forbidden_via_internal_auth", () => {
  const tool: WriteToolEntry = { id: "crm.x.create", operation: "write", /* ... */ };
  const result = checkMode(tool, { mode: "internal" });
  expect(result.allowed).toBe(false);
  expect(result.errorCode).toBe("forbidden_via_internal_auth");
});

it("write no modo externo + capability presente → allowed", () => {
  const tool: WriteToolEntry = { id: "crm.x.create", capability: { write: { module: "crm", action: "create" } }, /* ... */ };
  const result = checkMode(tool, { mode: "external", apiKey: { ...base, capabilities: { version: 1, read: [], write: { crm: ["create"] } } } });
  expect(result.allowed).toBe(true);
});

it("write no modo externo + capability ausente → 403 capability_missing", () => {
  const tool = { /* ... */ };
  const result = checkMode(tool, { mode: "external", apiKey: { ...base, capabilities: { version: 1, read: [], write: {} } } });
  expect(result.errorCode).toBe("capability_missing");
});

it("read no modo interno → permitido se UserContext aprova", () => {
  /* depende do UserContext atual; teste integration */
});
```
- [ ] Implementar.
- [ ] PASS.

### Task F6: Commit Bloco F

- [ ] `git add mcp/catalog/types.ts mcp/catalog/registry.ts mcp/auth/capability-check.ts mcp/dispatcher/`
- [ ] `git commit -m "feat(f4-onda2-bloco-f): capability check + filtro de catálogo

- WriteToolEntry estende ToolEntry com capability { module, action },
  sensitive, odooModel, eventName
- addedInVersion e requiresExternalAuth para versionamento
- hasCapability respeita capabilitiesVersion (chave antiga não vê
  ações novas)
- visibleToolsForApiKey filtra catálogo por ApiKeyContext
- Dispatcher rejeita writes via modo interno (403
  forbidden_via_internal_auth) e por capability_missing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco G — Rate Limit por apiKeyId

> Estende `mcp/lib/rate-limit.ts` existente (decisão tomada em Bloco A task A3).

### Task G1: TDD — Rate limit por apiKeyId, sliding window 60s

**Files:**
- Modify: `mcp/lib/rate-limit.ts`
- Test: `mcp/lib/__tests__/rate-limit.test.ts`

- [ ] Test:
```typescript
it("até o limit, permite; depois bloqueia", async () => {
  for (let i = 0; i < 60; i++) {
    expect(await checkRateLimit("apiKey1", 60)).toEqual({ allowed: true, remaining: 60 - i - 1 });
  }
  expect(await checkRateLimit("apiKey1", 60)).toEqual({ allowed: false, retryAfterSec: expect.any(Number) });
});

it("apiKeys diferentes têm buckets separados", async () => {
  for (let i = 0; i < 60; i++) await checkRateLimit("apiKey1", 60);
  expect((await checkRateLimit("apiKey2", 60)).allowed).toBe(true);
});

it("Redis indisponível → modo permissivo (fail open) + log warn", async () => {
  // mock redis lança
  const result = await checkRateLimit("apiKey1", 60);
  expect(result.allowed).toBe(true);
  expect(result.warning).toBe("redis_unavailable");
});
```
- [ ] Implementar (ou ajustar) sliding window com `INCR + EXPIRE` em Redis.
- [ ] Tratamento de erro Redis → fail open.
- [ ] PASS.

### Task G2: TDD — Headers de resposta

**Files:**
- Create: `mcp/lib/rate-limit-headers.ts`
- Test: `mcp/lib/__tests__/rate-limit-headers.test.ts`

- [ ] Test:
```typescript
it("rateLimitHeaders devolve X-RateLimit-Limit/Remaining/Reset", () => {
  const hdr = rateLimitHeaders({ limit: 60, remaining: 47, resetAt: new Date("2026-05-20T15:30:30Z") });
  expect(hdr["X-RateLimit-Limit"]).toBe("60");
  expect(hdr["X-RateLimit-Remaining"]).toBe("47");
  expect(hdr["X-RateLimit-Reset"]).toBe("2026-05-20T15:30:30.000Z");
});
```
- [ ] Implementar.
- [ ] PASS.

### Task G3: Commit Bloco G

- [ ] `git add mcp/lib/rate-limit*.ts mcp/lib/__tests__/rate-limit*.test.ts`
- [ ] `git commit -m "feat(f4-onda2-bloco-g): rate limit por apiKeyId

Sliding window 60s no Redis. Buckets isolados por apiKeyId.
Fail open se Redis cai (mantém clientes legítimos funcionando)
com log warn. Headers X-RateLimit-* na resposta.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco H — Sync Direcionado (Worker)

### Task H1: Criar fila BullMQ `odoo-sync:directed`

**Files:**
- Modify: `src/lib/queue.ts` (ou onde estão as filas atuais)
- Create: `mcp/sync/queue.ts`

- [ ] Definir queue + types do job:
```typescript
// mcp/sync/queue.ts
export interface DirectedSyncJob {
  model: string;
  ids: number[];
  operation: "create" | "update" | "delete";
  snapshotAfter?: object;  // se presente, usa direto; senão re-busca
  requestId: string;
  apiKeyId: string;
}
export const directedSyncQueue = new Queue<DirectedSyncJob>("odoo-sync:directed", { connection: redisOpts });
```
- [ ] Test integração simples (push + assert na fila).
- [ ] PASS.

### Task H2: Worker do sync direcionado

**Files:**
- Create: `src/worker/sync/directed.ts`
- Test: `src/worker/sync/__tests__/directed.test.ts`

- [ ] Test:
```typescript
it("create: usa snapshotAfter para popular cache (sem call Odoo)", async () => {
  await processDirectedSync({
    model: "res.partner", ids: [1234], operation: "create",
    snapshotAfter: { id: 1234, name: "X", cnpj_cpf: "..." },
    requestId: "r1", apiKeyId: "k1",
  });
  const row = await prisma.rawResPartner.findUnique({ where: { id: 1234 } });
  expect(row?.name).toBe("X");
});

it("delete: remove do cache local", async () => {
  await prisma.rawResPartner.create({ data: { id: 5555, name: "Y" } });
  await processDirectedSync({
    model: "res.partner", ids: [5555], operation: "delete",
    requestId: "r2", apiKeyId: "k1",
  });
  expect(await prisma.rawResPartner.findUnique({ where: { id: 5555 } })).toBeNull();
});

it("update sem snapshotAfter: re-busca no Odoo", async () => {
  const odooMock = { read: jest.fn().mockResolvedValue([{ id: 7777, name: "Updated" }]) };
  await processDirectedSync(
    { model: "res.partner", ids: [7777], operation: "update", requestId: "r3", apiKeyId: "k1" },
    { odoo: odooMock as unknown as OdooWriteClient },
  );
  expect(odooMock.read).toHaveBeenCalledWith("res.partner", [7777], expect.any(Array));
});
```
- [ ] Implementar com upsert via Prisma para os modelos `raw_*` aplicáveis. Onda 0 cobre apenas `raw_res_partner` (POC); ondas seguintes adicionam mais.
- [ ] **Lock Redis** `mcp:sync:<model>:<id>` antes do UPSERT (coordena com cron incremental).
- [ ] PASS.

### Task H3: Registrar worker no `src/worker/index.ts`

**Files:**
- Modify: `src/worker/index.ts`

- [ ] Adicionar `new Worker("odoo-sync:directed", processDirectedSync, { connection: redisOpts });`.
- [ ] Reiniciar worker e validar.

### Task H4: Commit Bloco H

- [ ] `git add mcp/sync/queue.ts src/worker/sync/directed.ts src/worker/sync/__tests__/ src/worker/index.ts`
- [ ] `git commit -m "feat(f4-onda2-bloco-h): worker de sync direcionado pós-write

- Fila BullMQ odoo-sync:directed
- Job: create/update/delete com snapshotAfter opcional
- Reusa snapshotAfter para evitar round-trip ao Odoo
- Delete remove do cache; create/update faz UPSERT
- Lock Redis mcp:sync:<model>:<id> coordena com cron incremental
- Worker registrado em src/worker/index.ts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco I — Health Check Endpoint

### Task I1: Criar endpoint `/api/mcp/health` (no servidor MCP standalone)

**Files:**
- Modify: `mcp/server.ts` (ou criar `mcp/routes/health.ts`)
- Test: `mcp/__tests__/health.test.ts`

- [ ] Test:
```typescript
it("GET /api/mcp/health retorna JSON com status e checks", async () => {
  const res = await fetch("http://localhost:PORT/api/mcp/health");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBeOneOf(["healthy", "degraded", "unhealthy"]);
  expect(body.checks).toMatchObject({
    postgres: expect.stringMatching(/ok|fail/),
    redis: expect.stringMatching(/ok|fail/),
    odoo_read: expect.stringMatching(/ok|fail|skip/),
    odoo_write: expect.stringMatching(/ok|fail|skip/),
    worker_queue_depth: expect.any(Number),
    sync_directed_lag_ms: expect.any(Number),
    cache_freshness_seconds: expect.any(Number),
  });
  expect(body.protocol_version).toBe("2025-06-18");
});
```
- [ ] Implementar com checks reais:
  - Postgres: `prisma.$queryRaw\`SELECT 1\``.
  - Redis: `redis.ping()`.
  - Odoo read/write: try `authenticate()` com timeout curto (skip se env ausente).
  - Worker queue: `await directedSyncQueue.getJobCounts()`.
  - Sync lag: `now() - max(McpAuditLog onde sync_failed=false)`.
  - Cache freshness: `now() - max(raw_res_partner.last_sync_at)` (ajustar quando houver mais tabelas).
- [ ] Mapeamento de status conforme spec §25.
- [ ] PASS.

### Task I2: Commit Bloco I

- [ ] `git add mcp/server.ts mcp/__tests__/health.test.ts`
- [ ] `git commit -m "feat(f4-onda2-bloco-i): endpoint GET /api/mcp/health

Verificações: postgres, redis, odoo_read, odoo_write, queue depth,
sync directed lag, cache freshness. Status healthy/degraded/unhealthy
conforme spec §25. cache_freshness_seconds > 3600 → unhealthy.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco J — Tools POC (`crm.res_partner.get` + `crm.res_partner.create`)

### Task J1: Criar `mcp/tools/crm/res-partner-get.ts` (read tool)

**Files:**
- Create: `mcp/tools/crm/res-partner-get.ts`
- Test: `mcp/tools/crm/__tests__/res-partner-get.test.ts`

- [ ] Test:
```typescript
it("retorna partner do cache por id", async () => {
  await prisma.rawResPartner.create({ data: { id: 1234, name: "21 Fitness", cnpj_cpf: "..." } });
  const result = await crmResPartnerGet.handler({ id: 1234 }, mockCtx);
  expect(result).toMatchObject({ id: 1234, name: "21 Fitness" });
});

it("retorna null para id inexistente", async () => {
  const result = await crmResPartnerGet.handler({ id: 99999 }, mockCtx);
  expect(result).toBeNull();
});
```
- [ ] Implementar:
```typescript
export const crmResPartnerGet: ToolEntry = {
  id: "crm.res_partner.get",
  dominio: "crm",
  descricao: "Busca um parceiro (cliente/fornecedor) do CRM no cache por id.",
  inputSchemaShape: { id: z.number().int().positive() },
  inputSchema: z.object({ id: z.number().int().positive() }),
  outputSchema: z.object({ id: z.number(), name: z.string(), /* ... */ }).nullable(),
  addedInVersion: 1,
  handler: async (input, ctx) => {
    const row = await ctx.prisma.rawResPartner.findUnique({ where: { id: input.id } });
    return row ?? null;
  },
};
```
- [ ] Registrar no catálogo (`mcp/catalog/index.ts`).
- [ ] PASS.

### Task J2: Criar `mcp/tools/crm/res-partner-create.ts` (write tool)

**Files:**
- Create: `mcp/tools/crm/res-partner-create.ts`
- Test: `mcp/tools/crm/__tests__/res-partner-create.test.ts`

- [ ] Test (com mock do Odoo):
```typescript
it("create partner sem external_id retorna novo id", async () => {
  const odoo = mockOdooWriteClient();
  odoo.create.mockResolvedValue(1234);
  odoo.read.mockResolvedValue([{ id: 1234, name: "21 Fitness", cnpj_cpf: "21.085.714/0001-10" }]);

  const result = await crmResPartnerCreate.handler({ name: "21 Fitness", cnpj_cpf: "21.085.714/0001-10", is_company: true }, { ...ctx, odoo });

  expect(odoo.create).toHaveBeenCalledWith("res.partner", expect.objectContaining({ name: "21 Fitness", is_company: true }));
  expect(result.id).toBe(1234);
  expect(result.data.name).toBe("21 Fitness");
});

it("external_id duplicado → ConflictError", async () => {
  const odoo = mockOdooWriteClient();
  odoo.searchIrModelData.mockResolvedValue({ res_id: 5555, id: 99 });
  await expect(
    crmResPartnerCreate.handler({ name: "X", external_id: "dup" }, { ...ctx, odoo }),
  ).rejects.toThrow(ConflictError);
});

it("registra ir.model.data quando external_id fornecido", async () => {
  const odoo = mockOdooWriteClient();
  odoo.create.mockResolvedValueOnce(1234);  // partner
  odoo.create.mockResolvedValueOnce(99);    // ir.model.data
  odoo.read.mockResolvedValue([{ id: 1234, name: "X" }]);

  await crmResPartnerCreate.handler({ name: "X", external_id: "atendimento_8842" }, { ...ctx, odoo });

  expect(odoo.create).toHaveBeenCalledWith("ir.model.data", expect.objectContaining({
    name: "mcp_external_atendimento_8842",
    model: "res.partner",
    module: "mcp_nexus",
  }));
});
```
- [ ] Implementar conforme spec §5.5.
- [ ] `ConflictError` class em `mcp/lib/errors.ts` (a criar; mapeado para HTTP 409 `external_id_already_exists` no dispatcher).
- [ ] Registrar no catálogo.
- [ ] PASS.

### Task J3: Commit Bloco J

- [ ] `git add mcp/tools/crm/ mcp/lib/errors.ts mcp/catalog/index.ts`
- [ ] `git commit -m "feat(f4-onda2-bloco-j): tools POC crm.res_partner.get + crm.res_partner.create

- res_partner.get lê do cache local (raw_res_partner)
- res_partner.create chama Odoo via OdooWriteClient; valida
  external_id no ir.model.data; registra com module=mcp_nexus
- ConflictError class para external_id duplicado
- Mock OdooWriteClient nos testes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco K — Painel: Tab "Visão Geral"

> Toda UI obrigatoriamente desenhada via `ui-ux-pro-max`. Reusa componentes existentes em `src/components/integracoes/`.

### Task K1: Rota Next.js `/integracoes/servidor-mcp`

**Files:**
- Create: `src/app/(protected)/integracoes/servidor-mcp/page.tsx`
- Create: `src/app/(protected)/integracoes/servidor-mcp/layout.tsx` (tabs)

- [ ] `page.tsx` redireciona para `/visao-geral`.
- [ ] `layout.tsx` define 4 tabs (Visão geral, Chaves, Logs, Documentação).
- [ ] RBAC: middleware verifica `super_admin`; senão 403.

### Task K2: Componente `VisaoGeralCard` com fetch do health

**Files:**
- Create: `src/components/integracoes/servidor-mcp/visao-geral.tsx`
- Test: `src/components/integracoes/servidor-mcp/__tests__/visao-geral.test.tsx`

- [ ] Test renderiza loading, depois dados após fetch mockado.
- [ ] Implementar:
  - URL pública (copy-to-clipboard).
  - Status (badge colorido).
  - Transport + versão protocolo.
  - Versão do servidor.
  - Métricas 24h (tools chamadas, % erro, p50/p99) — query agregada em `McpAuditLog`.
- [ ] PASS.

### Task K3: Server Action para métricas 24h

**Files:**
- Create: `src/lib/actions/mcp-metrics.ts`

- [ ] Implementar:
```typescript
"use server";
export async function getMcp24hMetrics() {
  const since = new Date(Date.now() - 86400_000);
  const totals = await prisma.mcpAuditLog.groupBy({
    by: ["status"],
    where: { createdAt: { gte: since } },
    _count: true,
  });
  const topTools = await prisma.mcpAuditLog.groupBy({
    by: ["toolId"],
    where: { createdAt: { gte: since } },
    _count: true,
    orderBy: { _count: { toolId: "desc" } },
    take: 5,
  });
  // ... p50/p99 via PERCENTILE_CONT (raw SQL)
  return { totals, topTools, /* ... */ };
}
```
- [ ] Test.
- [ ] PASS.

### Task K4: Commit Bloco K

- [ ] `git add src/app/(protected)/integracoes/servidor-mcp/ src/components/integracoes/servidor-mcp/ src/lib/actions/mcp-metrics.ts`
- [ ] `git commit -m "feat(f4-onda2-bloco-k): painel Servidor MCP - Visão Geral"`

---

## Bloco L — Painel: Tab "Chaves de Acesso" (CRUD)

### Task L1: Lista de chaves

**Files:**
- Create: `src/app/(protected)/integracoes/servidor-mcp/chaves/page.tsx`
- Create: `src/components/integracoes/servidor-mcp/chaves-lista.tsx`

- [ ] Listar via `prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } })`.
- [ ] Mostrar: label, last4 (`mcp_live_...AbCd`), capabilities resumo ("CRM R/W"), lastUsedAt, status badge, createdAt.

### Task L2: Server Action `createApiKey`

**Files:**
- Create: `src/lib/actions/mcp-api-keys.ts`

- [ ] Implementar:
```typescript
"use server";
export async function createApiKey(input: { label: string; description?: string; capabilities: Capabilities; rateLimit: number; expiresAt?: Date; tenantId?: string; allowedOrigins: string[]; sensitiveConfirmed: boolean; }) {
  const userId = await getCurrentSuperAdminId();
  const tokenRaw = `mcp_live_${randomBytes(32).toString("base64url")}`;
  const keyHash = sha256hex(tokenRaw);
  const last4 = tokenRaw.slice(-4);
  const key = await prisma.apiKey.create({
    data: { ...input, keyHash, last4, createdById: userId, active: true },
  });
  return { id: key.id, token: tokenRaw, last4 };  // token devolvido UMA vez
}
```
- [ ] Test.
- [ ] PASS.

### Task L3: Componente `NovaChaveDialog` com matriz de capabilities

**Files:**
- Create: `src/components/integracoes/servidor-mcp/nova-chave-dialog.tsx`

- [ ] Formulário com:
  - Label, descrição.
  - Tenant (se multi-tenant).
  - **Matriz módulo × ação** (rendering do catálogo do servidor MCP — endpoint `/api/mcp/catalog-schema` que devolve módulos e ações disponíveis).
  - Confirmação dupla para ações sensíveis.
  - Rate limit slider.
  - Expiração date picker.
  - allowedOrigins (lista de strings).
- [ ] No submit, chama `createApiKey`, mostra `TokenRevealDialog` com o token.

### Task L4: Componente `TokenRevealDialog` (mostra token uma única vez)

**Files:**
- Create: `src/components/integracoes/servidor-mcp/token-reveal-dialog.tsx`

- [ ] Modal não-dismissível por click-outside.
- [ ] Mostra token grande, botão "Copiar" com feedback "Copiado!".
- [ ] Checkbox obrigatório "Marquei e copiei o token. Entendo que ele não será mostrado novamente.".
- [ ] Botão "Concluir" só habilita após checkbox.

### Task L5: Editar / Rotacionar / Revogar / Marcar perdida

**Files:**
- Create: `src/lib/actions/mcp-api-keys.ts` (estender)
- Create: `src/components/integracoes/servidor-mcp/editar-chave-dialog.tsx`

- [ ] `updateApiKey(id, fields)` — preserva token, altera capabilities/rate/expires; publica em `mcp:keys:invalidated:<id>` no Redis para hot reload.
- [ ] `rotateApiKey(id)` — gera novo token; grace 24h via `expiresAt = now() + 24h` para a antiga; cria nova herdando configs.
- [ ] `revokeApiKey(id, reason)` — `revokedAt = now()`, `revokedReason = reason`.
- [ ] `markLostAndRegenerate(id)` — combina revoke + create herdando configs.
- [ ] Tests para cada server action.

### Task L6: Commit Bloco L

- [ ] `git add src/app/(protected)/integracoes/servidor-mcp/chaves/ src/components/integracoes/servidor-mcp/*chave* src/components/integracoes/servidor-mcp/token-reveal-dialog.tsx src/lib/actions/mcp-api-keys.ts`
- [ ] `git commit -m "feat(f4-onda2-bloco-l): painel Servidor MCP - Chaves de Acesso (CRUD)"`

---

## Bloco M — Painel: Tab "Logs / Audit"

### Task M1: Lista com filtros e paginação infinita

**Files:**
- Create: `src/app/(protected)/integracoes/servidor-mcp/logs/page.tsx`
- Create: `src/components/integracoes/servidor-mcp/logs-timeline.tsx`
- Create: `src/lib/actions/mcp-audit-query.ts`

- [ ] Server action `queryAuditLogs(filters, cursor)` com paginação por `createdAt`.
- [ ] Filtros: chave (Select), tool (Combobox), módulo, ação, status, range de data, busca `idempotencyKey`/`requestId`.
- [ ] Item da timeline: Timestamp · Chave (last4) · Tool · Status · Duration.
- [ ] Click → painel lateral (Sheet) com payload, snapshots, errorCode, errorMessage.

### Task M2: Export CSV dos logs filtrados

**Files:**
- Create: `src/app/(protected)/api/integracoes/servidor-mcp/logs/export/route.ts`

- [ ] Streaming CSV usando `csv-stringify` ou impl. manual.

### Task M3: Commit Bloco M

- [ ] `git add src/app/(protected)/integracoes/servidor-mcp/logs/ src/components/integracoes/servidor-mcp/logs-timeline.tsx src/lib/actions/mcp-audit-query.ts src/app/(protected)/api/integracoes/servidor-mcp/logs/export/`
- [ ] `git commit -m "feat(f4-onda2-bloco-m): painel Servidor MCP - Logs/Audit + export CSV"`

---

## Bloco N — Painel: Tab "Documentação"

### Task N1: Quickstart MDX

**Files:**
- Create: `src/content/mcp-docs/quickstart.mdx`

- [ ] Conteúdo: 3 passos (criar chave, exemplo curl, conferir no log).

### Task N2: Autenticação MDX

**Files:**
- Create: `src/content/mcp-docs/autenticacao.mdx`

- [ ] Como gerar Idempotency-Key, headers obrigatórios.

### Task N3: Permissões MDX, Idempotência MDX, External ID MDX, Rate Limits MDX, Changelog MDX

**Files:**
- Create: `src/content/mcp-docs/permissoes.mdx`
- Create: `src/content/mcp-docs/idempotencia.mdx`
- Create: `src/content/mcp-docs/external-id.mdx`
- Create: `src/content/mcp-docs/rate-limits.mdx`
- Create: `src/content/mcp-docs/changelog.mdx`

- [ ] Conteúdo base manuscrito.

### Task N4: Componente de catálogo auto-gerado

**Files:**
- Create: `src/components/integracoes/servidor-mcp/docs-catalog.tsx`
- Create: `src/lib/actions/mcp-catalog-schema.ts`

- [ ] Server action que exporta o catálogo do servidor MCP (ToolEntry serializável: id, dominio, descricao, inputSchemaShape, outputSchema, operation, capability).
- [ ] Componente renderiza por módulo, com:
  - Descrição.
  - Schemas (Zod serializado).
  - Tabs por linguagem (curl, n8n, Python, JavaScript) com exemplos.
  - Badge "Sensível" para `WriteToolEntry { sensitive: true }`.

### Task N5: Layout da tab Documentação

**Files:**
- Create: `src/app/(protected)/integracoes/servidor-mcp/documentacao/page.tsx`

- [ ] Sidebar com seções (Quickstart, Auth, Catálogo, Permissões, Idempotência, External ID, Rate Limits, Erros, Changelog).
- [ ] Conteúdo renderiza MDX ou componente auto-gerado conforme seção.
- [ ] Syntax highlighting via `shiki`.
- [ ] Busca interna (Cmd+K).

### Task N6: Commit Bloco N

- [ ] `git add src/content/mcp-docs/ src/app/(protected)/integracoes/servidor-mcp/documentacao/ src/components/integracoes/servidor-mcp/docs-catalog.tsx src/lib/actions/mcp-catalog-schema.ts`
- [ ] `git commit -m "feat(f4-onda2-bloco-n): painel Servidor MCP - Documentação interativa"`

---

## Bloco O — Reorganização do Menu

### Task O1: Mover "Plugar MCPs" para o Agente Nex

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/(protected)/agente/` (criar `plugar-mcps/page.tsx` se necessário)
- Move: `src/app/(protected)/integracoes/mcp/` → `src/app/(protected)/agente/plugar-mcps/`

- [ ] **Coordenação multi-agente:** verificar `docs/agents/active/` antes; comunicar mudança em `sidebar.tsx`.
- [ ] Atualizar `sidebar.tsx`: remover item "MCP" de Integrações, adicionar "Plugar MCPs" no Agente Nex.
- [ ] Migrar rotas e componentes preservando conteúdo.

### Task O2: Renomear card "APIs" para "API REST" com tag "Em breve"

**Files:**
- Modify: `src/components/integracoes/cards/api-rest-card.tsx` (renomear de `api-card.tsx`)
- Modify: `src/app/(protected)/integracoes/api/` → renomear pasta para `api-rest/`

- [ ] Card visível, não-clicável, tag "Em breve" estilo BI.
- [ ] Tooltip explicativo "API REST nossa (não-MCP). Em breve.".

### Task O3: Adicionar card "Servidor MCP" no Integrações

**Files:**
- Create: `src/components/integracoes/cards/servidor-mcp-card.tsx`

- [ ] Reusa padrão visual dos cards existentes.
- [ ] Link para `/integracoes/servidor-mcp`.

### Task O4: Commit Bloco O

- [ ] `git add src/app/(protected)/integracoes/ src/app/(protected)/agente/plugar-mcps/ src/components/layout/sidebar.tsx src/components/integracoes/cards/`
- [ ] `git commit -m "feat(f4-onda2-bloco-o): reorganização de menu

- 'MCP' → Agente Nex > Plugar MCPs
- 'APIs' → 'API REST' (Em breve, não-clicável)
- 'Servidor MCP' (novo card) → Integrações

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco P — Testes E2E Completos (22 cenários)

> Base de teste: `grupojht.teste.tauga.online`. Prefixo `[MCP-TEST]` + cleanup automático.

### Task P1: Fixture de bootstrap key

**Files:**
- Create: `mcp/__tests__/fixtures/api-key.ts`

- [ ] Implementar conforme spec §19.5.

### Task P2: Fixture de cleanup Odoo

**Files:**
- Create: `mcp/__tests__/fixtures/odoo-cleanup.ts`

- [ ] `cleanupPartnersByPrefix(prefix)`: search + unlink em massa via OdooWriteClient.

### Task P3: Suite E2E — POC happy path

**Files:**
- Create: `mcp/__tests__/e2e/poc-happy-path.test.ts`

- [ ] Suite cobre:
  - Criar partner via tool `crm.res_partner.create` (com `[MCP-TEST]` no name) → 200 + id retornado.
  - Verificar no Odoo direto via JSON-RPC: partner existe.
  - Verificar no cache local: partner sincronizado em <2s.
  - Verificar audit log: 1 linha com `status=success`, `snapshotAfter` preenchido.
- [ ] PASS contra base de teste.

### Task P4: Suite E2E — Cenários de erro (15 cenários da §19.3)

**Files:**
- Create: `mcp/__tests__/e2e/error-scenarios.test.ts`

- [ ] Implementa todos os cenários:
  1. Capability check: 403 + audit denied.
  2. Modo auth interno tenta write: 403 forbidden_via_internal_auth.
  3. Validação Zod: 400.
  4. Idempotency-Key ausente: 400.
  5. Idempotency repetida (mesmo payload): cache devolve.
  6. Idempotency repetida (payload diferente): 422.
  7. Burst com mesma key: 409 idempotency_in_progress.
  8. External_id duplicado: 409.
  9. Optimistic locking: 412.
  10. Chave revogada durante chamada: 401.
  11. Rate limit: 429 após 61 chamadas.
  12. Erros do Odoo (mocked): cada classe → status correto.
  13. Tauga offline durante write: 502.
  14. Sync direcionado: cache reflete em <2s.
  15. Sync direcionado falha + retry: consistência final.
- [ ] PASS.

### Task P5: Suite E2E — Cenários novos da Review #2

**Files:**
- Create: `mcp/__tests__/e2e/review2-scenarios.test.ts`

- [ ] Implementa:
  - C1 Tenant cross-leakage: 403.
  - C2 Chave expirada: 401.
  - C3 Rotação durante uso: A continua 24h; A' funciona.
  - C4 Hot reload de capability: <1s.
  - C5 Token vazado regenerado.
  - C6 Catálogo filtrado verificação direta.
  - C7 Health check com Tauga offline: degraded.
- [ ] PASS.

### Task P6: Cleanup global

- [ ] `afterAll` global em todos os E2E rodadas:
  - Deleta `mcp_audit_logs WHERE auth_mode='external' AND created_at > <start_test>`.
  - Deleta `mcp_idempotency_records WHERE api_key_id IN <test_keys>`.
  - Deleta ApiKeys de teste.
  - Cleanup Odoo via fixture P2.

### Task P7: Commit Bloco P

- [ ] `git add mcp/__tests__/`
- [ ] `git commit -m "test(f4-onda2-bloco-p): testes E2E completos (22 cenários)

Cobre todos os cenários da spec §19.3 + 7 da Review #2.
Roda contra grupojht.teste.tauga.online com prefixo [MCP-TEST]
e cleanup automático.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Bloco Q — Atualização CLAUDE.md + STATUS.md + Handoff

### Task Q1: Atualizar `CLAUDE.md` decisão canônica #2

**Files:**
- Modify: `CLAUDE.md`

- [ ] Confirmar numeração atual da decisão (pode ter mudado).
- [ ] Substituir texto antigo pelo novo conforme spec §3.2.

### Task Q2: Atualizar `STATUS.md`

**Files:**
- Modify: `STATUS.md`

- [ ] Marcar Onda 0 como concluída.
- [ ] Apontar Onda 1 como próxima.

### Task Q3: Handoff de fim de onda

**Files:**
- Create: `docs/HANDOFF-2026-MM-DD-f4-onda2-onda0.md`

- [ ] Resumo do que foi entregue, comandos para sessão seguinte, bloqueios resolvidos, próxima onda (CRM completo).

### Task Q4: Code review `/gsd-code-review`

- [ ] Rodar `/gsd-code-review` em modo phase.
- [ ] Endereçar achados.

### Task Q5: UI review `/gsd-ui-review`

- [ ] Rodar `/gsd-ui-review` no painel Servidor MCP.
- [ ] Endereçar achados.

### Task Q6: Commit Bloco Q + remoção do active/

- [ ] `git add CLAUDE.md STATUS.md docs/HANDOFF-2026-MM-DD-f4-onda2-onda0.md`
- [ ] `git rm docs/agents/active/claude-f4-onda2-mcp-escrita.md`
- [ ] `git commit -m "docs(f4-onda2-bloco-q): conclusão Onda 0

- CLAUDE.md §5 #2 atualizado (decisão canônica revisada)
- STATUS.md aponta Onda 1 como próxima
- HANDOFF com resumo de entregáveis e próximos passos
- Active/ removido (sessão concluiu sem bloqueio)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`

---

## Self-Review (vai virar Review #1 deste plano)

(executada após a redação, antes do commit do plano)

- [ ] **Spec coverage:** cada seção da spec v3 tem ao menos uma task? Listar gaps.
- [ ] **Placeholder scan:** procurar "TBD", "implementar depois", "similar a Task N".
- [ ] **Type consistency:** funções nomeadas em uma task batem com referências em outras.
- [ ] **Decomposição:** cada task é 2-5 min ou explicita sub-steps? Tasks grandes (J3-J4 UI complexa) precisam mais detalhe?

(Achados consolidados na Review #1 do plano em arquivo separado.)

---

## Próximos passos

1. **Review #1 deste plano** (adversarial, achados materiais) → `docs/superpowers/plans/reviews/2026-05-20-f4-onda2-onda0-fundacao-review-1.md`.
2. Aplicar achados → **Plan v2**.
3. **Review #2 do plano v2** → `...-review-2.md`.
4. Aplicar achados → **Plan v3** (final).
5. Executar via `superpowers:subagent-driven-development` bloco por bloco.

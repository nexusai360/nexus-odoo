# Bloco A — Achados da Inspeção Pré-Execução

> **Data:** 2026-05-20
> **Agente:** claude-f4-onda2-mcp-escrita
> **Plan:** v3 — `docs/superpowers/plans/2026-05-20-f4-onda2-onda0-fundacao.md`

## A1. `mcp/auth/user-context.ts`

```typescript
interface UserContext { userId: string; role: PlatformRole; domains: ReportDomain[] }
async function resolveUserContext(prisma, userId): Promise<UserContext | null>
```
- Simples, sem cache. Carrega user + domains via 2 queries.
- Retorna null se user inativo (alinha com src/auth.ts).

**Decisão:** modo externo cria `ApiKeyContext` análogo (já planejado em Bloco D Task D1). Sem mudança no plano.

## A2. `McpAuditLog` JÁ EXISTE (schema linha 1499)

```prisma
model McpAuditLog {
  id, userId, tool, params, outcome, rowCount, durationMs, criadoEm
  @@map("mcp_audit_log")
}
```

**Formato atual focado em READS** (`tool`, `params`, `outcome`, `rowCount`).

**🔴 Decisão revisada (atualiza Plan v3 Bloco B Task B2):**
- **NÃO criar tabela paralela.** Estender a existente com campos novos OPCIONAIS:
  - `apiKeyId String?` (null em chamadas modo interno)
  - `authMode String?` ("internal" | "external")
  - `module String?`, `action String?`, `capability String?`
  - `snapshotBefore Json?`, `snapshotAfter Json?`, `result Json?`
  - `httpStatus Int?`, `errorCode String?`, `errorMessage String?`
  - `idempotencyKey String?`, `requestId String?`
  - `eventName String?`, `operation String?` ("read" | "write")
  - `ipAddress String?`, `userAgent String?`
- Campos legados (`tool`, `params`, `outcome`, `rowCount`, `durationMs`, `criadoEm`) permanecem; código novo usa os novos. Migração suave.
- Novos índices: `@@index([apiKeyId, criadoEm(sort: Desc)])`, `@@index([eventName, criadoEm])`, etc.

## A3. `mcp/lib/rate-limit.ts` JÁ EXISTE

```typescript
async function checkMcpRateLimit(redis, userId): Promise<{ allowed, remaining }>
```
- Redis INCR+EXPIRE pipeline.
- Hardcoded 60/min, 60s window.
- Fail-open (Redis caído → permite).

**🔴 Decisão revisada (atualiza Plan v3 Bloco G):**
- **NÃO reescrever.** Estender com `checkMcpRateLimitFor(redis, scope)` onde `scope = { type: "user", userId, limit? } | { type: "apiKey", apiKeyId, limit }`. Original `checkMcpRateLimit` mantida.

## A4. `prisma/migrations/`

- Padrão atual: `<timestamp>_<descricao>` (sem prefixo `f5_` mas com prefixos descritivos).
- Último: `20260519220000_f5_d2_d5_playground_fields`.
- Nova: `<timestamp>_f4_onda2_mcp_writes` (Bloco B Task B4).

## A5. `pino` — NÃO instalado

Plan v3 Task A11 confirma adicionar `pino` + `pino-pretty` + `ioredis-mock` + `lru-cache` + `json-stable-stringify`.

## A6. `src/components/integracoes/`

```
api-keys-content.tsx
breadcrumb.tsx
integracoes-grid.tsx
mcp-panel.tsx          ← atual: configurar MCPs externos para Nex consumir
webhooks-content.tsx
whatsapp-channel-form.tsx
whatsapp-instances-list.tsx
```

**🔴 Decisão revisada (atualiza Plan v3 Bloco O):**
- `mcp-panel.tsx` é o conteúdo do card "MCP" atual (clientes externos).
- **Plan O1.3 ajustado:** mover `mcp-panel.tsx` para `src/components/agent/plugar-mcps-content.tsx` (renomear durante a movimentação).
- Criar `servidor-mcp-content.tsx` em `src/components/integracoes/servidor-mcp/` (nova pasta para os 4 subcomponentes: visao-geral, chaves, logs, documentacao).

## A7. `src/lib/constants/nav.ts` (source of truth do menu)

- `NAV_ITEMS` é o único lugar onde itens de menu são declarados.
- Agente Nex (`/agente`) JÁ tem 5 children: Configuração, Chaves de API, Prompt, Consumo, Playground.
- Integrações (`/integracoes`) é **flat** — sub-rotas internas via Next.js routing (sem entry no nav).

**🔴 Decisão revisada (atualiza Plan v3 Bloco O Task O1.4):**
- Editar `src/lib/constants/nav.ts` (não `sidebar.tsx` que apenas renderiza).
- Adicionar `{ label: "Plugar MCPs", href: "/agente/plugar-mcps", icon: Plug, superAdminOnly: true }` como 6º child de Agente Nex.
- "Servidor MCP" e "API REST" são páginas internas em `/integracoes/*`; não precisam de entry no nav (Integrações continua flat).

## A8. `src/worker/odoo/client.ts`

Classe `OdooClient` com:
- `version()`, `authenticate()`, `executeKw<T>(model, method, args, kwargs)`
- `searchReadPaged(model, domain, opts)` — paginado
- `searchReadPage(model, domain, {offset, pageSize, fields})` — uma página
- `searchIds(model, domain)` — só ids paginados
- Factory `clientFromEnv()` lê `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`.

**🔴 Decisão revisada (atualiza Plan v3 Bloco C):**
- **NÃO criar cliente paralelo** em `mcp/odoo/client.ts`.
- **Estender** `src/worker/odoo/client.ts` adicionando métodos:
  - `create(model, vals): Promise<number>`
  - `write(model, ids, vals): Promise<boolean>`
  - `unlink(model, ids): Promise<boolean>`
  - `read(model, ids, fields): Promise<object[]>`
  - `searchRead(model, domain, fields, options)`
  - `fieldsGet(model, attributes?)`
  - `searchIrModelData(model, externalKey)`
- Suportar 2 instâncias via env: `OdooClient.fromEnv("read")` (usa `ODOO_*`) vs `OdooClient.fromEnv("write")` (usa `ODOO_WRITE_*`; fallback para `ODOO_*` se ausente).
- Classes de erro Odoo (`OdooAccessError`, etc) ficam em `src/worker/odoo/errors.ts` (novo arquivo).

## A9. `module = mcp_nexus` no Odoo Tauga — PENDENTE de execução

Script `discovery/check-mcp-nexus-module.py` será escrito; rodar quando credenciais `ODOO_WRITE_*` estiverem em `.env.local` ou `.env.test`. Se ocupado, alternativa: `nexus_mcp_external`.

## A10. Resumo das mudanças no Plan v3

Após este Bloco A, **Plan v3 será revisado em Bloco A.10.5** com as decisões acima antes de seguir para o Bloco B. Mudanças cirúrgicas:

1. **Bloco B Task B2:** alterar `McpAuditLog` de "criar novo modelo" para "estender modelo existente com campos opcionais".
2. **Bloco C:** alterar de "criar `mcp/odoo/client.ts`" para "estender `src/worker/odoo/client.ts` + novo `src/worker/odoo/errors.ts`".
3. **Bloco G:** alterar de "reescrever rate-limit" para "estender `mcp/lib/rate-limit.ts` com `checkMcpRateLimitFor(scope)`".
4. **Bloco O Task O1.3:** ajustar caminhos (mcp-panel.tsx → plugar-mcps-content.tsx).
5. **Bloco O Task O1.4:** editar `src/lib/constants/nav.ts` (não `sidebar.tsx`).
6. **Bloco C wrapper Odoo:** `OdooClient.fromEnv("read"|"write")`.

Outras tasks permanecem como no Plan v3.

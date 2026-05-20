# F4 Onda 2 — Capacidade de Escrita no Servidor MCP (Design)

> **Status:** v2 (pós Review #1) — aguarda Review crítica #2
> **Data:** 2026-05-20
> **Branch alvo:** `feat/f4-onda2-mcp-escrita`
> **Fase predecessora:** F4 Onda 1 (estoque + financeiro, leitura) — em andamento no `main`
> **Decisão canônica afetada:** `CLAUDE.md` §5 #2 (revisada nesta spec)
>
> **Histórico de versões:**
> - **v1** (2026-05-20): rascunho inicial pós-brainstorming. Não passou por review formal.
> - **v2** (2026-05-20): aplica 41 achados materiais da Review #1 (`docs/superpowers/specs/reviews/2026-05-20-f4-onda2-mcp-escrita-review-1.md`). Mudanças principais: estado real do `mcp/` existente (inspeção), arquitetura ancorada no SDK 1.29.0 + `StreamableHTTPServerTransport`, auth DUAL (interno + externo) preservando o que existe, `ApiKey` existente estendida em vez de renomeada, formato de resposta conformante ao protocolo MCP 2025-06-18, 5 TBDs decididos para Onda 0.
> - **v3** (TBD): após Review crítica #2 (`docs/superpowers/specs/reviews/2026-05-20-f4-onda2-mcp-escrita-review-2.md`).

---

## 0. Estado Atual do Servidor MCP (inspeção real do código)

> Esta seção foi adicionada na v2 após inspeção de `mcp/` em 2026-05-20. **A Onda 0 não é greenfield — é expansão do servidor existente.**

### 0.1. O que já existe

**Container e build:**
- `mcp/Dockerfile` — container Node.js standalone (não Next.js). Entry: `mcp/index.ts`. Script: `npm run mcp`.
- `tsx --env-file=.env.local mcp/index.ts` para dev.

**SDK e transport:**
- `@modelcontextprotocol/sdk` versão `^1.29.0` (instalada).
- Usa `StreamableHTTPServerTransport` (transport HTTP do protocolo MCP 2025-06-18).
- Padrão: 1 `McpServer` + 1 `StreamableHTTPServerTransport` **por sessão** (sessão criada no `initialize`, fechada no `transport.onclose`). Documentado em `mcp/SDK-NOTES.md`.

**Auth atual (modo INTERNO, único hoje):**
- `mcp/auth/service-token.ts` — valida `Authorization: Bearer <token>` contra env `MCP_SERVICE_TOKEN` via SHA-256 + `timingSafeEqual`.
- `mcp/auth/user-context.ts` — resolve `UserContext` (id, role, domínios) a partir de `X-Mcp-User-Id` header.
- `mcp/auth/session-store.ts` — Map em memória `sessionId → UserContext`.
- **Modelo conceitual atual:** o app Next.js (container `app`) chama o MCP usando um token compartilhado `MCP_SERVICE_TOKEN` (env) + `X-Mcp-User-Id` (identidade do usuário logado). Service-to-service auth, não end-user auth.

**Catálogo de tools:**
- `mcp/catalog/types.ts` — interface `ToolEntry<I, O>` com `id`, `dominio?`, `descricao`, `inputSchemaShape` (raw Zod), `inputSchema` (`ZodType<I>`), `outputSchema` (`ZodType<O>`), `gatedRoles?`, `sempreVisivel?`, `handler`.
- `mcp/catalog/registry.ts` + `mcp/catalog/index.ts` — registro central.
- **Filtro `tools/list` por usuário:** "Opção A" — McpServer por sessão registra somente tools visíveis (`visibleTools(catalogo, userCtx)`).

**Tools de leitura já implementadas:**
- `mcp/tools/dominios-vazios/*` — placeholders/status para domínios sem dados (crm, rh, producao).
- `mcp/tools/fiscal/faturamento-periodo.ts` — exemplo de tool de leitura real.
- `mcp/tools/caminho3/sql-guard.ts` — guard para o Caminho 3c (SQL ad-hoc BI), usa `pgsql-parser`.

**Lib interna do MCP:**
- `mcp/lib/audit.ts` — audit existente (verificar formato; pode precisar de expansão para writes).
- `mcp/lib/rate-limit.ts` — rate limit existente.
- `mcp/lib/freshness.ts` — controle do "atualizado há Xs" no cache.
- `mcp/lib/recusa.ts` — recusa de tools (Caminho 3b).
- `mcp/lib/failure.ts` — classificação de erros.

**Tabela `ApiKey` no Prisma (já existe):**
```prisma
model ApiKey {
  id          String    @id @default(uuid()) @db.Uuid
  label       String
  keyHash     String    @unique @map("key_hash")
  last4       String
  scopes      Json      @default("[]")
  revokedAt   DateTime? @map("revoked_at")
  createdById String?   @map("created_by_id") @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at")

  @@map("api_keys")
}
```
Usada hoje em `mcp/auth/*` e contextos de integração. Provavelmente reservada para o caminho de auth externo (ainda não totalmente implementado).

**Tabela `AuditLog` no Prisma (já existe, genérica):**
```prisma
model AuditLog {
  id, userId, action, targetType, targetId, ipAddress, userAgent, details, createdAt
}
```
**Não é específica do MCP.** Cobre ações da plataforma. Para o MCP precisamos de tabela própria (`McpAuditLog`) ou estender essa.

**Infraestrutura de fila:**
- BullMQ 5 + Redis 7 (validado em F2/F5).
- Worker em `src/worker/index.ts`; jobs específicos em `src/worker/jobs.ts`; sync recovery em `src/worker/recovery.ts`.

**Testes:**
- `mcp/__tests__/integration.test.ts` + `mcp/__tests__/harness.ts` — base de testes E2E já existe para reuso.

### 0.2. O que NÃO existe (será criado na Onda 0)

- **Modo de auth EXTERNO** (Bearer = `ApiKey` → carrega capabilities). Hoje só existe o modo interno (service token + X-Mcp-User-Id).
- **Conceito de capabilities por módulo × ação.** A `ApiKey.scopes` existe mas o formato/uso atual precisa ser determinado e migrado para o novo modelo.
- **Conceito de "write tool".** Hoje só há `ToolEntry` genérico; todas as tools existentes são leitura. Precisa de extensão do `ToolEntry` (ou tipo derivado) com metadados de capability `write:<modulo>:<ação>`.
- **Cliente JSON-RPC do Odoo configurado para escrita.** `src/worker/odoo/client.ts` faz leitura via `search_read`; métodos de escrita (`create`, `write`, `unlink`, `execute_kw`) podem existir mas precisam de wrapper específico para o MCP usar.
- **Worker de sync direcionado** pós-write (job na fila `odoo-sync:directed`).
- **Painel `Integrações → Servidor MCP`** com matriz de capabilities, logs, documentação interativa.
- **Endpoint `/api/mcp/health`** para o painel exibir status.
- **`McpAuditLog` e `McpIdempotencyRecord`** (novos modelos Prisma).
- **Reorganização do menu** (Plugar MCPs → Nex; API REST com "Em breve").
- **1 read tool + 1 write tool de POC para o CRM** (`crm.res_partner.get` + `crm.res_partner.create`).

### 0.3. Implicações para a v2

- **Auth dual:** Onda 0 preserva o modo interno e ADICIONA o modo externo (sem remover nada).
- **Estender `ApiKey`, não renomear.** Mantém `ApiKey` (genérico) e adiciona campos faltando. O futuro card "API REST" pode usar a mesma tabela com `scopes` diferentes — flexibilidade preservada.
- **Reusar `ToolEntry` existente** estendendo para writes com tipo derivado `WriteToolEntry`.
- **Reusar `mcp/catalog/registry.ts`** sem reescrita.
- **Reusar `mcp/lib/audit.ts`** (estender, não substituir) ou criar `McpAuditLog` Prisma para writes (decisão técnica fica para o plano).

---

## 1. Contexto e Objetivos

### 1.1. O quê

Estender o servidor MCP (existente em `mcp/`) para permitir **escrita** no Odoo Tauga, cobrindo **abrangentemente os módulos de negócio ativos** que o Odoo expõe, com **gate de segurança por API Key com capabilities por módulo × ação**, configurado e auditado pelo painel `Integrações → Servidor MCP`.

### 1.2. Por quê

Orquestrar fluxos de escrita no Odoo a partir de plataformas externas (n8n imediato; arquitetura aberta a Make, Zapier, scripts, outras plataformas), tipicamente para sincronizar dados que vivem em outras ferramentas (CRM externo, automações de marketing, etc) com o ERP.

### 1.3. Princípios não-negociáveis

1. **Agente Nex (in-app + WhatsApp) NUNCA escreve.** Materialização: o **modo de auth interno** (service token + `X-Mcp-User-Id`) usado pelo Agente Nex é **incompatível com tools `WriteToolEntry`** — o dispatcher rejeita writes vindas pelo modo interno (`403 forbidden_via_internal_auth`). Defesa pela **rota de auth**, não pelo prompt.
2. **Escrita exige `Idempotency-Key` obrigatória** + lock distribuído Redis para race conditions.
3. **Auditoria total.** Toda chamada (read e write, success e denied) registrada com snapshot (`payload`, `before`, `after`, `result`, `status`, `errorCode`, `durationMs`).
4. **Discovery abrangente.** Onda 0 entrega POC; ondas subsequentes mapeiam todos os módulos ativos no Odoo Tauga usando heurística (`action_*`, `_post`, `confirm`, `cancel`, `validate`, `reconcile`) + introspecção + iteração com uso real. **Cobertura é "abrangente com gap conhecido" — não "100%".** Gaps descobertos viram tools nas ondas seguintes.
5. **Testes E2E reais** na base `grupojht.teste.tauga.online` antes do merge de cada onda. Não é opcional. Cleanup automático via prefixo `[MCP-TEST]` + cascade.
6. **Conformidade com protocolo MCP 2025-06-18.** Formatos de resposta seguem `result.content[]` + `isError`; transport é `StreamableHTTPServerTransport` (já em uso).

---

## 2. Escopo

### 2.1. Dentro (Onda 0 — esta spec foca aqui)

- **Modelo de dados:** estender `ApiKey` Prisma com campos para capabilities, expiração, rate limit, tenant scoping, system key flag, rotação. Criar `McpAuditLog` e `McpIdempotencyRecord`.
- **Auth EXTERNO no MCP:** middleware que distingue Bearer interno (service token) vs externo (ApiKey existente).
- **Idempotência:** middleware com lock distribuído Redis + canonicalização determinística do payload.
- **Capability check:** tools com metadata `requiredCapability`; dispatcher valida ANTES do handler rodar.
- **Rate limit por chave:** sliding window 60s no Redis, default 60 req/min, configurável até 600.
- **Worker de sync direcionado:** fila `odoo-sync:directed` com job que atualiza cache local pós-write (reusa snapshot_after do handler).
- **Painel `Integrações → Servidor MCP`:** Visão geral, Chaves de Acesso (CRUD + matriz de capabilities), Logs/Audit, Documentação interativa (auto-gerada do catálogo + manuscritos em MDX).
- **Endpoint `/api/mcp/health`:** retorna status de Postgres, Redis, Odoo (configurável), profundidade da fila.
- **Reorganização do menu:** card "MCP" → submenu "Plugar MCPs" do Agente Nex; card "APIs" → "API REST" com tag "Em breve".
- **POC:** 1 read tool (`crm.res_partner.get`) + 1 write tool (`crm.res_partner.create`) com testes E2E completos contra base de teste.
- **Discovery write paths:** extensão de `discovery/` (Python) com heurística + introspecção.
- **Revisão da decisão canônica #2** no `CLAUDE.md`.

### 2.2. Dentro (ondas 1-7 — não detalhadas aqui)

Spec própria por onda (ou subseção desta) → plan → execução → testes E2E → review → merge. Ver §18 para a sequência.

### 2.3. Fora (todas as ondas)

- Construção de UI de cliente MCP no Agente Nex para consumir tools de escrita (Nex permanece read-only — ver §1.3).
- Endpoints REST não-MCP (a "API REST" da plataforma fica como "Em breve" — design separado quando demandado).
- BI/Caminho 3c de escrita (ad-hoc SQL não escreve).
- Migração de fluxos n8n existentes do cliente (cliente cuida).
- Webhooks push de eventos write (campo `eventName` reservado em `McpAuditLog` desde já; consumidor virá em fase futura).

### 2.4. Pré-requisitos externos (BLOQUEADORES)

Sem estes, a Onda 0 inicia em modo dry-run (handlers validam mas não chamam Odoo):

1. **PR1 — User Odoo dedicado em `grupojht.teste.tauga.online`** com permissões plenas confirmadas pela Tauga. Comunicação da credencial via cofre/Portainer (não chat/email). Prazo aceitável: 3 dias úteis após início da Onda 0.
2. **PR2 — SLA da base de teste** confirmado pela Tauga (mín. 30 dias de disponibilidade, aviso prévio de manutenção).
3. **PR3 — Confirmação de `module = mcp_nexus` livre em `ir.model.data`** (não conflita com nada já existente no Odoo Tauga). Verificar via busca direta no Odoo.
4. **PR4 — Estado do PR #9 (F5)** confirmado mergeado em `main` (✓ já feito em 2026-05-20, commit `682b9a7`).

### 2.5. Suposições

- JSON-RPC do Odoo é estável para writes (F0 validou leitura; **adicionar fase de teste de write** no início da Onda 0 com 3 modelos: 1 padrão, 1 OCA, 1 customizado da Tauga).
- Cron de sync incremental (3min) + snapshot/reconcile (24h) permanecem como mecanismo principal de hidratação do cache; sync direcionado é complemento.

---

## 3. Arquitetura

### 3.1. Visão macro (atualizada para a realidade)

```
┌──────────────────────────────────────────────────────────────┐
│ Modo INTERNO (existente, preservado)                          │
│ ─────────────────────────────────────                         │
│ App Next.js (container "app")                                 │
│   ↓ HTTPS POST /api/mcp/internal                              │
│   ↓ Authorization: Bearer <MCP_SERVICE_TOKEN>                 │
│   ↓ X-Mcp-User-Id: <userId-da-plataforma>                     │
│   ▼                                                            │
│ Servidor MCP (mcp/ — container "mcp")                         │
│   - validateServiceToken (já existe)                           │
│   - resolveUserContext via X-Mcp-User-Id                       │
│   - McpServer por sessão; visibleTools filtra catálogo         │
│   - Tools READ-ONLY são executadas                             │
│   - Tools WriteToolEntry → 403 forbidden_via_internal_auth     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Modo EXTERNO (novo — F4 Onda 2)                                │
│ ─────────────────────────────                                  │
│ Clientes externos (n8n, Make, Zapier, scripts, ...)            │
│   ↓ HTTPS POST https://app.nexus-odoo/api/mcp                  │
│   ↓ Authorization: Bearer mcp_live_<token>                     │
│   ↓ Idempotency-Key: <uuid>                                    │
│   ↓ (opcional) If-Unmodified-Since: <ISO8601> p/ updates       │
│   ▼                                                             │
│ Servidor MCP (mesmo container)                                 │
│   ┌──────────────────────────────────────────────────────┐    │
│   │ Auth Middleware (NOVO)                                │    │
│   │   - Bearer != MCP_SERVICE_TOKEN → modo EXTERNO        │    │
│   │   - SHA-256(token) → SELECT em ApiKey por keyHash     │    │
│   │   - active? expiresAt? revokedAt? → 401               │    │
│   │   - tenant scoping (verifica ApiKey.tenantId)         │    │
│   │   - rate limit Redis (sliding window 60s)             │    │
│   │   - carrega capabilities em ctx                       │    │
│   └──────────────────────────────────────────────────────┘    │
│   ┌──────────────────────────────────────────────────────┐    │
│   │ Idempotency Middleware (NOVO — writes apenas)         │    │
│   │   - header ausente → 400                              │    │
│   │   - lock Redis SET NX EX 60 mcp:idem:<key>            │    │
│   │   - McpIdempotencyRecord existe?                      │    │
│   │     - mesmo payloadHash (canonical) → devolve result  │    │
│   │     - payloadHash diferente → 422                     │    │
│   │   - lança execução                                    │    │
│   └──────────────────────────────────────────────────────┘    │
│   ┌──────────────────────────────────────────────────────┐    │
│   │ Tool Dispatcher (estende registry existente)          │    │
│   │   - lookup no catálogo (read OU write)                │    │
│   │   - WriteToolEntry exige capability "create:crm"      │    │
│   │   - capability presente? → 403 senão                  │    │
│   │   - validação Zod do input → 400 senão                │    │
│   └──────────────────────────────────────────────────────┘    │
│   ┌──────────────────────────────────────────────────────┐    │
│   │ Handler                                                │    │
│   │   READ: SELECT no Postgres cache (já existente)       │    │
│   │   WRITE:                                               │    │
│   │     1. snapshot before (read pré em update/del/trans) │    │
│   │     2. opcional: validar If-Unmodified-Since          │    │
│   │     3. chama Odoo (create/write/unlink/action_*)      │    │
│   │     4. snapshot after (read pós em create/upd/trans)  │    │
│   │     5. retorna { id, data, snapshotBefore, snapshotAfter } │
│   └──────────────────────────────────────────────────────┘    │
│   ┌──────────────────────────────────────────────────────┐    │
│   │ Post-handler (writes)                                  │    │
│   │   - grava McpAuditLog (status, payload, snapshots,    │    │
│   │     eventName="crm.res_partner.created")              │    │
│   │   - grava McpIdempotencyRecord (TTL 24h)              │    │
│   │   - libera lock Redis                                 │    │
│   │   - enfileira job odoo-sync:directed                  │    │
│   │     (payload: {model, ids, op, snapshotAfter})        │    │
│   └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
       │ JSON-RPC                            │
       ▼                                     │ enfileira
   Odoo Tauga                            ┌───┴────┐
   ├─ leitura (cache):  grupojht.tauga.online  (produção)
   ├─ writes Onda 0+:   grupojht.teste.tauga.online (teste)
   │                    cutover → produção após validação humana
   │                                          │
   │                                          ▼
   │                                    Postgres cache
   │                                    (raw_* + fato_*)
   │
   └─ leituras pelo Agente Nex via cache (read-only)
```

### 3.2. Revisão da decisão canônica #2

**Texto antigo (CLAUDE.md §5 #2):**
> "Sem fallback JSON-RPC nas tools. O Odoo é tocado somente pelo cron de sincronização. Nenhuma pergunta de usuário dispara chamada ao Odoo."

**Texto novo (aplicar em `CLAUDE.md` ao concluir Onda 0):**
> "Leitura **sempre** do cache; o cache é alimentado pelos ciclos da F2 (incremental 3min + snapshot/reconcile 24h). Escrita pode ir ao Odoo **exclusivamente** via tools `WriteToolEntry` do servidor MCP, gated por capability de `ApiKey` (modo EXTERNO) e disponível só pelo endpoint público `/api/mcp` (não pelo modo interno `/api/mcp/internal`). Toda write é seguida de sync direcionado da(s) linha(s) afetada(s), retornando ao cache em <2s. O Agente Nex (in-app + WhatsApp), por usar o modo interno, **nunca pode** chamar uma `WriteToolEntry` — é defesa pela rota de auth, não pelo prompt."

### 3.3. Cutover teste → produção (writes)

- Onda 0 inteira: writes apontam para `grupojht.teste.tauga.online` (env `ODOO_WRITE_URL`).
- Cutover para produção (`grupojht.tauga.online`) **só após** Onda 0 mergeada + validação humana explícita do usuário + comunicação prévia ao cliente.
- Variável de ambiente `ODOO_WRITE_URL` separada de `ODOO_READ_URL` (cron usa read).
- Reversibilidade: trocar `ODOO_WRITE_URL` de volta para `teste.tauga.online` se algo der errado em produção. Não há lock-in.

---

## 4. Modelo de Dados

### 4.1. Estender `ApiKey` (não renomear)

**Migration adiciona campos** ao modelo `ApiKey` existente. **Mantém `label`, `keyHash`, `last4`, `scopes`, `revokedAt`, `createdById`, `createdAt`.**

```prisma
model ApiKey {
  // EXISTENTES
  id          String    @id @default(uuid()) @db.Uuid
  label       String                                    // nome do uso (mantido — já era "label", não "name")
  keyHash     String    @unique @map("key_hash")        // SHA-256 do token; índice por @unique
  last4       String                                    // últimos 4 chars visíveis (mantido — já cumpre função do "prefix")
  scopes      Json      @default("[]")                  // DEPRECATED — preservado para migração; novo: capabilities
  revokedAt   DateTime? @map("revoked_at")
  createdById String?   @map("created_by_id") @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at")

  // NOVOS (Onda 0)
  description       String?
  capabilities      Json      @default("{\"version\":1,\"read\":[],\"write\":{}}")  // formato em §4.3
  capabilitiesVersion Int     @default(1) @map("capabilities_version")
  rateLimit         Int       @default(60) @map("rate_limit")           // requests/minuto, máx 600
  active            Boolean   @default(true)
  expiresAt         DateTime? @map("expires_at")
  lastUsedAt        DateTime? @map("last_used_at")
  rotatedAt         DateTime? @map("rotated_at")
  revokedReason     String?   @map("revoked_reason")
  isSystemKey       Boolean   @default(false) @map("is_system_key")     // true = chave de sistema; bloqueia delete pelo painel
  tenantId          String?   @map("tenant_id") @db.Uuid                // null=plataforma; preenchido se multi-tenant

  auditLogs         McpAuditLog[]

  @@index([active, revokedAt, expiresAt])
  @@index([tenantId, active])
  @@index([last4])  // facilita lookup visual no painel
  @@map("api_keys")
}
```

**Migração de dados de `scopes` para `capabilities`:**
- Se `scopes = []` ou `null` → `capabilities = { version: 1, read: [], write: {} }`.
- Se `scopes` tem itens no formato antigo (a verificar caso por caso na execução da migration) → mapear via script Node.js executado pela migration.
- Marcar todas as keys existentes com `isSystemKey=true` por segurança e exigir reconfiguração explícita pelo super_admin via painel antes de uso novo (revisão manual).

### 4.2. Novos modelos

```prisma
model McpAuditLog {
  id              String    @id @default(uuid()) @db.Uuid
  apiKeyId        String?   @map("api_key_id") @db.Uuid              // null se denied antes de identificar key
  apiKey          ApiKey?   @relation(fields: [apiKeyId], references: [id])

  // Modo de auth desta requisição
  authMode        String    @map("auth_mode")                        // "internal" | "external"

  // Tool e operação
  toolId          String    @map("tool_id")                          // ex: "crm.res_partner.create"
  operation       String                                              // "read" | "write"
  module          String?                                              // ex: "crm" (facilita filtros)
  action          String?                                              // ex: "create" (facilita filtros)
  capability      String?                                              // ex: "create:crm" (null em reads)
  eventName       String?   @map("event_name")                        // ex: "crm.res_partner.created" — reservado para webhooks futuros

  // Correlação
  requestId       String    @map("request_id")                       // uuid gerado no middleware
  idempotencyKey  String?   @map("idempotency_key")

  // Payloads
  payload         Json?                                                // input recebido (sujeito a redaction de PII — ver §10.4)
  result          Json?                                                // output da tool ou erro
  snapshotBefore  Json?     @map("snapshot_before")                   // estado before (writes; null em create)
  snapshotAfter   Json?     @map("snapshot_after")                    // estado after (writes; null em delete)

  // Resultado
  status          String                                               // "success" | "denied" | "validation_error" | "odoo_error" | "internal_error" | "rate_limited"
  httpStatus      Int       @map("http_status")                       // 200, 401, 403, 422, 429, 500…
  errorCode       String?   @map("error_code")                        // padronizado: "capability_missing", "odoo_access_denied", "validation_failed", "idempotency_key_required", "idempotency_key_conflict"…
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
  @@index([eventName, createdAt])  // p/ futuro webhook emit
  @@map("mcp_audit_logs")
}

model McpIdempotencyRecord {
  apiKeyId        String   @map("api_key_id") @db.Uuid               // key composto com `key` para evitar colisão entre canais
  key             String                                              // Idempotency-Key recebido
  toolId          String   @map("tool_id")
  payloadHash     String   @map("payload_hash")                       // SHA-256(canonicalJson(input))
  result          Json                                                  // resposta original a devolver em retry
  status          String                                               // "success" | "error"
  httpStatus      Int      @map("http_status")
  expiresAt       DateTime @map("expires_at")                         // now() + 24h
  createdAt       DateTime @default(now()) @map("created_at")

  @@id([apiKeyId, key])                                                // composite primary key — isola por chave
  @@index([expiresAt])
  @@map("mcp_idempotency_records")
}
```

### 4.3. Formato do campo `capabilities`

```json
{
  "version": 1,
  "read": ["estoque", "financeiro", "crm", "vendas"],
  "write": {
    "crm":        ["create", "update", "transition"],
    "estoque":    ["create", "update"],
    "fiscal":     ["update", "emit_nfe", "cancel_nfe"],
    "financeiro": ["update", "transition", "reconcile"],
    "contabil":   ["update", "post_journal"]
  }
}
```

**Versionamento (§8):** quando uma ação nova é adicionada ao catálogo (`unpost_journal`), ela entra **desligada por padrão** em chaves existentes — só ativa se o super_admin editar a chave e marcar. Idem para módulos novos. Sem invalidação retroativa.

---

## 5. Tools

### 5.1. Extensão do `ToolEntry` existente

A interface `ToolEntry` em `mcp/catalog/types.ts` permanece para tools de leitura. Para writes, criamos um **tipo derivado** `WriteToolEntry` que estende:

```typescript
// mcp/catalog/types.ts (adicionado)

export type ToolOperation = "read" | "write";

export interface WriteToolEntry<I = unknown, O = unknown> extends ToolEntry<I, O> {
  operation: "write";

  /** Capability exigida — gate principal da Camada 3. */
  capability: {
    module: string;            // "crm"
    action: string;            // "create" | "update" | "delete" | "transition" | sensitive name
  };

  /** Marca true para ações sensíveis (fiscal/contábil/financeiro irreversíveis). */
  sensitive: boolean;

  /** Modelo Odoo principal afetado (para sync direcionado). */
  odooModel: string;            // "res.partner"

  /** Modelos adicionais a sincronizar pós-write (FKs em cascata). Opcional. */
  affectsModels?: ReadonlyArray<string>;

  /** Event name padronizado para futuros webhooks. */
  eventName: string;            // "crm.res_partner.created"

  /** Handler de write — retorna { id, data, snapshotBefore?, snapshotAfter? }. */
  handler: (input: I, ctx: WriteToolHandlerCtx) => Promise<WriteToolResult<O>>;
}

export interface WriteToolHandlerCtx extends ToolHandlerCtx {
  odoo: OdooClient;             // wrapper para create/write/unlink/execute_kw
  requestId: string;
  idempotencyKey: string;
}

export interface WriteToolResult<O> {
  id: number | number[];        // id(s) afetado(s) no Odoo
  data: O;                       // output mapeado para o cliente
  snapshotBefore: object | null; // null em create
  snapshotAfter: object | null;  // null em delete
}
```

Tools de leitura existentes (`ToolEntry`) ganham implicitamente `operation: "read"` (derivável da ausência de `WriteToolEntry`).

### 5.2. Ações canônicas (4 — todos os módulos)

| Ação | Capability | Método Odoo subjacente | Snapshot |
|---|---|---|---|
| `create` | `create:<modulo>` | `model.create(vals)` | before=null, after=read pós-create |
| `update` | `update:<modulo>` | `model.write(ids, vals)` | before=read pré-write, after=read pós-write |
| `delete` | `delete:<modulo>` | `model.unlink(ids)` | before=read pré-unlink, after=null |
| `transition` | `transition:<modulo>` | método `action_*()` quando existe; fallback write em `state` | before=read pré, after=read pós |

**Regra para `transition`:** **preferir o método `action_*` quando existe** (dispara workflows, hooks, audit do Odoo). Write direto em `state` só quando não há método. Documentar exceções na descrição da tool.

### 5.3. Ações sensíveis por módulo (exemplos — discovery confirma na onda do módulo)

| Módulo | Ações sensíveis | Modelo Odoo principal | Observação |
|---|---|---|---|
| **fiscal** | `emit_nfe`, `cancel_nfe`, `inutilize_nfe` | `l10n_br_fiscal.document` | SEFAZ — irreversível pós-autorização |
| **contabil** | `post_journal`, `unpost_journal`, `close_period` | `account.move`, `account.period` | Lock contábil |
| **financeiro** | `reconcile`, `pay`, `cancel_payment`, `refund` | `account.payment`, `account.move.line` | Movimenta caixa |
| **estoque** | `validate_picking`, `apply_inventory`, `adjust_quant` | `stock.picking`, `stock.inventory` | Altera saldo físico |
| **vendas** | `confirm_order`, `cancel_order`, `mark_done` | `sale.order` | Gera NF + commitment estoque |
| **compras** | `confirm_purchase`, `receive`, `cancel_purchase` | `purchase.order` | Gera obrigação financeira |
| **producao** | `confirm_mo`, `mark_done_mo`, `cancel_mo` | `mrp.production` | Consome componentes |
| **rh** | `confirm_payslip`, `cancel_payslip` | `hr.payslip` | Folha de pagamento |

### 5.4. Nomenclatura de tools

Padrão explícito: **`<modulo>.<modelo_completo_underscore>.<ação>`**.

- `crm.res_partner.create` (não `crm.partner.create` — `res.partner` vira `res_partner`)
- `crm.crm_lead.update`
- `crm.crm_lead.transition` (input requer `stage_id` ou `name` do estágio)
- `fiscal.l10n_br_fiscal_document.emit_nfe`
- `financeiro.account_payment.reconcile`
- `vendas.sale_order.confirm_order` (transition sensível)
- `estoque.stock_picking.validate_picking` (transition sensível)

Justificativa: sem ambiguidade entre `account.move` vs `account.payment` quando há colisão de "modelo curto".

### 5.5. Limites e canonicalização do snapshot

- Snapshot grava **todos os campos retornados pelo método `read` da tool** (whitelist definida internamente em cada tool: ex. `FIELDS_RES_PARTNER = ['id', 'name', 'cnpj_cpf', 'email', 'phone', 'street', ...]`).
- **Não inclui** metadados internos (`__last_update`, `display_name`).
- **Limite de tamanho de campo:** valores >10KB são truncados com sufixo `...[truncated:<original_size>]`. Documentado no audit.

### 5.6. Mapping de input/output

- Cada tool define **internamente** suas funções `mapInputToOdoo` (Zod input → Odoo vals) e `mapOdooToOutput` (Odoo read → Zod output). Sem framework central — cada tool é autocontida.
- Wrapper Odoo client em `mcp/odoo/client.ts` (a criar; pode reusar `src/worker/odoo/client.ts`) expõe métodos `create`, `write`, `unlink`, `read`, `execute_kw`, `searchIrModelData`.

---

## 6. Fluxo Completo de uma Chamada (modo externo)

### 6.1. Requisição de exemplo (conforme MCP 2025-06-18)

```
POST /api/mcp
Authorization: Bearer mcp_live_aBcD1234EfGh5678IjKl9012MnOp3456
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
If-Unmodified-Since: 2026-05-20T15:00:00Z          (opcional, p/ updates)
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "crm.res_partner.create",
    "arguments": {
      "name": "21 Fitness Academia",
      "cnpj_cpf": "21.085.714/0001-10",
      "is_company": true,
      "external_id": "atendimento_crm_8842"
    }
  }
}
```

### 6.2. Resposta de sucesso (formato MCP nativo)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":1234,\"name\":\"21 Fitness Academia\",\"external_id\":\"atendimento_crm_8842\",\"cnpj_cpf\":\"21.085.714/0001-10\",\"is_company\":true}"
      }
    ],
    "isError": false,
    "_meta": {
      "request_id": "req_abc123",
      "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
      "cached_at": "2026-05-20T15:30:01Z",
      "duration_ms": 412,
      "server_version": "0.1.0",
      "protocol_version": "2025-06-18"
    }
  }
}
```

### 6.3. Resposta de erro

**Erros de pre-auth (sem catálogo carregado) — JSON-RPC error nativo:**

```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32000,
    "message": "Unauthorized",
    "data": {
      "code": "invalid_token",
      "message": "Token inválido ou revogado"
    }
  }
}
```

**Erros de execução da tool (capability missing, validation, odoo) — `content[]` + `isError: true`:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"code\":\"capability_missing\",\"message\":\"A chave de acesso não tem capability 'delete:crm'\",\"required\":\"delete:crm\",\"current_write_crm\":[\"create\",\"update\",\"transition\"]}"
      }
    ],
    "isError": true,
    "_meta": {
      "request_id": "req_def456"
    }
  }
}
```

**Regra:** erros que impedem a execução da tool antes do dispatcher (auth, transport, JSON malformado) → JSON-RPC error. Erros DA tool (capability, validation, odoo) → `isError: true` com payload tipado. Compatível com `@modelcontextprotocol/sdk` e n8n MCP node.

### 6.4. Headers de resposta

- `X-RateLimit-Limit: 60`
- `X-RateLimit-Remaining: 47`
- `X-RateLimit-Reset: 2026-05-20T15:30:30Z`
- `X-MCP-Server-Version: 0.1.0`
- `Retry-After: 12` (apenas em 429)

---

## 7. Defesa em Profundidade — 7 Camadas

| Camada | Trava | Responsável |
|---|---|---|
| 1. Catálogo filtrado | `tools/list` só retorna tools cobertas pelas capabilities da `ApiKey`. Tools fora do escopo nem aparecem | Dispatcher / McpServer por sessão (reuso da arquitetura existente "Opção A") |
| 2. Auth na borda | Token inválido/revogado/expirado/sem ApiKey conhecida → 401 antes de qualquer lógica | Auth middleware (novo) |
| 3. Capability check no dispatcher | Tool requer `create:crm`; chave não tem? → 403 antes do handler. **Tools `WriteToolEntry` no modo INTERNO** → 403 `forbidden_via_internal_auth` (independente de capability) | Dispatcher |
| 4. Validação Zod do input | Schema inválido → 400 com detalhes | Dispatcher (já existente para reads; estender p/ writes) |
| 5. Defesa secundária do user Odoo | User Odoo do MCP tem o conjunto de permissões mais amplo necessário. **Guard-rail global** (não diferenciador por chave) — protege contra bug no dispatcher | Odoo |
| 6. Idempotency-Key + lock distribuído | Retry não duplica. Lock `SET NX EX 60 mcp:idem:<apiKeyId>:<key>` previne race. Payload diferente com mesma key → 422 | Idempotency middleware (novo) |
| 7. Audit + rate limit | Toda chamada registrada (`McpAuditLog`). Rate limit sliding window 60s por `apiKeyId`, default 60req, máx 600req → 429 | Audit (estender existente) + Rate limit (estender existente) |

**Materialização da regra "Agente Nex nunca escreve":**
- Modo de auth INTERNO (service token + X-Mcp-User-Id) é a única rota usada pelo Agente Nex.
- Camada 3 rejeita qualquer `WriteToolEntry` chamada via modo interno (`status: denied`, `errorCode: forbidden_via_internal_auth`).
- Camada 1 mantém writes fora do `tools/list` em sessões internas (LLM do Nex nem vê).
- Defesa por **rota de auth**, não por flag de chave. Mais simples e robusto que ter "chave de sistema do Nex" como na v1.

---

## 8. Capabilities — Versionamento e Evolução

### 8.1. Problema

Quando uma ação nova é adicionada (ex: discovery descobre `emit_nfe_complementar`), chaves antigas precisam continuar funcionais sem ganharem permissão automática.

### 8.2. Estratégia

- Cada `ApiKey` armazena `capabilitiesVersion` (default `1`).
- O catálogo do servidor MCP declara, para cada `(module, action)`, um `addedInVersion` (default 1).
- Quando uma chave com `capabilitiesVersion = N` chama uma tool com `addedInVersion = M`:
  - Se `M <= N` e a capability está presente no objeto `capabilities.write[module]` → permite.
  - Se `M > N` (ação nova, chave antiga) → tratada como **não-presente** independente do JSON (defesa por idade).
- Para ganhar acesso a ações novas, super_admin edita a chave no painel: o ato de salvar incrementa `capabilitiesVersion` para a versão atual do catálogo.

### 8.3. Hot reload

- Mudança de capabilities no painel publica em canal Redis pub/sub `mcp:keys:invalidated:<apiKeyId>`.
- Servidor MCP descarta cache em memória da chave afetada.
- **Fallback:** mesmo sem pub/sub funcionando, o middleware faz `lastUsedAt` check com TTL de 60s — se >60s desde último uso, força reload do DB. Cinto e suspensório.

---

## 9. Idempotência e `external_id`

### 9.1. `Idempotency-Key` (header HTTP — obrigatório em todo write)

- Cliente gera UUID por operação.
- **Chave composta `(apiKeyId, key)`** no Redis e no DB — isola por canal.
- **Lock distribuído:** middleware faz `SET NX EX 60 mcp:idem:<apiKeyId>:<key>` ANTES do handler. Se já existia → 409 `idempotency_in_progress`.
- **Canonicalização do payload:** `payloadHash = SHA-256(canonicalJson(input))` onde `canonicalJson` ordena chaves recursivamente (lib `json-stable-stringify` ou impl. própria).
- **Comportamentos:**
  - Retry com mesma `(apiKeyId, key)` + mesmo `payloadHash` → devolve `result` armazenado.
  - Retry com mesma `(apiKeyId, key)` + `payloadHash` diferente → 422 `idempotency_key_conflict`.
  - Header ausente em write → 400 `idempotency_key_required`.
- TTL do registro: 24h. Cleanup job horário deleta `expiresAt < now()`.

### 9.2. `external_id` (parâmetro opcional do payload em creates)

- Identificador externo armazenado em `ir.model.data` do Odoo.
- **NÃO faz upsert.** Se já existe → 409 `external_id_already_exists` com o `existing_id` no payload.
- Para atualizar, cliente chama `<modulo>.<modelo>.update` explicitamente (não há ambiguidade entre create e update).
- Lookup posterior: tool de leitura `<modulo>.<modelo>.get_by_external_id` (não na Onda 0; entra na onda 1).

### 9.3. Storage do `external_id`

- Mecanismo nativo Odoo: `ir.model.data`.
- Naming: `module = "mcp_nexus"`, `name = "mcp_external_<external_id>"`.
- **Pré-requisito PR3** (§2.4) confirma `mcp_nexus` está livre no Odoo Tauga.
- Nunca usa campo custom `x_*` (evita modificar schema do Odoo).

---

## 10. Reversibilidade, Audit e LGPD

### 10.1. Estratégia

- **Não há undo automático.** Odoo limita undo de muitas operações.
- **Toda write grava snapshot before + after** em `McpAuditLog`.
- Reconstrução manual sempre possível a partir do audit log.

### 10.2. Conteúdo do snapshot

Conforme §5.5: lista whitelisted de campos por tool, truncamento >10KB.

### 10.3. Retenção (decisão Onda 0)

- `McpAuditLog`:
  - **0-90 dias:** payload, snapshotBefore, snapshotAfter, result completos.
  - **90 dias-2 anos:** apenas metadados (toolId, status, httpStatus, durationMs, eventName). Campos JSON grandes → NULL.
  - **>2 anos:** linha deletada.
- `McpIdempotencyRecord`: 24h.
- Job de cleanup: BullMQ diário 01:00 BRT.
- Configurável por env: `MCP_AUDIT_DETAIL_RETENTION_DAYS` (default 90), `MCP_AUDIT_FULL_RETENTION_DAYS` (default 730).

### 10.4. LGPD / PII (decisão Onda 0)

- Audit log **não criptografa por padrão** no campo `payload` (DB já tem encryption-at-rest em produção).
- **Mascaramento padrão:** campos com nomes que casem regex `/(cpf|cnpj|password|senha|token|secret)/i` viram `"[REDACTED]"` no `payload` armazenado. Spec MCP de cada tool pode opt-out via `noRedactFields: ["cnpj_cpf"]` quando o uso justifica (ex: criar partner exige enviar CPF — preserva para debug).
- LGPD revisão completa: Onda 4 (Fiscal) ou fase dedicada.

---

## 11. Cache: Sync Direcionado

### 11.1. Fluxo

1. Tool de write conclui com sucesso no Odoo.
2. Middleware pós-handler enfileira job em Redis (BullMQ queue `odoo-sync:directed`).
3. Payload do job: `{ model, ids, operation: "create"|"update"|"delete", snapshotAfter?: object, requestId }`.
4. Worker processa em <2s:
   - **create / update:** usa `snapshotAfter` para popular o cache (sem novo round-trip ao Odoo).
   - **delete:** remove a(s) linha(s) do cache local.
5. Cache fica consistente com o Odoo em <2s pós-write.

### 11.2. Race com cron incremental

- Cron incremental (3min) e sync direcionado podem escrever no mesmo registro.
- **Coordenação:** lock Redis `mcp:sync:<model>:<id>` com `SET NX EX 30` antes de cada UPSERT no cache.
- Quem chegar primeiro escreve; quem chegar depois espera ou desiste se o registro escrito é >=timestamp do que tem em mãos (compare `write_date`).
- Vencedor: timestamp do Odoo (`write_date`).

### 11.3. Falha do sync direcionado

- Worker falha (Odoo offline, network) → job vai para retry exponencial (BullMQ default 3 tries).
- Cache fica temporariamente inconsistente.
- Fallback: cron incremental (3min) pega na próxima rodada.
- Alerta operacional: se retry estourar, grava em `McpAuditLog` com `status = "sync_failed"` (apenas linha de sync — não é uma write nova).

### 11.4. Self-healing (reuso F4 wave 1)

- `src/worker/recovery.ts` trata Odoo offline para cron — estender para sync direcionado.

### 11.5. Cache de delete e fato_*

- `delete` no cache remove da tabela `raw_*`.
- Se houver `fato_*` que referencia a linha removida, política: **manter o fato historicamente** (não delete cascade) marcando flag `deletedAt`. Decisão por modelo na onda do módulo correspondente. Onda 0 só faz delete no `raw_*` da POC (`raw_res_partner` se existir; senão N/A).

---

## 12. Erros do Odoo — Classificação e Mapeamento

| Erro Odoo (JSON-RPC fault) | HTTP Status | `error.code` | Quando |
|---|---|---|---|
| `AccessError` | 403 | `odoo_access_denied` | User Odoo não tem permissão no modelo |
| `ValidationError` | 422 | `odoo_validation_failed` | Constraint Odoo violada (required, format) |
| `UserError` | 422 | `odoo_business_rule` | Regra de negócio Odoo (ex: "não pode confirmar pedido sem cliente") |
| `MissingError` | 404 | `odoo_record_not_found` | Registro `id` não existe |
| `IntegrityError` (DB) | 422 | `odoo_integrity_violation` | Constraint Postgres do Odoo (unique, FK) |
| `NotImplementedError` | 422 | `odoo_method_not_implemented` | Método não existe ou não aplicável |
| `psycopg2.PoolError` | 502 | `odoo_pool_exhausted` | Pool de conexões Odoo cheio |
| Timeout / connection refused | 502 | `odoo_unavailable` | Tauga offline ou rede |
| 500 do Odoo | 500 | `odoo_internal_error` | Exceção não tratada do Odoo |

**Idioma da mensagem:** Odoo Tauga (l10n_br) retorna mensagens em **pt-BR**. Cliente recebe `error.message` cru (preserva idioma original) + `error.code` (snake_case ASCII, invariante). Cliente que precisar lógica usa `code`; cliente que mostra ao usuário final usa `message`.

---

## 13. Concurrency e Optimistic Locking

### 13.1. Estratégia

- Tools de `update` e `transition` aceitam header opcional `If-Unmodified-Since: <ISO8601>`.
- Se enviado: handler lê `write_date` do registro **antes** de chamar `write`. Se for posterior ao `If-Unmodified-Since` → 412 `precondition_failed` com o `write_date` atual no payload.
- Cliente recebe 412 → relê e tenta de novo com novo `If-Unmodified-Since`.
- Sem o header: comportamento "last write wins" (default Odoo).
- Tools sensíveis (fiscal/contábil) **devem documentar** recomendação de uso do header.

---

## 14. Rate Limit

- **Por `apiKeyId`**, sliding window 60s.
- Default: 60 req/min. Configurável por chave no painel até 600 req/min.
- Backend Redis: `mcp:ratelimit:<apiKeyId>:<bucket_60s>` (incremento + TTL 60s).
- Headers de resposta sempre presentes:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
- Excedido → 429 `rate_limited` + `Retry-After` (segundos até próximo bucket).
- Read e write contam no mesmo bucket (simplicidade na Onda 0; reavaliar se houver desequilíbrio real).

---

## 15. Painel `Integrações → Servidor MCP`

> UI obrigatoriamente desenhada com a skill `ui-ux-pro-max` (regra `CLAUDE.md` §6 [2]).

### 15.1. Estrutura de telas

```
Integrações
├── Canais                       (mantido)
├── Servidor MCP                 ← NOVO (renomeação + expansão)
│   ├── Visão geral              (tab default)
│   ├── Chaves de Acesso         (lista + criar/editar/revogar)
│   ├── Logs / Audit             (timeline de chamadas)
│   └── Documentação             (interativa, auto-gerada + MDX)
├── Webhooks                     (mantido)
├── API REST                     ← renomeado de "APIs", tag "Em breve" (não-clicável)
└── BI                           (tag "Em breve" — mantém)

Agente Nex
├── Configurações                (mantido)
├── Histórico / Playground       (mantido)
└── Plugar MCPs                  ← NOVO (vem de Integrações → MCP)
```

### 15.2. Tab "Visão geral"

- **URL pública do MCP:** `https://app.nexus-odoo/api/mcp` (copy-to-clipboard).
- **Status:** ● Ativo (verde) / ● Degradado (amarelo) / ● Offline (vermelho) — alimentado pelo endpoint `/api/mcp/health` (§3).
- **Transport:** Streamable HTTP (badge informativo).
- **Versão do protocolo MCP:** `2025-06-18` (badge informativo).
- **Versão do servidor:** semver + commit hash curto (pego de `process.env.GIT_COMMIT_SHA` ou `package.json`).
- **Métricas (últimas 24h, agregadas de `McpAuditLog`):** total de chamadas, % de erro, p50/p99 latência, top 5 tools chamadas, top 5 chaves ativas.

### 15.3. Tab "Chaves de Acesso"

- **Lista:** label, last4 (`...AbCd`), capabilities resumo ("CRM R/W + Vendas R"), última utilização, status (ativo/expirado/revogado), criada por, criada em.
- **Botão "+ Nova chave":**
  1. Label obrigatório, descrição opcional.
  2. Tenant alvo (se multi-tenant) — default tenant do super_admin logado.
  3. **Matriz de permissões** — para cada módulo: checkbox para leitura, checkboxes para 4 ações canônicas + ações sensíveis específicas. Visual: ações sensíveis destacadas (cor amarela/vermelha).
  4. Rate limit (slider 1-600/min, default 60).
  5. Expiração opcional (data ou "Nunca").
  6. **Confirmação dupla para ações sensíveis** — checkbox separado "Confirmo conhecer os impactos de habilitar `emit_nfe`, `post_journal`, etc nesta chave".
  7. Gera token → **mostra uma única vez** num modal grande com cópia + botão "Marquei e copiei". Sem segunda chance — se cliente fechar sem copiar, ele revoga e cria nova.
- **Editar chave:** mesma matriz; mudança publica no Redis pub/sub para hot reload. Pode alterar capabilities, rate limit, expiração, label, descrição. **Não** pode alterar token (precisa rotacionar).
- **Rotacionar chave:** gera novo token, marca antigo como revogado em **24h** (grace period configurável). Painel mostra timer "antigo será desativado em Xh".
- **Revogar chave:** confirma com motivo (string obrigatória), marca `revokedAt` + `revokedReason`; bloqueio imediato.
- **Marcar perdida:** se cliente fechou modal sem copiar token, botão "Marcar como perdida e regenerar" — revoga atual (`revokedReason = "token_lost_in_creation"`) e cria nova herdando todas as configurações.

### 15.4. Tab "Logs / Audit"

- Timeline reversa, paginação infinita.
- Filtros: chave, tool, módulo, ação, status, faixa de data, busca por idempotency_key ou request_id.
- Linha: Timestamp · Chave (last4) · Tool · Status (badge colorido) · Duração · Capability checada.
- Clique abre painel lateral com payload, snapshotBefore, snapshotAfter, error code + message completos.
- Export CSV (filtros aplicados) para investigações.

### 15.5. Tab "Documentação"

**Auto-gerada do catálogo de tools + supplements em MDX manuscritos.**

Estrutura:
- **Quickstart** (MDX manuscrito — 3 passos: criar chave, exemplo curl com Idempotency-Key, ver no log).
- **Autenticação** (MDX manuscrito — Bearer token, gerar Idempotency-Key, headers obrigatórios/opcionais).
- **Catálogo:**
  - **Como ler** — auto-gerado a partir do `ToolEntry` (descricao + inputSchema + outputSchema + exemplos opcionais por tool). Renderiza por módulo, com tabs por linguagem (curl, n8n, Python, JavaScript).
  - **Como escrever** — auto-gerado a partir do `WriteToolEntry`, mesmo formato, com badge visual em tools `sensitive: true`.
- **Permissões** (MDX — explica matriz, ações canônicas, ações sensíveis).
- **Idempotência** (MDX — como gerar key, comportamento de retry, TTL, lock).
- **External ID** (MDX — como usar, comportamento em conflito, lookup futuro).
- **Erros** (auto-gerado a partir da tabela §12 + erros próprios da camada MCP — `capability_missing`, `idempotency_*`, `rate_limited`).
- **Rate limits** (MDX).
- **Changelog do servidor MCP** (MDX append-only por release).

**Renderização:** componente React. Syntax highlighting via Shiki (já comum no ecossistema). Tabs por linguagem com copy-to-clipboard. Anchors permalinkáveis (`#crm.res_partner.create`). Busca interna por nome de tool/erro.

### 15.6. Acesso

- **Apenas `super_admin`** vê o submenu Servidor MCP (decisão Onda 0).
- Demanda futura para admin de tenant ver suas próprias chaves → ondas seguintes.

---

## 16. Reorganização do Menu (entregue na Onda 0)

### 16.1. Movimentação

- **`Integrações → MCP`** (atual; configura MCPs externos para Nex consumir como cliente) → renomear submenu e mover para **`Agente Nex → Plugar MCPs`**.
- **`Integrações → APIs`** → renomear para **`Integrações → API REST`**, aplicar tag "Em breve" estilo BI (não-clicável até existir API REST nossa).
- **`Integrações → Servidor MCP`** → criar novo card conforme §15.

### 16.2. Migração de dados de `ApiKey`

- Schema atualizado conforme §4.1 (campos novos adicionados, `scopes` preservado como deprecated).
- Toda `ApiKey` existente recebe `capabilities = { version: 1, read: [], write: {} }` e `isSystemKey = true` na migration.
- Painel mostra aviso "Chave herdada — reconfigure capabilities". Super_admin precisa editar e marcar `isSystemKey = false` + capabilities corretas antes de uso novo. Sem auto-upgrade silencioso.

### 16.3. Aprovação explícita da reorganização

A reorganização foi aprovada pelo usuário no brainstorm de 2026-05-20 (esta sessão, respostas às perguntas 8 e seguinte). O card "MCP" atual (configurar MCPs externos) é movido — não reescrito. O conteúdo é o mesmo, apenas no novo local conceitualmente correto (Agente Nex como cliente de MCPs).

---

## 17. Discovery — Estratégia

### 17.1. Reuso e extensão

- `discovery/` (Python) já mapeou modelos + campos para leitura (F0).
- Esta onda **estende** com descoberta de:
  - **Métodos públicos por modelo** via introspecção do Odoo (`ir.model.access`, `ir.model.fields`, inspeção via `execute_kw`).
  - **Workflow stages** (`crm.stage`, `sale.order.state`, etc).
  - **Constraints e required fields** (refinar `fields_get`).
  - **Heurística de ações sensíveis:** métodos cujo nome bate em `/^action_/`, `/^_post$/`, `/_confirm$/`, `/_cancel$/`, `/_validate$/`, `/_reconcile$/`.

### 17.2. Output

- `discovery/output/write_paths/<modulo>.json` — modelos + ações descobertas + parâmetros + sensitive flag.
- Consumido na geração de tools (template-driven nas ondas 1-7).

### 17.3. Execução

- Roda manualmente uma vez por módulo no início da onda correspondente.
- Não-automatizado em CI (Tauga pode ter rate limit; rodadas raras).
- **Re-discovery periódico** (semestral) para pegar mudanças do Odoo Tauga (em fase futura).

### 17.4. Limites conhecidos

- Heurística não pega 100% — métodos com nomes não-padrão (`do_validate`, `process_picking`, `_check_and_post`) escapam. Vão sendo adicionados manualmente quando descobertos.

---

## 18. Ondas de Implementação

> Cada onda = spec própria (ou subseção desta) → plan → execução → testes E2E reais na base de teste → code review (`/gsd-code-review`) + UI review (`/gsd-ui-review` se UI) → merge → próxima.

### Onda 0 — Fundação (esta spec foca aqui)

**Entregáveis (de §2.1):**
- Schema Prisma estendido (`ApiKey` + `McpAuditLog` + `McpIdempotencyRecord`) com migration.
- Middleware HTTP completo (auth externo, idempotency, capability, rate limit).
- Tool dispatcher estendido com filtro de catálogo por capability e modo de auth.
- Sync direcionado worker.
- Painel `Integrações → Servidor MCP` (4 tabs).
- Endpoint `/api/mcp/health`.
- Reorganização do menu (Plugar MCPs → Nex; API REST com "Em breve").
- 1 read tool (`crm.res_partner.get`) + 1 write tool (`crm.res_partner.create`) com testes E2E completos.
- Atualização do CLAUDE.md (decisão canônica #2 revisada).

**Fronteira Onda 0 vs Onda 1:**
- Onda 0 entrega `crm.res_partner.get` + `crm.res_partner.create` **como POC**.
- Onda 1 expande para `crm.res_partner.update`, `delete`, `transition` e todos os outros modelos do CRM (lead, team, stage, tag, lost.reason).

### Onda 1 — CRM completo

`res.partner` (update/delete/transition), `crm.lead`, `crm.team`, `crm.stage`, `crm.tag`, `crm.lost.reason` — todas as ações canônicas + ações sensíveis descobertas.

### Onda 2 — Vendas + Estoque

- Vendas: `sale.order`, `sale.order.line`, `sale.report` (read).
- Estoque: `stock.picking`, `stock.move`, `stock.quant`, `stock.location`, `stock.warehouse`.
- Ações sensíveis: `confirm_order`, `validate_picking`, `apply_inventory`.

### Onda 3 — Financeiro

- `account.payment`, `account.move.line`, `account.journal`.
- **`account.move`:** apenas tools que **enxergam** `account.move` mas operam em **campos financeiros** (linhas, conciliação, pagamento).
- Compras: `purchase.order`, `purchase.order.line`.
- Ações sensíveis: `reconcile`, `pay`, `confirm_purchase`, `receive`.

### Onda 4 — Fiscal

- Módulos OCA brasileiros: `l10n_br_fiscal.document`, `l10n_br_fiscal.document.line`, etc.
- Ações sensíveis: `emit_nfe`, `cancel_nfe`, `inutilize_nfe`.
- **Revisão LGPD completa** entra aqui.

### Onda 5 — Contábil

- `account.move` (post/unpost — separado das tools de Financeiro), `account.period`, plano de contas.
- Ações sensíveis: `post_journal`, `unpost_journal`, `close_period`.
- **`account.move`:** apenas transições contábeis (post/unpost); leitura e mutação de linhas vivem na Onda 3.

### Onda 6 — Produção + RH + Projeto

- `mrp.production`, `mrp.bom`, `mrp.workorder`.
- `hr.employee`, `hr.payslip`, `hr.contract`.
- `project.project`, `project.task`.

### Onda 7 — Restantes

- Frota (`fleet.*`), manutenção (`maintenance.*`), demais módulos ativos no Odoo Tauga descobertos.

### Critério de transição entre ondas

- Todos os testes E2E da onda passam contra `grupojht.teste.tauga.online`.
- `/gsd-code-review` e `/gsd-ui-review` (se houver UI) executados, achados endereçados.
- Audit log inspecionado: nenhuma write deixou registro `error` não classificado.
- Documentação interativa atualizada com as novas tools (auto-gerada + MDX revisados).
- Merge da branch em `main`.
- Update do `STATUS.md` apontando próxima onda.

---

## 19. Estratégia de Testes E2E

### 19.1. Ambiente

- Base: `grupojht.teste.tauga.online` (env `ODOO_WRITE_URL` em `.env.test`).
- User Odoo dedicado: confirmado pela Tauga (PR1).
- Testes rodam isolados — não em CI público até validação manual.

### 19.2. Prefixo de teste + cleanup

- Todo registro criado em testes começa com `[MCP-TEST]` no campo `name` (ou equivalente do modelo).
- Cleanup automático em `afterAll` da suite:
  - Busca tudo com prefixo `[MCP-TEST]` no modelo testado.
  - `unlink` em massa.
  - **Cascade:** se a tool afeta outros modelos (criar partner também cria contact?), cleanup em cascata por `affectsModels` do `WriteToolEntry`.
- Falha de cleanup → testa subsequente recebe estado sujo → marca como warning; runbook humano de cleanup manual.

### 19.3. Cobertura mínima por write tool

- **Caminho feliz**: cria/atualiza/deleta com input válido → assert no Odoo direto via JSON-RPC + assert no cache local pós-sync.
- **Capability check**: chave sem capability → 403 + audit `denied`.
- **Modo auth interno tenta write**: 403 `forbidden_via_internal_auth` + audit `denied`.
- **Validação Zod**: input inválido → 400 com detalhes do campo.
- **Idempotency-Key ausente**: 400 `idempotency_key_required`.
- **Idempotency-Key repetida (mesmo payload canonical)**: devolve cache sem reexecutar; conta como 1 chamada no rate limit.
- **Idempotency-Key repetida (payload diferente)**: 422 `idempotency_key_conflict`.
- **Burst com mesma Idempotency-Key**: lock funciona, só 1 executa, outros recebem 409 `idempotency_in_progress`.
- **External_id duplicado**: 409 `external_id_already_exists`.
- **Optimistic locking**: write_date inválido → 412 `precondition_failed`.
- **Chave revogada durante chamada**: corrida entre revogação e execução — o que acontece? Test cobre.
- **Rate limit**: 61 chamadas em 60s → 61ª recebe 429.
- **Erros do Odoo** (mocked): handler simula AccessError, ValidationError, UserError, MissingError, IntegrityError, timeout → status correto + errorCode correto.
- **Tauga offline durante write**: 502 `odoo_unavailable` + audit registra.
- **Sync direcionado**: cache local reflete em <2s pós-write; valida via SELECT no Postgres.
- **Sync direcionado falha + retry**: simula erro, valida retry, valida consistência final.

### 19.4. Frequência

- Local antes do PR.
- CI: roda inteiro em cada PR contra branch da feature.
- Não roda contra produção. Não em loop autônomo.

---

## 20. Riscos e Mitigações

| Risco | Probab. | Impacto | Mitigação |
|---|---|---|---|
| Cliente esquece Idempotency-Key | Média | Alto | Header obrigatório (400 sem); doc destaca; exemplos em todas as linguagens |
| Burst com mesma key sem lock | Alta | Alto | Lock distribuído Redis `SET NX EX 60` (§9.1) |
| `JSON.stringify` não-determinístico vira false positive de "payload diferente" | Alta | Alto | Canonicalização via `json-stable-stringify` (§9.1) |
| Capability mal configurada | Baixa | Alto | Hot reload + audit log + confirmação dupla para sensíveis no painel |
| Odoo retorna erro genérico (UserError sem código) | Alta | Médio | Preservar message cru + nosso errorCode próprio (§12) |
| Sync direcionado falha e cache fica stale | Baixa | Médio | Retry exponencial + fallback ao cron incremental + alerta |
| Modelo Odoo customizado não documentado | Alta | Médio | Discovery itera; testes E2E pegam; tools desconhecidas ficam fora do catálogo |
| Operação sensível executada por engano | Média | Crítico | Confirmação dupla no painel ao habilitar capability; audit alerta toda execução de `sensitive: true` |
| Token vazado em log/git | Média | Crítico | Token só uma vez (modal); hash SHA-256 no banco; rotacionar fácil; `last4` permite identificar |
| Chave do Nex (não existe — modo interno) confundida com chave externa | N/A | N/A | Defesa por **rota de auth**, não por flag — não há chave do Nex (modo interno usa service token) |
| Multi-tenant cross-leakage | Baixa | Crítico | `tenantId` em ApiKey + middleware valida tenant no path + tools usam `ctx.tenantId` |
| Race entre sync direcionado e cron incremental | Média | Médio | Lock Redis `mcp:sync:<model>:<id>` (§11.2) |
| Servidor MCP cai e n8n acumula retries | Média | Médio | Endpoint `/api/mcp/health` permite n8n detectar; documentar circuit breaker recomendado |
| `mcp_nexus` colide com módulo existente do Odoo Tauga | Baixa | Médio | PR3 (§2.4) confirma antes da implementação |
| User Odoo da Tauga tem permissão limitada (não cobre todos os módulos) | Média | Médio | Catálogo ajustado: tools cujas writes o user não pode executar ficam fora; documentado |
| Cutover teste→produção feito sem validação | Baixa | Crítico | Cutover requer aprovação humana explícita (§3.3); `ODOO_WRITE_URL` reversível |

---

## 21. Critérios de Aceitação

### 21.1. Onda 0 (fundação)

Amarrados aos cenários de §19.3.

- [ ] Pré-requisitos externos PR1, PR2, PR3 cumpridos (PR4 já feito).
- [ ] Migration Prisma rodada; tabelas/campos novos existem; `ApiKey` existente continua funcional.
- [ ] Endpoint `POST /api/mcp` aceita Bearer externo (ApiKey); preserva modo interno em `/api/mcp/internal` (ou via header `MCP_SERVICE_TOKEN`).
- [ ] Endpoint `GET /api/mcp/health` retorna JSON com checks Postgres/Redis/Odoo + queue depth.
- [ ] Chamada sem token → 401; com token inválido → 401; com token revogado → 401.
- [ ] Chamada write modo interno → 403 `forbidden_via_internal_auth`.
- [ ] Chamada write modo externo sem Idempotency-Key → 400.
- [ ] Lock distribuído Redis previne burst com mesma key.
- [ ] Canonicalização do payload via `json-stable-stringify` (ou impl. própria testada).
- [ ] Catálogo `tools/list` filtra por capabilities da chave.
- [ ] Capability missing → 403 + audit `denied`.
- [ ] Tool POC `crm.res_partner.get` retorna dados do cache (modo interno e externo OK).
- [ ] Tool POC `crm.res_partner.create` cria registro no Odoo de teste; snapshot before/after em audit log; sync direcionado atualiza cache em <2s.
- [ ] Painel `Integrações → Servidor MCP` renderiza 4 tabs (Visão geral, Chaves, Logs, Documentação base).
- [ ] CRUD de chaves no painel funciona: criar, editar, rotacionar, revogar, marcar perdida.
- [ ] Reorganização de menu concluída (Plugar MCPs no Nex; API REST com "Em breve" — não clicável).
- [ ] Documentação interativa renderiza catálogo (auto-gerado das 2 tools POC) + MDX Quickstart/Auth.
- [ ] Todos os 15 cenários de teste E2E de §19.3 passam contra base de teste.
- [ ] `/gsd-code-review` aplicado e achados resolvidos.
- [ ] `/gsd-ui-review` aplicado no painel e achados resolvidos.
- [ ] `CLAUDE.md` §5 #2 atualizado com o texto novo (§3.2).
- [ ] `STATUS.md` aponta para Onda 1 como próxima.

### 21.2. Ondas 1-7

- [ ] Discovery do módulo executado e output em `discovery/output/write_paths/`.
- [ ] Todas as tools (canônicas + sensíveis descobertas) implementadas.
- [ ] Schemas Zod completos e documentados.
- [ ] Testes E2E cobrem todos os cenários de §19.3.
- [ ] Documentação interativa atualizada (auto + MDX se necessário).
- [ ] Code review + UI review aprovados.
- [ ] Audit log limpo (sem erros não classificados em fase de validação).
- [ ] Merge em `main` sem regressão.

---

## 22. Decisões em Aberto (TBD reduzidos)

- **Cobrança/observability** por chave/módulo: métricas já estão no audit; expor é tema futuro pós-Onda 3.
- **Re-discovery automático periódico:** semestral; mecanismo definido pós-Onda 1.
- **Cliente MCP para o painel (testar tools no navegador):** UX nice-to-have; pós-Onda 0.

(TBDs originais resolvidos na v2: PII/LGPD política Onda 0 §10.4; Acesso super_admin only §15.6; Retenção audit log §10.3; Webhook events `eventName` reservado §4.2.)

---

## 23. Próximos Passos

1. Review crítica #2 desta v2 → produzir v3 (`docs/superpowers/specs/reviews/2026-05-20-f4-onda2-mcp-escrita-review-2.md`).
2. `superpowers:writing-plans` v1 → review #1 → v2 → review #2 → v3 do plano da Onda 0 (`docs/superpowers/plans/2026-05-20-f4-onda2-onda0-fundacao.md`).
3. Execução em modo autônomo via `superpowers:subagent-driven-development` (Sonnet executa task, Opus revisa entre blocos).
4. UI obrigatoriamente desenhada via `ui-ux-pro-max`.
5. Testes E2E contra `grupojht.teste.tauga.online`.
6. `/gsd-code-review` + `/gsd-ui-review` no fim da Onda 0.
7. Merge → CLAUDE.md atualizado → Onda 1 (CRM completo).

---

## 24. Versão do Protocolo MCP

- **Alvo:** `2025-06-18` (última estável conhecida em 2026-05).
- **Referência oficial:** https://modelcontextprotocol.io/specification (consultar antes de cada onda para confirmar versão atual).
- **SDK:** `@modelcontextprotocol/sdk@^1.29.0` (instalado).
- **Transport:** `StreamableHTTPServerTransport` (já em uso).
- **Header de versão na resposta:** `X-MCP-Server-Version: 0.1.0` + meta `protocol_version: "2025-06-18"`.
- **Breaking changes** do protocolo em versões futuras → migração documentada no changelog do painel.

---

## 25. Health Check — Endpoint `/api/mcp/health`

**Método:** GET (sem autenticação).

**Resposta padrão:**
```json
{
  "status": "healthy",
  "checks": {
    "postgres": "ok",
    "redis": "ok",
    "odoo_read": "ok",
    "odoo_write": "ok",
    "worker_queue_depth": 12,
    "sync_directed_lag_ms": 850
  },
  "version": "0.1.0",
  "commit": "abc1234",
  "protocol_version": "2025-06-18",
  "timestamp": "2026-05-20T15:30:00Z"
}
```

**Mapeamento status:**
- `healthy`: todos os checks `ok`.
- `degraded`: 1+ checks falham mas servidor MCP responde a tools.
- `unhealthy`: Postgres ou Redis caem.

Consumido por: painel "Visão geral" (§15.2), monitoração externa (uptime check).

---

## Anexo A — Mapeamento Rápido `<acao>:<modulo>` → Método Odoo

| Capability | Método Odoo subjacente | Tools exemplo |
|---|---|---|
| `create:crm` | `model.create(vals)` | `crm.res_partner.create`, `crm.crm_lead.create` |
| `update:crm` | `model.write(ids, vals)` | `crm.res_partner.update`, `crm.crm_lead.update` |
| `delete:crm` | `model.unlink(ids)` | `crm.res_partner.delete` |
| `transition:crm` | `crm.lead.action_set_won()` ou write em `stage_id` | `crm.crm_lead.transition` |
| `create:vendas` | `sale.order.create(vals)` + `sale.order.line.create(vals)` | `vendas.sale_order.create` |
| `confirm_order:vendas` (sensível) | `sale.order.action_confirm()` | `vendas.sale_order.confirm_order` |
| `validate_picking:estoque` (sensível) | `stock.picking.button_validate()` | `estoque.stock_picking.validate_picking` |
| `reconcile:financeiro` (sensível) | `account.move.line.reconcile()` | `financeiro.account_payment.reconcile` |
| `post_journal:contabil` (sensível) | `account.move.action_post()` | `contabil.account_move.post_journal` |
| `emit_nfe:fiscal` (sensível) | `l10n_br_fiscal.document.action_document_send()` | `fiscal.l10n_br_fiscal_document.emit_nfe` |

Discovery confirma e amplia esta tabela por módulo na onda correspondente.

---

## Anexo B — Variáveis de Ambiente Novas (Onda 0)

```bash
# Odoo escrita (separado da leitura para suportar cutover teste→produção)
ODOO_WRITE_URL=https://grupojht.teste.tauga.online
ODOO_WRITE_DB=grupojht_teste
ODOO_WRITE_USER=api_test            # confirmado pela Tauga (PR1)
ODOO_WRITE_PASSWORD=<from-vault>

# Cleanup automático de audit/idempotency
MCP_AUDIT_DETAIL_RETENTION_DAYS=90
MCP_AUDIT_FULL_RETENTION_DAYS=730
MCP_IDEMPOTENCY_TTL_HOURS=24

# Auth externo
MCP_TOKEN_PREFIX=mcp_live_           # prefixo dos tokens emitidos
MCP_TOKEN_ENTROPY_BYTES=32           # = 256 bits

# Operacional
MCP_EXTERNAL_RATE_LIMIT_DEFAULT=60   # req/min default
MCP_EXTERNAL_RATE_LIMIT_MAX=600      # req/min máximo configurável

# Modo interno (já existente — preservado)
# MCP_SERVICE_TOKEN=<existing>
```

---

## Anexo C — Lista de Erros Padronizados (errorCode)

| Code | HTTP | Origem | Significado |
|---|---|---|---|
| `unauthorized` | 401 | Auth middleware | Token ausente, inválido, revogado ou expirado |
| `forbidden_via_internal_auth` | 403 | Dispatcher | Tentativa de write via modo interno |
| `capability_missing` | 403 | Dispatcher | Chave sem capability para a tool |
| `validation_failed` | 400 | Dispatcher | Input não passa no Zod |
| `idempotency_key_required` | 400 | Idempotency MW | Header ausente em write |
| `idempotency_key_conflict` | 422 | Idempotency MW | Mesma key, payload diferente |
| `idempotency_in_progress` | 409 | Idempotency MW | Lock ativo para a mesma key |
| `external_id_already_exists` | 409 | Handler | External_id duplicado em create |
| `precondition_failed` | 412 | Handler | `If-Unmodified-Since` violado |
| `rate_limited` | 429 | Rate limit MW | Limite por chave excedido |
| `odoo_access_denied` | 403 | Handler/Odoo | User Odoo não tem permissão no modelo |
| `odoo_validation_failed` | 422 | Handler/Odoo | Constraint Odoo violada |
| `odoo_business_rule` | 422 | Handler/Odoo | UserError do Odoo |
| `odoo_record_not_found` | 404 | Handler/Odoo | MissingError do Odoo |
| `odoo_integrity_violation` | 422 | Handler/Odoo | IntegrityError do Odoo |
| `odoo_method_not_implemented` | 422 | Handler/Odoo | Método não existe |
| `odoo_pool_exhausted` | 502 | Handler/Odoo | Pool de conexões Odoo cheio |
| `odoo_unavailable` | 502 | Handler/Odoo | Tauga offline / timeout |
| `odoo_internal_error` | 500 | Handler/Odoo | Exceção não tratada do Odoo |
| `internal_error` | 500 | Servidor | Bug nosso (sempre alerta) |
| `sync_failed` | N/A | Worker (não-resposta) | Sync direcionado falhou após retries |

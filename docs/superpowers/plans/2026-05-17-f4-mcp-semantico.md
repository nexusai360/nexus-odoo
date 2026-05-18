# F4 — MCP Semântico — Implementation Plan (v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o servidor MCP semântico do nexus-odoo (onda 1: estoque + financeiro) — tools de vocabulário de negócio sobre o cache Postgres, RBAC estrutural, Caminho 3, contrato de identidade.

**Architecture:** Container `mcp/` Node puro com `@modelcontextprotocol/sdk` (Streamable HTTP sobre `node:http`); camada de fatos de financeiro construída por builders no worker via um registry; tools declarativas que reusam um núcleo de query compartilhado com o dashboard da F3.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Prisma 7 (`@prisma/adapter-pg`), Postgres, Redis (`ioredis`), Zod, Jest, `tsx`.

**Spec base:** `docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md` (v3).

---

## Estrutura de arquivos

**Criar:**
- `mcp/index.ts` — entrypoint do servidor MCP (Node puro).
- `mcp/server.ts` — montagem do `McpServer` + `StreamableHTTPServerTransport` sobre `node:http`.
- `mcp/auth/service-token.ts` — validação constant-time do service token.
- `mcp/auth/user-context.ts` — resolução e recarga do `UserContext`.
- `mcp/auth/session-store.ts` — associação `sessionId` → `UserContext`.
- `mcp/catalog/types.ts` — tipos do catálogo de tools (`ToolEntry`).
- `mcp/catalog/registry.ts` — registry: monta tools MCP a partir do catálogo, filtra por RBAC.
- `mcp/catalog/index.ts` — agrega os catálogos de domínio.
- `mcp/tools/estoque/*.ts` — 6 handlers de tool de estoque.
- `mcp/tools/financeiro/*.ts` — 6 handlers de tool de financeiro.
- `mcp/tools/caminho3/registrar-lacuna.ts`, `mcp/tools/caminho3/bi-consulta-avancada.ts`.
- `mcp/lib/audit.ts` — gravação em `McpAuditLog`.
- `mcp/lib/rate-limit.ts` — rate limiter do MCP (Redis).
- `mcp/lib/freshness.ts` — leitura de `FatoBuildState` + `SyncState` (estado de fonte).
- `mcp/lib/failure.ts` — helper de comportamento sob falha (3.9 da spec).
- `mcp/lib/prisma.ts` — `PrismaClient` com `DATABASE_URL` do role `nexus_mcp`.
- `mcp/tsconfig.json`, `mcp/Dockerfile`.
- `src/lib/reports/queries/estoque.ts` — núcleo de query de estoque (neutro).
- `src/worker/fatos/registry.ts` — registry de builders.
- `src/worker/fatos/fato-financeiro-saldo.ts`, `fato-financeiro-movimento.ts`, `fato-financeiro-titulo.ts`.
- `prisma/sql/2026-05-17-mcp-role.sql` — provisionamento do role `nexus_mcp`.
- `mcp/__tests__/harness.ts` — cliente de teste de integração Streamable HTTP.
- Testes `*.test.ts` ao lado de cada módulo testável.

**Modificar:**
- `prisma/schema.prisma` — 5 modelos novos.
- `src/worker/sync/processors.ts` — substituir os 3 `await import` hard-coded pela iteração do registry.
- `src/lib/actions/report-data.ts` — funções `getRelatorio*` viram wrappers do núcleo.
- `src/lib/actions/report-data.test.ts` — revisar para o novo split.
- `package.json` — dep `@modelcontextprotocol/sdk`, script `mcp`.
- `docker-compose.yml` / Portainer — serviço `mcp`.
- `STATUS.md`, `docs/fatos-modelagem.md`, `CLAUDE.md` (checklist de fatos).

---

## ONDA 4a — Fundação do servidor MCP

### Task 4a.0: Verificação de viabilidade do SDK

**Files:**
- Modify: `package.json`
- Create: `mcp/SDK-NOTES.md`

- [ ] **Step 1:** `npm install @modelcontextprotocol/sdk` e confirmar a versão instalada.
- [ ] **Step 2:** Ler a API do `StreamableHTTPServerTransport` na versão instalada (`node_modules/@modelcontextprotocol/sdk/dist/`). Confirmar: (a) é possível montar o transport sobre um `http.Server` próprio e interceptar o request HTTP **antes** de entregar o corpo ao transport (middleware de pré-auth); (b) é possível associar dados de sessão (`UserContext`) acessíveis dentro do handler de tool — via `sessionId` do transport ou `AsyncLocalStorage`.
- [ ] **Step 3:** Registrar os achados em `mcp/SDK-NOTES.md`: versão, assinatura do transport, mecanismo escolhido para pré-auth e para `UserContext` de sessão. **Se a API divergir do desenho da spec 3.3.1**, documentar o ajuste aqui — as tasks seguintes seguem este documento.
- [ ] **Step 4: Commit** — `git commit -m "chore(f4): adiciona @modelcontextprotocol/sdk e nota de viabilidade"`

### Task 4a.1: Schema Prisma — modelos de fato e logs

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/.../migration.sql` (via `prisma migrate dev`)

- [ ] **Step 1:** Adicionar ao `schema.prisma` os 5 modelos abaixo (snake_case via `@@map`, padrão dos demais):

```prisma
model FatoFinanceiroSaldo {
  bancoId        Int      @id @map("banco_id")
  bancoNome      String?  @map("banco_nome")
  tipo           String?
  dataReferencia DateTime? @map("data_referencia")
  saldoAnterior  Float    @default(0) @map("saldo_anterior")
  entrada        Float    @default(0)
  saida          Float    @default(0)
  saldo          Float    @default(0)
  atualizadoEm   DateTime @map("atualizado_em")
  @@map("fato_financeiro_saldo")
}

model FatoFinanceiroMovimento {
  odooId              Int      @id @map("odoo_id")
  data                DateTime?
  contaId             Int?     @map("conta_id")
  contaNome           String?  @map("conta_nome")
  centroResultadoId   Int?     @map("centro_resultado_id")
  centroResultadoNome String?  @map("centro_resultado_nome")
  entrada             Float    @default(0)
  saida               Float    @default(0)
  valor               Float    @default(0)
  entradaPrevista     Float    @default(0) @map("entrada_prevista")
  saidaPrevista       Float    @default(0) @map("saida_prevista")
  valorPrevisto       Float    @default(0) @map("valor_previsto")
  atualizadoEm        DateTime @map("atualizado_em")
  @@index([data])
  @@map("fato_financeiro_movimento")
}

model FatoFinanceiroTitulo {
  odooId           Int      @id @map("odoo_id")
  tipo             String
  participanteId   Int?     @map("participante_id")
  participanteNome String?  @map("participante_nome")
  contaId          Int?     @map("conta_id")
  contaNome        String?  @map("conta_nome")
  numeroDocumento  String?  @map("numero_documento")
  dataDocumento    DateTime? @map("data_documento")
  dataVencimento   DateTime? @map("data_vencimento")
  dataPagamento    DateTime? @map("data_pagamento")
  situacao         String?
  situacaoSimples  String?  @map("situacao_simples")
  vrDocumento      Float    @default(0) @map("vr_documento")
  vrSaldo          Float    @default(0) @map("vr_saldo")
  vrTotal          Float    @default(0) @map("vr_total")
  vrJuros          Float    @default(0) @map("vr_juros")
  vrMulta          Float    @default(0) @map("vr_multa")
  vrDesconto       Float    @default(0) @map("vr_desconto")
  atualizadoEm     DateTime @map("atualizado_em")
  @@index([dataVencimento])
  @@index([tipo])
  @@map("fato_financeiro_titulo")
}

model McpAuditLog {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  tool       String
  params     Json
  outcome    String
  rowCount   Int?     @map("row_count")
  durationMs Int?     @map("duration_ms")
  criadoEm   DateTime @default(now()) @map("criado_em")
  @@index([userId, criadoEm])
  @@map("mcp_audit_log")
}

model FeatureRequest {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")
  perguntaResumo String  @map("pergunta_resumo")
  dominio       String?
  criadoEm      DateTime @default(now()) @map("criado_em")
  @@map("feature_requests")
}
```

- [ ] **Step 2:** Rodar `npx prisma migrate dev --name f4-mcp-fatos-logs`. Expected: migration criada, `prisma generate` roda.
- [ ] **Step 3:** Rodar `npx tsc --noEmit`. Expected: PASS (o client gerado tem os 5 modelos).
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): modelos Prisma de fatos de financeiro e logs do MCP"`

### Task 4a.2: `mcp/lib/prisma.ts` — client com role restrito

**Files:**
- Create: `mcp/lib/prisma.ts`

- [ ] **Step 1:** Criar o client espelhando `src/lib/prisma.ts`/`src/worker/prisma.ts`, mas lendo `MCP_DATABASE_URL` do ambiente (a `DATABASE_URL` do role `nexus_mcp`, definida na onda 4f-1; até lá, cai em `DATABASE_URL`):

```ts
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.MCP_DATABASE_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: url });
export const prisma = new PrismaClient({ adapter });
```

- [ ] **Step 2:** `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): client Prisma do MCP com URL de role dedicado"`

### Task 4a.3: `mcp/auth/service-token.ts` — validação constant-time

**Files:**
- Create: `mcp/auth/service-token.ts`
- Test: `mcp/auth/service-token.test.ts`

- [ ] **Step 1: Escrever o teste falhando.** Testa `validateServiceToken(header)`: header `Bearer <correto>` → `true`; `Bearer <errado>` → `false`; ausente/malformado → `false`; usa `crypto.timingSafeEqual` (não comparação `===`).
- [ ] **Step 2:** Rodar — FAIL (módulo não existe).
- [ ] **Step 3:** Implementar: extrai o token do header `Authorization: Bearer`, compara com `process.env.MCP_SERVICE_TOKEN` via `crypto.timingSafeEqual` (tratando comprimentos diferentes sem vazar timing).
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): validação constant-time do service token"`

### Task 4a.4: `mcp/auth/user-context.ts` — resolução do `UserContext`

**Files:**
- Create: `mcp/auth/user-context.ts`
- Test: `mcp/auth/user-context.test.ts`

- [ ] **Step 1: Teste falhando.** `resolveUserContext(prisma, userId)`: usuário ativo → `{ userId, role, domains }` com `domains` de `UserDomainAccess`; usuário `isActive=false` → lança/retorna `null`; usuário inexistente → `null`. Usar `jest-mock-extended` para o prisma (padrão do projeto).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar: `prisma.user.findUnique` + `userDomainAccess.findMany`; espelha a checagem de `isActive` de `src/auth.ts`. Tipo `UserContext` exportado.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): resolução do UserContext a partir do banco"`

### Task 4a.5: `mcp/auth/session-store.ts` — `UserContext` por sessão

**Files:**
- Create: `mcp/auth/session-store.ts`
- Test: `mcp/auth/session-store.test.ts`

- [ ] **Step 1: Teste falhando.** Store em memória: `set(sessionId, ctx)`, `get(sessionId)`, `delete(sessionId)`. (Mecanismo confirmado em 4a.0; se o SDK oferecer escopo de sessão nativo, adaptar.)
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar com `Map`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): store de UserContext por sessão"`

### Task 4a.6: `mcp/lib/audit.ts` — gravação de audit

**Files:**
- Create: `mcp/lib/audit.ts`
- Test: `mcp/lib/audit.test.ts`

- [ ] **Step 1: Teste falhando.** `recordAudit(prisma, { userId, tool, params, outcome, rowCount?, durationMs? })` → `prisma.mcpAuditLog.create` chamado com os campos corretos.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `outcome` é o tipo união `"ok"|"denied"|"error"|"invalid_input"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): gravação de McpAuditLog"`

### Task 4a.7: `mcp/catalog/types.ts` — tipo `ToolEntry`

**Files:**
- Create: `mcp/catalog/types.ts`

- [ ] **Step 1:** Definir:

```ts
import type { z } from "zod";
import type { ReportDomain } from "../../src/generated/prisma/client";
import type { UserContext } from "../auth/user-context";
import type { prisma } from "../lib/prisma";

export interface ToolHandlerCtx {
  prisma: typeof prisma;
  user: UserContext;
}
export interface ToolEntry<I = unknown, O = unknown> {
  id: string;
  dominio: ReportDomain;
  descricao: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  gatedRoles?: ReadonlyArray<"super_admin" | "admin">;
  handler: (input: I, ctx: ToolHandlerCtx) => Promise<O>;
}
```

- [ ] **Step 2:** `npx tsc --noEmit` — PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): tipos do catálogo de tools do MCP"`

### Task 4a.8: `mcp/catalog/registry.ts` — registry + filtro RBAC

**Files:**
- Create: `mcp/catalog/registry.ts`
- Test: `mcp/catalog/registry.test.ts`

- [ ] **Step 1: Teste falhando.** `visibleTools(allTools, user)` — reusa `visibleDomains` de `src/lib/reports/domains.ts`: `viewer` com domínio `estoque` vê só tools de estoque; `admin` vê tudo incl. `gatedRoles`; tool com `gatedRoles:["admin","super_admin"]` não aparece para `manager`. `assertToolAllowed(tool, user)` — camada 2: lança se o domínio não está em `visibleDomains` ou se `gatedRoles` não inclui o role.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `visibleTools` e `assertToolAllowed`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): registry de catálogo com filtro de RBAC (camadas 1 e 2)"`

### Task 4a.9: `mcp/server.ts` + `mcp/index.ts` — servidor HTTP + transport

**Files:**
- Create: `mcp/server.ts`, `mcp/index.ts`, `mcp/tsconfig.json`

- [ ] **Step 1:** `mcp/tsconfig.json` estendendo o raiz, `module`/`target` para Node puro.
- [ ] **Step 2:** `mcp/server.ts`: cria `http.Server`; middleware que (a) valida o service token (4a.3) → 401 se inválido; (b) na abertura de sessão lê `X-Mcp-User-Id`, resolve `UserContext` (4a.4), nega (401/403) se `null`, guarda no session-store (4a.5); (c) entrega o request ao `StreamableHTTPServerTransport` (conforme `SDK-NOTES.md`). Registra o `McpServer` com as tools de `visibleTools(catalogo, user)`. Cada `tools/call`: recarrega `UserContext`, `assertToolAllowed`, valida input Zod, executa handler, grava audit, devolve output. Erros mapeados aos `outcome` de 3.9.
- [ ] **Step 3:** `mcp/index.ts`: lê env, sobe o servidor na porta 3100, log de start.
- [ ] **Step 4:** Script `mcp` no `package.json`: `tsx --env-file=.env.local mcp/index.ts`.
- [ ] **Step 5:** `npx tsc --noEmit` — PASS. Subir o servidor manualmente e confirmar log de start + 401 sem token (via `curl`).
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): servidor MCP Streamable HTTP com auth de serviço e sessão"`

> **Camada 6 (Zod)** é exercida no pipeline de `tools/call` do Step 2. **Camadas 1/2** vêm do registry (4a.8). O catálogo começa vazio; as ondas 4c/4d/4e o preenchem.

---

## ONDA 4b — Camada de fatos de financeiro

### Task 4b.0: Descoberta bloqueante

**Files:**
- Create: `docs/superpowers/research/2026-05-17-f4-financeiro-fontes.md`

- [ ] **Step 1:** Inspecionar amostra de `raw_finan_fluxo_caixa`, `raw_finan_pagamento_divida`, `raw_finan_banco_saldo_hoje` no banco (ou nos JSONs de `discovery/output/modelos/`). Documentar: valores reais dos `selection` (`tipo`, `situacao`, `situacao_divida_simples`, `sinal`); se em `finan.fluxo.caixa` realizado e previsto coexistem na mesma linha ou em linhas distintas (decisão #IM-2).
- [ ] **Step 2:** Se forem linhas distintas, registrar que `FatoFinanceiroMovimento` ganha coluna `natureza` (`String`) — e ajustar a Task 4a.1 retroativamente (migration adicional) e este plano.
- [ ] **Step 3: Commit** — `git commit -m "docs(f4): descoberta das fontes de financeiro"`

### Task 4b.1: Registry de builders

**Files:**
- Create: `src/worker/fatos/registry.ts`
- Test: `src/worker/fatos/registry.test.ts`
- Modify: `src/worker/sync/processors.ts`

- [ ] **Step 1: Teste falhando.** `FATO_BUILDERS` é um array de `{ nome, cycle, run }`; `runBuilders(prisma, cycle)` roda só os do `cycle` dado, isolando falha por builder (um erro não derruba os outros — padrão atual do `try/catch` em `processors.ts`).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Criar `registry.ts` com os 3 builders de estoque atuais como entradas `cycle: "snapshot"` e `runBuilders`.
- [ ] **Step 4:** Substituir, em `processors.ts`, os 3 `await import` hard-coded por `await runBuilders(ctx.prisma, "snapshot")`. Adicionar `await runBuilders(ctx.prisma, "incremental")` ao fim de `processIncrementalCycle`.
- [ ] **Step 5:** Rodar a suíte do worker (`npx jest src/worker`) — Expected: PASS, sem regressão nos builders de estoque.
- [ ] **Step 6: Commit** — `git commit -m "refactor(f4): registry de builders de fato no worker"`

### Task 4b.2: `fato-financeiro-saldo.ts`

**Files:**
- Create: `src/worker/fatos/fato-financeiro-saldo.ts`
- Test: `src/worker/fatos/fato-financeiro-saldo.test.ts`
- Modify: `src/worker/fatos/registry.ts`

- [ ] **Step 1: Teste falhando.** `mapSaldoRow(raw)` mapeia `raw_finan_banco_saldo_hoje` → `FatoFinanceiroSaldo` (PK `bancoId` via `relId(banco_id)`, `tipo`, `dataReferencia`, valores monetários). `rebuildFatoFinanceiroSaldo(prisma)` filtra `rawDeleted=false`, faz `deleteMany`+`createMany` em transação + `markFatoBuilt`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar espelhando `fato-estoque-saldo.ts` (usar `relId`/`relNome` de `odoo-relational.ts`).
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Registrar a entrada `cycle: "snapshot"` no registry.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): builder fato_financeiro_saldo"`

### Task 4b.3: `fato-financeiro-movimento.ts`

Mesma estrutura de 4b.2. Fonte `raw_finan_fluxo_caixa`, PK `odooId`, `cycle: "incremental"`, filtro `rawDeleted=false`. Colunas conforme 4a.1 (+ `natureza` se 4b.0 indicou). Commit: `feat(f4): builder fato_financeiro_movimento`.

### Task 4b.4: `fato-financeiro-titulo.ts`

Mesma estrutura. Fonte `raw_finan_pagamento_divida`, PK `odooId`, `cycle: "incremental"`. `tipo` derivado de `tipo`/`sinal` conforme 4b.0. **`diasAtraso` NÃO é coluna** — não mapear. Commit: `feat(f4): builder fato_financeiro_titulo`.

---

## ONDA 4c — Estoque

### Task 4c-1: Reestruturação da camada de query de estoque

**Files:**
- Create: `src/lib/reports/queries/estoque.ts`, `src/lib/reports/queries/estoque.test.ts`
- Modify: `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`

- [ ] **Step 1:** Ler `report-data.ts` inteiro. Listar, por função `getRelatorio*`, o miolo de agregação (o `Map`/`reduce` sobre os fatos) separado do que é `guardDominio`/`getReport`/`reportFreshness`/shaping de UI.
- [ ] **Step 2:** Criar `src/lib/reports/queries/estoque.ts` — **sem `"use server"`** — com uma função pura por relatório (`querySaldoProduto(prisma, filtros)`, `queryValorArmazem`, `queryEntradasSaidas`, `queryProdutoParado`, `queryTopMovimentados`, `queryConcentracao`), recebendo `prisma` + filtros, devolvendo dado de agregação cru (sem `estado`/`freshness`/shaping). Mover o miolo de `report-data.ts` para cá.
- [ ] **Step 3:** Reescrever as `getRelatorio*` em `report-data.ts` como wrappers: `guardDominio` + chamada à função de `estoque.ts` + `reportFreshness` + shaping. Comportamento externo idêntico.
- [ ] **Step 4:** Criar `estoque.test.ts` testando as funções-núcleo. Revisar `report-data.test.ts`: o que era teste de agregação migra para `estoque.test.ts`; o que é guard/freshness/shaping permanece.
- [ ] **Step 5:** Rodar `npx jest src/lib` — Expected: PASS, sem regressão.
- [ ] **Step 6:** `npx tsc --noEmit` + `npx eslint src/` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "refactor(f4): extrai núcleo de query de estoque compartilhável"`

### Task 4c-2: Tools de estoque

**Padrão de uma tool** (vale para todas as 12 tools de 4c-2 e 4d):

```ts
// mcp/tools/estoque/<nome>.ts
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types";
import { querySaldoProduto } from "../../../src/lib/reports/queries/estoque";
import { withFreshness } from "../../lib/freshness";

const input = z.object({ /* filtros de negócio */ });
const output = z.object({ /* forma para o agente */, atualizadoEm: z.string(),
  fonteStatus: z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() }) });

export const estoqueSaldoProduto: ToolEntry = {
  id: "estoque_saldo_produto",
  dominio: "estoque",
  descricao: "Saldo de estoque por produto, com localização.",
  inputSchema: input,
  outputSchema: output,
  handler: async (inp, ctx) => withFreshness(ctx.prisma, ["fato_estoque_saldo"],
    async () => { const dados = await querySaldoProduto(ctx.prisma, inp); return shape(dados); }),
};
```

Para cada tool, uma task com 5 steps (teste falhando → fail → implementar → pass → commit). Subdividir em 3 pares:

- [ ] **Task 4c-2a:** `estoque_saldo_produto`, `estoque_valor_armazem`. Commit por tool.
- [ ] **Task 4c-2b:** `estoque_entradas_saidas`, `estoque_top_movimentados`.
- [ ] **Task 4c-2c:** `estoque_produtos_parados`, `estoque_concentracao`.

Cada tool: reusa a função-núcleo de `estoque.ts`; `withFreshness` (Task 4c-2.0 abaixo) anexa `atualizadoEm`+`fonteStatus`; registra a entrada no catálogo de estoque (`mcp/tools/estoque/index.ts`). Teste: handler devolve a forma do `outputSchema`; RBAC nega `viewer` sem domínio estoque.

### Task 4c-2.0: `mcp/lib/freshness.ts` + `mcp/lib/failure.ts`

**Files:** Create `mcp/lib/freshness.ts`, `mcp/lib/failure.ts` + testes.

- [ ] **Step 1: Teste falhando.** `withFreshness(prisma, fatos[], fn)`: se algum fato não tem `FatoBuildState` → resultado "indicador não processado" (`outcome=ok`); senão executa `fn`, anexa `atualizadoEm` (max dos `FatoBuildState`) e `fonteStatus` (de `SyncState` da fonte). `failure.ts` mapeia exceção → `outcome`.
- [ ] **Steps 2-5:** Implementar, testar, commit. Commit: `feat(f4): helpers de frescor e falha das tools`.

### Task 4c-3: Tool `registrar_lacuna` (Caminho 3a)

**Files:** Create `mcp/tools/caminho3/registrar-lacuna.ts` + teste.

- [ ] **Step 1: Teste falhando.** Input `{ perguntaResumo, dominio? }`; handler faz `prisma.featureRequest.create`; output confirma registro. Sem domínio gated (qualquer usuário pode sinalizar lacuna).
- [ ] **Steps 2-5:** Implementar, testar, registrar no catálogo, commit. Commit: `feat(f4): tool registrar_lacuna (Caminho 3a)`.

---

## ONDA 4d — Financeiro

Tools seguem o **padrão de 4c-2**, consumindo os fatos de financeiro e `withFreshness`.

### Task 4d-1: Tools de saldo/caixa
- [ ] `financeiro_saldo_contas` — lê `fato_financeiro_saldo`; output: lista de contas com `saldo`, `tipo`.
- [ ] `financeiro_caixa_periodo` — lê `fato_financeiro_movimento` filtrando por período; soma `entrada`/`saida`/`valor` realizados.
- [ ] `financeiro_fluxo_caixa` — lê `fato_financeiro_movimento`; série de `valorPrevisto`/`valor` por período.
Uma task de 5 steps por tool; commit por tool.

### Task 4d-2: Tools de títulos
- [ ] `financeiro_contas_a_receber` — `fato_financeiro_titulo` `tipo=a_receber`, não pago; `diasAtraso` calculado na query (`dataVencimento` vs hoje).
- [ ] `financeiro_contas_a_pagar` — idem `tipo=a_pagar`.
- [ ] `financeiro_titulos_vencidos` — títulos com `dataVencimento < hoje` e sem `dataPagamento`.
Criar `mcp/lib/dias-atraso.ts` (+ teste) com a função pura de cálculo, usada pelas 3 tools. Uma task de 5 steps por tool; commit por tool.

---

## ONDA 4e — Caminho 3 (3b e 3c)

### Task 4e.1: Contrato de recusa 3b
**Files:** Create `mcp/lib/recusa.ts` + teste. Mensagem-padrão de recusa educada exportada como constante + helper que a formata. Commit: `feat(f4): contrato de recusa 3b`.

### Task 4e.2: Tool `bi_consulta_avancada` (3c stub gated)
**Files:** Create `mcp/tools/caminho3/bi-consulta-avancada.ts` + teste.
- [ ] **Step 1: Teste falhando.** `gatedRoles: ["admin","super_admin"]`; handler stub devolve "modo BI ainda não disponível nesta fase" + aviso de consulta dinâmica não auditada; `manager`/`viewer` não veem a tool (`visibleTools`).
- [ ] **Steps 2-5:** Implementar, testar, registrar no catálogo, commit. Commit: `feat(f4): tool bi_consulta_avancada (3c stub gated)`.
- [ ] **Step 6:** Documentar em `docs/superpowers/research/` o role Postgres read-only do futuro Postgres MCP.

---

## ONDA 4f — Hardening e harness

### Task 4f-1: Role Postgres `nexus_mcp`
**Files:** Create `prisma/sql/2026-05-17-mcp-role.sql`, `docs/runbooks/mcp-role.md`.
- [ ] **Step 1:** SQL: `CREATE ROLE nexus_mcp LOGIN`; `GRANT SELECT` em `fato_*`, `User`, `UserDomainAccess`, `SyncState`, `FatoBuildState`; `GRANT INSERT` em `mcp_audit_log`, `feature_requests`; revoga o resto. Sem `SELECT` em `mcp_audit_log`.
- [ ] **Step 2:** Runbook documentando como aplicar e a env `MCP_DATABASE_URL`.
- [ ] **Step 3:** Aplicar no banco local, testar que o MCP funciona com a URL restrita e que um `SELECT` em `raw_*` falha.
- [ ] **Step 4: Commit** — `feat(f4): role Postgres nexus_mcp com GRANT mínimo`.

### Task 4f-2: RLS preparada
**Files:** Create `prisma/sql/2026-05-17-mcp-rls.sql` (comentado/desabilitado) + `docs/runbooks/mcp-rls.md`. Documenta as políticas RLS por tenant, **desabilitadas** nesta fase. Commit: `docs(f4): RLS preparada e documentada`.

### Task 4f-3: Rate limiter do MCP
**Files:** Create `mcp/lib/rate-limit.ts` + teste; integrar no pipeline de `tools/call` de `server.ts`.
- [ ] **Step 1: Teste falhando.** `checkMcpRateLimit(redis, userId)`: chave `mcp:rate:{userId}`, `INCR`+`EXPIRE` 60s, limite 60 → 61ª chamada retorna bloqueado.
- [ ] **Steps 2-5:** Implementar (padrão `INCR`/`EXPIRE` de `src/lib/rate-limit.ts`), integrar em `server.ts` (estouro → `outcome=denied`), testar, commit.

### Task 4f-4: Harness de teste de integração MCP
**Files:** Create `mcp/__tests__/harness.ts`, `mcp/__tests__/integration.test.ts`.
- [ ] **Step 1:** Harness: sobe o servidor MCP num processo/porta de teste, cliente Streamable HTTP do SDK, autentica com service token de teste, abre sessão com `userId` de teste.
- [ ] **Step 2:** Teste de integração: para cada perfil (`super_admin`/`admin`/`manager`/`viewer`), `tools/list` retorna o catálogo filtrado correto; cada tool responde a pergunta-alvo; tool de domínio negado falha; `bi_consulta_avancada` invisível para `manager`/`viewer`; input inválido → erro estruturado.
- [ ] **Step 3:** Rodar — PASS.
- [ ] **Step 4: Commit** — `feat(f4): harness de teste de integração do MCP`.

### Task 4f-5: Container e compose
**Files:** Create `mcp/Dockerfile`; Modify `docker-compose.yml`.
- [ ] **Step 1:** `Dockerfile` do `mcp` (Node puro, `tsx`), espelhando o do `worker`.
- [ ] **Step 2:** Serviço `mcp` no `docker-compose.yml`: porta 3100 só na rede interna, `MCP_DATABASE_URL`/`MCP_SERVICE_TOKEN`/`REDIS_URL`, `depends_on: [db, redis]`.
- [ ] **Step 3:** `docker compose build mcp` — PASS.
- [ ] **Step 4: Commit** — `feat(f4): container mcp no compose`.

---

## Verificação final (etapa [9])

- [ ] `npx tsc --noEmit` — PASS.
- [ ] `npx eslint src/ mcp/` — PASS.
- [ ] `npx jest` — PASS (todos os testes, sem regressão).
- [ ] `npx next build` (só `app/`) — PASS.
- [ ] `docker compose build mcp` — PASS.
- [ ] Worker roda um ciclo: os 3 fatos de financeiro são construídos; `FatoBuildState` ganha as 3 entradas.
- [ ] Harness de integração verde para os 4 perfis.
- [ ] Atualizar `STATUS.md`, `docs/fatos-modelagem.md` (checklist F4), `.env.example` (`MCP_SERVICE_TOKEN`, `MCP_DATABASE_URL`).

---

## Self-review (cobertura da spec v3)

- §3.2 transporte → 4a.0, 4a.9, 4f-5. §3.3/3.3.1 identidade → 4a.3–4a.5, 4a.9.
- §3.4 fatos + registry → 4a.1, 4b.1–4b.4. §3.5.1 extração → 4c-1.
- §3.5.2 tools estoque → 4c-2. §3.5.3 tools financeiro → 4d.
- §3.6 RBAC: c1/c2 → 4a.8; c3/c5 → 4f-1/4f-2 (doc); c4 → 4f-1; c6 → 4a.9; c7 → 4a.6/4f-3.
- §3.7 Caminho 3 → 4c-3 (3a), 4e (3b/3c). §3.8 logs → 4a.1, 4a.6, 4c-3.
- §3.9 falha/frescor → 4c-2.0. §6 harness → 4f-4. §6 toolchains → Verificação final.

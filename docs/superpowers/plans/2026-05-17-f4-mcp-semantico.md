# F4 — MCP Semântico — Implementation Plan (v2)

> **PLAN v2 — aplica Review #1 (24 achados).** Versão da Review #1
> (`docs/superpowers/reviews/2026-05-17-f4-plan-review-1.md`): 6 CRÍTICO, 11
> IMPORTANTE, 7 MENOR — todos aplicados. Mapa achado→task no fim do documento.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Cada task é uma unidade de escopo único, verificável isoladamente; cada step leva 2–5 min.

**Goal:** Entregar o servidor MCP semântico do nexus-odoo (onda 1: estoque + financeiro) — tools de vocabulário de negócio sobre o cache Postgres, RBAC estrutural de 7 camadas, Caminho 3 (3a/3b funcionais, 3c stub gated), contrato de identidade por sessão.

**Architecture:** Container `mcp/` Node puro com `@modelcontextprotocol/sdk` (Streamable HTTP sobre `node:http`); camada de fatos de financeiro construída por builders no worker via um registry; tools declarativas que reusam um núcleo de query compartilhado com o dashboard da F3 (estoque) e um núcleo de query próprio testável (financeiro).

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Prisma 7 (`@prisma/adapter-pg`), Postgres, Redis (`ioredis`), Zod, Jest, `tsx`.

**Spec base:** `docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md` (v3).

---

## Estrutura de arquivos

**Criar:**
- `mcp/index.ts` — entrypoint do servidor MCP (Node puro).
- `mcp/server.ts` — servidor `node:http` + middlewares de auth + montagem do `McpServer`/`StreamableHTTPServerTransport` + pipeline de `tools/call`. **Reeditado em 4f-3** (integração do rate limiter).
- `mcp/auth/service-token.ts` — validação constant-time do service token.
- `mcp/auth/user-context.ts` — resolução e recarga do `UserContext`.
- `mcp/auth/session-store.ts` — associação `sessionId` → `UserContext` (`Map` em memória; nota de instância única).
- `mcp/catalog/types.ts` — tipos do catálogo de tools (`ToolEntry`, `ToolHandlerCtx`).
- `mcp/catalog/registry.ts` — `visibleTools` + `assertToolAllowed` (RBAC camadas 1/2).
- `mcp/catalog/index.ts` — agrega os índices de domínio num único array de `ToolEntry`.
- `mcp/tools/estoque/index.ts` — array de `ToolEntry` de estoque.
- `mcp/tools/estoque/saldo-produto.ts`, `valor-armazem.ts`, `entradas-saidas.ts`, `top-movimentados.ts`, `produtos-parados.ts`, `concentracao.ts` — 6 handlers de tool de estoque.
- `mcp/tools/financeiro/index.ts` — array de `ToolEntry` de financeiro.
- `mcp/tools/financeiro/saldo-contas.ts`, `caixa-periodo.ts`, `fluxo-caixa.ts`, `contas-a-receber.ts`, `contas-a-pagar.ts`, `titulos-vencidos.ts` — 6 handlers de tool de financeiro.
- `mcp/tools/caminho3/index.ts` — array de `ToolEntry` do Caminho 3.
- `mcp/tools/caminho3/registrar-lacuna.ts`, `mcp/tools/caminho3/bi-consulta-avancada.ts`.
- `mcp/lib/audit.ts` — gravação em `McpAuditLog`.
- `mcp/lib/rate-limit.ts` — rate limiter do MCP (Redis).
- `mcp/lib/freshness.ts` — `withFreshness` + constante `FATO_FONTE` (fato → modelo Odoo).
- `mcp/lib/failure.ts` — mapeamento exceção → `outcome`.
- `mcp/lib/recusa.ts` — contrato de recusa 3b.
- `mcp/lib/dias-atraso.ts` — função pura de cálculo de dias de atraso.
- `mcp/lib/prisma.ts` — `PrismaClient` com `MCP_DATABASE_URL` (role `nexus_mcp`).
- `mcp/tsconfig.json`, `mcp/Dockerfile`, `mcp/SDK-NOTES.md`.
- `mcp/__tests__/harness.ts` — cliente de teste de integração Streamable HTTP.
- `mcp/__tests__/integration.test.ts` — teste de integração por perfil.
- `src/lib/reports/queries/estoque.ts` — núcleo de query de estoque (neutro, sem `"use server"`).
- `src/lib/reports/queries/financeiro.ts` — núcleo de query de financeiro (neutro, testável).
- `src/worker/fatos/registry.ts` — registry de builders.
- `src/worker/fatos/fato-financeiro-saldo.ts`, `fato-financeiro-movimento.ts`, `fato-financeiro-titulo.ts`.
- `prisma/sql/2026-05-17-mcp-role.sql` — provisionamento do role `nexus_mcp`.
- `prisma/sql/2026-05-17-mcp-rls.sql` — RLS preparada (comentada/desabilitada).
- `docs/superpowers/research/2026-05-17-f4-financeiro-fontes.md` — descoberta das fontes.
- `docs/runbooks/mcp-role.md`, `docs/runbooks/mcp-rls.md`.
- Testes `*.test.ts` ao lado de cada módulo testável.

**Modificar:**
- `prisma/schema.prisma` — 5 modelos novos.
- `src/worker/sync/processors.ts` — substituir os 3 `await import` hard-coded pela iteração do registry.
- `src/lib/actions/report-data.ts` — funções `getRelatorio*` viram wrappers do núcleo.
- `src/lib/actions/report-data.test.ts` — revisar para o novo split.
- `package.json` — dep `@modelcontextprotocol/sdk`, script `mcp`.
- `.env.example` — `MCP_SERVICE_TOKEN`, `MCP_DATABASE_URL`.
- `docker-compose.yml` / Portainer — serviço `mcp`.
- `STATUS.md`, `docs/fatos-modelagem.md`, `CLAUDE.md` (checklist de fatos).

---

## Ondas e dependências

| Onda | Entrega | Depende de |
|---|---|---|
| **4a** | Fundação: env, SDK, schema Prisma, descoberta de financeiro, auth, registry de catálogo, servidor HTTP, pipeline de `tools/call` | — |
| **4b** | Camada de fatos de financeiro: registry de builders + 3 builders | 4a (schema + descoberta) |
| **4c** | Estoque: extração do núcleo de query + 6 tools + `registrar_lacuna` | 4a, 4b |
| **4d** | Financeiro: núcleo de query de financeiro + 6 tools | 4a, 4b, 4c |
| **4e** | Caminho 3: recusa 3b + `bi_consulta_avancada` stub | 4a, 4c |
| **4f** | Hardening: role Postgres, RLS, rate limiter, harness, container, paridade | 4c, 4d, 4e |

---

## ONDA 4a — Fundação

### Task 4a.0: Variáveis de ambiente do MCP

**Files:**
- Modify: `.env.example`

- [ ] **Step 1:** Adicionar ao `.env.example`, com comentário, duas variáveis:
  ```
  # MCP semântico (F4)
  # Service token: segredo forte estático; o agente F5 o envia em Authorization: Bearer.
  MCP_SERVICE_TOKEN=
  # URL Postgres do role nexus_mcp (GRANT mínimo). Sem valor: o MCP cai em DATABASE_URL (dev).
  MCP_DATABASE_URL=
  ```
- [ ] **Step 2:** Nota neste plano e no commit: `.env.local` (não versionado) precisa receber `MCP_SERVICE_TOKEN` (qualquer string forte para dev) **antes** de 4a.5/4a.13, e `MCP_DATABASE_URL` antes de 4f-1. `validateServiceToken` (4a.4) falha seguro se a env faltar — não compara contra `undefined`.
- [ ] **Step 3: Commit** — `git commit -m "chore(f4): variáveis de ambiente do MCP no .env.example"`

### Task 4a.1: Verificação de viabilidade do SDK

**Files:**
- Modify: `package.json`
- Create: `mcp/SDK-NOTES.md`

- [ ] **Step 1:** `npm install @modelcontextprotocol/sdk` e confirmar a versão instalada.
- [ ] **Step 2:** Ler a API do `StreamableHTTPServerTransport` na versão instalada (`node_modules/@modelcontextprotocol/sdk/dist/`). Confirmar: (a) é possível montar o transport sobre um `http.Server` próprio e interceptar o request HTTP **antes** de entregar o corpo ao transport (middleware de pré-auth); (b) é possível associar dados de sessão (`UserContext`) acessíveis dentro do handler de tool — via `sessionId` do transport ou `AsyncLocalStorage`.
- [ ] **Step 3:** Registrar os achados em `mcp/SDK-NOTES.md`: versão, assinatura do transport, mecanismo escolhido para pré-auth e para `UserContext` de sessão. **Se a API divergir do desenho da spec 3.3.1**, documentar o ajuste aqui — as tasks 4a.5/4a.11/4a.12/4a.13 seguem este documento.
- [ ] **Step 4: Commit** — `git commit -m "chore(f4): adiciona @modelcontextprotocol/sdk e nota de viabilidade"`

### Task 4a.2: Descoberta bloqueante das fontes de financeiro

**Files:**
- Create: `docs/superpowers/research/2026-05-17-f4-financeiro-fontes.md`

> Movida para **antes** do schema (M4): a descoberta não depende do schema; assim 4a.3 nasce correto, sem migration retroativa.

- [ ] **Step 1:** Inspecionar amostra de `raw_finan_fluxo_caixa`, `raw_finan_pagamento_divida`, `raw_finan_banco_saldo_hoje` no banco (ou nos JSONs de `discovery/output/modelos/`). Documentar os valores reais dos `selection`: `tipo`, `situacao`, `situacao_divida_simples`, `sinal`.
- [ ] **Step 2:** Documentar se em `finan.fluxo.caixa` realizado e previsto coexistem na mesma linha (`entrada` + `entrada_prevista` juntas) ou em linhas distintas (decisão #IM-2). **Se forem linhas distintas**, registrar que `FatoFinanceiroMovimento` ganha coluna `natureza String` — e a Task 4a.3 já cria o modelo com essa coluna (não há migration retroativa).
- [ ] **Step 3:** Confirmar a unicidade de `banco_id` em `raw_finan_banco_saldo_hoje`: contar linhas vs. `banco_id` distintos. Documentar o resultado — **insumo direto da Task 4a.3** (decide a PK de `FatoFinanceiroSaldo`, achado I1).
- [ ] **Step 4:** Documentar o critério "não pago" para `fato_financeiro_titulo`: com base nos valores reais de `situacao`/`situacao_divida_simples`, decidir se "não pago" é `dataPagamento == null` ou um valor específico de `situacaoSimples`. Esse critério é consumido por 4d.5/4d.6/4d.7.
- [ ] **Step 5:** Confirmar no `MODEL_CATALOG` (`src/worker/catalog/model-catalog.ts`) que `finan.fluxo.caixa`, `finan.pagamento.divida` e `finan.banco.saldo.hoje` estão presentes e com os `mode` da tabela 3.4 da spec (`snapshot`/`incremental`/`incremental`).
- [ ] **Step 6: Commit** — `git commit -m "docs(f4): descoberta das fontes do domínio financeiro"`

### Task 4a.3: Schema Prisma — modelos de fato e logs

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/.../migration.sql` (via `prisma migrate dev`)

- [ ] **Step 1:** Adicionar ao `schema.prisma` os 5 modelos abaixo. **Todos os campos monetários são `Decimal @db.Decimal(18,2)`** (achado I2 — alinha a `FatoEstoqueSaldo`; nunca `Float` para dinheiro). A PK de `FatoFinanceiroSaldo` segue o resultado da Task 4a.2 Step 3 (achado I1):
  - se `banco_id` for **único por linha** no snapshot → PK `bancoId Int @id @map("banco_id")`;
  - se **não** for único → PK `id String @id @default(uuid())` + `bancoId Int @map("banco_id")` + `@@unique([bancoId, dataReferencia])`.
  Modelo abaixo na variante PK-`bancoId` (trocar se a descoberta indicar):

```prisma
model FatoFinanceiroSaldo {
  bancoId        Int       @id @map("banco_id")
  bancoNome      String?   @map("banco_nome")
  tipo           String?
  dataReferencia DateTime? @map("data_referencia")
  saldoAnterior  Decimal   @default(0) @db.Decimal(18, 2) @map("saldo_anterior")
  entrada        Decimal   @default(0) @db.Decimal(18, 2)
  saida          Decimal   @default(0) @db.Decimal(18, 2)
  saldo          Decimal   @default(0) @db.Decimal(18, 2)
  atualizadoEm   DateTime  @map("atualizado_em")
  @@map("fato_financeiro_saldo")
}

model FatoFinanceiroMovimento {
  // Acrescentar `natureza String?` se a Task 4a.2 Step 2 indicar linhas distintas.
  odooId              Int       @id @map("odoo_id")
  data                DateTime?
  contaId             Int?      @map("conta_id")
  contaNome           String?   @map("conta_nome")
  centroResultadoId   Int?      @map("centro_resultado_id")
  centroResultadoNome String?   @map("centro_resultado_nome")
  entrada             Decimal   @default(0) @db.Decimal(18, 2)
  saida               Decimal   @default(0) @db.Decimal(18, 2)
  valor               Decimal   @default(0) @db.Decimal(18, 2)
  entradaPrevista     Decimal   @default(0) @db.Decimal(18, 2) @map("entrada_prevista")
  saidaPrevista       Decimal   @default(0) @db.Decimal(18, 2) @map("saida_prevista")
  valorPrevisto       Decimal   @default(0) @db.Decimal(18, 2) @map("valor_previsto")
  atualizadoEm        DateTime  @map("atualizado_em")
  @@index([data])
  @@map("fato_financeiro_movimento")
}

model FatoFinanceiroTitulo {
  odooId           Int       @id @map("odoo_id")
  tipo             String
  participanteId   Int?      @map("participante_id")
  participanteNome String?   @map("participante_nome")
  contaId          Int?      @map("conta_id")
  contaNome        String?   @map("conta_nome")
  numeroDocumento  String?   @map("numero_documento")
  dataDocumento    DateTime? @map("data_documento")
  dataVencimento   DateTime? @map("data_vencimento")
  dataPagamento    DateTime? @map("data_pagamento")
  situacao         String?
  situacaoSimples  String?   @map("situacao_simples")
  vrDocumento      Decimal   @default(0) @db.Decimal(18, 2) @map("vr_documento")
  vrSaldo          Decimal   @default(0) @db.Decimal(18, 2) @map("vr_saldo")
  vrTotal          Decimal   @default(0) @db.Decimal(18, 2) @map("vr_total")
  vrJuros          Decimal   @default(0) @db.Decimal(18, 2) @map("vr_juros")
  vrMulta          Decimal   @default(0) @db.Decimal(18, 2) @map("vr_multa")
  vrDesconto       Decimal   @default(0) @db.Decimal(18, 2) @map("vr_desconto")
  atualizadoEm     DateTime  @map("atualizado_em")
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
  id             String   @id @default(uuid())
  userId         String   @map("user_id")
  perguntaResumo String   @map("pergunta_resumo")
  dominio        String?
  criadoEm       DateTime @default(now()) @map("criado_em")
  @@map("feature_requests")
}
```

- [ ] **Step 2:** Rodar `npx prisma migrate dev --name f4-mcp-fatos-logs`. Expected: migration criada, `prisma generate` roda.
- [ ] **Step 3:** Rodar `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): modelos Prisma de fatos de financeiro e logs do MCP"`

### Task 4a.4: `mcp/tsconfig.json`

**Files:**
- Create: `mcp/tsconfig.json`

> Achado C5: a resolução do alias `@/` e o `include` de `src/` precisam ser explícitos, senão o build do `mcp` quebra.

- [ ] **Step 1:** Criar `mcp/tsconfig.json` estendendo o raiz, com `module`/`target`/`moduleResolution` para Node puro, e — crítico — `baseUrl`+`paths` que resolvem `@/*` para `src/*`, e `include` cobrindo `mcp/` e `src/`:
  ```json
  {
    "extends": "../tsconfig.json",
    "compilerOptions": {
      "module": "nodenext",
      "moduleResolution": "nodenext",
      "target": "ES2022",
      "noEmit": true,
      "jsx": "react-jsx",
      "baseUrl": "..",
      "paths": { "@/*": ["src/*"] }
    },
    "include": ["**/*.ts", "../src/**/*.ts"],
    "exclude": ["node_modules"]
  }
  ```
- [ ] **Step 2:** `npx tsc --noEmit -p mcp/tsconfig.json` — Expected: PASS (sem arquivos `mcp/` ainda, mas compila o `src/`).
- [ ] **Step 3: Commit** — `git commit -m "chore(f4): tsconfig do MCP com alias @/ e include de src/"`

### Task 4a.5: `mcp/lib/prisma.ts` — client com role restrito

**Files:**
- Create: `mcp/lib/prisma.ts`

- [ ] **Step 1:** Criar o client espelhando `src/lib/prisma.ts`/`src/worker/prisma.ts`, lendo `MCP_DATABASE_URL` (com fallback `DATABASE_URL` até 4f-1):
  ```ts
  import { PrismaClient } from "@/generated/prisma/client";
  import { PrismaPg } from "@prisma/adapter-pg";

  const url = process.env.MCP_DATABASE_URL ?? process.env.DATABASE_URL;
  const adapter = new PrismaPg({ connectionString: url });
  export const prisma = new PrismaClient({ adapter });
  ```
- [ ] **Step 2:** `npx tsc --noEmit -p mcp/tsconfig.json`. Expected: PASS — **valida o import transitivo de `@/` no build do `mcp`** (verificação do achado C5).
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): client Prisma do MCP com URL de role dedicado"`

### Task 4a.6: `mcp/auth/service-token.ts` — validação constant-time

**Files:**
- Create: `mcp/auth/service-token.ts`
- Test: `mcp/auth/service-token.test.ts`

- [ ] **Step 1: Escrever o teste falhando.** `validateServiceToken(header)`: `Bearer <correto>` → `true`; `Bearer <errado>` → `false`; ausente/malformado → `false`; **`MCP_SERVICE_TOKEN` ausente do ambiente → `false`** (falha seguro, achado I11); usa `crypto.timingSafeEqual`.
- [ ] **Step 2:** Rodar — FAIL (módulo não existe).
- [ ] **Step 3:** Implementar: extrai o token do header `Authorization: Bearer`; se `process.env.MCP_SERVICE_TOKEN` for vazio/ausente → retorna `false`; compara via `crypto.timingSafeEqual`, tratando comprimentos diferentes sem vazar timing.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): validação constant-time do service token"`

### Task 4a.7: `mcp/auth/user-context.ts` — resolução do `UserContext`

**Files:**
- Create: `mcp/auth/user-context.ts`
- Test: `mcp/auth/user-context.test.ts`

- [ ] **Step 1: Teste falhando.** `resolveUserContext(prisma, userId)`: usuário ativo → `{ userId, role, domains }` com `domains` de `UserDomainAccess`; usuário `isActive=false` → `null`; usuário inexistente → `null`. Usar `jest-mock-extended` para o prisma (padrão do projeto).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar: `prisma.user.findUnique` + `userDomainAccess.findMany`; espelha a checagem de `isActive` de `src/auth.ts`. Exportar o tipo `UserContext = { userId: string; role: PlatformRole; domains: ReportDomain[] }`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): resolução do UserContext a partir do banco"`

### Task 4a.8: `mcp/auth/session-store.ts` — `UserContext` por sessão

**Files:**
- Create: `mcp/auth/session-store.ts`
- Test: `mcp/auth/session-store.test.ts`

- [ ] **Step 1: Teste falhando.** Store em memória: `set(sessionId, ctx)`, `get(sessionId)`, `delete(sessionId)`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar com `Map`. **Comentário no topo do arquivo (achado M2):** "Store em memória — válido para instância única do container `mcp`. A F4 tem um único cliente (o agente F5) e o servidor é stateless quanto a conversa. Escalar para 2+ réplicas exigiria mover a sessão para Redis — endurecimento de F5."
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): store de UserContext por sessão (instância única)"`

### Task 4a.9: `mcp/lib/audit.ts` — gravação de audit

**Files:**
- Create: `mcp/lib/audit.ts`
- Test: `mcp/lib/audit.test.ts`

- [ ] **Step 1: Teste falhando.** `recordAudit(prisma, { userId, tool, params, outcome, rowCount?, durationMs? })` → `prisma.mcpAuditLog.create` chamado com os campos corretos.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `outcome` é a união `"ok" | "denied" | "error" | "invalid_input"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): gravação de McpAuditLog"`

### Task 4a.10: `mcp/lib/failure.ts` — mapeamento exceção → outcome

**Files:**
- Create: `mcp/lib/failure.ts`
- Test: `mcp/lib/failure.test.ts`

- [ ] **Step 1: Teste falhando.** `toOutcome(err)`: `ZodError` → `"invalid_input"`; erro de domínio negado (classe `DomainDeniedError`, exportada deste módulo) → `"denied"`; qualquer outra exceção → `"error"`. `safeErrorMessage(outcome)` devolve mensagem genérica ao agente sem vazar detalhe interno (spec 3.9).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `DomainDeniedError`, `toOutcome`, `safeErrorMessage`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): mapeamento de exceção para outcome do MCP"`

### Task 4a.11: `mcp/catalog/types.ts` — tipo `ToolEntry`

**Files:**
- Create: `mcp/catalog/types.ts`

- [ ] **Step 1:** Definir (achado M1 — `prisma` tipado como `PrismaClient`, não `typeof prisma`):

```ts
import type { z } from "zod";
import type { PrismaClient, ReportDomain } from "@/generated/prisma/client";
import type { UserContext } from "../auth/user-context";

export interface ToolHandlerCtx {
  prisma: PrismaClient;
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

- [ ] **Step 2:** `npx tsc --noEmit -p mcp/tsconfig.json` — PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): tipos do catálogo de tools do MCP"`

### Task 4a.12: `mcp/catalog/index.ts` — agregador do catálogo

**Files:**
- Create: `mcp/catalog/index.ts`

> Achado C4: task explícita que cria o catálogo. Contrato definido: cada `mcp/tools/<dominio>/index.ts` exporta `const <dominio>Tools: ToolEntry[]`; `mcp/catalog/index.ts` os concatena. Cada task de tool adiciona sua entrada ao `index.ts` do domínio.

- [ ] **Step 1:** Criar `mcp/catalog/index.ts` que importa os arrays de domínio (inicialmente arquivos ainda inexistentes — comentar os imports e a concatenação, deixando `export const catalogo: ToolEntry[] = [];`). À medida que cada `mcp/tools/<dominio>/index.ts` é criado (4c.1, 4d.0, 4e.x), descomentar o import e somar ao array. Documentar esse contrato num comentário no topo do arquivo.
- [ ] **Step 2:** `npx tsc --noEmit -p mcp/tsconfig.json` — PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): agregador do catálogo de tools do MCP"`

### Task 4a.13: `mcp/catalog/registry.ts` — registry + filtro RBAC

**Files:**
- Create: `mcp/catalog/registry.ts`
- Test: `mcp/catalog/registry.test.ts`

- [ ] **Step 1: Teste falhando.** `visibleTools(allTools, user)` — reusa `visibleDomains` de `@/lib/reports/domains`: `viewer` com domínio `estoque` vê só tools de estoque; `admin` vê tudo incl. `gatedRoles`; tool com `gatedRoles:["super_admin","admin"]` não aparece para `manager`/`viewer`. `assertToolAllowed(tool, user)` — camada 2: lança `DomainDeniedError` (de `mcp/lib/failure.ts`) se o domínio não está em `visibleDomains(user.role, user.domains)` ou se `gatedRoles` está definido e não inclui `user.role`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `visibleTools` e `assertToolAllowed`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): registry de catálogo com filtro de RBAC (camadas 1 e 2)"`

### Task 4a.14: `mcp/server.ts` — servidor HTTP + middleware de service token

**Files:**
- Create: `mcp/server.ts`
- Test: `mcp/server.test.ts`

> Achado C3: 4a.9 v1 era um épico — decomposta em 4a.14 / 4a.15 / 4a.16 / 4a.17.

- [ ] **Step 1: Teste falhando.** `createHttpServer()` devolve um `http.Server`; uma requisição sem header `Authorization` ou com token inválido → resposta HTTP 401, corpo nunca passa adiante; com token válido → segue para o próximo middleware (mock). Teste via injeção: a função aceita um `next` mockável.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/server.ts` exportando `createHttpServer(deps)`: cria `http.Server` cujo handler primeiro chama `validateServiceToken(req.headers.authorization)`; inválido → `res.writeHead(401)` + `res.end()`; válido → chama `next(req, res)`. `next` é o middleware de sessão (4a.15), injetado para teste.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): servidor HTTP do MCP com middleware de service token"`

### Task 4a.15: `mcp/server.ts` — middleware de resolução de sessão

**Files:**
- Modify: `mcp/server.ts`
- Test: `mcp/server.test.ts`

- [ ] **Step 1: Teste falhando.** `resolveSessionMiddleware(req, res, deps)`: na abertura de sessão lê `X-Mcp-User-Id`; chama `resolveUserContext`; se `null` → HTTP 403; se ok → grava no `session-store` indexado pelo `sessionId` (conforme `SDK-NOTES.md`) e segue. Header ausente → 403.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar o middleware em `mcp/server.ts`, conforme o mecanismo de sessão registrado em `SDK-NOTES.md` (4a.1).
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): middleware de resolução de sessão X-Mcp-User-Id"`

### Task 4a.16: `mcp/server.ts` — transport + registro do `McpServer`

**Files:**
- Modify: `mcp/server.ts`

- [ ] **Step 1:** Implementar a montagem do `StreamableHTTPServerTransport` sobre o `http.Server` (conforme `SDK-NOTES.md`), e o registro do `McpServer` com as tools de `visibleTools(catalogo, user)` da sessão — `catalogo` de `mcp/catalog/index.ts` (vazio nesta onda; preenchido por 4c/4d/4e). `tools/list` reflete o catálogo filtrado.
- [ ] **Step 2:** `npx tsc --noEmit -p mcp/tsconfig.json` — PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): transport Streamable HTTP e registro do McpServer"`

### Task 4a.17: `mcp/server.ts` — pipeline de `tools/call`

**Files:**
- Modify: `mcp/server.ts`
- Test: `mcp/server.test.ts`

> O pipeline é o coração do RBAC (camadas 2/6/7) — tem teste unitário próprio (achado C3).

- [ ] **Step 1: Teste falhando.** `handleToolCall(tool, rawInput, sessionId, deps)`: (1) recarrega `UserContext` via `resolveUserContext` — `null` → `outcome=denied`; (2) `assertToolAllowed(tool, user)` — lança → `outcome=denied`; (3) `tool.inputSchema.parse(rawInput)` — `ZodError` → `outcome=invalid_input`; (4) executa `tool.handler(input, { prisma, user })`; exceção → `outcome=error` via `toOutcome`/`safeErrorMessage`; (5) `recordAudit` chamado em **todos** os caminhos com `tool`, `userId`, `params`, `outcome`, `rowCount?`, `durationMs`; (6) sucesso devolve o output validado por `outputSchema`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `handleToolCall` em `mcp/server.ts` e ligá-lo ao callback de `tools/call` do `McpServer`. `recordAudit` envolto em `try/catch` próprio (uma falha de audit não derruba a resposta — só loga).
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): pipeline de tools/call com RBAC, Zod e audit"`

### Task 4a.18: `mcp/index.ts` — entrypoint

**Files:**
- Create: `mcp/index.ts`
- Modify: `package.json`

- [ ] **Step 1:** `mcp/index.ts`: lê env, monta o servidor (`createHttpServer` + middlewares + transport), faz `listen(3100)`, log de start.
- [ ] **Step 2:** Script `mcp` no `package.json`: `"mcp": "tsx --env-file=.env.local mcp/index.ts"`.
- [ ] **Step 3:** `npx tsc --noEmit -p mcp/tsconfig.json` — PASS. Subir o servidor manualmente e confirmar log de start + `curl` sem token → 401.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): entrypoint do servidor MCP"`

---

## ONDA 4b — Camada de fatos de financeiro

### Task 4b.1: Registry de builders

**Files:**
- Create: `src/worker/fatos/registry.ts`
- Test: `src/worker/fatos/registry.test.ts`
- Modify: `src/worker/sync/processors.ts`

- [ ] **Step 1: Teste falhando.** `FATO_BUILDERS` é um array de `{ nome: string; cycle: "snapshot" | "incremental"; run: (prisma) => Promise<number> }`. `runBuilders(prisma, cycle)` roda só as entradas do `cycle` dado; **isola falha por builder** — para cada builder: `try { const n = await run(prisma); console.log(\`[worker] \${nome} reconstruído: \${n} linhas\`) } catch (err) { console.error(\`[worker] falha ao reconstruir \${nome}:\`, err) }` (achado I4 — replica exatamente `processors.ts:99-125`). Teste verifica: (a) uma exceção num builder não impede os demais; (b) o `console.log`/`console.error` por builder sai (spy em `console`).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Criar `registry.ts` com os 3 builders de estoque atuais como entradas `cycle: "snapshot"` (`rebuildFatoEstoqueSaldo`, `rebuildFatoEstoqueMovimento`, `rebuildFatoProdutoParado`) e `runBuilders` com o `try/catch`+log por builder do Step 1.
- [ ] **Step 4:** Em `processors.ts`: substituir os 3 blocos `await import`+`try/catch` (linhas 97-125) por `await runBuilders(ctx.prisma, "snapshot")` ao fim de `processSnapshotCycle`. Em `processIncrementalCycle`: adicionar `await runBuilders(ctx.prisma, "incremental")` **após o `for` de sync (após a linha 64)**, envolto em `try/catch` com `console.error` (achado I5 — a chamada vem depois do loop, para o `raw` estar atualizado; o erro do agregador não derruba o ciclo).
- [ ] **Step 5:** Rodar `npx jest src/worker` — Expected: PASS, sem regressão nos builders de estoque.
- [ ] **Step 6: Commit** — `git commit -m "refactor(f4): registry de builders de fato no worker"`

### Task 4b.2: `fato-financeiro-saldo.ts`

**Files:**
- Create: `src/worker/fatos/fato-financeiro-saldo.ts`
- Test: `src/worker/fatos/fato-financeiro-saldo.test.ts`
- Modify: `src/worker/fatos/registry.ts`

- [ ] **Step 1: Teste falhando.** `mapSaldoFinanceiroRow(raw)` mapeia uma linha de `raw_finan_banco_saldo_hoje` → forma de `FatoFinanceiroSaldo` (PK conforme 4a.3, via `relId(banco_id)`; `bancoNome` via `relNome`; `tipo`, `dataReferencia`, valores monetários como `number`). `rebuildFatoFinanceiroSaldo(prisma)` filtra `rawDeleted=false`, faz `deleteMany`+`createMany` em `$transaction` e chama `markFatoBuilt(tx, "fato_financeiro_saldo")` **dentro** do `$transaction` (achado I3 — padrão de `fato-estoque-saldo.ts:91-100`).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar espelhando `fato-estoque-saldo.ts` (usar `relId`/`relNome` de `odoo-relational.ts`). Campos monetários gravados como `number` — o Prisma converte para `Decimal` na coluna.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Registrar a entrada `{ nome: "fato_financeiro_saldo", cycle: "snapshot", run: rebuildFatoFinanceiroSaldo }` em `registry.ts`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): builder fato_financeiro_saldo"`

### Task 4b.3: `fato-financeiro-movimento.ts`

**Files:**
- Create: `src/worker/fatos/fato-financeiro-movimento.ts`
- Test: `src/worker/fatos/fato-financeiro-movimento.test.ts`
- Modify: `src/worker/fatos/registry.ts`

- [ ] **Step 1: Teste falhando.** `mapMovimentoRow(raw)` mapeia `raw_finan_fluxo_caixa` → `FatoFinanceiroMovimento` (PK `odooId` via `Number(raw.id)`; `data`, `contaId`/`contaNome` e `centroResultado*` via `relId`/`relNome`; `entrada`/`saida`/`valor`/`*Prevista` como `number`; `natureza` **se** a Task 4a.2 indicou linhas distintas). `rebuildFatoFinanceiroMovimento(prisma)` filtra `rawDeleted=false`, `deleteMany`+`createMany` em `$transaction` + `markFatoBuilt(tx, "fato_financeiro_movimento")` dentro da transação.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar espelhando `fato-estoque-saldo.ts`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Registrar `{ nome: "fato_financeiro_movimento", cycle: "incremental", run: rebuildFatoFinanceiroMovimento }` em `registry.ts`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): builder fato_financeiro_movimento"`

### Task 4b.4: `fato-financeiro-titulo.ts`

**Files:**
- Create: `src/worker/fatos/fato-financeiro-titulo.ts`
- Test: `src/worker/fatos/fato-financeiro-titulo.test.ts`
- Modify: `src/worker/fatos/registry.ts`

- [ ] **Step 1: Teste falhando.** `mapTituloRow(raw)` mapeia `raw_finan_pagamento_divida` → `FatoFinanceiroTitulo`: PK `odooId`; `tipo` (`a_pagar`/`a_receber`) derivado de `tipo`/`sinal` conforme os valores reais da Task 4a.2; `participante*`/`conta*` via `relId`/`relNome`; datas; `situacao`/`situacaoSimples` como `String`; valores monetários como `number`. **`diasAtraso` NÃO é coluna** — não mapear. `rebuildFatoFinanceiroTitulo(prisma)` filtra `rawDeleted=false`, `deleteMany`+`createMany` em `$transaction` + `markFatoBuilt(tx, "fato_financeiro_titulo")` dentro.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Registrar `{ nome: "fato_financeiro_titulo", cycle: "incremental", run: rebuildFatoFinanceiroTitulo }` em `registry.ts`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): builder fato_financeiro_titulo"`

---

## ONDA 4c — Estoque

> Achado I6: a reestruturação da camada de query é decomposta em **7 tasks** — 4c.0 (cria o módulo) + uma por relatório (4c.1a–4c.1f). Achado C2 fixado: a verificação `estadoDoFato` **permanece no wrapper `report-data.ts`**; o núcleo `estoque.ts` não a contém. Achado I7 fixado: o núcleo **não captura exceção** — deixa propagar; o `try { } catch { estado:"erro" }` permanece **só** no wrapper.

### Task 4c.0: Criação do módulo-núcleo de query de estoque

**Files:**
- Create: `src/lib/reports/queries/estoque.ts`
- Create: `src/lib/reports/queries/estoque.test.ts`

- [ ] **Step 1:** Criar `src/lib/reports/queries/estoque.ts` — **sem `"use server"`** — com um comentário de topo que fixa o contrato: "Núcleo de agregação de estoque, framework-neutro. Cada função recebe `prisma` + filtros e devolve dado de agregação cru — **sem `estado`, sem `freshness`, sem shaping de gráfico**. **Não captura exceção** (deixa propagar — quem trata é o wrapper). `estadoDoFato`/`reportFreshness` vivem no wrapper `report-data.ts`, não aqui."
- [ ] **Step 2:** Mover para este arquivo a função auxiliar `limparNomeLocal` **já é importada de `@/lib/reports/local-nome`** — não mover; o núcleo apenas a importa (é agregação, pode ficar no núcleo). Decisão escrita (achado I6): `agruparTopN` (`report-data.ts:524-536`) é **shaping de gráfico** → permanece no wrapper, **não** vai para o núcleo. `TOP_N`/`TOP_CONCENTRACAO` também são shaping → permanecem no wrapper.
- [ ] **Step 3:** Criar `estoque.test.ts` vazio (estrutura `describe` por função, preenchido nas tasks 4c.1a–4c.1f).
- [ ] **Step 4:** `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): cria módulo-núcleo de query de estoque"`

### Task 4c.1a: Extrair `querySaldoProduto`

**Files:**
- Modify: `src/lib/reports/queries/estoque.ts`, `src/lib/actions/report-data.ts`
- Modify: `src/lib/reports/queries/estoque.test.ts`, `src/lib/actions/report-data.test.ts`

- [ ] **Step 1:** Criar em `estoque.ts` a função `querySaldoProduto(prisma, filtros: { armazemId?: number; familiaId?: number })`: move o miolo de `getRelatorioSaldoProduto` (`report-data.ts:103-194`) — o `findMany`, o `Map` de agregação por `produtoId`, a montagem de `linhas` e `kpis`. Retorna `SaldoProdutoData` (`{ kpis, linhas }`). Mover os tipos `DetalhePorLocal`/`SaldoProdutoRow`/`SaldoProdutoKpis`/`SaldoProdutoData` para `estoque.ts` e reexportá-los de `report-data.ts`.
- [ ] **Step 2:** Reescrever `getRelatorioSaldoProduto` como wrapper: `try { requireReport + guardDominio + reportFreshness + estadoDoFato("fato_estoque_saldo") → se "preparando" devolve estado preparando; senão const dados = await querySaldoProduto(prisma, filtros); estado vazio/ok; return } catch { estado:"erro" }`. Comportamento externo idêntico.
- [ ] **Step 3:** Em `estoque.test.ts`: teste de `querySaldoProduto` (agregação, KPIs, drill-down por local) — migrado do que era teste de agregação de R1 em `report-data.test.ts`. Em `report-data.test.ts`: manter só o teste de guard/freshness/`estadoDoFato`/shaping do wrapper de R1.
- [ ] **Step 4:** `npx jest src/lib` — PASS. `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor(f4): extrai querySaldoProduto para o núcleo"`

### Task 4c.1b: Extrair `queryValorArmazem`

**Files:** mesmas de 4c.1a.

- [ ] **Step 1:** Criar `queryValorArmazem(prisma, filtros)` — move o miolo de `getRelatorioValorPorArmazem` (`report-data.ts:310-354`). `getRelatorioValorPorArmazem` não usa filtros (`_filtros`) → `filtros` é `{}`. O `top8` é **shaping de gráfico** → permanece no wrapper; o núcleo devolve `{ kpis, linhasBruto }` (lista ordenada por valor, sem `percentual`). O `percentual` e o `top8` são calculados no wrapper. Mover tipos `ValorArmazemRow`/`ValorArmazemKpis`/`ValorArmazemData` para `estoque.ts`, reexportar.
- [ ] **Step 2:** Reescrever `getRelatorioValorPorArmazem` como wrapper (guard + freshness + `estadoDoFato` + `queryValorArmazem` + cálculo de `percentual`/`top8` + `catch`).
- [ ] **Step 3:** Migrar o teste de agregação de R2 para `estoque.test.ts`; manter guard/freshness no `report-data.test.ts`.
- [ ] **Step 4:** `npx jest src/lib` + `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor(f4): extrai queryValorArmazem para o núcleo"`

### Task 4c.1c: Extrair `queryEntradasSaidas`

**Files:** mesmas de 4c.1a.

- [ ] **Step 1:** Criar `queryEntradasSaidas(prisma, filtros: { periodoDe?: string; periodoAte?: string; armazemId?: number })` — move o miolo de `getRelatorioEntradasSaidas` (`report-data.ts:376-413`): os dois `groupBy` (série por mês×sentido e detalhe por mês×sentido×produto). Retorna `EntradasSaidasData` (`{ serie, detalhe }`). Mover tipos `MovimentoMes`/`DetalheMovimento`/`EntradasSaidasData`, reexportar.
- [ ] **Step 2:** Reescrever `getRelatorioEntradasSaidas` como wrapper.
- [ ] **Step 3:** Migrar o teste de agregação de R3 para `estoque.test.ts`.
- [ ] **Step 4:** `npx jest src/lib` + `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor(f4): extrai queryEntradasSaidas para o núcleo"`

### Task 4c.1d: Extrair `queryProdutosParados`

**Files:** mesmas de 4c.1a.

- [ ] **Step 1:** Criar `queryProdutosParados(prisma, filtros: { faixaDias?: number; armazemId?: number })` — move o miolo de `getRelatorioProdutoParado` (`report-data.ts:438-462`). Retorna `ProdutoParadoData`. Mover tipos `ProdutoParadoRow`/`ProdutoParadoKpis`/`ProdutoParadoData`, reexportar.
- [ ] **Step 2:** Reescrever `getRelatorioProdutoParado` como wrapper.
- [ ] **Step 3:** Migrar o teste de agregação de R4 para `estoque.test.ts`.
- [ ] **Step 4:** `npx jest src/lib` + `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor(f4): extrai queryProdutosParados para o núcleo"`

### Task 4c.1e: Extrair `queryTopMovimentados`

**Files:** mesmas de 4c.1a.

- [ ] **Step 1:** Criar `queryTopMovimentados(prisma, filtros: { periodoDe?: string; periodoAte?: string; sentido?: string })` — move o `groupBy` por `produtoNome` e a montagem de `linhas` de `getRelatorioTopMovimentados` (`report-data.ts:487-503`). O `barras` (slice top-N) é shaping → permanece no wrapper; o núcleo devolve `{ kpis, linhas }` (lista completa ordenada). Mover tipos `TopMovimentadoBar`/`TopMovimentadoKpis`/`TopMovimentadoData`, reexportar.
- [ ] **Step 2:** Reescrever `getRelatorioTopMovimentados` como wrapper (calcula `barras` via `slice(0, TOP_N)`).
- [ ] **Step 3:** Migrar o teste de agregação de R5 para `estoque.test.ts`.
- [ ] **Step 4:** `npx jest src/lib` + `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor(f4): extrai queryTopMovimentados para o núcleo"`

### Task 4c.1f: Extrair `queryConcentracao`

**Files:** mesmas de 4c.1a.

- [ ] **Step 1:** Criar `queryConcentracao(prisma)` — move os dois `groupBy` (por `familiaNome` e por `marcaNome`) e a montagem de `familiasBruto`/`marcasBruto`/`tabelaFamilia`/`tabelaMarca` de `getRelatorioConcentracao` (`report-data.ts:556-595`). Retorna `{ familiasBruto, marcasBruto, tabelaFamilia, tabelaMarca }` — **sem** `agruparTopN` (shaping, fica no wrapper). Mover tipos `ConcentracaoFamiliaRow`/`ConcentracaoMarcaRow`/`ConcentracaoData`, reexportar.
- [ ] **Step 2:** Reescrever `getRelatorioConcentracao` como wrapper: aplica `agruparTopN` sobre `familiasBruto`/`marcasBruto` para montar `dados.familia`/`dados.marca`.
- [ ] **Step 3:** Migrar o teste de agregação de R6 para `estoque.test.ts`.
- [ ] **Step 4:** `npx jest src/lib` + `npx tsc --noEmit` + `npx eslint src/` — PASS, sem regressão.
- [ ] **Step 5: Commit** — `git commit -m "refactor(f4): extrai queryConcentracao para o núcleo"`

### Task 4c.2: `mcp/lib/freshness.ts` — `withFreshness` + `FATO_FONTE`

**Files:**
- Create: `mcp/lib/freshness.ts`, `mcp/lib/freshness.test.ts`

> Reordenada para **antes** das tools de estoque (achado M5). Achado I8: o mapa `FATO_FONTE` é criado aqui.

- [ ] **Step 1:** Criar a constante `FATO_FONTE: Record<string, string>` (fato → `SyncState.model`): `fato_estoque_saldo → "estoque.saldo.hoje"`, `fato_estoque_movimento → "estoque.extrato"`, `fato_produto_parado → "estoque.saldo.hoje"`, `fato_financeiro_saldo → "finan.banco.saldo.hoje"`, `fato_financeiro_movimento → "finan.fluxo.caixa"`, `fato_financeiro_titulo → "finan.pagamento.divida"`. Comentário: quando um fato tem mais de uma fonte, `fonteStatus` reporta a **mais antiga/pior** (a sync mais defasada).
- [ ] **Step 2: Teste falhando.** `withFreshness(prisma, fatos: string[], fn)`: (a) consulta `FatoBuildState` de cada fato — **se qualquer** fato não tem entrada → devolve `{ estado: "preparando" }` (`outcome=ok`), **não executa `fn`**; (b) senão executa `fn`, e anexa `atualizadoEm` (ISO do **max** dos `ultimoBuildAt`) e `fonteStatus` (`{ status, ultimaSyncEm }` do `SyncState` da pior fonte via `FATO_FONTE`). `failure.ts` já existe (4a.10) — não recriar.
- [ ] **Step 3:** Rodar — FAIL.
- [ ] **Step 4:** Implementar. O contrato de retorno (achado C2): `withFreshness` devolve um **envelope** `{ estado: "preparando" } | { estado: "ok" | "vazio"; dados: O; atualizadoEm: string; fonteStatus: {...} }`. O `outputSchema` de cada tool (4c.3+) é o tipo desse envelope — campos de negócio ficam sob `dados`, opcional na variante "preparando".
- [ ] **Step 5:** Rodar — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): withFreshness e mapa fato-fonte do MCP"`

### Task 4c.3: `mcp/tools/estoque/index.ts` — índice do domínio

**Files:**
- Create: `mcp/tools/estoque/index.ts`
- Modify: `mcp/catalog/index.ts`

- [ ] **Step 1:** Criar `mcp/tools/estoque/index.ts` com `export const estoqueTools: ToolEntry[] = [];` (preenchido nas tasks 4c.4–4c.9).
- [ ] **Step 2:** Em `mcp/catalog/index.ts`, descomentar o import de `estoqueTools` e somá-lo a `catalogo`.
- [ ] **Step 3:** `npx tsc --noEmit -p mcp/tsconfig.json` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): índice de tools de estoque no catálogo"`

> **Padrão de uma tool de estoque** (preâmbulo das tasks 4c.4–4c.9 — não substitui os steps): cada tool é um `ToolEntry`; o `handler` chama `withFreshness(ctx.prisma, [<fatos>], async () => shape(await query*(ctx.prisma, input)))`; `shape` é uma função local de tradução núcleo→agente definida no próprio arquivo da tool; o `outputSchema` é o envelope de 4c.2 com `dados` específico da tool. Cada task adiciona a entrada ao array de `mcp/tools/estoque/index.ts`.

### Task 4c.4: Tool `estoque_saldo_produto`

**Files:**
- Create: `mcp/tools/estoque/saldo-produto.ts`, `mcp/tools/estoque/saldo-produto.test.ts`
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Testa o `handler`: com `fato_estoque_saldo` em `FatoBuildState` e dados → devolve envelope `estado:"ok"`, `dados` no formato do `outputSchema`, `atualizadoEm` string, `fonteStatus`; sem `FatoBuildState` → `estado:"preparando"`; `assertToolAllowed` nega `viewer` sem domínio `estoque`. Mock do prisma via `jest-mock-extended`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/tools/estoque/saldo-produto.ts`:
  ```ts
  import { z } from "zod";
  import type { ToolEntry } from "../../catalog/types";
  import { querySaldoProduto } from "@/lib/reports/queries/estoque";
  import { withFreshness } from "../../lib/freshness";

  const inputSchema = z.object({
    armazemId: z.number().int().positive().optional(),
    familiaId: z.number().int().positive().optional(),
  });
  const linha = z.object({
    produtoNome: z.string(),
    familiaNome: z.string().nullable(),
    marcaNome: z.string().nullable(),
    saldoTotal: z.number(),
    valorTotal: z.number(),
    numLocais: z.number().int(),
  });
  const dados = z.object({
    kpis: z.object({
      totalProdutos: z.number().int(),
      produtosNegativos: z.number().int(),
      valorTotal: z.number(),
    }),
    linhas: z.array(linha),
  });
  const fonteStatus = z.object({
    status: z.string(),
    ultimaSyncEm: z.string().nullable(),
  });
  const outputSchema = z.union([
    z.object({ estado: z.literal("preparando") }),
    z.object({
      estado: z.enum(["ok", "vazio"]),
      dados,
      atualizadoEm: z.string(),
      fonteStatus,
    }),
  ]);

  function shape(d: Awaited<ReturnType<typeof querySaldoProduto>>) {
    return {
      kpis: d.kpis,
      // achata: o agente não precisa do drill-down detalhePorLocal por linha
      linhas: d.linhas.map((l) => ({
        produtoNome: l.produtoNome,
        familiaNome: l.familiaNome,
        marcaNome: l.marcaNome,
        saldoTotal: l.saldoTotal,
        valorTotal: l.valorTotal,
        numLocais: l.numLocais,
      })),
    };
  }

  export const estoqueSaldoProduto: ToolEntry<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
    id: "estoque_saldo_produto",
    dominio: "estoque",
    descricao: "Saldo de estoque por produto: unidades e valor a custo, com nº de localizações.",
    inputSchema,
    outputSchema,
    handler: (input, ctx) =>
      withFreshness(ctx.prisma, ["fato_estoque_saldo"], async () =>
        shape(await querySaldoProduto(ctx.prisma, input)),
      ),
  };
  ```
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar `estoqueSaldoProduto` ao array `estoqueTools` em `mcp/tools/estoque/index.ts`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool estoque_saldo_produto"`

### Task 4c.5: Tool `estoque_valor_armazem`

**Files:**
- Create: `mcp/tools/estoque/valor-armazem.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve envelope com `dados` `{ kpis: { valorTotal, numArmazens }, linhas: [{ armazem, valor, numProdutos, percentual }] }`; `preparando` sem `FatoBuildState`; RBAC nega `viewer` sem `estoque`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({})` (R2 não tem filtros). `dados` Zod: `kpis: { valorTotal: number, numArmazens: int }`, `linhas: array({ armazem: string, valor: number, numProdutos: int, percentual: number })`. `shape` recebe `queryValorArmazem` (que devolve `{ kpis, linhasBruto }`) e calcula `percentual` por linha (`valor/valorTotal*100`). `outputSchema` = envelope com esse `dados`. `withFreshness(ctx.prisma, ["fato_estoque_saldo"], …)`. `id: "estoque_valor_armazem"`, `dominio: "estoque"`, descrição "Valor de estoque a preço de custo por armazém".
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool estoque_valor_armazem"`

### Task 4c.6: Tool `estoque_entradas_saidas`

**Files:**
- Create: `mcp/tools/estoque/entradas-saidas.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler com filtros de período devolve `dados` `{ serie: [{ mes, entrada, saida }] }` (a `serie`; o `detalhe` por produto é volumoso — `shape` o omite, deixando só a série mensal para o agente); `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional(), armazemId: z.number().int().positive().optional() })`. `dados` Zod: `serie: array({ mes: string, entrada: number, saida: number })`. `shape` recebe `queryEntradasSaidas` e devolve só `{ serie }`. `withFreshness(ctx.prisma, ["fato_estoque_movimento"], …)`. `id: "estoque_entradas_saidas"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool estoque_entradas_saidas"`

### Task 4c.7: Tool `estoque_top_movimentados`

**Files:**
- Create: `mcp/tools/estoque/top-movimentados.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve `dados` `{ kpis: { totalProdutos, totalUnidades }, top: [{ rotulo, valor }] }` (os top-20 movimentados); `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional(), sentido: z.enum(["entrada","saida"]).optional() })`. `dados` Zod: `kpis: { totalProdutos: int, totalUnidades: number }`, `top: array({ rotulo: string, valor: number })`. `shape` recebe `queryTopMovimentados` (que devolve `{ kpis, linhas }`) e devolve `kpis` + `linhas.slice(0, 20)` como `top`. `withFreshness(ctx.prisma, ["fato_estoque_movimento"], …)`. `id: "estoque_top_movimentados"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool estoque_top_movimentados"`

### Task 4c.8: Tool `estoque_produtos_parados`

**Files:**
- Create: `mcp/tools/estoque/produtos-parados.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve `dados` `{ kpis: { totalParados, valorImobilizado }, linhas: [{ produtoNome, localNome, saldo, dias, vrSaldo }] }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({ faixaDias: z.number().int().nonnegative().optional(), armazemId: z.number().int().positive().optional() })`. `dados` Zod conforme acima. `shape` repassa `queryProdutosParados` (já no formato `{ kpis, total, linhas }`) → `{ kpis, linhas }`. `withFreshness(ctx.prisma, ["fato_produto_parado"], …)`. `id: "estoque_produtos_parados"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool estoque_produtos_parados"`

### Task 4c.9: Tool `estoque_concentracao`

**Files:**
- Create: `mcp/tools/estoque/concentracao.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve `dados` `{ familia: [{ familia, valor, percentual }], marca: [{ marca, valor, percentual }] }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({})`. `dados` Zod: `familia: array({ familia: string, valor: number, percentual: number })`, `marca: array({ marca: string, valor: number, percentual: number })`. `shape` recebe `queryConcentracao` e devolve `tabelaFamilia`/`tabelaMarca` (que já têm `percentual`) renomeadas para `familia`/`marca` — sem `agruparTopN` (shaping de gráfico, não vai ao agente). `withFreshness(ctx.prisma, ["fato_estoque_saldo"], …)`. `id: "estoque_concentracao"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool estoque_concentracao"`

### Task 4c.10: Teste de paridade dashboard×MCP (#IM-8)

**Files:**
- Create: `src/lib/reports/queries/paridade.test.ts`

> Achado C6: o teste de paridade da spec §6 (#IM-8) ganha task explícita.

- [ ] **Step 1: Teste falhando.** Em `paridade.test.ts`: usar `jest.spyOn` no módulo `@/lib/reports/queries/estoque` para espionar `querySaldoProduto`. Mockando o prisma, chamar `getRelatorioSaldoProduto` (de `report-data.ts`) **e** o `handler` da tool `estoqueSaldoProduto` — assertar que **ambos** invocam `querySaldoProduto` exatamente uma vez (provando que delegam ao núcleo, não recomputam). Repetir o padrão para pelo menos mais uma dupla (ex.: `getRelatorioConcentracao` × `estoqueConcentracao` → `queryConcentracao`).
- [ ] **Step 2:** Rodar — FAIL (ou PASS já, se a delegação estiver correta — neste caso o teste é a evidência).
- [ ] **Step 3:** Se FAIL, corrigir o wrapper/tool que não delega. Rodar — PASS.
- [ ] **Step 4: Commit** — `git commit -m "test(f4): paridade dashboard x MCP delega ao núcleo de query"`

### Task 4c.11: Tool `registrar_lacuna` (Caminho 3a)

**Files:**
- Create: `mcp/tools/caminho3/index.ts`, `mcp/tools/caminho3/registrar-lacuna.ts` (+ teste)
- Modify: `mcp/catalog/index.ts`

- [ ] **Step 1: Teste falhando.** Handler com input `{ perguntaResumo: string; dominio?: string }` faz `prisma.featureRequest.create({ data: { userId: ctx.user.userId, perguntaResumo, dominio } })`; output confirma o registro (`{ registrado: true }`). Sem `gatedRoles` (qualquer usuário sinaliza lacuna). `dominio` da tool é uma escolha pragmática — usar `"estoque"` como `ToolEntry.dominio` para a tool aparecer a todo usuário com qualquer domínio? **Decisão escrita:** a tool é de domínio-neutro; como `ToolEntry.dominio` é obrigatório e `visibleDomains` filtra por domínio, registrar com um marcador especial — `mcp/catalog/registry.ts` (4a.13) trata tools cujo `id` começa com `registrar_` ou `bi_` como **sempre visíveis** (exceto `gatedRoles`). Atualizar `visibleTools`/`assertToolAllowed` para essa exceção (adicionar um campo `sempreVisivel?: boolean` ao `ToolEntry` é mais limpo — fazer assim: acrescentar `sempreVisivel?: boolean` ao tipo em `mcp/catalog/types.ts` e `visibleTools` inclui a tool se `sempreVisivel` for `true`).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Acrescentar `sempreVisivel?: boolean` a `ToolEntry` (`mcp/catalog/types.ts`); ajustar `visibleTools` (4a.13) para incluir tools `sempreVisivel`. Implementar `registrar-lacuna.ts` com `sempreVisivel: true`. Criar `mcp/tools/caminho3/index.ts` com `caminho3Tools` e somá-lo ao `catalogo`.
- [ ] **Step 4:** Rodar — PASS. Rodar `mcp/catalog/registry.test.ts` — PASS (sem regressão).
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): tool registrar_lacuna (Caminho 3a)"`

---

## ONDA 4d — Financeiro

> Achado I9: a agregação das tools de financeiro mora em `src/lib/reports/queries/financeiro.ts` — núcleo neutro e testável, espelhando o padrão de estoque. Uma função/teste por tool. Achado I10: 4d.5/4d.6/4d.7 dependem de 4a.2 (critério "não pago" e valores de `situacao`).

### Task 4d.0: Módulo-núcleo de query de financeiro + índice do domínio

**Files:**
- Create: `src/lib/reports/queries/financeiro.ts`, `src/lib/reports/queries/financeiro.test.ts`
- Create: `mcp/tools/financeiro/index.ts`
- Modify: `mcp/catalog/index.ts`

- [ ] **Step 1:** Criar `src/lib/reports/queries/financeiro.ts` — **sem `"use server"`** — com comentário de topo idêntico em espírito ao de `estoque.ts`: núcleo neutro, recebe `prisma` + filtros, devolve agregação crua, **não captura exceção**. Arquivo inicialmente só com o cabeçalho e os tipos vazios (preenchido nas tasks 4d.1–4d.6).
- [ ] **Step 2:** Criar `financeiro.test.ts` (estrutura `describe` por função). Criar `mcp/tools/financeiro/index.ts` com `export const financeiroTools: ToolEntry[] = [];` e somá-lo ao `catalogo` em `mcp/catalog/index.ts`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx tsc --noEmit -p mcp/tsconfig.json` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): módulo-núcleo de query de financeiro e índice de tools"`

### Task 4d.1: Tool `financeiro_saldo_contas`

**Files:**
- Modify: `src/lib/reports/queries/financeiro.ts`, `financeiro.test.ts`
- Create: `mcp/tools/financeiro/saldo-contas.ts` (+ teste)
- Modify: `mcp/tools/financeiro/index.ts`

- [ ] **Step 1: Teste de query falhando.** Em `financeiro.test.ts`: `querySaldoContas(prisma)` lê `fatoFinanceiroSaldo.findMany`, devolve `{ contas: [{ bancoNome, tipo, saldo }], saldoTotal }` com valores convertidos via `Number()` (campos `Decimal`). Mock do prisma.
- [ ] **Step 2:** Rodar — FAIL. Implementar `querySaldoContas`. Rodar — PASS.
- [ ] **Step 3: Teste de tool falhando.** `mcp/tools/financeiro/saldo-contas.ts` — handler devolve envelope `dados` `{ contas, saldoTotal }`; `preparando` sem `FatoBuildState` de `fato_financeiro_saldo`; RBAC nega `viewer` sem domínio `financeiro`.
- [ ] **Step 4:** Rodar — FAIL. Implementar: `inputSchema = z.object({})`; `dados` Zod `{ contas: array({ bancoNome: z.string().nullable(), tipo: z.string().nullable(), saldo: z.number() }), saldoTotal: z.number() }`; `outputSchema` = envelope; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_saldo"], async () => querySaldoContas(ctx.prisma))`; `id: "financeiro_saldo_contas"`, `dominio: "financeiro"`. Rodar — PASS.
- [ ] **Step 5:** Adicionar `financeiroSaldoContas` ao `financeiroTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool financeiro_saldo_contas"`

### Task 4d.2: Tool `financeiro_caixa_periodo`

**Files:** mesmas do padrão de 4d.1.

- [ ] **Step 1: Teste de query falhando.** `queryCaixaPeriodo(prisma, filtros: { periodoDe?: string; periodoAte?: string })` — `fatoFinanceiroMovimento.findMany`/`groupBy` filtrando `data` no período; soma `entrada`/`saida`/`valor` **realizados** (não os `*Prevista`). Devolve `{ entrada, saida, saldo }`. Conversão `Number()` dos `Decimal`.
- [ ] **Step 2:** Rodar — FAIL. Implementar `queryCaixaPeriodo`. Rodar — PASS.
- [ ] **Step 3: Teste de tool falhando.** Handler devolve envelope `dados` `{ entrada, saida, saldo }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 4:** Rodar — FAIL. Implementar `mcp/tools/financeiro/caixa-periodo.ts`: `inputSchema = z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional() })`; `dados` Zod `{ entrada: z.number(), saida: z.number(), saldo: z.number() }`; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_movimento"], …)`; `id: "financeiro_caixa_periodo"`, `dominio: "financeiro"`. Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool financeiro_caixa_periodo"`

### Task 4d.3: Tool `financeiro_fluxo_caixa`

**Files:** mesmas do padrão de 4d.1.

- [ ] **Step 1: Teste de query falhando.** `queryFluxoCaixa(prisma, filtros: { periodoDe?: string; periodoAte?: string })` — `fatoFinanceiroMovimento`; série por período (mês) de `valorPrevisto` e `valor` realizado. Devolve `{ serie: [{ periodo, realizado, previsto }] }`. Conversão `Number()`.
- [ ] **Step 2:** Rodar — FAIL. Implementar `queryFluxoCaixa`. Rodar — PASS.
- [ ] **Step 3: Teste de tool falhando.** Handler devolve envelope `dados` `{ serie }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 4:** Rodar — FAIL. Implementar `mcp/tools/financeiro/fluxo-caixa.ts`: `inputSchema = z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional() })`; `dados` Zod `{ serie: z.array(z.object({ periodo: z.string(), realizado: z.number(), previsto: z.number() })) }`; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_movimento"], …)`; `id: "financeiro_fluxo_caixa"`, `dominio: "financeiro"`. Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool financeiro_fluxo_caixa"`

### Task 4d.4: `mcp/lib/dias-atraso.ts` — função pura de atraso

**Files:**
- Create: `mcp/lib/dias-atraso.ts`, `mcp/lib/dias-atraso.test.ts`

- [ ] **Step 1: Teste falhando.** `diasAtraso(dataVencimento: Date | null, hoje: Date): number` — vencimento no passado → dias positivos; futuro/`null` → `0`. Cálculo por diferença de dias de calendário (sem hora).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar a função pura.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): função pura de cálculo de dias de atraso"`

### Task 4d.5: Tool `financeiro_contas_a_receber`

**Files:** mesmas do padrão de 4d.1. **Depende de 4a.2** (critério "não pago", valores de `tipo`/`situacao`).

- [ ] **Step 1: Teste de query falhando.** `queryContasAReceber(prisma, filtros: { participanteId?: number }, hoje: Date)` — `fatoFinanceiroTitulo.findMany` com `tipo = "a_receber"` (valor confirmado em 4a.2) e filtro "não pago" (critério decidido em 4a.2 Step 4 — `dataPagamento == null` **ou** `situacaoSimples` específico). Para cada linha computa `diasAtraso` via `mcp/lib/dias-atraso.ts` (`diasAtraso` é calculado **na query**, spec 3.4). Devolve `{ titulos: [{ participanteNome, numeroDocumento, dataVencimento, vrSaldo, diasAtraso }], totalAReceber }`. Conversão `Number()`.
- [ ] **Step 2:** Rodar — FAIL. Implementar `queryContasAReceber`. Rodar — PASS.
- [ ] **Step 3: Teste de tool falhando.** Handler devolve envelope `dados` `{ titulos, totalAReceber }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 4:** Rodar — FAIL. Implementar `mcp/tools/financeiro/contas-a-receber.ts`: `inputSchema = z.object({ participanteId: z.number().int().positive().optional() })`; `dados` Zod `{ titulos: z.array(z.object({ participanteNome: z.string().nullable(), numeroDocumento: z.string().nullable(), dataVencimento: z.string().nullable(), vrSaldo: z.number(), diasAtraso: z.number().int() })), totalAReceber: z.number() }`; `handler` passa `new Date()` como `hoje` e chama `withFreshness(ctx.prisma, ["fato_financeiro_titulo"], …)`; `id: "financeiro_contas_a_receber"`, `dominio: "financeiro"`. Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool financeiro_contas_a_receber"`

### Task 4d.6: Tool `financeiro_contas_a_pagar`

**Files:** mesmas do padrão de 4d.1. **Depende de 4a.2.**

- [ ] **Step 1: Teste de query falhando.** `queryContasAPagar(prisma, filtros, hoje)` — idêntica a `queryContasAReceber` mas `tipo = "a_pagar"`. Devolve `{ titulos: [...], totalAPagar }`.
- [ ] **Step 2:** Rodar — FAIL. Implementar `queryContasAPagar`. Rodar — PASS.
- [ ] **Step 3: Teste de tool falhando.** Handler devolve envelope `dados` `{ titulos, totalAPagar }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 4:** Rodar — FAIL. Implementar `mcp/tools/financeiro/contas-a-pagar.ts` (mesmo formato de 4d.5, `totalAPagar`); `id: "financeiro_contas_a_pagar"`. Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool financeiro_contas_a_pagar"`

### Task 4d.7: Tool `financeiro_titulos_vencidos`

**Files:** mesmas do padrão de 4d.1. **Depende de 4a.2.**

- [ ] **Step 1: Teste de query falhando.** `queryTitulosVencidos(prisma, hoje)` — `fatoFinanceiroTitulo.findMany` com `dataVencimento < hoje` **e** sem `dataPagamento` (não pago — critério de 4a.2). `diasAtraso` por linha via `mcp/lib/dias-atraso.ts`. Devolve `{ titulos: [{ tipo, participanteNome, numeroDocumento, dataVencimento, vrSaldo, diasAtraso }], totalVencido }`.
- [ ] **Step 2:** Rodar — FAIL. Implementar `queryTitulosVencidos`. Rodar — PASS.
- [ ] **Step 3: Teste de tool falhando.** Handler devolve envelope `dados` `{ titulos, totalVencido }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 4:** Rodar — FAIL. Implementar `mcp/tools/financeiro/titulos-vencidos.ts`: `inputSchema = z.object({})`; `dados` Zod `{ titulos: z.array(z.object({ tipo: z.string(), participanteNome: z.string().nullable(), numeroDocumento: z.string().nullable(), dataVencimento: z.string().nullable(), vrSaldo: z.number(), diasAtraso: z.number().int() })), totalVencido: z.number() }`; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_titulo"], …)`; `id: "financeiro_titulos_vencidos"`, `dominio: "financeiro"`. Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool financeiro_titulos_vencidos"`

---

## ONDA 4e — Caminho 3 (3b e 3c)

### Task 4e.1: Contrato de recusa 3b

**Files:**
- Create: `mcp/lib/recusa.ts`, `mcp/lib/recusa.test.ts`

- [ ] **Step 1: Teste falhando.** `MENSAGEM_RECUSA_3B` (constante) + `montarRecusa(assunto?)` — formata a recusa educada de pergunta fora do escopo de negócio; o teste confirma o texto-padrão e a interpolação opcional do assunto.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): contrato de recusa 3b"`

### Task 4e.2: Tool `bi_consulta_avancada` (3c stub gated)

**Files:**
- Create: `mcp/tools/caminho3/bi-consulta-avancada.ts` (+ teste)
- Modify: `mcp/tools/caminho3/index.ts`

- [ ] **Step 1: Teste falhando.** `gatedRoles: ["super_admin","admin"]`; `sempreVisivel: true` (gate por role, não por domínio); handler stub devolve `{ disponivel: false, mensagem: "modo BI ainda não disponível nesta fase", aviso: "consulta dinâmica não auditada" }`; `visibleTools` esconde a tool de `manager`/`viewer`; `assertToolAllowed` lança para `manager`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `bi-consulta-avancada.ts`: `inputSchema = z.object({ pergunta: z.string() })`; `outputSchema = z.object({ disponivel: z.literal(false), mensagem: z.string(), aviso: z.string() })`; `dominio: "estoque"` com `sempreVisivel: true` e `gatedRoles`. Adicionar `biConsultaAvancada` ao `caminho3Tools`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): tool bi_consulta_avancada (3c stub gated)"`
- [ ] **Step 6:** Documentar em `docs/superpowers/research/2026-05-17-f4-postgres-mcp-role.md` a definição do role Postgres read-only do futuro Postgres MCP (3c). Commit: `docs(f4): role read-only do Postgres MCP (3c futuro)`.

---

## ONDA 4f — Hardening, harness e container

### Task 4f-1: Role Postgres `nexus_mcp`

**Files:**
- Create: `prisma/sql/2026-05-17-mcp-role.sql`, `docs/runbooks/mcp-role.md`

- [ ] **Step 1:** SQL: `CREATE ROLE nexus_mcp LOGIN PASSWORD …`; `GRANT SELECT` em `fato_estoque_saldo`, `fato_estoque_movimento`, `fato_produto_parado`, `fato_financeiro_saldo`, `fato_financeiro_movimento`, `fato_financeiro_titulo`, `User`, `UserDomainAccess`, `SyncState`, `FatoBuildState`; `GRANT INSERT` em `mcp_audit_log` e `feature_requests`; `REVOKE` o resto (sem `raw_*`, sem `UPDATE`/`DELETE`, **sem `SELECT` em `mcp_audit_log`**).
- [ ] **Step 2:** `docs/runbooks/mcp-role.md`: como aplicar o SQL e como compor `MCP_DATABASE_URL` com o role. Nota (achado M3): `MCP_DATABASE_URL` já era consumida com fallback desde 4a.5 — esta task a torna o caminho real.
- [ ] **Step 3:** Aplicar no banco local; setar `MCP_DATABASE_URL` no `.env.local`; subir o MCP e confirmar que as tools funcionam e que um `SELECT` em `raw_*` falha por permissão.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): role Postgres nexus_mcp com GRANT mínimo"`

### Task 4f-2: RLS preparada

**Files:**
- Create: `prisma/sql/2026-05-17-mcp-rls.sql`, `docs/runbooks/mcp-rls.md`

- [ ] **Step 1:** SQL comentado/desabilitado documentando as políticas RLS por tenant — **não aplicadas** nesta fase (tenant único).
- [ ] **Step 2:** `docs/runbooks/mcp-rls.md` explica o ponto de extensão.
- [ ] **Step 3: Commit** — `git commit -m "docs(f4): RLS preparada e documentada (desabilitada)"`

### Task 4f-3: Rate limiter do MCP

**Files:**
- Create: `mcp/lib/rate-limit.ts` (+ teste)
- Modify: `mcp/server.ts`

> Achado M3: `mcp/server.ts` é **reeditado aqui** (a 4a.17 já o entregou; esta task estende o pipeline) — declarado para o subagente não estranhar.

- [ ] **Step 1: Teste falhando.** `checkMcpRateLimit(redis, userId)`: chave `mcp:rate:{userId}`, `INCR`+`EXPIRE` 60s, limite 60 → 61ª chamada retorna bloqueado. Padrão de `src/lib/rate-limit.ts`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/lib/rate-limit.ts`. Integrar em `handleToolCall` (`mcp/server.ts`, 4a.17): antes da execução do handler, `checkMcpRateLimit` — estouro → `outcome=denied`, `recordAudit`, resposta de recusa.
- [ ] **Step 4:** Rodar o teste do rate limiter + `mcp/server.test.ts` — PASS (sem regressão no pipeline).
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): rate limiter do MCP no pipeline de tools/call"`

### Task 4f-4: Harness de teste de integração MCP

**Files:**
- Create: `mcp/__tests__/harness.ts`, `mcp/__tests__/integration.test.ts`

> Depende de 4c, 4d, 4e (catálogo completo).

- [ ] **Step 1:** `harness.ts`: sobe o servidor MCP num processo/porta de teste, cliente Streamable HTTP do SDK, autentica com service token de teste, abre sessão com `userId` de teste.
- [ ] **Step 2:** `integration.test.ts`: para cada perfil (`super_admin`/`admin`/`manager`/`viewer`), `tools/list` retorna o catálogo filtrado correto; cada tool de estoque/financeiro responde a pergunta-alvo; tool de domínio negado falha; `bi_consulta_avancada` invisível para `manager`/`viewer` (tool de 4e — dependência declarada, achado M6); input inválido → erro estruturado `invalid_input`.
- [ ] **Step 3:** Rodar — PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): harness de teste de integração do MCP"`

### Task 4f-5: Container e compose

**Files:**
- Create: `mcp/Dockerfile`
- Modify: `docker-compose.yml`

> Achado C5: o Dockerfile **não** pode só "espelhar o worker" — precisa copiar `src/` e o Prisma generated.

- [ ] **Step 1:** `mcp/Dockerfile` (Node puro, `tsx`): copia `mcp/`, `src/`, `prisma/` (incl. `src/generated/prisma`), `package.json`, `tsconfig.json`, `mcp/tsconfig.json`; roda `npm ci`; `CMD` executa `tsx mcp/index.ts`. Step de verificação: dentro do build, `npx tsc --noEmit -p mcp/tsconfig.json` resolve os imports `@/` transitivos.
- [ ] **Step 2:** Serviço `mcp` no `docker-compose.yml`: porta 3100 só na rede interna, envs `MCP_DATABASE_URL`/`MCP_SERVICE_TOKEN`/`REDIS_URL`, `depends_on: [db, redis]`.
- [ ] **Step 3:** `docker compose build mcp` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): container mcp no compose"`

---

## Verificação final (etapa [9])

**Automáticos (CI) — achado M7:**
- [ ] `npx tsc --noEmit` (raiz) — PASS.
- [ ] `npx tsc --noEmit -p mcp/tsconfig.json` — PASS.
- [ ] `npx eslint src/ mcp/` — PASS.
- [ ] `npx jest` — PASS (todos os testes, sem regressão; inclui o teste de paridade 4c.10 e o harness 4f-4).
- [ ] `npx next build` (só `app/`) — PASS.
- [ ] `docker compose build mcp` — PASS.

**Manuais (deploy assistido — achado M7):**
- [ ] Worker roda um ciclo real contra o Odoo: os 3 fatos de financeiro são construídos; `FatoBuildState` ganha as 3 entradas (até o primeiro ciclo, as tools de financeiro respondem "indicador ainda não processado" — comportamento correto, #MN-1).
- [ ] MCP sobe com `MCP_DATABASE_URL` do role `nexus_mcp`; `SELECT` em `raw_*` falha por permissão.
- [ ] Atualizar `STATUS.md`, `docs/fatos-modelagem.md` (checklist F4), `CLAUDE.md` (checklist de fatos).

---

## Self-review (cobertura da spec v3)

- §3.2 transporte → 4a.1, 4a.14–4a.18, 4f-5. §3.3/3.3.1 identidade → 4a.6–4a.8, 4a.14–4a.15.
- §3.4 fatos + registry → 4a.2, 4a.3, 4b.1–4b.4. §3.5.1 extração → 4c.0–4c.1f.
- §3.5.2 tools estoque → 4c.4–4c.9. §3.5.3 tools financeiro → 4d.1–4d.7.
- §3.6 RBAC: c1/c2 → 4a.13; c3/c5 → 4f-1/4f-2 (doc); c4 → 4f-1; c6 → 4a.17; c7 → 4a.9/4f-3.
- §3.7 Caminho 3 → 4c.11 (3a), 4e.1 (3b), 4e.2 (3c). §3.8 logs → 4a.3, 4a.9, 4c.11.
- §3.9 falha/frescor → 4a.10, 4c.2. §6 harness → 4f-4. §6 paridade #IM-8 → 4c.10.
- §6 toolchains separadas → Verificação final (CI vs manual).

---

## Mapa: 24 achados da Review #1 → task que resolve

| # | Achado | Resolução |
|---|---|---|
| **C1** | 4c-2 épico de 6 tools sem steps | Decomposto em 4c.4–4c.9 (uma task/tool, schemas Zod literais, `shape` definido) |
| **C2** | `withFreshness` × `estadoDoFato`; semântica multi-fato | 4c.0 Step 1 fixa `estadoDoFato` no wrapper; 4c.2 Step 4 define o envelope de retorno |
| **C3** | 4a.9 épico de servidor+pipeline | Decomposto em 4a.14/4a.15/4a.16/4a.17 (4a.17 com teste unitário do pipeline) |
| **C4** | Catálogo nunca criado; contrato indefinido | 4a.12 cria `mcp/catalog/index.ts`; contrato `tools/<dominio>/index.ts → catalog`; cada tool tem step de registro |
| **C5** | `mcp/tsconfig.json` e imports cruzados não verificados | 4a.4 especifica `paths`/`include`; 4a.5 Step 2 compila import transitivo; 4f-5 Dockerfile copia `src/`+generated |
| **C6** | Teste de paridade #IM-8 sem task | 4c.10 cria o teste de paridade |
| **I1** | PK `bancoId` não verificada | 4a.2 Step 3 verifica unicidade; 4a.3 Step 1 escolhe a PK conforme a descoberta |
| **I2** | Monetário como `Float` | 4a.3 Step 1: todos os campos monetários `Decimal @db.Decimal(18,2)`; builders/queries usam `Number()` |
| **I3** | `markFatoBuilt` fora da transação | 4b.2–4b.4 Step 1: `markFatoBuilt(tx, …)` dentro do `$transaction` |
| **I4** | Registry quebra o `try/catch` por builder | 4b.1 Step 1/3: `runBuilders` replica `try/catch`+log por builder de `processors.ts` |
| **I5** | `processIncrementalCycle` sem ponto de chamada | 4b.1 Step 4: chamada após o `for` (linha 64), em `try/catch` |
| **I6** | 4c-1 épico de 6 relatórios | Decomposto em 4c.0 + 4c.1a–4c.1f (uma task/relatório); `agruparTopN` fica no wrapper |
| **I7** | `report-data.ts` engole erro; núcleo herda? | 4c.0 Step 1: núcleo não captura exceção; `catch` só no wrapper |
| **I8** | Mapa fato→fonte inexistente | 4c.2 Step 1 cria `FATO_FONTE` |
| **I9** | Agregação de financeiro sem casa | 4d.0 cria `src/lib/reports/queries/financeiro.ts`; 4d.1–4d.7 uma função/teste por tool |
| **I10** | `diasAtraso`/"não pago" — dep 4b.0 não declarada | 4d.5/4d.6/4d.7 dependem de 4a.2; critério "não pago" decidido em 4a.2 Step 4 |
| **I11** | `.env.example` órfão | 4a.0 atualiza `.env.example`; 4a.6 `validateServiceToken` falha seguro sem a env |
| **M1** | `typeof prisma` frágil | 4a.11: `ToolHandlerCtx.prisma` tipado como `PrismaClient` |
| **M2** | session-store `Map` × múltiplas instâncias | 4a.8 Step 3: comentário de instância única |
| **M3** | `server.ts` reeditado fora de onda | 4f-3 declara a reedição de `mcp/server.ts` |
| **M4** | 4b.0 muda 4a.1 retroativamente | 4a.2 (descoberta) movida para antes de 4a.3 (schema) |
| **M5** | 4c-2.0 depois de 4c-2 | `withFreshness` é 4c.2, antes das tools 4c.4–4c.9 |
| **M6** | 4f-4 testa tool de 4e sem reforço | 4f-4 Step 2 declara a dependência de 4e |
| **M7** | Verificação final não separa CI×manual | Verificação final dividida em "Automáticos (CI)" e "Manuais" |

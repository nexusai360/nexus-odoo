# F4 — MCP Semântico — Implementation Plan (v3 — final)

> **PLAN v3 — final; aplica Review #1 (24 achados) e Review #2 (16 achados).**
> Review #1 (`docs/superpowers/reviews/2026-05-17-f4-plan-review-1.md`): 6
> CRÍTICO, 11 IMPORTANTE, 7 MENOR — todos aplicados na v2 (20 plenos, 4
> parciais). Review #2 (`docs/superpowers/reviews/2026-05-17-f4-plan-review-2.md`):
> 3 CRÍTICO (N1–N3), 7 IMPORTANTE (N4–N10), 6 MENOR (N11–N16) — todos aplicados
> nesta v3, **incluindo a resolução plena dos 4 parciais** da Review #1
> (C5→N1, I8→N4, I3→N5, I6→N2). Mapa achado→task no fim do documento.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Cada task é uma unidade de escopo único, verificável isoladamente; cada step leva 2–5 min.

**Goal:** Entregar o servidor MCP semântico do nexus-odoo (onda 1: estoque + financeiro) — tools de vocabulário de negócio sobre o cache Postgres, RBAC estrutural de 7 camadas, Caminho 3 (3a/3b funcionais, 3c stub gated), contrato de identidade por sessão.

**Architecture:** Container `mcp/` Node puro com `@modelcontextprotocol/sdk` (Streamable HTTP sobre `node:http`); camada de fatos de financeiro construída por builders no worker via um registry; tools declarativas que reusam um núcleo de query compartilhado com o dashboard da F3 (estoque) e um núcleo de query próprio testável (financeiro).

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Prisma 7 (`@prisma/adapter-pg`), Postgres, Redis (`ioredis`), Zod, Jest (`ts-jest`, transform CJS — relevante para N7), `tsx`.

**Spec base:** `docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md` (v3).

---

## Convenções de ancoragem de edição (achado N14)

Toda edição de arquivo **existente** neste plano é ancorada por **marcador
textual** — um trecho de código literal a localizar — **nunca por número de
linha**. Os intervalos de linha citados (ex.: `report-data.ts:85-200`) são
**referência de orientação ao revisor**, não instrução de corte: o subagente
localiza o marcador textual indicado e opera sobre ele. Um commit anterior à
execução pode deslocar números; não desloca o texto do marcador.

---

## Estrutura de arquivos

**Criar:**
- `mcp/index.ts` — entrypoint do servidor MCP (Node puro).
- `mcp/server.ts` — servidor `node:http` + middlewares de auth + montagem do `McpServer`/`StreamableHTTPServerTransport` + pipeline de `tools/call`. **Reeditado em 4f-3** (integração do rate limiter).
- `mcp/auth/service-token.ts` — validação constant-time do service token.
- `mcp/auth/user-context.ts` — resolução e recarga do `UserContext`.
- `mcp/auth/session-store.ts` — associação `sessionId` → `UserContext` (`Map` em memória; nota de instância única).
- `mcp/catalog/types.ts` — tipos do catálogo de tools (`ToolEntry` com `sempreVisivel?`, `ToolHandlerCtx`).
- `mcp/catalog/registry.ts` — `visibleTools` + `assertToolAllowed` (RBAC camadas 1/2).
- `mcp/catalog/index.ts` — agrega os índices de domínio num único array de `ToolEntry`.
- `mcp/tools/estoque/index.ts` — array de `ToolEntry` de estoque.
- `mcp/tools/estoque/saldo-produto.ts`, `valor-armazem.ts`, `entradas-saidas.ts`, `top-movimentados.ts`, `produtos-parados.ts`, `concentracao.ts` — 6 handlers de tool de estoque.
- `mcp/tools/financeiro/index.ts` — array de `ToolEntry` de financeiro.
- `mcp/tools/financeiro/saldo-contas.ts`, `caixa-periodo.ts`, `fluxo-caixa.ts`, `contas-a-receber.ts`, `contas-a-pagar.ts`, `titulos-vencidos.ts` — 6 handlers de tool de financeiro.
- `mcp/tools/caminho3/index.ts` — array de `ToolEntry` do Caminho 3.
- `mcp/tools/caminho3/registrar-lacuna.ts`, `mcp/tools/caminho3/bi-consulta-avancada.ts`.
- `mcp/lib/audit.ts` — gravação em `McpAuditLog` (com extração de `rowCount`).
- `mcp/lib/rate-limit.ts` — rate limiter do MCP (Redis).
- `mcp/lib/freshness.ts` — `withFreshness` + constante `FATO_FONTE` (`{ model, mode }`) + helper `estadoPreparando`.
- `mcp/lib/failure.ts` — mapeamento exceção → `outcome`.
- `mcp/lib/recusa.ts` — contrato de recusa 3b.
- `mcp/lib/dias-atraso.ts` — função pura de cálculo de dias de atraso.
- `mcp/lib/prisma.ts` — `PrismaClient` com `MCP_DATABASE_URL` (role `nexus_mcp`).
- `mcp/tsconfig.json`, `mcp/Dockerfile`, `mcp/SDK-NOTES.md`.
- `mcp/__tests__/harness.ts` — cliente de teste de integração Streamable HTTP.
- `mcp/__tests__/integration.test.ts` — teste de integração por perfil.
- `src/lib/reports/queries/estoque.ts` — núcleo de query de estoque (neutro, sem `"use server"`).
- `src/lib/reports/queries/estoque.test.ts` — testes do núcleo de estoque.
- `src/lib/reports/queries/financeiro.ts` — núcleo de query de financeiro (neutro, testável).
- `src/lib/reports/queries/financeiro.test.ts` — testes do núcleo de financeiro.
- `src/lib/reports/queries/paridade.test.ts` — teste de paridade dashboard×MCP.
- `src/worker/fatos/registry.ts` — registry de builders.
- `src/worker/fatos/fato-financeiro-saldo.ts`, `fato-financeiro-movimento.ts`, `fato-financeiro-titulo.ts`.
- `prisma/sql/2026-05-17-mcp-role.sql` — provisionamento do role `nexus_mcp`.
- `prisma/sql/2026-05-17-mcp-rls.sql` — RLS preparada (comentada/desabilitada).
- `docs/superpowers/research/2026-05-17-f4-financeiro-fontes.md` — descoberta das fontes.
- `docs/superpowers/research/2026-05-17-f4-postgres-mcp-role.md` — role read-only do Postgres MCP (3c futuro).
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
| **4a** | Fundação: env, SDK, schema Prisma, descoberta de financeiro, `mcp/tsconfig.json` autônomo, auth, registry de catálogo (já com `sempreVisivel?`), servidor HTTP, pipeline de `tools/call` | — |
| **4b** | Camada de fatos de financeiro: registry de builders + 3 builders | 4a (schema + descoberta) |
| **4c** | Estoque: extração do núcleo de query (12 tasks sequenciais) + `withFreshness` + 6 tools + `registrar_lacuna` | 4a, 4b |
| **4d** | Financeiro: núcleo de query de financeiro + 6 tools | 4a, 4b, 4c |
| **4e** | Caminho 3: recusa 3b + `bi_consulta_avancada` stub | 4a, 4c |
| **4f** | Hardening: role Postgres, RLS, rate limiter, harness, container | 4c, 4d, 4e |

### Modelo de execução — paralelismo e sequencialidade (achado N9)

- **Onda 4a:** tasks 4a.0–4a.18 sequenciais (cada uma depende do schema/tipo da anterior).
- **Onda 4b:** 4b.1 antes de 4b.2–4b.4; 4b.2/4b.3/4b.4 podem ser paralelas entre si **exceto** o Step de registro em `registry.ts` (editam o mesmo arquivo — o subagente registra uma de cada vez, ou são executadas sequencialmente).
- **Onda 4c — REGRA: 4c.0 → 4c.1a-extr → 4c.1a-wrap → 4c.1b-extr → 4c.1b-wrap → … → 4c.1f-wrap são ESTRITAMENTE SEQUENCIAIS.** Todas editam `src/lib/reports/queries/estoque.ts` e `src/lib/actions/report-data.ts` (e seus dois testes). Despachar em paralelo = conflito de escrita garantido. `withFreshness` (4c.2) e as tasks de tool (4c.3–4c.11) podem rodar após as 12 tasks de extração; as tasks de tool 4c.4–4c.9 são independentes entre si (arquivos distintos) **exceto** o Step de adição ao `mcp/tools/estoque/index.ts` (registrar uma de cada vez).
- **Onda 4d:** 4d.1–4d.7 cada uma é um arquivo de tool distinto, mas todas editam `src/lib/reports/queries/financeiro.ts` e seu teste — **sequenciais** pelo mesmo motivo da onda 4c.
- O `ToolEntry` já nasce com `sempreVisivel?` na onda 4a (Task 4a.11) — nenhuma task de onda posterior altera `mcp/catalog/types.ts`.

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
- [ ] **Step 2:** Nota neste plano e no commit: `.env.local` (não versionado) precisa receber `MCP_SERVICE_TOKEN` (qualquer string forte para dev) **antes** de 4a.6/4a.14, e `MCP_DATABASE_URL` antes de 4f-1. `validateServiceToken` (4a.6) falha seguro se a env faltar — não compara contra `undefined`.
- [ ] **Step 3: Commit** — `git commit -m "chore(f4): variáveis de ambiente do MCP no .env.example"`

### Task 4a.1: Verificação de viabilidade do SDK

**Files:**
- Modify: `package.json`
- Create: `mcp/SDK-NOTES.md`

- [ ] **Step 1:** `npm install @modelcontextprotocol/sdk` e confirmar a versão instalada.
- [ ] **Step 2:** Ler a API do `StreamableHTTPServerTransport` na versão instalada (`node_modules/@modelcontextprotocol/sdk/dist/`). Confirmar: (a) é possível montar o transport sobre um `http.Server` próprio e interceptar o request HTTP **antes** de entregar o corpo ao transport (middleware de pré-auth); (b) é possível associar dados de sessão (`UserContext`) acessíveis dentro do handler de tool — via `sessionId` do transport ou `AsyncLocalStorage`.
- [ ] **Step 3:** Registrar os achados em `mcp/SDK-NOTES.md`: versão, assinatura do transport, mecanismo escolhido para pré-auth e para `UserContext` de sessão. **Se a API divergir do desenho da spec 3.3.1**, documentar o ajuste aqui — as tasks 4a.5/4a.14/4a.15/4a.16 seguem este documento.
- [ ] **Step 4: Commit** — `git commit -m "chore(f4): adiciona @modelcontextprotocol/sdk e nota de viabilidade"`

### Task 4a.2: Descoberta bloqueante das fontes de financeiro

**Files:**
- Create: `docs/superpowers/research/2026-05-17-f4-financeiro-fontes.md`

> Movida para **antes** do schema (M4): a descoberta não depende do schema; assim 4a.3 nasce correto, sem migration retroativa.

- [ ] **Step 1:** Inspecionar amostra de `raw_finan_fluxo_caixa`, `raw_finan_pagamento_divida`, `raw_finan_banco_saldo_hoje` no banco (ou nos JSONs de `discovery/output/modelos/`). Documentar os valores reais dos `selection`: `tipo`, `situacao`, `situacao_divida_simples`, `sinal`.
- [ ] **Step 2:** Documentar se em `finan.fluxo.caixa` realizado e previsto coexistem na mesma linha (`entrada` + `entrada_prevista` juntas) ou em linhas distintas (decisão #IM-2). **Se forem linhas distintas**, registrar que `FatoFinanceiroMovimento` ganha coluna `natureza String` — e a Task 4a.3 já cria o modelo com essa coluna (não há migration retroativa).
- [ ] **Step 3:** Confirmar a unicidade de `banco_id` em `raw_finan_banco_saldo_hoje`: contar linhas vs. `banco_id` distintos. Documentar o resultado — **insumo direto da Task 4a.3** (decide a PK de `FatoFinanceiroSaldo`, achado I1).
- [ ] **Step 4:** Documentar o critério "não pago" para `fato_financeiro_titulo`: com base nos valores reais de `situacao`/`situacao_divida_simples`, decidir se "não pago" é `dataPagamento == null` ou um valor específico de `situacaoSimples`. **Registrar o critério como uma frase literal e nomeada** (`CRITERIO_NAO_PAGO`) neste documento — as tasks 4d.5/4d.6/4d.7 copiam essa frase verbatim para o `where` do `findMany`.
- [ ] **Step 5:** Confirmar no `MODEL_CATALOG` (`src/worker/catalog/model-catalog.ts`) que `finan.fluxo.caixa`, `finan.pagamento.divida` e `finan.banco.saldo.hoje` estão presentes e com os `mode` da tabela 3.4 da spec (`incremental`/`incremental`/`snapshot`).
- [ ] **Step 6: Commit** — `git commit -m "docs(f4): descoberta das fontes do domínio financeiro"`

### Task 4a.3: Schema Prisma — modelos de fato e logs

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/.../migration.sql` (via `prisma migrate dev`)

- [ ] **Step 1:** Adicionar ao `schema.prisma` os 5 modelos abaixo. **Todos os campos monetários são `Decimal @db.Decimal(18,2)`** (achado I2 — alinha a `FatoEstoqueSaldo`; nunca `Float` para dinheiro). **Decisão N5: o campo `atualizadoEm` dos 3 fatos de financeiro recebe `@default(now())`** — assim o `createMany` dos builders **não precisa injetar `atualizadoEm` por linha**, removendo a ambiguidade do "espelhando `fato-estoque-saldo.ts`" na origem (`fato-estoque-saldo.ts` injeta `atualizadoEm: new Date()` por linha porque o campo não tem default; aqui escolhemos a opção mais simples — default no banco). A PK de `FatoFinanceiroSaldo` segue o resultado da Task 4a.2 Step 3 (achado I1):
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
  atualizadoEm   DateTime  @default(now()) @map("atualizado_em")
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
  atualizadoEm        DateTime  @default(now()) @map("atualizado_em")
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
  atualizadoEm     DateTime  @default(now()) @map("atualizado_em")
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

### Task 4a.4: `mcp/tsconfig.json` — autônomo, sem recompilar `src/` (achado N1)

**Files:**
- Create: `mcp/tsconfig.json`

> **Redesenho N1.** A v2 estendia o raiz e incluía `../src/**/*.ts` no
> `include` — errado: o raiz usa `moduleResolution: "bundler"` + `module:
> "esnext"`; redefinir para `nodenext` e **recompilar `src/**` inteiro** sob
> `nodenext` quebra em centenas de arquivos (imports sem extensão `.js`,
> `.tsx`). O `mcp/` **não deve compilar o `src/`** — deve apenas **resolver os
> tipos** dos módulos de `src/` que ele importa. Solução (Opção A da Review #2):
> `mcp/tsconfig.json` **não estende o raiz** e **não inclui `src/**`**; define
> `module/moduleResolution: nodenext`, `baseUrl: ".."` e `paths` para `@/*`. O
> `tsc` resolve os tipos de `@/...` via `paths` — os arquivos de `src/`
> efetivamente importados entram como **dependências**, não como raízes de
> compilação; arquivos `.tsx` de `src/` **não** entram (não são importados pelo
> `mcp/`). Sem `jsx` (o `mcp/` é Node puro).

- [ ] **Step 1:** Criar `mcp/tsconfig.json` **sem `extends`**:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022"],
      "module": "nodenext",
      "moduleResolution": "nodenext",
      "strict": true,
      "esModuleInterop": true,
      "resolveJsonModule": true,
      "skipLibCheck": true,
      "noEmit": true,
      "baseUrl": "..",
      "paths": { "@/*": ["src/*"] }
    },
    "include": ["**/*.ts"],
    "exclude": ["node_modules"]
  }
  ```
  Notas no próprio arquivo, em comentário JSONC ou em `mcp/SDK-NOTES.md`: (a) `include` cobre **só `mcp/`** — `**/*.ts` é relativo ao diretório do `mcp/tsconfig.json`; (b) **não** estende o raiz porque o raiz é `bundler`-mode; (c) sem `jsx` — `mcp/` não tem `.tsx`; (d) os tipos de `@/...` resolvem via `paths`, sem o `src/` ser raiz de compilação.
- [ ] **Step 2: Comprovação do desenho.** Rodar `npx tsc -p mcp/tsconfig.json` (ainda sem arquivos `mcp/*.ts` reais — a primeira prova efetiva é 4a.5). Expected: **nenhum erro** (compilação vazia válida). **Critério de N1:** quando 4a.5 introduzir o primeiro import `@/...`, `tsc -p mcp/tsconfig.json` **não pode emitir nenhum erro originado de um arquivo `.tsx` de `src/`** — se emitir, o `include` está errado e a 4a.4 deve ser revista.
- [ ] **Step 3: Commit** — `git commit -m "chore(f4): tsconfig autônomo do MCP (resolve @/ sem recompilar src)"`

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
- [ ] **Step 2: Primeira prova real do tsconfig N1.** `npx tsc -p mcp/tsconfig.json`. Expected: PASS — **valida o import transitivo de `@/` no build do `mcp`** (verificação dos achados C5/N1). Confirmar explicitamente: a saída **não** contém nenhum erro originado de arquivo `.tsx` de `src/` (se contiver, voltar a 4a.4).
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): client Prisma do MCP com URL de role dedicado"`

### Task 4a.6: `mcp/auth/service-token.ts` — validação constant-time

**Files:**
- Create: `mcp/auth/service-token.ts`
- Test: `mcp/auth/service-token.test.ts`

- [ ] **Step 1: Escrever o teste falhando.** `validateServiceToken(header)`: `Bearer <correto>` → `true`; `Bearer <errado>` → `false`; ausente/malformado → `false`; **`MCP_SERVICE_TOKEN` ausente do ambiente → `false`** (falha seguro, achado I11); usa `crypto.timingSafeEqual`.
- [ ] **Step 2:** Rodar — FAIL (módulo não existe).
- [ ] **Step 3:** Implementar: extrai o token do header `Authorization: Bearer`; se `process.env.MCP_SERVICE_TOKEN` for vazio/ausente → retorna `false`; compara via `crypto.timingSafeEqual`, tratando comprimentos diferentes sem vazar timing.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/auth/service-token.ts mcp/auth/service-token.test.ts` — PASS (achado N16 — lint do `mcp/` validado já nas tasks, não só no fim).
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): validação constant-time do service token"`

### Task 4a.7: `mcp/auth/user-context.ts` — resolução do `UserContext`

**Files:**
- Create: `mcp/auth/user-context.ts`
- Test: `mcp/auth/user-context.test.ts`

- [ ] **Step 1: Teste falhando.** `resolveUserContext(prisma, userId)`: usuário ativo → `{ userId, role, domains }` com `domains` de `UserDomainAccess`; usuário `isActive=false` → `null`; usuário inexistente → `null`. Usar `jest-mock-extended` para o prisma (padrão do projeto).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar: `prisma.user.findUnique` + `userDomainAccess.findMany`; espelha a checagem de `isActive` de `src/auth.ts`. Exportar o tipo `UserContext = { userId: string; role: PlatformRole; domains: ReportDomain[] }`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/auth/user-context.ts mcp/auth/user-context.test.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): resolução do UserContext a partir do banco"`

### Task 4a.8: `mcp/auth/session-store.ts` — `UserContext` por sessão

**Files:**
- Create: `mcp/auth/session-store.ts`
- Test: `mcp/auth/session-store.test.ts`

- [ ] **Step 1: Teste falhando.** Store em memória: `set(sessionId, ctx)`, `get(sessionId)`, `delete(sessionId)`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar com `Map`. **Comentário no topo do arquivo (achado M2):** "Store em memória — válido para instância única do container `mcp`. A F4 tem um único cliente (o agente F5) e o servidor é stateless quanto a conversa. Escalar para 2+ réplicas exigiria mover a sessão para Redis — endurecimento de F5."
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/auth/session-store.ts mcp/auth/session-store.test.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): store de UserContext por sessão (instância única)"`

### Task 4a.9: `mcp/lib/audit.ts` — gravação de audit

**Files:**
- Create: `mcp/lib/audit.ts`
- Test: `mcp/lib/audit.test.ts`

> **Achado N13:** o `rowCount` do audit precisa de uma regra de extração — o
> envelope de tool tem `dados` com `linhas`/`titulos`/`serie`/`contas` de
> tamanhos variados. Esta task fixa um helper de extração; o pipeline 4a.17 o
> usa. A regra é determinística, não "provavelmente `dados.linhas?.length`".

- [ ] **Step 1: Teste falhando.** Dois símbolos exportados:
  - `recordAudit(prisma, { userId, tool, params, outcome, rowCount?, durationMs? })` → `prisma.mcpAuditLog.create` chamado com os campos corretos.
  - `extractRowCount(output: unknown): number | null` — regra: se `output` tem a forma de envelope `{ estado, dados }` e `dados` é objeto, retorna o **tamanho do primeiro array encontrado** entre as chaves de `dados` na ordem `["linhas","titulos","serie","contas","top","familia","marca"]`; se nenhuma chave de array existir (ex.: `dados` só com escalares como `{ entrada, saida, saldo }`) → `0`; se `estado === "preparando"` ou `output` não é envelope → `null`. Teste cobre: envelope `ok` com `linhas` de 3 itens → `3`; envelope `ok` com `dados` só escalar → `0`; envelope `preparando` → `null`; `output` arbitrário → `null`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `recordAudit` e `extractRowCount`. `outcome` é a união `"ok" | "denied" | "error" | "invalid_input"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/lib/audit.ts mcp/lib/audit.test.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): gravação de McpAuditLog com extração de rowCount"`

### Task 4a.10: `mcp/lib/failure.ts` — mapeamento exceção → outcome

**Files:**
- Create: `mcp/lib/failure.ts`
- Test: `mcp/lib/failure.test.ts`

- [ ] **Step 1: Teste falhando.** `toOutcome(err)`: `ZodError` → `"invalid_input"`; erro de domínio negado (classe `DomainDeniedError`, exportada deste módulo) → `"denied"`; qualquer outra exceção → `"error"`. `safeErrorMessage(outcome)` devolve mensagem genérica ao agente sem vazar detalhe interno (spec 3.9).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `DomainDeniedError`, `toOutcome`, `safeErrorMessage`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/lib/failure.ts mcp/lib/failure.test.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): mapeamento de exceção para outcome do MCP"`

### Task 4a.11: `mcp/catalog/types.ts` — tipo `ToolEntry` (já com `sempreVisivel?`)

**Files:**
- Create: `mcp/catalog/types.ts`

> **Achado N9:** `sempreVisivel?` é parte do **contrato do tipo** — nasce aqui,
> na onda 4a, não em 4c.11. O `visibleTools`/`assertToolAllowed` de 4a.13 já o
> conhece; nenhuma onda posterior reabre este arquivo.

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
  /** Roles que podem ver/invocar a tool (gate por role). Ausente = sem gate de role. */
  gatedRoles?: ReadonlyArray<"super_admin" | "admin">;
  /**
   * Quando true, a tool aparece em tools/list para qualquer usuário,
   * independentemente de `dominio` (mas ainda sujeita a `gatedRoles`).
   * Usada por tools de domínio-neutro do Caminho 3 (registrar_lacuna,
   * bi_consulta_avancada). Ver Task 4a.13 e 4c.11.
   */
  sempreVisivel?: boolean;
  handler: (input: I, ctx: ToolHandlerCtx) => Promise<O>;
}
```

- [ ] **Step 2:** `npx tsc -p mcp/tsconfig.json` — PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): tipos do catálogo de tools do MCP (com sempreVisivel)"`

### Task 4a.12: `mcp/catalog/index.ts` — agregador do catálogo

**Files:**
- Create: `mcp/catalog/index.ts`

> Achado C4: task explícita que cria o catálogo. Contrato definido: cada `mcp/tools/<dominio>/index.ts` exporta `const <dominio>Tools: ToolEntry[]`; `mcp/catalog/index.ts` os concatena. Cada task de tool adiciona sua entrada ao `index.ts` do domínio.

- [ ] **Step 1:** Criar `mcp/catalog/index.ts` que importa os arrays de domínio (inicialmente arquivos ainda inexistentes — comentar os imports e a concatenação, deixando `export const catalogo: ToolEntry[] = [];`). À medida que cada `mcp/tools/<dominio>/index.ts` é criado (4c.3, 4d.0, 4c.11), descomentar o import e somar ao array. Documentar esse contrato num comentário no topo do arquivo. **Nota de fechamento do catálogo (achado N6):** o catálogo só é validado integralmente em 4f-4, que assertará a **contagem total de 14 tools** — se um subagente esquecer de descomentar um import, `tsc` passa, o servidor sobe, a tool só não aparece; 4f-4 é a rede de proteção.
- [ ] **Step 2:** `npx tsc -p mcp/tsconfig.json` — PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(f4): agregador do catálogo de tools do MCP"`

### Task 4a.13: `mcp/catalog/registry.ts` — registry + filtro RBAC

**Files:**
- Create: `mcp/catalog/registry.ts`
- Test: `mcp/catalog/registry.test.ts`

- [ ] **Step 1: Teste falhando.** `visibleTools(allTools, user)` — reusa `visibleDomains` de `@/lib/reports/domains`: `viewer` com domínio `estoque` vê só tools de estoque; `admin` vê tudo incl. `gatedRoles`; tool com `gatedRoles:["super_admin","admin"]` não aparece para `manager`/`viewer`; **tool com `sempreVisivel:true` aparece para qualquer usuário** (sujeita a `gatedRoles`, se houver). `assertToolAllowed(tool, user)` — camada 2: lança `DomainDeniedError` (de `mcp/lib/failure.ts`) se — **e só se** — a tool **não** é `sempreVisivel` **e** o domínio não está em `visibleDomains(user.role, user.domains)`; **e** lança também se `gatedRoles` está definido e não inclui `user.role` (vale inclusive para `sempreVisivel`).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `visibleTools` e `assertToolAllowed` honrando `sempreVisivel` e `gatedRoles` conforme o Step 1.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/catalog/` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): registry de catálogo com filtro de RBAC (camadas 1 e 2)"`

### Task 4a.14: `mcp/server.ts` — servidor HTTP + middleware de service token

**Files:**
- Create: `mcp/server.ts`
- Test: `mcp/server.test.ts`

> Achado C3: 4a.9 v1 era um épico — decomposta em 4a.14 / 4a.15 / 4a.16 / 4a.17.

- [ ] **Step 1: Teste falhando.** `createHttpServer()` devolve um `http.Server`; uma requisição sem header `Authorization` ou com token inválido → resposta HTTP 401, corpo nunca passa adiante; com token válido → segue para o próximo middleware (mock). Teste via injeção: a função aceita um `next` mockável.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/server.ts` exportando `createHttpServer(deps)`: cria `http.Server` cujo handler primeiro chama `validateServiceToken(req.headers.authorization)`; inválido → `res.writeHead(401)` + `res.end()`; válido → chama `next(req, res)`. `next` é o middleware de sessão (4a.15), injetado para teste.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/server.ts mcp/server.test.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): servidor HTTP do MCP com middleware de service token"`

### Task 4a.15: `mcp/server.ts` — middleware de resolução de sessão

**Files:**
- Modify: `mcp/server.ts`
- Test: `mcp/server.test.ts`

- [ ] **Step 1: Teste falhando.** `resolveSessionMiddleware(req, res, deps)`: na abertura de sessão lê `X-Mcp-User-Id`; chama `resolveUserContext`; se `null` → HTTP 403; se ok → grava no `session-store` indexado pelo `sessionId` (conforme `SDK-NOTES.md`) e segue. Header ausente → 403.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar o middleware em `mcp/server.ts`, conforme o mecanismo de sessão registrado em `SDK-NOTES.md` (4a.1).
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/server.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): middleware de resolução de sessão X-Mcp-User-Id"`

### Task 4a.16: `mcp/server.ts` — transport + registro do `McpServer`

**Files:**
- Modify: `mcp/server.ts`
- Test: `mcp/server.test.ts`

- [ ] **Step 1:** Implementar a montagem do `StreamableHTTPServerTransport` sobre o `http.Server` (conforme `SDK-NOTES.md`), e o registro do `McpServer` com as tools de `visibleTools(catalogo, user)` da sessão — `catalogo` de `mcp/catalog/index.ts` (vazio nesta onda; preenchido por 4c/4d/4e). `tools/list` reflete o catálogo filtrado.
- [ ] **Step 2: Teste de fumaça (achado N6).** Em `mcp/server.test.ts`: com `catalogo` vazio (estado real desta onda), montar o `McpServer` e exercer `tools/list` para um `UserContext` qualquer — deve devolver **lista vazia sem lançar exceção**. Isso comprova que o servidor sobe e responde `tools/list` mesmo antes de qualquer tool existir.
- [ ] **Step 3:** Rodar — PASS. `npx tsc -p mcp/tsconfig.json` — PASS. `npx eslint mcp/server.ts mcp/server.test.ts` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): transport Streamable HTTP e registro do McpServer"`

### Task 4a.17: `mcp/server.ts` — pipeline de `tools/call`

**Files:**
- Modify: `mcp/server.ts`
- Test: `mcp/server.test.ts`

> O pipeline é o coração do RBAC (camadas 2/6/7) — tem teste unitário próprio (achado C3).

- [ ] **Step 1: Teste falhando.** `handleToolCall(tool, rawInput, sessionId, deps)`: (1) recarrega `UserContext` via `resolveUserContext` — `null` → `outcome=denied`; (2) `assertToolAllowed(tool, user)` — lança → `outcome=denied`; (3) `tool.inputSchema.parse(rawInput)` — `ZodError` → `outcome=invalid_input`; (4) executa `tool.handler(input, { prisma, user })`; exceção → `outcome=error` via `toOutcome`/`safeErrorMessage`; (5) `recordAudit` chamado em **todos** os caminhos com `tool`, `userId`, `params`, `outcome`, `durationMs`, e `rowCount` extraído via `extractRowCount(output)` (de `mcp/lib/audit.ts`, 4a.9) **quando há output** — nos caminhos `denied`/`invalid_input`/`error` `rowCount` é `null`; (6) sucesso devolve o output validado por `outputSchema`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `handleToolCall` em `mcp/server.ts` e ligá-lo ao callback de `tools/call` do `McpServer`. `recordAudit` envolto em `try/catch` próprio (uma falha de audit não derruba a resposta — só loga). `rowCount` via `extractRowCount`.
- [ ] **Step 4:** Rodar — PASS. `npx eslint mcp/server.ts mcp/server.test.ts` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): pipeline de tools/call com RBAC, Zod e audit"`

> **Nota de integração (achado N11):** as tasks 4a.14–4a.17 testam cada
> middleware/pipeline **isoladamente** com mocks. Não há teste dos três
> encadeados num `http.Server` real nesta onda — a **primeira prova
> ponta-a-ponta** do servidor é o harness **4f-4**. Aceito e registrado: a onda
> 4a "fecha" com cobertura unitária; a integração real é 4f-4.

### Task 4a.18: `mcp/index.ts` — entrypoint

**Files:**
- Create: `mcp/index.ts`
- Modify: `package.json`

- [ ] **Step 1:** `mcp/index.ts`: lê env, monta o servidor (`createHttpServer` + middlewares + transport), faz `listen(3100)`, log de start.
- [ ] **Step 2:** Script `mcp` no `package.json`: `"mcp": "tsx --env-file=.env.local mcp/index.ts"`.
- [ ] **Step 3:** `npx tsc -p mcp/tsconfig.json` — PASS. `npx eslint mcp/index.ts` — PASS. Subir o servidor manualmente e confirmar log de start + `curl` sem token → 401.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): entrypoint do servidor MCP"`

---

## ONDA 4b — Camada de fatos de financeiro

### Task 4b.1: Registry de builders

**Files:**
- Create: `src/worker/fatos/registry.ts`
- Test: `src/worker/fatos/registry.test.ts`
- Modify: `src/worker/sync/processors.ts`

- [ ] **Step 1: Teste falhando.** `FATO_BUILDERS` é um array de `{ nome: string; cycle: "snapshot" | "incremental"; run: (prisma) => Promise<number> }`. `runBuilders(prisma, cycle)` roda só as entradas do `cycle` dado; **isola falha por builder** — para cada builder: `try { const n = await run(prisma); console.log(\`[worker] \${nome} reconstruído: \${n} linhas\`) } catch (err) { console.error(\`[worker] falha ao reconstruir \${nome}:\`, err) }` (achado I4 — replica o padrão dos três blocos `await import(...)` + `try/catch` de `processSnapshotCycle`). Teste verifica: (a) uma exceção num builder não impede os demais; (b) o `console.log`/`console.error` por builder sai (spy em `console`).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Criar `registry.ts` com os 3 builders de estoque atuais como entradas `cycle: "snapshot"` (`rebuildFatoEstoqueSaldo`, `rebuildFatoEstoqueMovimento`, `rebuildFatoProdutoParado`) e `runBuilders` com o `try/catch`+log por builder do Step 1.
- [ ] **Step 4: Edição de `processors.ts` ancorada por marcador textual (achado N14).** Em `processSnapshotCycle`: **localizar o comentário `// Fato provisório: reconstruir após o snapshot de estoque.saldo.hoje.`** e **substituir esse comentário e os três blocos seguintes** (cada um do tipo `const { rebuild... } = await import("../fatos/...")` + `try { ... } catch { ... }`, terminando no bloco do `rebuildFatoProdutoParado`) por uma única linha `await runBuilders(ctx.prisma, "snapshot");` ao fim da função. Em `processIncrementalCycle`: **localizar o `for` que itera o `catalog` de modelos incrementais**, e **após esse `for`** adicionar `await runBuilders(ctx.prisma, "incremental");` envolto em `try { ... } catch (err) { console.error("[worker] falha ao rodar builders incrementais:", err); }` (achado I5 — a chamada vem depois do loop, para o `raw` estar atualizado; o erro do agregador não derruba o ciclo).
- [ ] **Step 5:** Rodar `npx jest src/worker` — Expected: PASS, sem regressão nos builders de estoque.
- [ ] **Step 6: Commit** — `git commit -m "refactor(f4): registry de builders de fato no worker"`

### Task 4b.2: `fato-financeiro-saldo.ts`

**Files:**
- Create: `src/worker/fatos/fato-financeiro-saldo.ts`
- Test: `src/worker/fatos/fato-financeiro-saldo.test.ts`
- Modify: `src/worker/fatos/registry.ts`

- [ ] **Step 1: Teste falhando.** `mapSaldoFinanceiroRow(raw)` mapeia uma linha de `raw_finan_banco_saldo_hoje` → forma de `FatoFinanceiroSaldo` (PK conforme 4a.3, via `relId(banco_id)`; `bancoNome` via `relNome`; `tipo`, `dataReferencia`, valores monetários como `number`). **O mapper NÃO produz `atualizadoEm`** — esse campo tem `@default(now())` no schema (decisão N5, Task 4a.3). `rebuildFatoFinanceiroSaldo(prisma)` filtra `rawDeleted=false`, faz `deleteMany`+`createMany` em `$transaction` e chama `markFatoBuilt(tx, "fato_financeiro_saldo")` **dentro** do `$transaction` (achado I3).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3: Implementar espelhando `fato-estoque-saldo.ts`, com UMA divergência explícita.** Estrutura idêntica a `rebuildFatoEstoqueSaldo` (`fato-estoque-saldo.ts:81-102`): `findMany({ where: { rawDeleted: false } })` → `map(mapSaldoFinanceiroRow)` → `$transaction(async (tx) => { deleteMany; if (mapped.length) createMany; markFatoBuilt(tx, ...) })`. **Divergência N5 — o `createMany` NÃO injeta `atualizadoEm`:** onde `fato-estoque-saldo.ts:95` faz `data: mapped.map((m) => ({ ...m, atualizadoEm: new Date() }))` (porque lá o campo não tem default), aqui é `data: mapped`, pois `atualizadoEm` tem `@default(now())` no schema. Usar `relId`/`relNome` de `odoo-relational.ts`. Campos monetários gravados como `number` — o Prisma converte para `Decimal` na coluna.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Registrar a entrada `{ nome: "fato_financeiro_saldo", cycle: "snapshot", run: rebuildFatoFinanceiroSaldo }` em `registry.ts` (adicionar ao array `FATO_BUILDERS`).
- [ ] **Step 6:** `npx eslint src/worker/fatos/fato-financeiro-saldo.ts src/worker/fatos/fato-financeiro-saldo.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): builder fato_financeiro_saldo"`

### Task 4b.3: `fato-financeiro-movimento.ts`

**Files:**
- Create: `src/worker/fatos/fato-financeiro-movimento.ts`
- Test: `src/worker/fatos/fato-financeiro-movimento.test.ts`
- Modify: `src/worker/fatos/registry.ts`

- [ ] **Step 1: Teste falhando.** `mapMovimentoRow(raw)` mapeia `raw_finan_fluxo_caixa` → `FatoFinanceiroMovimento` (PK `odooId` via `Number(raw.id)`; `data`, `contaId`/`contaNome` e `centroResultado*` via `relId`/`relNome`; `entrada`/`saida`/`valor`/`*Prevista` como `number`; `natureza` **se** a Task 4a.2 indicou linhas distintas). **O mapper NÃO produz `atualizadoEm`** (decisão N5 — `@default(now())`). `rebuildFatoFinanceiroMovimento(prisma)` filtra `rawDeleted=false`, `deleteMany`+`createMany` em `$transaction` + `markFatoBuilt(tx, "fato_financeiro_movimento")` dentro da transação.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar espelhando `fato-estoque-saldo.ts` **com a mesma divergência N5 da Task 4b.3 Step 3**: o `createMany` recebe `data: mapped` (sem `{ ...m, atualizadoEm }`).
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Registrar `{ nome: "fato_financeiro_movimento", cycle: "incremental", run: rebuildFatoFinanceiroMovimento }` em `registry.ts`.
- [ ] **Step 6:** `npx eslint src/worker/fatos/fato-financeiro-movimento.ts src/worker/fatos/fato-financeiro-movimento.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): builder fato_financeiro_movimento"`

### Task 4b.4: `fato-financeiro-titulo.ts`

**Files:**
- Create: `src/worker/fatos/fato-financeiro-titulo.ts`
- Test: `src/worker/fatos/fato-financeiro-titulo.test.ts`
- Modify: `src/worker/fatos/registry.ts`

- [ ] **Step 1: Teste falhando.** `mapTituloRow(raw)` mapeia `raw_finan_pagamento_divida` → `FatoFinanceiroTitulo`: PK `odooId`; `tipo` (`a_pagar`/`a_receber`) derivado de `tipo`/`sinal` conforme os valores reais da Task 4a.2; `participante*`/`conta*` via `relId`/`relNome`; datas; `situacao`/`situacaoSimples` como `String`; valores monetários como `number`. **`diasAtraso` NÃO é coluna** — não mapear. **O mapper NÃO produz `atualizadoEm`** (decisão N5). `rebuildFatoFinanceiroTitulo(prisma)` filtra `rawDeleted=false`, `deleteMany`+`createMany` em `$transaction` + `markFatoBuilt(tx, "fato_financeiro_titulo")` dentro.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar espelhando `fato-estoque-saldo.ts` **com a divergência N5**: `createMany` recebe `data: mapped`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Registrar `{ nome: "fato_financeiro_titulo", cycle: "incremental", run: rebuildFatoFinanceiroTitulo }` em `registry.ts`.
- [ ] **Step 6:** `npx eslint src/worker/fatos/fato-financeiro-titulo.ts src/worker/fatos/fato-financeiro-titulo.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): builder fato_financeiro_titulo"`

---

## ONDA 4c — Estoque

> **Achados I6/N2:** a reestruturação da camada de query é decomposta em
> **1 + 12 tasks de extração** — 4c.0 (cria o módulo) + para cada um dos 6
> relatórios **duas tasks**: `-extr` (extrai o núcleo + testa o núcleo) e
> `-wrap` (reescreve o wrapper + poda o teste antigo). N2: cada operação de
> risco distinto é uma task verificável isoladamente — a extração do núcleo é
> risco médio, a reescrita do wrapper (onde a F3 regride) é risco alto e tem
> seu próprio PASS.
> **Achado C2/N3:** a verificação `estadoDoFato` **permanece no wrapper
> `report-data.ts`**; o núcleo `estoque.ts` não a contém. O núcleo **não
> captura exceção** — deixa propagar; o `try { } catch { estado:"erro" }`
> permanece **só** no wrapper.
> **Achado N9:** 4c.0 → as 12 tasks `-extr`/`-wrap` são **estritamente
> sequenciais** (editam os mesmos 4 arquivos).

### Task 4c.0: Criação do módulo-núcleo de query de estoque

**Files:**
- Create: `src/lib/reports/queries/estoque.ts`
- Create: `src/lib/reports/queries/estoque.test.ts`

- [ ] **Step 1:** Criar `src/lib/reports/queries/estoque.ts` — **sem `"use server"`** — com um comentário de topo que fixa o contrato: "Núcleo de agregação de estoque, framework-neutro. Cada função recebe `prisma` + filtros e devolve dado de agregação cru — **sem `estado`, sem `freshness`, sem shaping de gráfico**. **Não captura exceção** (deixa propagar — quem trata é o wrapper). `estadoDoFato`/`reportFreshness` vivem no wrapper `report-data.ts`, não aqui."
- [ ] **Step 2 (redação afirmativa — achado N15):** o núcleo **importa** `limparNomeLocal` de `@/lib/reports/local-nome` e a usa nas agregações que precisam de rótulo de local — `limparNomeLocal` **permanece** em seu módulo atual, **não é movida**. O que **não vai** para o núcleo: `agruparTopN` (`report-data.ts`, função local entre `getRelatorioTopMovimentados` e `getRelatorioConcentracao`) e as constantes `TOP_N`/`TOP_CONCENTRACAO` — são **shaping de gráfico** e **permanecem no wrapper `report-data.ts`**. Decisão escrita: o núcleo contém só agregação; todo recorte/agrupamento para exibição fica no wrapper.
- [ ] **Step 3:** Criar `estoque.test.ts` com um `describe` por função-núcleo a criar (`querySaldoProduto`, `queryValorArmazem`, `queryEntradasSaidas`, `queryProdutosParados`, `queryTopMovimentados`, `queryConcentracao`) — corpo vazio, preenchido pelas tasks `-extr`.
- [ ] **Step 4:** `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): cria módulo-núcleo de query de estoque"`

### Task 4c.1a-extr: Extrair `querySaldoProduto` (núcleo) — R1

**Files:**
- Modify: `src/lib/reports/queries/estoque.ts`, `src/lib/reports/queries/estoque.test.ts`

> Fato consultado por R1 (`estadoDoFato` do wrapper): **`fato_estoque_saldo`**.

- [ ] **Step 1:** Em `estoque.ts`, criar `querySaldoProduto(prisma: PrismaClient, filtros: { armazemId?: number; familiaId?: number }): Promise<SaldoProdutoData>`. Mover para esta função o **miolo de agregação** de `getRelatorioSaldoProduto` — marcador textual: do `const rows = await prisma.fatoEstoqueSaldo.findMany({` (logo após o comentário `// groupBy não suporta _count(distinct)`) **até** o `return { estado, dados, freshness };`, **trocando** esse `return` por `return dados;`. Inclui: o `findMany` com o `where` por `armazemId`/`familiaId`, o `Map` de agregação por `produtoId`, a montagem de `linhas`, o cálculo de `totalProdutos`/`produtosNegativos`/`valorTotal` e o objeto `dados`. **Não** inclui: `requireReport`, `guardDominio`, `reportFreshness`, `estadoDoFato`, o objeto `vazio`, o `try/catch`, a derivação de `estado`.
- [ ] **Step 2:** Mover os tipos `DetalhePorLocal`, `SaldoProdutoRow`, `SaldoProdutoKpis`, `SaldoProdutoData` de `report-data.ts` para `estoque.ts`; em `report-data.ts` reexportá-los: `export type { DetalhePorLocal, SaldoProdutoRow, SaldoProdutoKpis, SaldoProdutoData } from "@/lib/reports/queries/estoque";`.
- [ ] **Step 3:** Em `estoque.test.ts`, preencher o `describe("querySaldoProduto")`: testar a agregação por `produtoId`, os KPIs, o drill-down `detalhePorLocal` por local, o filtro `armazemId`/`familiaId`. Mock do prisma via `jest-mock-extended`. **Não tocar `report-data.ts` nesta task** — o wrapper ainda referencia o código antigo; a compilação dele quebra temporariamente e é consertada na task `-wrap` seguinte. Por isso a verificação aqui é só `npx jest src/lib/reports/queries/estoque.test.ts`.
- [ ] **Step 4:** `npx jest src/lib/reports/queries/estoque.test.ts` — PASS (o teste do núcleo passa isoladamente).
- [ ] **Step 5: Commit** — `git commit -m "refactor(f4): extrai querySaldoProduto para o núcleo"`

### Task 4c.1a-wrap: Reescrever o wrapper `getRelatorioSaldoProduto` — R1

**Files:**
- Modify: `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`

> Wrapper atual: função `getRelatorioSaldoProduto` em `report-data.ts`
> (intervalo de referência **linhas 85-200** na v3 do arquivo lido). **Risco
> alto** — é onde a F3 regride se errar. **Checklist literal do que preservar
> (achado N2):** (a) o objeto `vazio: SaldoProdutoData` exatamente como hoje
> (`{ kpis: { totalProdutos: 0, produtosNegativos: 0, valorTotal: 0 }, linhas:
> [] }`); (b) `freshness` chamado via `reportFreshness(prisma, entry)` e passado
> em **todos** os returns de sucesso; (c) a regra `estado: linhas.length === 0
> ? "vazio" : "ok"`; (d) o ramo `"preparando"` quando `estadoDoFato(...) ===
> "preparando"`, devolvendo `{ estado: "preparando", dados: vazio, freshness
> }`; (e) o `try { } catch { return { estado: "erro", dados: vazio, freshness:
> null }; }`.

- [ ] **Step 1:** Substituir o **corpo** de `getRelatorioSaldoProduto` em `report-data.ts` por este wrapper literal (mantendo a assinatura `(filtros: ReportFilterValues): Promise<ReportResult<SaldoProdutoData>>` e o `import { querySaldoProduto } from "@/lib/reports/queries/estoque";`):
  ```ts
  export async function getRelatorioSaldoProduto(
    filtros: ReportFilterValues,
  ): Promise<ReportResult<SaldoProdutoData>> {
    const vazio: SaldoProdutoData = {
      kpis: { totalProdutos: 0, produtosNegativos: 0, valorTotal: 0 },
      linhas: [],
    };
    try {
      const entry = requireReport("saldo-produto");
      await guardDominio(entry.dominio);
      const freshness = await reportFreshness(prisma, entry);
      const base = await estadoDoFato("fato_estoque_saldo");
      if (base === "preparando") {
        return { estado: "preparando", dados: vazio, freshness };
      }
      const dados = await querySaldoProduto(prisma, {
        armazemId: filtros.armazemId,
        familiaId: filtros.familiaId,
      });
      const estado: ReportState = dados.linhas.length === 0 ? "vazio" : "ok";
      return { estado, dados, freshness };
    } catch {
      return { estado: "erro", dados: vazio, freshness: null };
    }
  }
  ```
- [ ] **Step 2:** Em `report-data.test.ts`: **podar** o teste antigo de agregação de R1 (o que verificava o `Map` por `produtoId`, KPIs e drill-down — esse comportamento agora é coberto por `estoque.test.ts`, task 4c.1a-extr). **Manter/ajustar** os testes do wrapper de R1: ramo `"preparando"` quando `estadoDoFato` devolve `"preparando"`; ramo `"erro"` quando uma dependência lança; `freshness` presente no retorno; `estado` `"vazio"` vs `"ok"` conforme `dados.linhas.length`. O teste do wrapper **mocka `querySaldoProduto`** (via `jest.spyOn` no módulo `@/lib/reports/queries/estoque` — `ts-jest`/transform CJS, o spy funciona, ver N7) para não reexecutar a agregação.
- [ ] **Step 3:** `npx jest src/lib` — PASS. `npx tsc --noEmit` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): getRelatorioSaldoProduto vira wrapper do núcleo"`

### Task 4c.1b-extr: Extrair `queryValorArmazem` (núcleo) — R2

**Files:**
- Modify: `src/lib/reports/queries/estoque.ts`, `src/lib/reports/queries/estoque.test.ts`

> Fato consultado por R2: **`fato_estoque_saldo`**.
> **Regra de `percentual` (achados N8) — CANÔNICA para toda a onda 4c:** o
> `percentual` é **shaping de apresentação** (spec 3.5.1) e **fica FORA do
> núcleo**. O núcleo devolve só dado de agregação cru; `percentual` é calculado
> pelo wrapper F3 **e** pela tool MCP. Esta task e a 4c.1f-extr seguem a mesma
> regra (a v2 divergia: 4c.1f punha `percentual` no núcleo — corrigido).

- [ ] **Step 1:** Em `estoque.ts`, criar `queryValorArmazem(prisma: PrismaClient): Promise<{ kpis: { valorTotal: number; numArmazens: number }; linhasBruto: { armazem: string; valor: number; numProdutos: number }[] }>`. Mover o miolo de `getRelatorioValorPorArmazem` — marcador textual: do `const rows = await prisma.fatoEstoqueSaldo.findMany({ where: { vrSaldo: { gt: 0 } } ...` **até** o cálculo de `linhasBruto` (a lista ordenada por `valor` desc com `armazem`/`valor`/`numProdutos`) e `valorTotal`/`mapa.size`. **Não move:** o cálculo de `percentual` por linha nem o `top8` — ambos são shaping e ficam no wrapper. R2 não usa filtros (`_filtros`) → a função-núcleo não recebe `filtros`.
- [ ] **Step 2:** Mover os tipos `ValorArmazemRow`, `ValorArmazemKpis`, `ValorArmazemData` para `estoque.ts`, reexportar de `report-data.ts`.
- [ ] **Step 3:** Em `estoque.test.ts`, preencher `describe("queryValorArmazem")`: agregação por `localNome` (via `limparNomeLocal`), `valorTotal`, `numArmazens`, ordenação de `linhasBruto`. Verificação: `npx jest src/lib/reports/queries/estoque.test.ts` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): extrai queryValorArmazem para o núcleo"`

### Task 4c.1b-wrap: Reescrever o wrapper `getRelatorioValorPorArmazem` — R2

**Files:**
- Modify: `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`

> Wrapper atual: `getRelatorioValorPorArmazem` (referência **linhas 292-360**).
> Fato: **`fato_estoque_saldo`**. Checklist literal a preservar: objeto `vazio:
> ValorArmazemData` (`{ kpis: { valorTotal: 0, numArmazens: 0 }, linhas: [],
> top8: [] }`); `freshness` em todo return de sucesso; ramo `"preparando"`;
> regra `estado: linhas.length === 0 ? "vazio" : "ok"`; `try/catch` →
> `"erro"`. **O wrapper calcula `percentual` e `top8`** (shaping) a partir de
> `linhasBruto`.

- [ ] **Step 1:** Substituir o corpo de `getRelatorioValorPorArmazem` por um wrapper que: monta `vazio`; `try` → `requireReport("valor-armazem")` + `guardDominio` + `reportFreshness` + `estadoDoFato("fato_estoque_saldo")` (ramo `"preparando"`); `const { kpis, linhasBruto } = await queryValorArmazem(prisma);`; calcula `linhas: ValorArmazemRow[]` aplicando `percentual: kpis.valorTotal > 0 ? (l.valor / kpis.valorTotal) * 100 : 0` por linha; calcula `top8 = linhasBruto.slice(0, 8).map((l) => ({ rotulo: l.armazem, valor: l.valor }))`; `estado` por `linhas.length`; `return { estado, dados: { kpis, linhas, top8 }, freshness }`; `catch` → `"erro"`/`vazio`.
- [ ] **Step 2:** Em `report-data.test.ts`: podar o teste de agregação de R2; manter/ajustar os do wrapper (preparando/erro/freshness/`percentual` calculado/`top8`), mockando `queryValorArmazem`.
- [ ] **Step 3:** `npx jest src/lib` — PASS. `npx tsc --noEmit` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): getRelatorioValorPorArmazem vira wrapper do núcleo"`

### Task 4c.1c-extr: Extrair `queryEntradasSaidas` (núcleo) — R3

**Files:**
- Modify: `src/lib/reports/queries/estoque.ts`, `src/lib/reports/queries/estoque.test.ts`

> Fato consultado por R3: **`fato_estoque_movimento`**.

- [ ] **Step 1:** Criar `queryEntradasSaidas(prisma: PrismaClient, filtros: { periodoDe?: string; periodoAte?: string; armazemId?: number }): Promise<EntradasSaidasData>`. Mover o miolo de `getRelatorioEntradasSaidas` — marcador textual: do `const where = {` (a montagem do `where` por período/`armazemId`) **até** o objeto `dados: EntradasSaidasData = { serie, detalhe }`, retornando `dados`. Inclui os dois `groupBy` (`fatoEstoqueMovimento`) e a montagem de `serie`/`detalhe`.
- [ ] **Step 2:** Mover os tipos `MovimentoMes`, `DetalheMovimento`, `EntradasSaidasData` para `estoque.ts`, reexportar.
- [ ] **Step 3:** Preencher `describe("queryEntradasSaidas")` em `estoque.test.ts`: série por mês×sentido, detalhe por mês×sentido×produto, filtro de período. Verificação: `npx jest src/lib/reports/queries/estoque.test.ts` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): extrai queryEntradasSaidas para o núcleo"`

### Task 4c.1c-wrap: Reescrever o wrapper `getRelatorioEntradasSaidas` — R3

**Files:**
- Modify: `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`

> Wrapper atual: `getRelatorioEntradasSaidas` (referência **linhas 363-419**).
> Fato: **`fato_estoque_movimento`**. Checklist: objeto `vazio: EntradasSaidasData`
> (`{ serie: [], detalhe: [] }`); `freshness`; ramo `"preparando"`; regra
> `estado: serie.length === 0 ? "vazio" : "ok"` (R3 usa `serie.length`, não
> `linhas.length` — preservar exatamente); `try/catch` → `"erro"`.

- [ ] **Step 1:** Substituir o corpo de `getRelatorioEntradasSaidas` por wrapper: `vazio`; `try` → `requireReport("entradas-saidas")` + `guardDominio` + `reportFreshness` + `estadoDoFato("fato_estoque_movimento")` (ramo preparando); `const dados = await queryEntradasSaidas(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte, armazemId: filtros.armazemId });`; `const estado: ReportState = dados.serie.length === 0 ? "vazio" : "ok";`; `return { estado, dados, freshness }`; `catch` → `"erro"`/`vazio`.
- [ ] **Step 2:** Em `report-data.test.ts`: podar o teste de agregação de R3; manter/ajustar os do wrapper, mockando `queryEntradasSaidas`.
- [ ] **Step 3:** `npx jest src/lib` — PASS. `npx tsc --noEmit` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): getRelatorioEntradasSaidas vira wrapper do núcleo"`

### Task 4c.1d-extr: Extrair `queryProdutosParados` (núcleo) — R4

**Files:**
- Modify: `src/lib/reports/queries/estoque.ts`, `src/lib/reports/queries/estoque.test.ts`

> Fato consultado por R4: **`fato_produto_parado`**.

- [ ] **Step 1:** Criar `queryProdutosParados(prisma: PrismaClient, filtros: { faixaDias?: number; armazemId?: number }): Promise<ProdutoParadoData>`. Mover o miolo de `getRelatorioProdutoParado` — marcador textual: do `const rows = await prisma.fatoProdutoParado.findMany({` **até** o objeto `dados: ProdutoParadoData = { kpis, total, linhas }`, retornando `dados`. Inclui `where` (`saldo: { gt: 0 }`, `faixaDias`, `armazemId`), `map` de `linhas`, `valorImobilizado`.
- [ ] **Step 2:** Mover os tipos `ProdutoParadoRow`, `ProdutoParadoKpis`, `ProdutoParadoData` para `estoque.ts`, reexportar.
- [ ] **Step 3:** Preencher `describe("queryProdutosParados")`: filtros, `valorImobilizado`, ordenação por `dias` desc. Verificação: `npx jest src/lib/reports/queries/estoque.test.ts` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): extrai queryProdutosParados para o núcleo"`

### Task 4c.1d-wrap: Reescrever o wrapper `getRelatorioProdutoParado` — R4

**Files:**
- Modify: `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`

> Wrapper atual: `getRelatorioProdutoParado` (referência **linhas 422-468**).
> Fato: **`fato_produto_parado`**. Checklist: objeto `vazio: ProdutoParadoData`
> (`{ kpis: { totalParados: 0, valorImobilizado: 0 }, total: 0, linhas: [] }`);
> `freshness`; ramo `"preparando"`; regra `estado: linhas.length === 0 ?
> "vazio" : "ok"`; `try/catch` → `"erro"`.

- [ ] **Step 1:** Substituir o corpo de `getRelatorioProdutoParado` por wrapper: `vazio`; `try` → `requireReport("produtos-parados")` + `guardDominio` + `reportFreshness` + `estadoDoFato("fato_produto_parado")` (ramo preparando); `const dados = await queryProdutosParados(prisma, { faixaDias: filtros.faixaDias, armazemId: filtros.armazemId });`; `estado` por `dados.linhas.length`; `return { estado, dados, freshness }`; `catch` → `"erro"`/`vazio`.
- [ ] **Step 2:** Em `report-data.test.ts`: podar o teste de agregação de R4; manter/ajustar os do wrapper, mockando `queryProdutosParados`.
- [ ] **Step 3:** `npx jest src/lib` — PASS. `npx tsc --noEmit` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): getRelatorioProdutoParado vira wrapper do núcleo"`

### Task 4c.1e-extr: Extrair `queryTopMovimentados` (núcleo) — R5

**Files:**
- Modify: `src/lib/reports/queries/estoque.ts`, `src/lib/reports/queries/estoque.test.ts`

> Fato consultado por R5: **`fato_estoque_movimento`**.

- [ ] **Step 1:** Criar `queryTopMovimentados(prisma: PrismaClient, filtros: { periodoDe?: string; periodoAte?: string; sentido?: string }): Promise<{ kpis: { totalProdutos: number; totalUnidades: number }; linhas: { rotulo: string; valor: number }[] }>`. Mover o miolo de `getRelatorioTopMovimentados` — marcador textual: do `const grupos = await prisma.fatoEstoqueMovimento.groupBy({ by: ["produtoNome"]` **até** a montagem de `linhas` ordenada e `kpis` (`totalProdutos`, `totalUnidades`). **Não move:** `const barras = linhas.slice(0, TOP_N)` — é shaping de gráfico, fica no wrapper. O núcleo devolve a lista completa `linhas`.
- [ ] **Step 2:** Mover os tipos `TopMovimentadoBar`, `TopMovimentadoKpis`, `TopMovimentadoData` para `estoque.ts`, reexportar.
- [ ] **Step 3:** Preencher `describe("queryTopMovimentados")`: agregação por `produtoNome`, ordenação, KPIs, filtros. Verificação: `npx jest src/lib/reports/queries/estoque.test.ts` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): extrai queryTopMovimentados para o núcleo"`

### Task 4c.1e-wrap: Reescrever o wrapper `getRelatorioTopMovimentados` — R5

**Files:**
- Modify: `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`

> Wrapper atual: `getRelatorioTopMovimentados` (referência **linhas 471-517**).
> Fato: **`fato_estoque_movimento`**. Checklist: objeto `vazio:
> TopMovimentadoData` (`{ kpis: { totalProdutos: 0, totalUnidades: 0 },
> barras: [], linhas: [] }`); `freshness`; ramo `"preparando"`; regra `estado:
> linhas.length === 0 ? "vazio" : "ok"`; `try/catch` → `"erro"`. **O wrapper
> calcula `barras = linhas.slice(0, TOP_N)`** (shaping); `TOP_N` permanece
> constante de `report-data.ts`.

- [ ] **Step 1:** Substituir o corpo de `getRelatorioTopMovimentados` por wrapper: `vazio`; `try` → `requireReport("top-movimentados")` + `guardDominio` + `reportFreshness` + `estadoDoFato("fato_estoque_movimento")` (ramo preparando); `const { kpis, linhas } = await queryTopMovimentados(prisma, { periodoDe: filtros.periodoDe, periodoAte: filtros.periodoAte, sentido: filtros.sentido });`; `const barras = linhas.slice(0, TOP_N);`; `estado` por `linhas.length`; `return { estado, dados: { kpis, barras, linhas }, freshness }`; `catch` → `"erro"`/`vazio`.
- [ ] **Step 2:** Em `report-data.test.ts`: podar o teste de agregação de R5; manter/ajustar os do wrapper (incl. verificação de que `barras` é o top-`TOP_N`), mockando `queryTopMovimentados`.
- [ ] **Step 3:** `npx jest src/lib` — PASS. `npx tsc --noEmit` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): getRelatorioTopMovimentados vira wrapper do núcleo"`

### Task 4c.1f-extr: Extrair `queryConcentracao` (núcleo) — R6

**Files:**
- Modify: `src/lib/reports/queries/estoque.ts`, `src/lib/reports/queries/estoque.test.ts`

> Fato consultado por R6: **`fato_estoque_saldo`**.
> **Regra de `percentual` — alinhada a 4c.1b-extr (achado N8):** `percentual`
> é shaping e **NÃO entra no núcleo**. O núcleo devolve só os dados brutos
> agregados; `percentual` e `agruparTopN` são calculados no wrapper e na tool.
> A v2 punha `percentual` no núcleo aqui — corrigido para a regra única.

- [ ] **Step 1:** Criar `queryConcentracao(prisma: PrismaClient): Promise<{ familiasBruto: { rotulo: string; valor: number }[]; marcasBruto: { rotulo: string; valor: number }[] }>`. Mover o miolo de `getRelatorioConcentracao` — marcador textual: dos dois `groupBy` (`const porFamilia = await prisma.fatoEstoqueSaldo.groupBy({ by: ["familiaNome"]` e `const porMarca = ...`) **até** a montagem de `familiasBruto` e `marcasBruto` (as listas ordenadas por `valor` desc, com `rotulo`/`valor`). **Não move:** o cálculo de `totalFamilia`/`totalMarca`, o `tabelaFamilia`/`tabelaMarca` (que carregam `percentual`), nem `agruparTopN` — tudo isso é shaping e fica no wrapper.
- [ ] **Step 2:** Mover os tipos `ConcentracaoFamiliaRow`, `ConcentracaoMarcaRow`, `ConcentracaoData` para `estoque.ts`, reexportar.
- [ ] **Step 3:** Preencher `describe("queryConcentracao")`: agregação por `familiaNome`/`marcaNome`, `rotulo` `"Não classificado"` quando nulo, ordenação. **O teste do núcleo NÃO testa `percentual`** (percentual é shaping, testado no nível do wrapper/tool). Verificação: `npx jest src/lib/reports/queries/estoque.test.ts` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): extrai queryConcentracao para o núcleo"`

### Task 4c.1f-wrap: Reescrever o wrapper `getRelatorioConcentracao` — R6

**Files:**
- Modify: `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`

> Wrapper atual: `getRelatorioConcentracao` (referência **linhas 539-609**).
> Fato: **`fato_estoque_saldo`**. Checklist: objeto `vazio: ConcentracaoData`
> (`{ familia: [], tabelaFamilia: [], marca: [], tabelaMarca: [] }`);
> `freshness`; ramo `"preparando"`; regra `estado: dados.familia.length === 0
> && dados.marca.length === 0 ? "vazio" : "ok"` (R6 tem regra própria — duas
> listas — preservar exatamente); `try/catch` → `"erro"`. **O wrapper calcula
> `totalFamilia`/`totalMarca`, `tabelaFamilia`/`tabelaMarca` com `percentual`,
> e aplica `agruparTopN`** sobre `familiasBruto`/`marcasBruto` para `familia`/
> `marca`. `agruparTopN`, `TOP_CONCENTRACAO` permanecem em `report-data.ts`.

- [ ] **Step 1:** Substituir o corpo de `getRelatorioConcentracao` por wrapper: `vazio`; `try` → `requireReport("concentracao")` + `guardDominio` + `reportFreshness` + `estadoDoFato("fato_estoque_saldo")` (ramo preparando); `const { familiasBruto, marcasBruto } = await queryConcentracao(prisma);`; calcular `totalFamilia`/`totalMarca` (`reduce`), montar `tabelaFamilia: ConcentracaoFamiliaRow[]` (`{ familia: r.rotulo, valor: r.valor, percentual: totalFamilia > 0 ? (r.valor/totalFamilia)*100 : 0 }`) e `tabelaMarca` análogo; `const dados: ConcentracaoData = { familia: agruparTopN(familiasBruto), tabelaFamilia, marca: agruparTopN(marcasBruto), tabelaMarca };`; `const estado: ReportState = dados.familia.length === 0 && dados.marca.length === 0 ? "vazio" : "ok";`; `return { estado, dados, freshness }`; `catch` → `"erro"`/`vazio`.
- [ ] **Step 2:** Em `report-data.test.ts`: podar o teste de agregação de R6; manter/ajustar os do wrapper (incl. `percentual` calculado e `agruparTopN` aplicado), mockando `queryConcentracao`.
- [ ] **Step 3:** `npx jest src/lib` — PASS. `npx tsc --noEmit` — PASS. `npx eslint src/lib/actions/report-data.ts src/lib/reports/queries/estoque.ts` — PASS (todas as 12 tasks de extração concluídas; lint dos dois arquivos).
- [ ] **Step 4: Commit** — `git commit -m "refactor(f4): getRelatorioConcentracao vira wrapper do núcleo"`

### Task 4c.2: `mcp/lib/freshness.ts` — `withFreshness` + `FATO_FONTE`

**Files:**
- Create: `mcp/lib/freshness.ts`, `mcp/lib/freshness.test.ts`

> Reordenada para **antes** das tools de estoque (achado M5). Achado I8: o mapa
> `FATO_FONTE` é criado aqui.
> **Achado N4:** fontes incrementais não preenchem `SyncState.lastSnapshotAt` —
> `FATO_FONTE` carrega o **modo** da fonte para `withFreshness` escolher a
> coluna certa do `SyncState`.
> **Achado N3:** `withFreshness`/"preparando" e o `estadoDoFato` do wrapper F3
> são as **duas faces do mesmo conceito** — esta task documenta a gemelaridade.
> **Achado N12:** quem decide `"vazio"` é definido explicitamente abaixo.

- [ ] **Step 1:** Criar a constante `FATO_FONTE: Record<string, { model: string; mode: "snapshot" | "incremental" }>` (fato → fonte do `SyncState`, com modo):
  ```ts
  export const FATO_FONTE: Record<string, { model: string; mode: "snapshot" | "incremental" }> = {
    fato_estoque_saldo:        { model: "estoque.saldo.hoje",       mode: "snapshot" },
    fato_estoque_movimento:    { model: "estoque.extrato",          mode: "incremental" },
    fato_produto_parado:       { model: "estoque.saldo.hoje",       mode: "snapshot" },
    fato_financeiro_saldo:     { model: "finan.banco.saldo.hoje",   mode: "snapshot" },
    fato_financeiro_movimento: { model: "finan.fluxo.caixa",        mode: "incremental" },
    fato_financeiro_titulo:    { model: "finan.pagamento.divida",   mode: "incremental" },
  };
  ```
  Comentário no arquivo: "Quando um fato é usado junto de outros, `fonteStatus` reporta a fonte **mais defasada** (a sync mais antiga). `mode` decide a coluna do `SyncState`: `snapshot` → `lastSnapshotAt`, `incremental` → `lastIncrementalAt` — fontes incrementais nunca preenchem `lastSnapshotAt` (achado N4). Confirmar o `model` de `estoque.extrato` contra `MODEL_CATALOG` durante a implementação."
- [ ] **Step 2: Documentar a gemelaridade com `estadoDoFato` (achado N3).** Comentário no topo de `freshness.ts`: "A checagem 'builder nunca rodou → preparando' existe em **dois lugares** com contratos distintos mas semântica idêntica: `estadoDoFato` em `src/lib/actions/report-data.ts` (wrapper F3, devolve `{ estado: 'preparando', dados: vazio, freshness }`) e `withFreshness` aqui (MCP, devolve `{ estado: 'preparando' }` sem `dados`). Ambas seguem a **regra multi-fato da spec 3.9**: se **qualquer** fato consultado não tem `FatoBuildState`, vale 'preparando'. O wrapper F3 hoje consulta **um** fato por relatório; `withFreshness` recebe uma **lista**. Se a regra multi-fato mudar, **os dois pontos devem ser atualizados juntos**. A função `estadoPreparando(prisma, fatos: string[]): Promise<boolean>` exportada por este módulo é o helper compartilhado da regra — `withFreshness` a usa; um refactor futuro do wrapper F3 pode adotá-la também."
- [ ] **Step 3: Teste falhando.** Em `freshness.test.ts`, testar:
  - `estadoPreparando(prisma, fatos)` — `true` se **qualquer** fato da lista não tem `FatoBuildState`; `false` se todos têm.
  - `withFreshness(prisma, fatos: string[], fn)`: (a) se `estadoPreparando` é `true` → devolve `{ estado: "preparando" }`, **não executa `fn`**; (b) senão executa `fn`, obtém `dados`, e devolve `{ estado, dados, atualizadoEm, fonteStatus }`. `atualizadoEm` = ISO do **máximo** dos `ultimoBuildAt` dos `FatoBuildState`. `fonteStatus` = `{ status, ultimaSyncEm }` da **pior** fonte (`SyncState` via `FATO_FONTE`): `status` = `SyncState.lastStatus`; `ultimaSyncEm` = ISO de `lastSnapshotAt` **se** `FATO_FONTE[fato].mode === "snapshot"`, senão `lastIncrementalAt` — `null` se a coluna for `null`. **Decisão N12 — quem decide `"vazio"`:** `withFreshness` inspeciona `dados` após executar `fn`: se `dados` for um objeto cujo **primeiro array** entre suas chaves (mesma ordem de `extractRowCount`: `linhas`/`titulos`/`serie`/`contas`/`top`/`familia`/`marca`) tem comprimento `0` → `estado = "vazio"`; se não há array de dados (ex.: `dados` só escalar como `{ entrada, saida, saldo }`) → `estado = "ok"` sempre; senão `estado = "ok"`. Teste cobre: lista com fato sem build → `preparando`; `dados` com `linhas` vazias → `vazio`; `dados` com `linhas` populadas → `ok`; `dados` só escalar → `ok`; fonte `incremental` → `ultimaSyncEm` vem de `lastIncrementalAt`; fonte `snapshot` → de `lastSnapshotAt`.
- [ ] **Step 4:** Rodar — FAIL.
- [ ] **Step 5:** Implementar `estadoPreparando` e `withFreshness`. O contrato de retorno (achado C2): `withFreshness` devolve o **envelope** `{ estado: "preparando" } | { estado: "ok" | "vazio"; dados: O; atualizadoEm: string; fonteStatus: { status: string; ultimaSyncEm: string | null } }`. O `outputSchema` de cada tool (4c.4+) é o tipo desse envelope — campos de negócio sob `dados`, ausente na variante "preparando".
- [ ] **Step 6:** Rodar — PASS. `npx eslint mcp/lib/freshness.ts mcp/lib/freshness.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): withFreshness e mapa fato-fonte do MCP"`

### Task 4c.3: `mcp/tools/estoque/index.ts` — índice do domínio

**Files:**
- Create: `mcp/tools/estoque/index.ts`
- Modify: `mcp/catalog/index.ts`

- [ ] **Step 1:** Criar `mcp/tools/estoque/index.ts` com `export const estoqueTools: ToolEntry[] = [];` (preenchido nas tasks 4c.4–4c.9).
- [ ] **Step 2:** Em `mcp/catalog/index.ts`, descomentar o import de `estoqueTools` e somá-lo a `catalogo` (`catalogo.push(...estoqueTools)` ou concatenação na declaração — conforme o padrão do arquivo de 4a.12).
- [ ] **Step 3:** `npx tsc -p mcp/tsconfig.json` — PASS.
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
- [ ] **Step 6:** `npx eslint mcp/tools/estoque/saldo-produto.ts mcp/tools/estoque/saldo-produto.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool estoque_saldo_produto"`

### Task 4c.5: Tool `estoque_valor_armazem`

**Files:**
- Create: `mcp/tools/estoque/valor-armazem.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve envelope com `dados` `{ kpis: { valorTotal, numArmazens }, linhas: [{ armazem, valor, numProdutos, percentual }] }`; `preparando` sem `FatoBuildState`; RBAC nega `viewer` sem `estoque`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({})` (R2 não tem filtros). `dados` Zod:
  ```ts
  const dados = z.object({
    kpis: z.object({ valorTotal: z.number(), numArmazens: z.number().int() }),
    linhas: z.array(z.object({
      armazem: z.string(),
      valor: z.number(),
      numProdutos: z.number().int(),
      percentual: z.number(),
    })),
  });
  ```
  `shape` recebe `queryValorArmazem` (que devolve `{ kpis, linhasBruto }`) e **calcula `percentual` por linha** (`kpis.valorTotal > 0 ? (l.valor / kpis.valorTotal) * 100 : 0`) — `percentual` é shaping, calculado aqui na tool (regra única N8). `outputSchema` = envelope de 4c.2 com esse `dados`. `withFreshness(ctx.prisma, ["fato_estoque_saldo"], …)`. `id: "estoque_valor_armazem"`, `dominio: "estoque"`, descrição "Valor de estoque a preço de custo por armazém".
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/estoque/valor-armazem.ts mcp/tools/estoque/valor-armazem.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool estoque_valor_armazem"`

### Task 4c.6: Tool `estoque_entradas_saidas`

**Files:**
- Create: `mcp/tools/estoque/entradas-saidas.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler com filtros de período devolve `dados` `{ serie: [{ mes, entrada, saida }] }` (a `serie`; o `detalhe` por produto é volumoso — `shape` o omite, deixando só a série mensal para o agente); `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional(), armazemId: z.number().int().positive().optional() })`. `dados` Zod: `z.object({ serie: z.array(z.object({ mes: z.string(), entrada: z.number(), saida: z.number() })) })`. `shape` recebe `queryEntradasSaidas` e devolve só `{ serie }`. `withFreshness(ctx.prisma, ["fato_estoque_movimento"], …)`. `id: "estoque_entradas_saidas"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/estoque/entradas-saidas.ts mcp/tools/estoque/entradas-saidas.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool estoque_entradas_saidas"`

### Task 4c.7: Tool `estoque_top_movimentados`

**Files:**
- Create: `mcp/tools/estoque/top-movimentados.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve `dados` `{ kpis: { totalProdutos, totalUnidades }, top: [{ rotulo, valor }] }` (os top-20 movimentados); `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional(), sentido: z.enum(["entrada","saida"]).optional() })`. `dados` Zod: `z.object({ kpis: z.object({ totalProdutos: z.number().int(), totalUnidades: z.number() }), top: z.array(z.object({ rotulo: z.string(), valor: z.number() })) })`. `shape` recebe `queryTopMovimentados` (que devolve `{ kpis, linhas }`) e devolve `kpis` + `linhas.slice(0, 20)` como `top`. `withFreshness(ctx.prisma, ["fato_estoque_movimento"], …)`. `id: "estoque_top_movimentados"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/estoque/top-movimentados.ts mcp/tools/estoque/top-movimentados.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool estoque_top_movimentados"`

### Task 4c.8: Tool `estoque_produtos_parados`

**Files:**
- Create: `mcp/tools/estoque/produtos-parados.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve `dados` `{ kpis: { totalParados, valorImobilizado }, linhas: [{ produtoNome, localNome, saldo, dias, vrSaldo }] }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({ faixaDias: z.number().int().nonnegative().optional(), armazemId: z.number().int().positive().optional() })`. `dados` Zod: `z.object({ kpis: z.object({ totalParados: z.number().int(), valorImobilizado: z.number() }), linhas: z.array(z.object({ produtoNome: z.string().nullable(), localNome: z.string().nullable(), saldo: z.number(), dias: z.number().int(), vrSaldo: z.number() })) })`. `shape` repassa `queryProdutosParados` (formato `{ kpis, total, linhas }`) → `{ kpis, linhas }`. `withFreshness(ctx.prisma, ["fato_produto_parado"], …)`. `id: "estoque_produtos_parados"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/estoque/produtos-parados.ts mcp/tools/estoque/produtos-parados.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool estoque_produtos_parados"`

### Task 4c.9: Tool `estoque_concentracao`

**Files:**
- Create: `mcp/tools/estoque/concentracao.ts` (+ teste)
- Modify: `mcp/tools/estoque/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve `dados` `{ familia: [{ familia, valor, percentual }], marca: [{ marca, valor, percentual }] }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar. `inputSchema = z.object({})`. `dados` Zod: `z.object({ familia: z.array(z.object({ familia: z.string(), valor: z.number(), percentual: z.number() })), marca: z.array(z.object({ marca: z.string(), valor: z.number(), percentual: z.number() })) })`. **`shape` recebe `queryConcentracao` (que devolve `{ familiasBruto, marcasBruto }` — SEM `percentual`, regra N8) e CALCULA `percentual` na tool:** soma `totalFamilia`/`totalMarca` (`reduce`), monta `familia: familiasBruto.map((r) => ({ familia: r.rotulo, valor: r.valor, percentual: totalFamilia > 0 ? (r.valor/totalFamilia)*100 : 0 }))` e `marca` análogo. **Sem `agruparTopN`** (shaping de gráfico, não vai ao agente — o agente recebe a lista completa). `withFreshness(ctx.prisma, ["fato_estoque_saldo"], …)`. `id: "estoque_concentracao"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `estoqueTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/estoque/concentracao.ts mcp/tools/estoque/concentracao.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool estoque_concentracao"`

### Task 4c.10: Teste de paridade dashboard×MCP (#IM-8)

**Files:**
- Create: `src/lib/reports/queries/paridade.test.ts`

> Achado C6: o teste de paridade da spec §6 (#IM-8) ganha task explícita.
> **Achado N7 — técnica de spy escolhida com base na config Jest real.**

- [ ] **Step 0 (achado N7):** Confirmar a config Jest do projeto. **Verificado:** `jest.config.ts` usa `preset: "ts-jest"`, sem `extensionsToTreatAsEsm` e sem `--experimental-vm-modules` no script `test` (`package.json`: `"test": "jest"`). **Conclusão: Jest roda com transform CJS** (`ts-jest` compila os módulos para CommonJS). Nesse modo, `jest.spyOn(mod, "fn")` **intercepta** a referência usada internamente por outro módulo do mesmo grafo CJS — a técnica de spy é válida. **Não** é necessário `jest.unstable_mockModule` + `await import`. Registrar esta verificação como comentário no topo de `paridade.test.ts`.
- [ ] **Step 1: Teste.** Em `paridade.test.ts`: `jest.spyOn` no módulo `@/lib/reports/queries/estoque` para espionar `querySaldoProduto`. Mockando o prisma (`jest-mock-extended`), chamar `getRelatorioSaldoProduto` (de `report-data.ts`) **e** o `handler` da tool `estoqueSaldoProduto` (de `mcp/tools/estoque/saldo-produto.ts`) — assertar que **ambos** invocam `querySaldoProduto` (prova que delegam ao núcleo, não recomputam). Repetir o padrão para a dupla `getRelatorioConcentracao` × `estoqueConcentracao` → `queryConcentracao`. Como ambos os wrappers delegam por construção, o teste deve **passar** já; se falhar, é evidência de regressão.
- [ ] **Step 2:** Rodar — PASS (ou FAIL se algum wrapper/tool não delega).
- [ ] **Step 3:** Se FAIL, corrigir o wrapper/tool que recomputa em vez de delegar. Rodar — PASS.
- [ ] **Step 4:** `npx eslint src/lib/reports/queries/paridade.test.ts` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "test(f4): paridade dashboard x MCP delega ao núcleo de query"`

### Task 4c.11: Tool `registrar_lacuna` (Caminho 3a)

**Files:**
- Create: `mcp/tools/caminho3/index.ts`, `mcp/tools/caminho3/registrar-lacuna.ts` (+ teste)
- Modify: `mcp/catalog/index.ts`

> **Achado N9:** o campo `sempreVisivel?` já existe em `ToolEntry` desde a Task
> 4a.11 — esta task **não** altera `mcp/catalog/types.ts`. Apenas **usa** o
> campo.

- [ ] **Step 1: Teste falhando.** Handler com input `{ perguntaResumo: string; dominio?: string }` faz `prisma.featureRequest.create({ data: { userId: ctx.user.userId, perguntaResumo, dominio } })`; output confirma o registro (`{ registrado: true }`). A tool é de **domínio-neutro**: `ToolEntry.dominio` é obrigatório por tipo — usar `"estoque"` como valor de campo, mas marcar `sempreVisivel: true` para que `visibleTools` (4a.13) a inclua para qualquer usuário. Sem `gatedRoles` (qualquer usuário sinaliza lacuna). Teste: handler grava em `featureRequest`; `visibleTools` inclui a tool para um `viewer` sem nenhum domínio (graças a `sempreVisivel`); `assertToolAllowed` **não** lança para `viewer` (porque `sempreVisivel` e sem `gatedRoles`).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/tools/caminho3/registrar-lacuna.ts`: `inputSchema = z.object({ perguntaResumo: z.string().min(1), dominio: z.string().optional() })`; `outputSchema = z.object({ registrado: z.literal(true) })`; `ToolEntry` com `id: "registrar_lacuna"`, `dominio: "estoque"`, `sempreVisivel: true`, `descricao` explicando que registra uma pergunta não coberta pelo catálogo. Criar `mcp/tools/caminho3/index.ts` com `export const caminho3Tools: ToolEntry[] = [registrarLacuna];`. Em `mcp/catalog/index.ts`, descomentar o import de `caminho3Tools` e somá-lo a `catalogo`.
- [ ] **Step 4:** Rodar — PASS. Rodar `mcp/catalog/registry.test.ts` — PASS (sem regressão; `sempreVisivel` já era contemplado por 4a.13).
- [ ] **Step 5:** `npx eslint mcp/tools/caminho3/` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool registrar_lacuna (Caminho 3a)"`

---

## ONDA 4d — Financeiro

> Achado I9: a agregação das tools de financeiro mora em
> `src/lib/reports/queries/financeiro.ts` — núcleo neutro e testável,
> espelhando o padrão de estoque. Achado I10: 4d.5/4d.6/4d.7 dependem de 4a.2
> (critério "não pago" e valores de `situacao`).
> **Achado N10:** cada task de tool de financeiro tinha 2 ciclos TDD (query +
> tool) comprimidos em 6 steps com Step 2/Step 4 escondendo a implementação.
> Na v3 cada tool de financeiro é **duas tasks**: `-q` (função de query +
> teste) e `-t` (handler de tool + teste) — espelhando a granularidade da onda
> 4c.
> **Achado N9:** as tasks `-q` editam todas o mesmo `financeiro.ts` — são
> **sequenciais**.

### Task 4d.0: Módulo-núcleo de query de financeiro + índice do domínio

**Files:**
- Create: `src/lib/reports/queries/financeiro.ts`, `src/lib/reports/queries/financeiro.test.ts`
- Create: `mcp/tools/financeiro/index.ts`
- Modify: `mcp/catalog/index.ts`

- [ ] **Step 1:** Criar `src/lib/reports/queries/financeiro.ts` — **sem `"use server"`** — com comentário de topo idêntico em espírito ao de `estoque.ts`: núcleo neutro, recebe `prisma` + filtros, devolve agregação crua, **não captura exceção**. Arquivo inicialmente só com o cabeçalho (preenchido nas tasks 4d.x-q).
- [ ] **Step 2:** Criar `financeiro.test.ts` com `describe` por função (`querySaldoContas`, `queryCaixaPeriodo`, `queryFluxoCaixa`, `queryContasAReceber`, `queryContasAPagar`, `queryTitulosVencidos`) — corpo vazio. Criar `mcp/tools/financeiro/index.ts` com `export const financeiroTools: ToolEntry[] = [];` e, em `mcp/catalog/index.ts`, descomentar o import de `financeiroTools` e somá-lo a `catalogo`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx tsc -p mcp/tsconfig.json` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): módulo-núcleo de query de financeiro e índice de tools"`

### Task 4d.1-q: Query `querySaldoContas`

**Files:**
- Modify: `src/lib/reports/queries/financeiro.ts`, `src/lib/reports/queries/financeiro.test.ts`

- [ ] **Step 1: Teste falhando.** `querySaldoContas(prisma: PrismaClient): Promise<{ contas: { bancoNome: string | null; tipo: string | null; saldo: number }[]; saldoTotal: number }>` — lê `prisma.fatoFinanceiroSaldo.findMany({ select: { bancoNome: true, tipo: true, saldo: true } })`; mapeia cada linha com `saldo: Number(r.saldo)` (campo `Decimal`); `saldoTotal = contas.reduce((acc, c) => acc + c.saldo, 0)`. Mock do prisma (`jest-mock-extended`).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `querySaldoContas` em `financeiro.ts` conforme o Step 1.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): query querySaldoContas"`

### Task 4d.1-t: Tool `financeiro_saldo_contas`

**Files:**
- Create: `mcp/tools/financeiro/saldo-contas.ts` (+ teste)
- Modify: `mcp/tools/financeiro/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve envelope `dados` `{ contas, saldoTotal }`; `preparando` sem `FatoBuildState` de `fato_financeiro_saldo`; RBAC nega `viewer` sem domínio `financeiro`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/tools/financeiro/saldo-contas.ts`: `inputSchema = z.object({})`; `dados` Zod `z.object({ contas: z.array(z.object({ bancoNome: z.string().nullable(), tipo: z.string().nullable(), saldo: z.number() })), saldoTotal: z.number() })`; `outputSchema` = envelope de 4c.2; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_saldo"], async () => querySaldoContas(ctx.prisma))`; `id: "financeiro_saldo_contas"`, `dominio: "financeiro"`, descrição "Saldo atual de cada conta/banco".
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar `financeiroSaldoContas` ao `financeiroTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/financeiro/saldo-contas.ts mcp/tools/financeiro/saldo-contas.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool financeiro_saldo_contas"`

### Task 4d.2-q: Query `queryCaixaPeriodo`

**Files:**
- Modify: `src/lib/reports/queries/financeiro.ts`, `financeiro.test.ts`

- [ ] **Step 1: Teste falhando.** `queryCaixaPeriodo(prisma: PrismaClient, filtros: { periodoDe?: string; periodoAte?: string }): Promise<{ entrada: number; saida: number; saldo: number }>` — `prisma.fatoFinanceiroMovimento.aggregate` ou `findMany` filtrando `data` no intervalo (`gte`/`lte` quando ambos os filtros presentes; sem filtro = todo o período); soma os campos **realizados** `entrada` e `saida` (NÃO `entradaPrevista`/`saidaPrevista`); `saldo = entrada - saida`. Conversão `Number()` dos `Decimal`. Mock do prisma.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `queryCaixaPeriodo`: `where` = `{ ...(periodoDe && periodoAte ? { data: { gte: new Date(periodoDe), lte: new Date(periodoAte) } } : {}) }`; somar `entrada`/`saida` realizados; `saldo`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): query queryCaixaPeriodo"`

### Task 4d.2-t: Tool `financeiro_caixa_periodo`

**Files:**
- Create: `mcp/tools/financeiro/caixa-periodo.ts` (+ teste)
- Modify: `mcp/tools/financeiro/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve envelope `dados` `{ entrada, saida, saldo }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/tools/financeiro/caixa-periodo.ts`: `inputSchema = z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional() })`; `dados` Zod `z.object({ entrada: z.number(), saida: z.number(), saldo: z.number() })`; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_movimento"], async () => queryCaixaPeriodo(ctx.prisma, input))`; `id: "financeiro_caixa_periodo"`, `dominio: "financeiro"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/financeiro/caixa-periodo.ts mcp/tools/financeiro/caixa-periodo.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool financeiro_caixa_periodo"`

### Task 4d.3-q: Query `queryFluxoCaixa`

**Files:**
- Modify: `src/lib/reports/queries/financeiro.ts`, `financeiro.test.ts`

- [ ] **Step 1: Teste falhando.** `queryFluxoCaixa(prisma: PrismaClient, filtros: { periodoDe?: string; periodoAte?: string }): Promise<{ serie: { periodo: string; realizado: number; previsto: number }[] }>` — `fatoFinanceiroMovimento.findMany` no período; agrupar por mês (`data` → `YYYY-MM`) em JS; por mês somar `valor` (realizado) e `valorPrevisto` (previsto); `serie` ordenada por `periodo`. Conversão `Number()`. Mock do prisma.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `queryFluxoCaixa`: `findMany` com `where` de período; `Map<string, { realizado, previsto }>` por mês; `serie` ordenada.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): query queryFluxoCaixa"`

### Task 4d.3-t: Tool `financeiro_fluxo_caixa`

**Files:**
- Create: `mcp/tools/financeiro/fluxo-caixa.ts` (+ teste)
- Modify: `mcp/tools/financeiro/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve envelope `dados` `{ serie }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/tools/financeiro/fluxo-caixa.ts`: `inputSchema = z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional() })`; `dados` Zod `z.object({ serie: z.array(z.object({ periodo: z.string(), realizado: z.number(), previsto: z.number() })) })`; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_movimento"], async () => queryFluxoCaixa(ctx.prisma, input))`; `id: "financeiro_fluxo_caixa"`, `dominio: "financeiro"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/financeiro/fluxo-caixa.ts mcp/tools/financeiro/fluxo-caixa.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool financeiro_fluxo_caixa"`

### Task 4d.4: `mcp/lib/dias-atraso.ts` — função pura de atraso

**Files:**
- Create: `mcp/lib/dias-atraso.ts`, `mcp/lib/dias-atraso.test.ts`

- [ ] **Step 1: Teste falhando.** `diasAtraso(dataVencimento: Date | null, hoje: Date): number` — vencimento no passado → dias positivos; futuro/`null` → `0`. Cálculo por diferença de dias de calendário (sem hora).
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar a função pura.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/lib/dias-atraso.ts mcp/lib/dias-atraso.test.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): função pura de cálculo de dias de atraso"`

### Task 4d.5-q: Query `queryContasAReceber`

**Files:**
- Modify: `src/lib/reports/queries/financeiro.ts`, `financeiro.test.ts`

> **Depende de 4a.2** — usa o valor real de `tipo` para "a receber" e a frase
> `CRITERIO_NAO_PAGO` documentada em 4a.2 Step 4.

- [ ] **Step 1: Teste falhando.** `queryContasAReceber(prisma: PrismaClient, filtros: { participanteId?: number }, hoje: Date): Promise<{ titulos: { participanteNome: string | null; numeroDocumento: string | null; dataVencimento: Date | null; vrSaldo: number; diasAtraso: number }[]; totalAReceber: number }>`. **Sub-bullets concretos da implementação (achado N10):**
  - `where`: `{ tipo: <valor "a receber" confirmado em 4a.2>, ...CRITERIO_NAO_PAGO, ...(filtros.participanteId ? { participanteId: filtros.participanteId } : {}) }` — `CRITERIO_NAO_PAGO` é o objeto de filtro decidido em 4a.2 Step 4 (ex.: `{ dataPagamento: null }` **ou** `{ situacaoSimples: { not: "<pago>" } }`).
  - `findMany` selecionando `participanteNome`, `numeroDocumento`, `dataVencimento`, `vrSaldo`, e `dataVencimento` para o cálculo de atraso.
  - para cada linha: `diasAtraso: diasAtraso(r.dataVencimento, hoje)` (de `mcp/lib/dias-atraso.ts` — atraso calculado **na query**, spec 3.4); `vrSaldo: Number(r.vrSaldo)`.
  - `totalAReceber = titulos.reduce((acc, t) => acc + t.vrSaldo, 0)`.
  Mock do prisma; testar o `where`, o cálculo de `diasAtraso` por linha, a soma.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `queryContasAReceber` conforme os sub-bullets.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): query queryContasAReceber"`

### Task 4d.5-t: Tool `financeiro_contas_a_receber`

**Files:**
- Create: `mcp/tools/financeiro/contas-a-receber.ts` (+ teste)
- Modify: `mcp/tools/financeiro/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve envelope `dados` `{ titulos, totalAReceber }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/tools/financeiro/contas-a-receber.ts`: `inputSchema = z.object({ participanteId: z.number().int().positive().optional() })`; `dados` Zod `z.object({ titulos: z.array(z.object({ participanteNome: z.string().nullable(), numeroDocumento: z.string().nullable(), dataVencimento: z.string().nullable(), vrSaldo: z.number(), diasAtraso: z.number().int() })), totalAReceber: z.number() })`; `shape` converte `dataVencimento` (`Date | null`) para ISO string ou `null`; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_titulo"], async () => shape(await queryContasAReceber(ctx.prisma, input, new Date())))`; `id: "financeiro_contas_a_receber"`, `dominio: "financeiro"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/financeiro/contas-a-receber.ts mcp/tools/financeiro/contas-a-receber.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool financeiro_contas_a_receber"`

### Task 4d.6-q: Query `queryContasAPagar`

**Files:**
- Modify: `src/lib/reports/queries/financeiro.ts`, `financeiro.test.ts`

> **Depende de 4a.2.**

- [ ] **Step 1: Teste falhando.** `queryContasAPagar(prisma, filtros: { participanteId?: number }, hoje: Date)` — idêntica a `queryContasAReceber` **exceto** o `where`: `tipo: <valor "a pagar" confirmado em 4a.2>` (mesmo `CRITERIO_NAO_PAGO`). Devolve `{ titulos: [...mesma forma], totalAPagar }`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `queryContasAPagar` (sub-bullets idênticos a 4d.5-q Step 1, trocando `tipo` e `totalAReceber`→`totalAPagar`).
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): query queryContasAPagar"`

### Task 4d.6-t: Tool `financeiro_contas_a_pagar`

**Files:**
- Create: `mcp/tools/financeiro/contas-a-pagar.ts` (+ teste)
- Modify: `mcp/tools/financeiro/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve envelope `dados` `{ titulos, totalAPagar }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/tools/financeiro/contas-a-pagar.ts` — mesmo formato de 4d.5-t, `dados` com `totalAPagar` em vez de `totalAReceber`; `handler` chama `queryContasAPagar`; `id: "financeiro_contas_a_pagar"`, `dominio: "financeiro"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/financeiro/contas-a-pagar.ts mcp/tools/financeiro/contas-a-pagar.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool financeiro_contas_a_pagar"`

### Task 4d.7-q: Query `queryTitulosVencidos`

**Files:**
- Modify: `src/lib/reports/queries/financeiro.ts`, `financeiro.test.ts`

> **Depende de 4a.2.**

- [ ] **Step 1: Teste falhando.** `queryTitulosVencidos(prisma: PrismaClient, hoje: Date): Promise<{ titulos: { tipo: string; participanteNome: string | null; numeroDocumento: string | null; dataVencimento: Date | null; vrSaldo: number; diasAtraso: number }[]; totalVencido: number }>`. **Sub-bullets concretos:**
  - `where`: `{ dataVencimento: { lt: hoje }, ...CRITERIO_NAO_PAGO }` — só títulos com vencimento no passado **e** não pagos (critério de 4a.2).
  - `findMany` selecionando `tipo`, `participanteNome`, `numeroDocumento`, `dataVencimento`, `vrSaldo`.
  - por linha: `diasAtraso: diasAtraso(r.dataVencimento, hoje)`; `vrSaldo: Number(r.vrSaldo)`.
  - `totalVencido = titulos.reduce((acc, t) => acc + t.vrSaldo, 0)`.
  Mock do prisma; testar `where`, `diasAtraso`, soma.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `queryTitulosVencidos`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): query queryTitulosVencidos"`

### Task 4d.7-t: Tool `financeiro_titulos_vencidos`

**Files:**
- Create: `mcp/tools/financeiro/titulos-vencidos.ts` (+ teste)
- Modify: `mcp/tools/financeiro/index.ts`

- [ ] **Step 1: Teste falhando.** Handler devolve envelope `dados` `{ titulos, totalVencido }`; `preparando`; RBAC nega `viewer`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `mcp/tools/financeiro/titulos-vencidos.ts`: `inputSchema = z.object({})`; `dados` Zod `z.object({ titulos: z.array(z.object({ tipo: z.string(), participanteNome: z.string().nullable(), numeroDocumento: z.string().nullable(), dataVencimento: z.string().nullable(), vrSaldo: z.number(), diasAtraso: z.number().int() })), totalVencido: z.number() })`; `shape` converte `dataVencimento` para ISO/`null`; `handler` = `withFreshness(ctx.prisma, ["fato_financeiro_titulo"], async () => shape(await queryTitulosVencidos(ctx.prisma, new Date())))`; `id: "financeiro_titulos_vencidos"`, `dominio: "financeiro"`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** Adicionar ao `financeiroTools`.
- [ ] **Step 6:** `npx eslint mcp/tools/financeiro/titulos-vencidos.ts mcp/tools/financeiro/titulos-vencidos.test.ts` — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(f4): tool financeiro_titulos_vencidos"`

---

## ONDA 4e — Caminho 3 (3b e 3c)

### Task 4e.1: Contrato de recusa 3b

**Files:**
- Create: `mcp/lib/recusa.ts`, `mcp/lib/recusa.test.ts`

- [ ] **Step 1: Teste falhando.** `MENSAGEM_RECUSA_3B` (constante) + `montarRecusa(assunto?)` — formata a recusa educada de pergunta fora do escopo de negócio; o teste confirma o texto-padrão e a interpolação opcional do assunto.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/lib/recusa.ts mcp/lib/recusa.test.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): contrato de recusa 3b"`

### Task 4e.2: Tool `bi_consulta_avancada` (3c stub gated)

**Files:**
- Create: `mcp/tools/caminho3/bi-consulta-avancada.ts` (+ teste)
- Modify: `mcp/tools/caminho3/index.ts`

- [ ] **Step 1: Teste falhando.** `gatedRoles: ["super_admin","admin"]`; `sempreVisivel: true` (gate por role, não por domínio); handler stub devolve `{ disponivel: false, mensagem: "modo BI ainda não disponível nesta fase", aviso: "consulta dinâmica não auditada" }`; `visibleTools` esconde a tool de `manager`/`viewer`; `assertToolAllowed` lança `DomainDeniedError` para `manager`.
- [ ] **Step 2:** Rodar — FAIL.
- [ ] **Step 3:** Implementar `bi-consulta-avancada.ts`: `inputSchema = z.object({ pergunta: z.string() })`; `outputSchema = z.object({ disponivel: z.literal(false), mensagem: z.string(), aviso: z.string() })`; `ToolEntry` com `id: "bi_consulta_avancada"`, `dominio: "estoque"`, `sempreVisivel: true`, `gatedRoles: ["super_admin","admin"]`. Adicionar `biConsultaAvancada` ao `caminho3Tools` em `mcp/tools/caminho3/index.ts`.
- [ ] **Step 4:** Rodar — PASS.
- [ ] **Step 5:** `npx eslint mcp/tools/caminho3/bi-consulta-avancada.ts mcp/tools/caminho3/bi-consulta-avancada.test.ts` — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(f4): tool bi_consulta_avancada (3c stub gated)"`
- [ ] **Step 7:** Documentar em `docs/superpowers/research/2026-05-17-f4-postgres-mcp-role.md` a definição do role Postgres read-only do futuro Postgres MCP (3c). Commit: `docs(f4): role read-only do Postgres MCP (3c futuro)`.

---

## ONDA 4f — Hardening, harness e container

### Task 4f-1: Role Postgres `nexus_mcp`

**Files:**
- Create: `prisma/sql/2026-05-17-mcp-role.sql`, `docs/runbooks/mcp-role.md`

- [ ] **Step 1:** SQL: `CREATE ROLE nexus_mcp LOGIN PASSWORD …`; `GRANT SELECT` em `fato_estoque_saldo`, `fato_estoque_movimento`, `fato_produto_parado`, `fato_financeiro_saldo`, `fato_financeiro_movimento`, `fato_financeiro_titulo`, `User`, `UserDomainAccess`, `sync_state`, `FatoBuildState`; `GRANT INSERT` em `mcp_audit_log` e `feature_requests`; `REVOKE` o resto (sem `raw_*`, sem `UPDATE`/`DELETE`, **sem `SELECT` em `mcp_audit_log`**).
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
- [ ] **Step 3:** Implementar `mcp/lib/rate-limit.ts`. Integrar em `handleToolCall` (`mcp/server.ts`, 4a.17): antes da execução do handler, `checkMcpRateLimit` — estouro → `outcome=denied`, `recordAudit` (`rowCount` `null`), resposta de recusa.
- [ ] **Step 4:** Rodar o teste do rate limiter + `mcp/server.test.ts` — PASS (sem regressão no pipeline). `npx eslint mcp/lib/rate-limit.ts mcp/lib/rate-limit.test.ts mcp/server.ts` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): rate limiter do MCP no pipeline de tools/call"`

### Task 4f-4: Harness de teste de integração MCP

**Files:**
- Create: `mcp/__tests__/harness.ts`, `mcp/__tests__/integration.test.ts`

> Depende de 4c, 4d, 4e (catálogo completo). É a **primeira prova
> ponta-a-ponta** do servidor (achado N11) e a **rede de proteção do catálogo**
> (achado N6).

- [ ] **Step 1:** `harness.ts`: sobe o servidor MCP num processo/porta de teste, cliente Streamable HTTP do SDK, autentica com service token de teste, abre sessão com `userId` de teste.
- [ ] **Step 2: Assertiva de contagem do catálogo (achado N6).** Em `integration.test.ts`, primeiro teste: `tools/list` para um `super_admin` retorna **exatamente 14 tools** — 6 estoque (`estoque_saldo_produto`, `estoque_valor_armazem`, `estoque_entradas_saidas`, `estoque_top_movimentados`, `estoque_produtos_parados`, `estoque_concentracao`) + 6 financeiro (`financeiro_saldo_contas`, `financeiro_caixa_periodo`, `financeiro_fluxo_caixa`, `financeiro_contas_a_receber`, `financeiro_contas_a_pagar`, `financeiro_titulos_vencidos`) + `registrar_lacuna` + `bi_consulta_avancada`. Assertar a contagem **e** o conjunto de `id`s — flagra qualquer import esquecido em `mcp/catalog/index.ts`.
- [ ] **Step 3:** `integration.test.ts`, demais testes: para cada perfil (`super_admin`/`admin`/`manager`/`viewer`), `tools/list` retorna o catálogo filtrado correto (estoque/financeiro conforme `UserDomainAccess`; `registrar_lacuna` sempre presente; `bi_consulta_avancada` só para `super_admin`/`admin`); cada tool de estoque/financeiro responde a pergunta-alvo; tool de domínio negado falha com `denied`; input inválido → erro estruturado `invalid_input` (#M6 — `bi_consulta_avancada` é de 4e, dependência declarada).
- [ ] **Step 4:** Rodar — PASS. `npx eslint mcp/__tests__/` — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(f4): harness de teste de integração do MCP"`

### Task 4f-5: Container e compose

**Files:**
- Create: `mcp/Dockerfile`
- Modify: `docker-compose.yml`

> **Achado N1/C5:** o Dockerfile **não** pode só "espelhar o worker" — precisa
> copiar `src/` e o Prisma generated. A verificação de tipo do build usa
> `tsc -p mcp/tsconfig.json` (o tsconfig autônomo de 4a.4 — **não** o raiz, e
> sem recompilar `src/**`); o runtime usa `tsx`, que lê os `paths` do
> `mcp/tsconfig.json` para resolver `@/`.

- [ ] **Step 1:** `mcp/Dockerfile` (Node puro, `tsx`): copia `mcp/`, `src/`, `prisma/` (incl. `src/generated/prisma`), `package.json`, `mcp/tsconfig.json` (**o tsconfig raiz não é necessário** — `mcp/tsconfig.json` é autônomo, não estende ninguém; copiar só por conveniência se outro script precisar); roda `npm ci`; `CMD` executa `tsx mcp/index.ts`. **Step de verificação dentro do build:** `npx tsc -p mcp/tsconfig.json` — resolve os imports `@/` transitivos **sem** emitir erro de arquivos `.tsx` de `src/` (critério N1).
- [ ] **Step 2:** Serviço `mcp` no `docker-compose.yml`: porta 3100 só na rede interna, envs `MCP_DATABASE_URL`/`MCP_SERVICE_TOKEN`/`REDIS_URL`, `depends_on: [db, redis]`.
- [ ] **Step 3:** `docker compose build mcp` — PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat(f4): container mcp no compose"`

---

## Verificação final (etapa [9])

**Automáticos (CI) — achado M7:**
- [ ] `npx tsc --noEmit` (raiz) — PASS.
- [ ] `npx tsc -p mcp/tsconfig.json` — PASS (sem erro de arquivo `.tsx` de `src/` — critério N1).
- [ ] `npx eslint src/ mcp/` — PASS (o lint do `mcp/` já foi validado task a task durante as ondas, achado N16 — este é o sweep final, sem acúmulo).
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
- §3.4 fatos + registry → 4a.2, 4a.3, 4b.1–4b.4 (N5: `atualizadoEm @default(now())`).
- §3.5.1 extração → 4c.0–4c.1f-wrap (1 + 12 tasks; N2: extração e wrapper separados).
- §3.5.2 tools estoque → 4c.4–4c.9. §3.5.3 tools financeiro → 4d.1-q–4d.7-t.
- §3.6 RBAC: c1/c2 → 4a.13 (com `sempreVisivel`, N9); c3/c5 → 4f-1/4f-2 (doc); c4 → 4f-1; c6 → 4a.17; c7 → 4a.9/4f-3.
- §3.7 Caminho 3 → 4c.11 (3a), 4e.1 (3b), 4e.2 (3c). §3.8 logs → 4a.3, 4a.9 (com `extractRowCount`, N13), 4c.11.
- §3.9 falha/frescor → 4a.10, 4c.2 (N3 gemelaridade, N4 modo de fonte, N12 regra de "vazio").
- §6 harness → 4f-4 (N6 contagem de catálogo). §6 paridade #IM-8 → 4c.10 (N7 técnica de spy).
- §6 toolchains separadas → Verificação final (CI vs manual). N1 tsconfig autônomo → 4a.4/4f-5.

---

## Mapa: achados → task que resolve

### Review #1 (24 achados — 20 plenos na v2, 4 parciais agora plenos na v3)

| # | Achado | Resolução |
|---|---|---|
| **C1** | 4c-2 épico de 6 tools sem steps | 4c.4–4c.9 (uma task/tool, schemas Zod literais) |
| **C2** | `withFreshness` × `estadoDoFato` | 4c.0 Step 1 fixa `estadoDoFato` no wrapper; 4c.2 Step 5 define o envelope |
| **C3** | 4a.9 épico de servidor+pipeline | 4a.14/4a.15/4a.16/4a.17 |
| **C4** | Catálogo nunca criado | 4a.12 cria `mcp/catalog/index.ts`; cada tool registra |
| **C5** | `mcp/tsconfig.json` e imports cruzados | **Pleno via N1** — 4a.4 redesenhada (tsconfig autônomo, não recompila `src/**`); 4a.5/4f-5 comprovam |
| **C6** | Teste de paridade #IM-8 | 4c.10 (com N7 — técnica de spy validada) |
| **I1** | PK `bancoId` não verificada | 4a.2 Step 3 / 4a.3 Step 1 |
| **I2** | Monetário como `Float` | 4a.3 — todos `Decimal(18,2)` |
| **I3** | `markFatoBuilt` fora da transação | **Pleno via N5** — 4b.2–4b.4 `markFatoBuilt(tx)` dentro; `atualizadoEm` resolvido por `@default(now())` |
| **I4** | Registry quebra `try/catch` por builder | 4b.1 Step 1/3 |
| **I5** | `processIncrementalCycle` sem ponto de chamada | 4b.1 Step 4 (ancorado por marcador textual, N14) |
| **I6** | 4c-1 épico de 6 relatórios | **Pleno via N2** — 4c.0 + 12 tasks `-extr`/`-wrap` (extração e wrapper separados) |
| **I7** | núcleo herda `catch`? | 4c.0 Step 1 — núcleo não captura |
| **I8** | Mapa fato→fonte inexistente | **Pleno via N4** — 4c.2 Step 1 cria `FATO_FONTE` com `{ model, mode }` |
| **I9** | Agregação de financeiro sem casa | 4d.0 cria `financeiro.ts`; 4d.x-q/-t |
| **I10** | `diasAtraso`/"não pago" dep 4a.2 | 4d.5/4d.6/4d.7 dependem de 4a.2 (`CRITERIO_NAO_PAGO`) |
| **I11** | `.env.example` órfão | 4a.0; 4a.6 falha seguro |
| **M1** | `typeof prisma` frágil | 4a.11 `PrismaClient` |
| **M2** | session-store `Map` | 4a.8 Step 3 comentário |
| **M3** | `server.ts` reeditado fora de onda | 4f-3 declara |
| **M4** | 4b.0 muda 4a.1 retroativo | 4a.2 antes de 4a.3 |
| **M5** | 4c-2.0 depois de 4c-2 | `withFreshness` é 4c.2, antes das tools |
| **M6** | 4f-4 testa tool de 4e | 4f-4 Step 3 declara dep |
| **M7** | Verificação CI×manual | dividida |

### Review #2 (16 achados — todos aplicados na v3)

| # | Achado | Resolução |
|---|---|---|
| **N1** | `mcp/tsconfig.json` herda `module`/`jsx` errados; `tsc`≠`tsx` | 4a.4 redesenhada — tsconfig **autônomo** (sem `extends`, sem `src/**` no `include`, sem `jsx`, `nodenext`, `baseUrl ".."`, `paths @/*`). 4a.5 Step 2 e 4f-5 Step 1 comprovam que `tsc -p mcp/tsconfig.json` não emite erro em `.tsx` de `src/` |
| **N2** | 4c.1a–4c.1f tri-unidade | Cada relatório vira **2 tasks**: `-extr` (núcleo + teste do núcleo) e `-wrap` (reescrita do wrapper + poda do teste antigo). A `-wrap` cita intervalo de linhas de referência + checklist literal do que preservar (`vazio`, `freshness`, regra `estado`) e traz o wrapper em código |
| **N3** | `withFreshness`×`estadoDoFato` divergem; wrapper sem nome de fato | 4c.2 Step 2 documenta a gemelaridade + helper `estadoPreparando` compartilhado da regra multi-fato 3.9. Cada task `-extr`/`-wrap` nomeia o fato: R1/R2/R6=`fato_estoque_saldo`, R3/R5=`fato_estoque_movimento`, R4=`fato_produto_parado` |
| **N4** | `withFreshness` lê coluna errada do `SyncState` para fontes incrementais | 4c.2 Step 1 — `FATO_FONTE` carrega `{ model, mode }`; Step 3/5 — `withFreshness` lê `lastSnapshotAt` se `mode==="snapshot"`, senão `lastIncrementalAt` |
| **N5** | `atualizadoEm` por linha omitido nos builders de financeiro | 4a.3 Step 1 — `atualizadoEm @default(now())` nos 3 fatos (opção mais simples); 4b.2–4b.4 Step 1/3 dizem literalmente que o mapper não produz `atualizadoEm` e o `createMany` recebe `data: mapped` (sem `{ ...m, atualizadoEm }`) |
| **N6** | catálogo nunca verificado montado; 4a.16 sem teste | 4f-4 Step 2 asserta contagem total de 14 tools + conjunto de `id`s; 4a.16 Step 2 — teste de fumaça `tools/list` com catálogo vazio |
| **N7** | `jest.spyOn` em módulo ESM não intercepta | 4c.10 Step 0 — confirma que o Jest do projeto roda com transform CJS (`ts-jest`, sem `--experimental-vm-modules`); `jest.spyOn` é válido; técnica registrada no teste |
| **N8** | `percentual` ora no núcleo, ora no wrapper | Regra única: `percentual` é shaping, **fora do núcleo**. 4c.1b-extr e 4c.1f-extr alinhadas; 4c.5 e 4c.9 calculam `percentual` na tool |
| **N9** | onda 4c em paralelo edita o mesmo arquivo; `sempreVisivel` tardio | Modelo de execução declara 4c.0→`-extr`/`-wrap` **sequenciais** e 4d.x-q sequenciais; `sempreVisivel?` movido para 4a.11 (`ToolEntry`); 4a.13 já o conhece; 4c.11 só usa |
| **N10** | tasks de tool de financeiro com 2 ciclos TDD comprimidos | Cada tool de financeiro vira **2 tasks** (`-q` query + `-t` tool); Step 1 das `-q` traz sub-bullets concretos (`where`, `CRITERIO_NAO_PAGO`, `diasAtraso`, somas) |
| **N11** | servidor sem teste de integração antes do harness | 4a.17 nota — primeira prova ponta-a-ponta é 4f-4; aceito e registrado |
| **N12** | `withFreshness` — quem decide "vazio"? | 4c.2 Step 3 — `withFreshness` inspeciona o primeiro array de `dados` (ordem de `extractRowCount`); comprimento 0 → `vazio`; sem array → `ok` |
| **N13** | `rowCount` do audit sem regra de extração | 4a.9 — `extractRowCount(output)` determinístico; 4a.17 Step 1/3 o usa no pipeline |
| **N14** | edições ancoradas em número de linha | Seção "Convenções de ancoragem" no topo; 4b.1 Step 4 e todas as tasks `-extr` ancoram por marcador textual |
| **N15** | 4c.0 Step 2 com redação truncada | 4c.0 Step 2 reescrito de forma afirmativa |
| **N16** | `eslint mcp/` só na verificação final | Cada task que cria/edita arquivo `mcp/` ganha um Step `npx eslint` antes do commit |

---

## Contagem de tasks

- **Onda 4a:** 19 tasks (4a.0–4a.18).
- **Onda 4b:** 4 tasks (4b.1–4b.4).
- **Onda 4c:** 16 tasks (4c.0; 4c.1a-extr/-wrap … 4c.1f-extr/-wrap = 12; 4c.2; 4c.3; 4c.4–4c.9 = 6; 4c.10; 4c.11) — recontando: 4c.0 (1) + 12 + 4c.2 (1) + 4c.3 (1) + 6 (4c.4–4c.9) + 4c.10 (1) + 4c.11 (1) = **23 tasks**.
- **Onda 4d:** 4d.0 (1) + 4d.1-q/-t … 4d.3-q/-t (6) + 4d.4 (1) + 4d.5-q/-t … 4d.7-q/-t (6) = **14 tasks**.
- **Onda 4e:** 2 tasks (4e.1, 4e.2).
- **Onda 4f:** 5 tasks (4f-1–4f-5).

**Total: 19 + 4 + 23 + 14 + 2 + 5 = 67 tasks.**

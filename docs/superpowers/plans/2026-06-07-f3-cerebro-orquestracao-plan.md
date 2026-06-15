# F3 , Cérebro de Orquestração , Implementation Plan (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Steps usam checkbox (`- [ ]`).
>
> **v3 = v1 + 2 reviews adversariais do plano aplicadas.** Correções marcadas `[P]`. Antes de editar `run-agent.ts` (1460 linhas, volátil), **re-confirmar a âncora por grep** , as linhas abaixo são referência, não verdade absoluta.

**Goal:** dar ao agente Nex um cérebro determinístico que recupera as tools certas por embedding, classifica a intenção e verifica a resposta antes de devolver, eliminando "tool errada" e "alucina/trunca".

**Architecture:** camada determinística em `src/lib/agent/router/` e `src/lib/agent/validation/`, dentro do `run-agent.ts`. Reusa router de domínio por embeddings, cache em memória de vetores, RBAC em camadas e o `auto-validator` (V1-V5 existentes). Tudo config-gated com fallback; nada nasce `active`.

**Tech Stack:** TypeScript, Next.js, Prisma v7 (`@prisma/adapter-pg`), embeddings OpenAI `text-embedding-3-small` via `src/lib/agent/rag/embed.ts`, Jest, MCP SDK.

**Spec:** `docs/superpowers/specs/2026-06-07-f3-cerebro-orquestracao-design.md` (v3).

**Fatos do código fixados pelas reviews `[P]`:**
- `embed` real: `src/lib/agent/rag/embed.ts`; de `router/`, import = `../rag/embed`; mock em `router/__tests__` = `../rag/embed`.
- Embedding da pergunta: `embedQuestion(q, usageCtx?)` → `{ vector, cacheHit }` (não existe `safeEmbedQuestion`); usar `.vector`.
- `ToolEntry` tem `id` e `descricao` (não name/description); `mcp/server.ts:181` registra `mcpServer.tool(tool.id, tool.descricao, ...)`. O `name` que o agente vê em `tools/list` = `tool.id` saneado. `TOOL_TRIGGERS` é indexado por `tool.id`.
- `routerEnabled` é **Boolean** (`schema.prisma:2815`); `run-agent.ts:515` deriva shadow/active dele. A flag nova de retrieval é **separada**: `routerToolRetrieval String @default("shadow")`.
- `auto-validator` já tem **V1-V5** (`ValidationFailReason = V1|V2|V3|V4|V5`); V2 já soma linhas vs `_agregado` (anti-invenção). Checks novos = **V6/V7/V8**. `validateResponse` faz **early-return** no 1º que falha.
- Retry corretivo (`run-agent.ts ~984-1060`) é **só-texto** (re-chat LLM, timeout 3s, não reexecuta tool, não conta `MAX_ITERATIONS`).
- Âncoras run-agent: router ~465-577; fast-path recusa ~542; safety-net gap ~790; mode/retry ~984-1060; updateDecision ~1131; `applyIntentArgs`/`session.callTool` ~1241 (não 1214).

---

## File Structure

**Onda 3a:** `mcp/catalog/embedding-text.ts` (novo), `mcp/server.ts` (mod), `mcp/catalog/__tests__/embedding-text.test.ts`; `src/lib/agent/router/{embed-tools,pick-tools,apply-intent-args}.ts` (novos), `router/types.ts` (mod), `router/filter-catalog.ts` (mod camada C), `router/log-decision.ts` (mod), `prisma/schema.prisma` + migration (AgentRouterDecision + AgentSettings.routerToolRetrieval), `run-agent.ts` (mod).

**Onda 3b:** `router/classify-intent.ts` (novo), `router/apply-intent-args.ts` (novo), `run-agent.ts` (mod ~1241), `validation/auto-validator.ts` (mod V6/V8), `validation/__tests__/*`.

**Onda 3c:** `git mv mcp/tools/caminho3 → mcp/tools/fora-do-catalogo`; `mcp/lib/recusa.ts`, componentes React do router, `prompt/identity-base.ts`, docs (mod); `router/fora-do-catalogo.ts` (novo helper).

---

## ONDA 3a , Tool Retrieval + Router ativo

### Task 3a.0 `[P]`: flags novas em AgentSettings (schema + migration manual)

**Files:** `prisma/schema.prisma` (model `AgentSettings`); `prisma/migrations/<ts>_f3_agent_settings_retrieval/migration.sql`.

- [ ] Step 1: adicionar `routerToolRetrieval String @default("shadow") @map("router_tool_retrieval")` em `AgentSettings`. `npx prisma validate`.
- [ ] Step 2: `npx prisma generate`; `grep -rq routerToolRetrieval src/generated/prisma/`.
- [ ] Step 3: migration SQL idempotente: `ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "router_tool_retrieval" TEXT NOT NULL DEFAULT 'shadow';`.
- [ ] Step 4: `npx prisma migrate deploy` (NUNCA `migrate dev`); `\d agent_settings` confirma. `agente schema-changed`.
- [ ] Step 5: Commit , `feat(f3): AgentSettings.routerToolRetrieval (shadow default)`.

### Task 3a.1a `[P]`: estrutura `embedding-text.ts` + check de cobertura (sem curadoria ainda)

**Files:** `mcp/catalog/embedding-text.ts`; `mcp/catalog/__tests__/embedding-text.test.ts`.

- [ ] Step 1: Teste (falha): `embeddingTextFor(tool)` = `descricao` + triggers de `TOOL_TRIGGERS[tool.id]` (vazio por ora); `assertEmbeddingTextCoverage(catalogo)` exige `>= 40 chars` por read-tool (a `descricao` sozinha já costuma passar → **não bloqueia** tool sem trigger curado); **teste negativo:** tool fake com `descricao` curta (`< 40`) faz `assertEmbeddingTextCoverage` lançar.
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar. `TOOL_TRIGGERS: Record<string /*tool.id*/, string[]> = {}` (preenchido nas 3a.1b+). `embeddingTextFor(t) = [t.descricao, ...(TOOL_TRIGGERS[t.id] ?? [])].join(". ")`. Cobertura por `>= 40 chars`.
- [ ] Step 4: rodar (passa) + `tsc mcp`.
- [ ] Step 5: Commit , `feat(f3): embedding-text estrutura + check de cobertura (>=40 chars, nao bloqueia)`.

### Task 3a.1b `[P]`: curadoria de `TOOL_TRIGGERS` por domínio (fan-out Opus)

> `[P]` Recontar primeiro: `grep -rl "export const" mcp/tools/<dominio>/ | wc -l`. As read-tools de negócio (estoque/financeiro/fiscal/comercial/contabil/cadastros) recebem triggers; floor-only (dominios-vazios/transversal/fora-do-catalogo) não precisam (entram por piso). Curadoria deriva das perguntas `[OK]` do dossie (comercial 61, fiscal 55, cadastros 43, financeiro 38, estoque 23, contábil ...).

- [ ] Step 1: workflow Opus, 1 agente por domínio: cada um lê as perguntas `[OK]` do seu domínio no dossie + as descrições das tools do domínio e escreve `TOOL_TRIGGERS[tool.id] = [<2-4 frases-gatilho pt-br>]`. Agentes NÃO editam `embedding-text.ts` (arquivo compartilhado); retornam o sub-mapa; o orquestrador integra inline.
- [ ] Step 2: integrar os sub-mapas em `TOOL_TRIGGERS`; `npx jest mcp/catalog/__tests__/embedding-text.test.ts` verde; `tsc mcp`.
- [ ] Step 3: Commit , `feat(f3): triggers curados por dominio (fonte: perguntas-ouro do dossie)`.

### Task 3a.2 `[P]`: publicar embeddingText (cap 400 chars) na description do tools/list

**Files:** `mcp/server.ts` (~:181); `mcp/__tests__/integration.test.ts`.

- [ ] Step 1: Teste (falha): a `description` publicada de `fiscal_faturamento_periodo` contém o **1º** trigger de `TOOL_TRIGGERS["fiscal_faturamento_periodo"]` (determinístico).
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar `mcpServer.tool(tool.id, capDescription(embeddingTextFor(tool)), ...)` onde `capDescription` = `descricao` + até **3** triggers, **cap 400 chars** (corta no limite de palavra preservando o 1º trigger). `[P]` evita inflar o prompt.
- [ ] Step 4: rodar (passa) + `tsc mcp`.
- [ ] Step 5: Commit , `feat(f3): tools/list publica embeddingText capado (descricao + ate 3 triggers, 400 chars)`.

### Task 3a.3 `[P]`: cache de vetores de tool (`embed-tools.ts`)

**Files:** `src/lib/agent/router/embed-tools.ts`; `src/lib/agent/router/__tests__/embed-tools.test.ts`.

- [ ] Step 1: Teste (falha): `jest.mock("../rag/embed", () => ({ embed: jest.fn(async () => [0.1,0.2,0.3]) }))`. `getToolVectors(tools)` → `Record<id, number[]>`; race-safe (promise compartilhada); cache invalida por hash de `id|description`.
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar espelhando `embed-domains.ts` (mesmo `import { embed } from "../rag/embed"`, `getRouterEmbeddingConfig`). `[P]` recebe **só o catálogo próprio** (tools com embeddingText), não tools externas; hash só sobre esse conjunto. `__resetToolCache()` p/ testes.
- [ ] Step 4: rodar (passa) + `tsc`.
- [ ] Step 5: Commit , `feat(f3): cache de vetores de tool (so catalogo proprio, import ../rag/embed)`.

### Task 3a.4: tipos do retrieval

**Files:** `src/lib/agent/router/types.ts`.

- [ ] Step 1: `RetrievalTool = { name: string; description: string }`; `ToolRetrievalResult = { picked: string[]; scores: Record<string,number>; floorAdded: string[] }`. `tsc`.
- [ ] Step 2: Commit , `feat(f3): tipos de retrieval de tool`.

### Task 3a.5 `[P]`: `pick-tools.ts` (top-K + núcleo mínimo)

**Files:** `src/lib/agent/router/pick-tools.ts`; `__tests__/pick-tools.test.ts`.

- [ ] Step 1: Testes (falha): (1) maior cosseno entra no top-K; (2) **núcleo:** toda tool de `pickedDomains` entra mesmo com score baixo (via `getToolDomain`); (3) `[P]` floor concreto: `bi_consulta_avancada` entra via `_desconhecido` e `registrar_lacuna` via `dominios-vazios` (NÃO assumir que `getToolDomain` retorna `caminho3`); (4) tool externa (`_desconhecido`) sempre entra; (5) K limita só candidatas cross-domínio; (6) `questionVector` ausente → retorna todas (fallback).
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar `pickTools({ tools, toolVectors, questionVector, pickedDomains, k })`: cosseno por tool; `floor = getToolDomain(name) ∈ pickedDomains ∪ EXCLUDE_FROM_FILTERING ∪ {UNKNOWN_DOMAIN}`; `topK` entre não-floor; `picked = floor ∪ topK`; fallback se sem vetor.
- [ ] Step 4: rodar (passa) + `tsc`.
- [ ] Step 5: Commit , `feat(f3): pick-tools top-K + nucleo minimo (floor por getToolDomain real)`.

### Task 3a.6 `[P]`: migration shadow-compare no AgentRouterDecision + log-decision

**Files:** `prisma/schema.prisma` (`AgentRouterDecision`); migration; `src/lib/agent/router/log-decision.ts`.

- [ ] Step 1: schema: `retrievalOfferedTools String[] @map("retrieval_offered_tools")`, `retrievalScores Json? @map("retrieval_scores")`, `chosenToolRank Int? @map("chosen_tool_rank")`. `prisma validate` + `generate` + grep.
- [ ] Step 2: migration SQL idempotente (`ADD COLUMN IF NOT EXISTS` text[]/jsonb/integer). `migrate deploy`; `\d agent_router_decision`.
- [ ] Step 3: `[P]` estender `CreateDecisionInput`/`UpdateDecisionInput` e os `data:{}` de `createDecision`/`updateDecision` em `log-decision.ts` com os 3 campos. `tsc`.
- [ ] Step 4: Commit , `feat(f3): AgentRouterDecision + log-decision ganham telemetria de retrieval` + `agente schema-changed`.

### Task 3a.7 `[P]`: camada C (retrieval) no filter-catalog

**Files:** `src/lib/agent/router/filter-catalog.ts`; `__tests__/filter-catalog.test.ts`.

- [ ] Step 1: Teste (falha): input opcional `toolRetrieval?: { picked: ReadonlySet<string> }`; quando presente, saída = `afterPermissionB.filter(t => picked.has(t.name))`; ausente → inalterado; camada B (RBAC) sempre antes de C.
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar camada C após B; diagnóstico `retrievalApplied`.
- [ ] Step 4: rodar (passa) + `tsc`.
- [ ] Step 5: Commit , `feat(f3): filter-catalog camada C de retrieval (RBAC antes)`.

### Task 3a.8a `[P]`: helper puro de rank + cálculo do chosenToolRank

**Files:** `src/lib/agent/router/retrieval-rank.ts`; `__tests__/retrieval-rank.test.ts`.

- [ ] Step 1: Teste (falha): `rankOf(toolName, offeredOrdered)` → índice (0-based) ou `null` se fora.
- [ ] Step 2-3: implementar função pura.
- [ ] Step 4: rodar (passa) + `tsc`.
- [ ] Step 5: Commit , `feat(f3): helper de rank do retrieval (chosenToolRank)`.

### Task 3a.8b `[P]`: computar retrieval em shadow no run-agent + popular createDecision

**Files:** `src/lib/agent/run-agent.ts` (bloco do router ~465-577).

- [ ] Step 1: após `pickDomains`, `const questionVector = (await embedQuestion(userMessage, usageCtx)).vector;` (reusar o embed já feito se possível); `getToolVectors(mcpToolsProprias)`; `pickTools(...)`. Em **shadow** (`settingsRow?.routerToolRetrieval !== "active"`): NÃO passar `toolRetrieval` ao `filterCatalog`; gravar `retrievalOfferedTools`/`retrievalScores` no `createDecision`. Em **active**: passar `toolRetrieval={picked}`.
- [ ] Step 2: `tsc` + `npx jest src/lib/agent/router`.
- [ ] Step 3: Commit , `feat(f3): run-agent computa retrieval (shadow loga offered/scores; active filtra)`.

### Task 3a.8c `[P]`: gravar chosenToolRank no updateDecision

**Files:** `src/lib/agent/run-agent.ts` (~1131).

- [ ] Step 1: no `updateDecision`, `chosenToolRank = rankOf(toolUsadaPeloLlm, retrievalOfferedTools)`.
- [ ] Step 2: `tsc`.
- [ ] Step 3: Commit , `feat(f3): grava chosenToolRank no updateDecision (gate de go-live)`.

---

## ONDA 3b , Classificador de Intenção + Verificador

### Task 3b.1: `classify-intent.ts` + precedência

**Files:** `src/lib/agent/router/classify-intent.ts`; `__tests__/classify-intent.test.ts`.

- [ ] Step 1: Testes (falha): "todos os produtos"→`exaustiva`; "top 5 clientes"→`ranking`; "um exemplo de produto parado"→`amostragem`; "faturamento de maio"→`pontual`; **precedência** "os 5 maiores clientes"→`ranking`; `[P]` **dupla colisão** "alguns dos 5 maiores"→`ranking` (ranking > amostragem); variantes "me lista tudo", "top dez", número por extenso.
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar puro `classifyIntent(q)`; normaliza; precedência **ranking > amostragem > exaustiva > pontual**; mapa número-por-extenso 0-20.
- [ ] Step 4: rodar (passa) + `tsc`.
- [ ] Step 5: Commit , `feat(f3): classify-intent com precedencia (ranking>amostragem>exaustiva>pontual)`.

### Task 3b.2 `[P]`: `apply-intent-args.ts` + injeção no run-agent (~:1241)

**Files:** `src/lib/agent/router/apply-intent-args.ts`; `__tests__/apply-intent-args.test.ts`; `run-agent.ts` (~:1241, antes de `session.callTool`).

- [ ] Step 1: Teste (falha): `applyIntentArgs(intent, llmArgs, toolSupports)`: exaustiva→`limit=50` (cap vence o do LLM); amostragem→`limit∈[3,5]`; ranking→preserva `orderBy` do LLM, se `!toolSupports.orderBy` → degrada `pontual` + `aviso`; pontual→inalterado.
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar helper puro; em `run-agent` derivar `toolSupports` do inputSchema da tool (presença de `limit`/`orderBy`) e aplicar antes do `callTool` (após mapear `nomeRealDaTool`, ~454-462/1241). Registrar `aviso` no log/envelope.
- [ ] Step 4: rodar (passa) + `tsc` + `npx jest src/lib/agent/router`.
- [ ] Step 5: Commit , `feat(f3): injecao deterministica de args por intencao (~1241)`.

### Task 3b.3 `[P]`: V6 = coerência total-declarado × linhas-do-próprio-envelope (NÃO duplicar V2)

> `[P]` Antes de implementar, LER `validateV2` (auto-validator.ts:130-288). V2 pega número do LLM não-derivado das linhas. V6 é diferente: confere o **total que o próprio envelope declara** (`_agregado/total`) contra a **soma das linhas que o próprio envelope retornou**, independente do texto do LLM (pega tool que se autocontradiz). Fixture de aceite: caso que V2 sozinho NÃO pega.

**Files:** `src/lib/agent/validation/auto-validator.ts` (type `ValidationFailReason` += `V6`); `__tests__/auto-validator-v6.test.ts`.

- [ ] Step 1: Teste (falha): envelope com `_agregado.total=1000` e linhas somando 900 → V6 sinaliza; sem campo de total → "não verificável" (sem falso positivo); fixture provando cobertura nova vs V2.
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar `validateV6` (modo shadow), só onde o shape expõe total + linhas com valor; adicionar `V6` ao type. `[P]` ver decisão de arquitetura em 3b.6 (coletar outcomes vs early-return).
- [ ] Step 4: rodar (passa) + `tsc`.
- [ ] Step 5: Commit , `feat(f3): validateV6 total-declarado x linhas-do-envelope (shadow, cobertura nova vs V2)`.

### Task 3b.4 `[P]`: V7 = anti-JOIN-duplicado (heurística, shadow)

**Files:** `src/lib/agent/validation/auto-validator.ts` (`+= V7`); `__tests__/auto-validator-v7.test.ts`.

- [ ] Step 1: Teste (falha): contagem de itens >> total distinto declarado → sinal de duplicação; caso normal → sem sinal; sem metadado → não verificável.
- [ ] Step 2-4: implementar `validateV7` (shadow, conservador), rodar, `tsc`.
- [ ] Step 5: Commit , `feat(f3): validateV7 anti-JOIN-duplicado (heuristica, shadow)`.

> `[P]` **CORTADO desta fase:** "datas no período" (era V8 do plano v1). `periodoDe/periodoAte` são campos de **input**, não saem no envelope que o `auto-validator` vê. Implementar exigiria passar os args de input ao validador + envelope canônico → **fica para a F4** (documentado na spec §10). Não criar V8 de datas agora.

### Task 3b.5 `[P]`: contrato de execução dos checks novos (coletar outcomes vs early-return)

**Files:** `src/lib/agent/validation/auto-validator.ts` (`validateResponse` ~:532-568); `__tests__/validate-response-shadow.test.ts`.

- [ ] Step 1: Teste (falha): `validateResponse` retorna o **1º outcome acionável** (V1-V5 em modo active) **+** uma lista `shadowOutcomes` com V6/V7 (sempre avaliados, nunca short-circuitam o fluxo). Em shadow, V6/V7 só populam `shadowOutcomes` (não viram retry).
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar: V6/V7 rodam SEMPRE e vão para `shadowOutcomes` (telemetria); o retorno acionável continua só V1-V5 (early-return preservado para o comportamento de produção). `run-agent` loga `shadowOutcomes` sem retentar.
- [ ] Step 4: rodar (passa) + `tsc`.
- [ ] Step 5: Commit , `feat(f3): validateResponse coleta shadowOutcomes (V6/V7) sem short-circuit`.

### Task 3b.6 `[P]`: política de falha , retry só-texto vs Falta Honesta direta

**Files:** `src/lib/agent/run-agent.ts` (~:984-1060); `__tests__/retry-policy.test.ts` (helper puro `decideRetryOuGap`).

- [ ] Step 1: Teste (falha): `decideRetryOuGap(reason)`: V1-V5 (problemas de redação/recusa) → `retry-texto` (cap=1 existente); V6/V7 (incoerência **estrutural** de dado) → `falta-honesta-direta` (retry-texto não conserta dado) , **não** gasta retry.
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar helper + fiar: manter o retry só-texto cap=1 existente para V1-V5; quando V6/V7 forem promovidos a active no futuro, vão direto a Falta Honesta. `[P]` documentar que o retry NÃO reexecuta tool nem conta `MAX_ITERATIONS`.
- [ ] Step 4: rodar (passa) + `tsc` + `npx jest src/lib/agent/validation`.
- [ ] Step 5: Commit , `feat(f3): politica de falha (V1-V5 retry-texto; V6/V7 Falta Honesta direta, cap=1)`.

---

## ONDA 3c , "Fora do Catálogo"

### Task 3c.1 `[P]`: git mv do diretório + suite mcp inteira

**Files:** `git mv mcp/tools/caminho3 mcp/tools/fora-do-catalogo` (move testes co-localizados junto).

- [ ] Step 1: `git mv`; `grep -rl "tools/caminho3" mcp/` (repo todo, não só prod) e atualizar imports; conferir `jest.config`/`tsconfig` paths.
- [ ] Step 2: `npx tsc -p mcp/tsconfig.json --noEmit` + `npx jest mcp/` (suite mcp **inteira**, não só integration); ids `registrar_lacuna`/`bi_consulta_avancada` inalterados.
- [ ] Step 3: Commit , `refactor(f3): mcp/tools/caminho3 -> fora-do-catalogo (ids estaveis)`.

### Task 3c.2a: rótulo em recusa.ts (com teste)

**Files:** `mcp/lib/recusa.ts`; `mcp/lib/recusa.test.ts` (se existir, senão criar).

- [ ] Step 1: trocar texto user-facing "Caminho 3" → "Fora do Catálogo" / ramos. Teste assert do texto novo. `tsc mcp` + jest.
- [ ] Step 2: Commit , `refactor(f3): recusa.ts rotulo Fora do Catalogo`.

### Task 3c.2b: rótulos na UI do router (inline + ui-ux-pro-max)

**Files:** `src/components/agent/router/router-decision-drilldown.tsx`, `router-decisions-table.tsx`.

> Regra de raiz do projeto: UI só na sessão principal + `ui-ux-pro-max`. Não delegar.

- [ ] Step 1: trocar rótulos visíveis "Caminho 3" → "Fora do Catálogo" (a chave técnica `caminho3` exibida vira label amigável via mapa de rótulos, sem mudar o valor). `tsc`.
- [ ] Step 2: Commit , `refactor(f3): UI do router rotula caminho3 como Fora do Catalogo`.

### Task 3c.2c: prompt/identidade + docs + comentário na chave

**Files:** `src/lib/agent/prompt/identity-base.ts`; docs ativos; comentário em `src/lib/agent/router/domain-vocabulary.ts`.

- [ ] Step 1: trocar terminologia user-facing no prompt e docs; comentar em `domain-vocabulary.ts` que a chave `caminho3` é **identificador estável** (não renomear: vocabulary hash + histórico). `[P]` **NÃO** tocar a string `caminho3` em `domain-vocabulary.ts`/`tool-to-domain.ts`/`queries.ts`, role SQL `nexus_mcp_bi`, env, `provision-mcp.sql`.
- [ ] Step 2: Verificação: `grep -rniE "caminho ?3" src/components mcp/lib/recusa.ts src/lib/agent/prompt` → 0 (user-facing limpo); chave técnica permanece com comentário. `tsc` raiz + mcp.
- [ ] Step 3: Commit , `refactor(f3): prompt/docs Fora do Catalogo; chave de dominio caminho3 documentada como estavel`.

### Task 3c.3 `[P]`: ramo determinístico "Fora de Escopo" + ligação do gap (Falta Honesta)

**Files:** `src/lib/agent/router/fora-do-catalogo.ts` (helper puro); `__tests__/fora-do-catalogo.test.ts`; `run-agent.ts` (fast-path ~542, safety-net ~790).

- [ ] Step 1: Teste (falha): `decideForaDoCatalogo({ retrievalEmpty, topScore, limiar, dominiosUsuario, dadoExisteNoEscopo })` → `"fora_de_escopo" | "falta_honesta" | "prosseguir"`.
- [ ] Step 2: rodar (falha).
- [ ] Step 3: implementar helper; fiar no run-agent gated (shadow→active): `fora_de_escopo`→recusa educada via `recusa.ts` (LLM redige); `falta_honesta`→`registrar_lacuna` (reusa safety-net + `formatarLacunaAmbiguidade`).
- [ ] Step 4: rodar (passa) + `tsc` + `npx jest src/lib/agent`.
- [ ] Step 5: Commit , `feat(f3): ramo deterministico Fora de Escopo + gap (Falta Honesta)`.

---

## VERIFICAÇÃO

### Task V.1 `[P]`: mini-oráculo (distribuição + classes)

**Files:** `src/lib/agent/router/__tests__/e2e/mini-oraculo.json`.

- [ ] Step 1: 40-50 perguntas pt-br das `[OK]` do dossie, **≥ 4 por domínio ativo** (estoque/financeiro/fiscal/comercial/contábil/cadastros) + **≥ 5 fora-de-escopo** (esperando recusa) + **≥ 5 falta-honesta** (RH/CRM/Produção vazios). Formato: `{ pergunta, toolEsperada, dominioEsperado, classeEsperada: "prosseguir"|"fora_de_escopo"|"falta_honesta" }`. `toolEsperada` cross-checada contra `registrar-lacuna.ts` e execução real.
- [ ] Step 2: Commit , `test(f3): mini-oraculo (>=4/dominio + fora-de-escopo + falta-honesta)`.

### Task V.2: E2E recall@K (runner tsx)

**Files:** `src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`.

- [ ] Step 1: runner tsx: por pergunta, `embedQuestion` + `pickDomains` + `pickTools`; mede `recall@K` (toolEsperada ∈ picked) e taxa de falso-fora-de-escopo. Sai != 0 se `recall@K < 0.98`.
- [ ] Step 2: `set -a; . ./.env.local; set +a; npx tsx src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`. Calibrar K (faixa 5-8) até recall@K ≥ 98%.
- [ ] Step 3: Commit , `test(f3): E2E recall@K (K calibrado >= 98%)`.

### Task V.3: rebuild + shadow-compare + suite

- [ ] Step 1: rebuild da worktree: `docker compose --env-file .env.local build app && up -d --force-recreate worker app`; `up -d --build mcp`. Provar embeddingText no `tools/list` do container.
- [ ] Step 2: shadow um período; `chosenToolRank` populado; medir % turnos com tool usada no top-K; recomendar `active` só se ≥ 98%.
- [ ] Step 3: `npx tsc --noEmit && npx tsc -p mcp/tsconfig.json --noEmit && npx eslint mcp src/lib/agent && npx jest` , verdes.
- [ ] Step 4: Commit , `chore(f3): rebuild + verificacao final (shadow-compare, suite verde)`.

### Task V.4: code review + PR

- [ ] Step 1: auto-review do diff F3 (RBAC antes do retrieval, fallbacks, nada nasce active, V6/V7 só shadow).
- [ ] Step 2: push + PR para `main` com auto-avaliação + evidências (tsc/jest/recall@K). Avisar humano (merge = decisão dele).

---

## Self-Review (cobertura da spec) `[P]`

- §4 retrieval → 3a.0-3a.8c (flags, embeddingText, vetores só catálogo próprio, pick-tools floor real, migration+log-decision, camada C, shadow-compare). ✓
- §5.1 intenção → 3b.1-3b.2 (precedência + injeção ~1241). ✓
- §5.2 verificador → 3b.3-3b.6: **V6/V7** (V5 já existe), V6 não duplica V2, datas-no-período CORTADO p/ F4, contrato shadow sem short-circuit, retry só-texto vs Falta Honesta direta. ✓
- §6 Fora do Catálogo → 3c.1-3c.3 (mv + rótulos por superfície + Fora de Escopo/gap), chave `caminho3` estável. ✓
- §4.5/§9 shadow-compare + recall@K → 3a.6/3a.8c + V.1-V.3 (mini-oráculo com classes). ✓
- Premissas corrigidas `[P]`: V5-collision, V2-overlap, import `../rag/embed`, `embedQuestion().vector`, `routerEnabled` Boolean vs `routerToolRetrieval`, `id`/`descricao` (não name), retry só-texto, ToolEntry id→name, contagem real de read-tools, cap 400 chars. ✓
- §11 da spec: corrigir "V1-V7" → na prática V1-V5 + V6/V7 novos (sem V8 de datas nesta fase).

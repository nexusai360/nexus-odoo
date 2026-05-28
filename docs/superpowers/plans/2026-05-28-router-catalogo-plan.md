# PLAN v3: R1, Router de catalogo por embedding (definitiva para execucao)

> Plano de execucao do **Sub-projeto R1** do roadmap de cobertura completa.
> Baseado em SPEC v3 em `docs/superpowers/specs/2026-05-28-router-catalogo-design.md`
> com errata SPEC v3.1 (ver §0 abaixo).
>
> Status: **v3 (apos review adversarial #2, pronta para execucao)**.
> Reviews em `docs/superpowers/research/2026-05-28-router-r1-review-plan-v1-to-v2.md`
> e `2026-05-28-router-r1-review-plan-v2-to-v3.md`.
>
> Branch: `feat/router-catalogo-r1`. Modelo: Opus 4.7. Execucao inline,
> TDD por unidade. Multi-agente: ver `docs/agents/active/claude-router-catalogo-r1.md`.

---

## §0. Errata SPEC v3.1 (incorporada neste PLAN v3)

**Mudanca:** o model `AgentRouterDecision` (§6.1 da SPEC v3) ganha
coluna nova `topScore Float?`. Justificativa: facilita query de
histograma (D2b) com `width_bucket()` PostgreSQL sem precisar de
unnest de JSON. Sem essa coluna, a query do histograma fica cara em
escala.

A coluna e' populada por `pick-domains.ts` em B3 (`Math.max` dos
scores). Em fallbacks tipo 1 e 2 (scores={}), `topScore = null`.

**Acao:** §6.1 da SPEC v3 considera-se atualizado. PLAN v3 e
implementacao seguem a versao com `topScore`. Quando R2 (Discovery)
ou onda subsequente fizer SPEC propria, herda essa versao.

**Padrao de queries no painel (Wave D):**
- Default: **Prisma client** (type-safe, autocompletar, refatoravel).
- Excecao: **$queryRaw** SOMENTE quando dependa de funcao Postgres
  nao mapeada pelo Prisma. Caso unico no R1: D2b (`width_bucket()`).

---

## Estrutura do plano

R1 e' decomposto em **8 ondas** (G0 + A a G). Cada onda agrupa tarefas
relacionadas. Dentro de cada onda, tarefas sao de **15 minutos a 1h30**.

Ordem de execucao: G0 → A → B → C → D → E → F → G. **Wave B depende
de A. Wave C depende de A+B. Wave D depende de A+B+C parcial (queries).
Wave E depende de B. Wave F preenche lacunas de teste. Wave G fecha.**

Cada task tem coluna "Depende de" explicita.

Total realista (sem paralelismo, foco continuo): **22-28h** em 5-7 dias.
Calculo somando todos os tempos: ~50h, mas TDD inline reduz overhead.

**Final de cada wave: atualizar `STATUS.md` com progresso.**

---

## Wave G0: Pre-flight (rebase em main)

Objetivo: garantir que a branch esta em cima da main mergeada de PR #30.

### G0.1. Rebase em main

- **Depende de:** nada.
- **Acao:**
  1. `git fetch origin main`
  2. **Verificar antes:** `git branch --list hotfix/lint-travessao-identity-base`.
     Se existir e nao mergeada, aguardar merge antes de rebasear
     (evita conflito de coordenacao futura).
  3. `git rebase origin/main` (resolver conflitos se houver, improvavel
     pois R1 nao toca codigo do PR #30).
  4. `npm test` global verde pos-rebase.
- **Verificacao:** branch ahead/behind contra origin/main mostra 0
  behind.
- **Tempo:** 30min (incluindo eventual conflito).

### G0.2. Investigar comando de bateria R-X

- **Depende de:** nada.
- **Acao:** localizar e documentar comando exato:
  - Procurar em `scripts/quality-audit/` por scripts disparadores.
  - Procurar em `package.json` por scripts `npm run quality:*`.
  - Procurar em `mcp/` e `src/lib/agent/quality/` por triggers.
  - Documentar em `STATUS.md` ou em comentario no PLAN v3 antes de G3.
- **Verificacao:** comando funciona em dry-run.
- **Tempo:** 30min.

**Wave G0 total: ~1h.**

---

## Wave A: Fundacao (schema + tipos + utils puros)

Objetivo: base de dados + tipos + utilitarios puros. Sem dependencia de
nada do agente Nex.

### A1. Migration Prisma aditiva

- **Depende de:** G0.1.
- **Arquivo:** `prisma/schema.prisma`,
  `prisma/migrations/20260528150000_router_catalogo/migration.sql`
  (timestamp YYYYMMDDhhmmss conforme convencao do projeto, ex:
  `20260528020000_dim_empresa_grupo`).
- **Acao:**
  1. Adicionar model `AgentRouterDecision` conforme §6.1 da SPEC v3,
     incluindo coluna nova `topScore Float?` (denormalizada para
     facilitar query de histograma sem JSON unnest).
  2. Adicionar 4 colunas em `AppSetting`: `routerEnabled` (default
     false), `routerThreshold` (default 0.55), `routerTopK` (default 3),
     `routerRetryExpandBelow` (default 0.70).
  3. Adicionar relacao inversa em `Conversation` e `Message`.
  4. Gerar migration com `npx prisma migrate dev --create-only`.
  5. Editar SQL gerado para incluir:
     ```sql
     -- Garantir defaults para a linha unica de app_settings existente
     UPDATE app_settings SET
       router_enabled = false,
       router_threshold = 0.55,
       router_top_k = 3,
       router_retry_expand_below = 0.70
     WHERE id = 1;

     -- GRANT SELECT idempotente
     DO $$ BEGIN
       GRANT SELECT ON TABLE agent_router_decision TO nexus_mcp_ro;
       GRANT SELECT ON TABLE agent_router_decision TO nexus_mcp_bi;
     EXCEPTION WHEN undefined_object THEN NULL; END $$;
     ```
- **Verificacao:** `npx prisma migrate dev` aplica sem erro; rodar em
  base limpa de teste valida idempotencia; `SELECT router_enabled FROM
  app_settings WHERE id=1` retorna `false`.
- **Tempo:** 1h.

### A2. Vocabulario canonico

- **Depende de:** nada.
- **Arquivo:** `src/lib/agent/router/domain-vocabulary.ts`.
- **Acao:**
  1. Type `DomainEntry` (§7.1).
  2. Array `DOMAINS` com 9 entradas (cadastros, comercial, contabil, crm,
     dominios-vazios, estoque, financeiro, fiscal, caminho3),
     descriptions canonicas exatamente como §7.2.
  3. `SAUDACOES_STOP_LIST` (§7.1).
  4. Funcao `computeVocabularyHash()` que retorna SHA256 truncado em 8
     chars das descriptions concatenadas (usa `crypto.createHash`).
  5. Constante `VOCABULARY_VERSION` derivada (chamada lazy).
- **Verificacao:** import + console.log do VOCABULARY_VERSION, hash
  estavel entre runs.
- **Tempo:** 1h.

### A3. tool-to-domain mapping

- **Depende de:** A2 (importa DOMAINS).
- **Arquivo:** `src/lib/agent/router/tool-to-domain.ts`.
- **Acao:**
  1. Constante `TOOL_TO_DOMAIN_OVERRIDE: Record<string, string>` vazia
     inicialmente.
  2. Funcao `getToolDomain(toolName: string, knownDomains: string[]):
     string` aplicando regras §4.3.
- **Verificacao:** import test simples valida regra 2 (`fiscal_X` →
  `fiscal`).
- **Tempo:** 30min.

### A4. question-normalize

- **Depende de:** nada.
- **Arquivo:** `src/lib/agent/router/question-normalize.ts`.
- **Acao:**
  1. Funcao pura `normalize(q: string): string` aplicando trim,
     toLowerCase, collapse spaces, remove zero-width chars (`​`,
     `‌`, `‍`, `﻿`), remove `\r\n`.
  2. Funcao pura `hashKey(q: string): string` retornando SHA1
     truncado em 16 chars do normalizado (chave de cache LRU).
- **Verificacao:** funcoes puras importaveis.
- **Tempo:** 30min.

### A5. Tipos compartilhados

- **Depende de:** nada.
- **Arquivo:** `src/lib/agent/router/types.ts`.
- **Acao:**
  1. Type `RouterDecision` (campos conforme §8 + topScore).
  2. Type `FilterCatalogInput`, `FilterCatalogOutput`.
- **Verificacao:** tsc verde.
- **Tempo:** 30min.

### A6a. Testes unit question-normalize

- **Depende de:** A4.
- **Arquivo:** `src/lib/agent/router/__tests__/question-normalize.test.ts`.
- **Acao:** 13 testes (10 normalize + 3 hashKey).
- **Verificacao:** verde.
- **Tempo:** 45min.

### A6b. Testes unit tool-to-domain

- **Depende de:** A3.
- **Arquivo:** `src/lib/agent/router/__tests__/tool-to-domain.test.ts`.
- **Acao:** 10 testes (override hit, prefix split, desconhecido).
- **Verificacao:** verde.
- **Tempo:** 30min.

### A6c. Testes unit domain-vocabulary

- **Depende de:** A2.
- **Arquivo:** `src/lib/agent/router/__tests__/domain-vocabulary.test.ts`.
- **Acao:** 5 testes (9 entradas existem, hash estavel,
  excludeFromFiltering=true em caminho3 e dominios-vazios,
  forceIncludeOn presente em cadastros).
- **Verificacao:** verde.
- **Tempo:** 30min.

### A7. Fim de Wave A: update STATUS

- **Depende de:** A1-A6.
- **Acao:** anotar em STATUS.md "Wave A R1 concluida".
- **Tempo:** 10min.

**Wave A total: ~5h45min. Entregavel: schema aplicado + tipos + utils +
testes.**

---

## Wave B: Core router (embed + decisao + filtro + log)

Objetivo: motor do router funcionando end-to-end como funcao pura.

### B1. embed-domains com promise sharing

- **Depende de:** A2, A5.
- **Arquivo:** `src/lib/agent/router/embed-domains.ts`.
- **Acao:**
  1. Modulo singleton com:
     - `cachedHash: string | null`
     - `cachedVectors: Record<string, number[]> | null`
     - `pendingEmbedPromise: Promise<Record<string, number[]>> | null`
       (evita race em cold start, ver §A2 do review).
  2. Funcao async `getDomainVectors()`:
     - Calcula `currentHash = computeVocabularyHash()`.
     - Se `currentHash === cachedHash`: retorna cachedVectors.
     - Se `pendingEmbedPromise` nao null: aguarda essa promise (race
       handling).
     - Senao: cria pendingEmbedPromise = embedTexts(...), aguarda,
       popula cache, limpa pendingEmbedPromise.
  3. Reusa `rag/embed.ts` para `embedTexts`.
- **Verificacao:** chamadas consecutivas batem rag/embed.ts uma vez so;
  mudar VOCABULARY_VERSION dispara re-embed; chamadas concorrentes em
  cold start nao disparam embed duplo.
- **Tempo:** 1h30.

### B2. embed-question com LRU inline (sem dep externa)

- **Depende de:** A4.
- **Arquivo:** `src/lib/agent/router/embed-question.ts`.
- **Acao:**
  1. Classe `LRU<K,V>` inline (~25 linhas). Map com reordem na get
     (delete+set) e ejecao da entrada mais antiga em set quando cap.
     Decisao: nao instalar `lru-cache` para evitar dep adicional.
  2. Singleton `cache = new LRU<string, number[]>(200)`.
  3. Funcao async `embedQuestion(q: string)`:
     - Normaliza pergunta + computa key.
     - Cache hit → retorna `{vector, cacheHit: true}`.
     - Cache miss → chama `embedTexts([qNorm])[0]`, popula cache,
       retorna `{vector, cacheHit: false}`.
  4. Race em cold start de mesma pergunta: aceitamos pequena
     duplicacao (custo ~$0.000002), documentado.
- **Verificacao:** segundo chamado da mesma pergunta retorna
  `cacheHit: true`.
- **Tempo:** 1h.

### B3. pick-domains (regras 1-8)

- **Depende de:** A2, A4, A5, B1, B2.
- **Arquivo:** `src/lib/agent/router/pick-domains.ts`.
- **Acao:**
  1. Funcao `cosineSimilarity(a, b): number` inline (~10 linhas).
  2. Funcao async `pickDomains(question, settings): Promise<RouterDecision>`:
     - Implementa regras 1-8 §8 da SPEC v3 estritamente em ordem.
     - Mede `pickDurationMs` via performance.now().
     - Computa `topScore = Math.max(...scores) || 0` (campo
       denormalizado de A1).
     - Retorna RouterDecision com routerVersion populado.
- **Verificacao:** smoke manual com 3 perguntas reais (estoque,
  financeiro, vaga); ver scores logicos.
- **Tempo:** 2h.

### B4. filter-catalog

- **Depende de:** A2, A3, A5, B3.
- **Arquivo:** `src/lib/agent/router/filter-catalog.ts`.
- **Acao:**
  1. Funcao `filterCatalog(allTools, decision, opts): McpTool[]`:
     - Se `!opts.routerEnabled` OU `decision.fallback.triggered` →
       return allTools.
     - Senao, agrega tools dos pickedDomains + excludeFromFiltering +
       caminho3.
     - Filtra dominios sem tool (warn dev em
       `process.env.NODE_ENV === "development"`).
- **Verificacao:** unit tests cobrindo cenarios §11.1.
- **Tempo:** 1h.

### B5. log-decision com erros loggados (formato canonico)

- **Depende de:** A1, A5.
- **Arquivo:** `src/lib/agent/router/log-decision.ts`.
- **Acao:**
  1. Funcao async `createDecision(input): Promise<{decisionId: string}>`:
     - prisma.agentRouterDecision.create({data: ...}).
     - Try/catch com **formato canonico de warn**:
       ```ts
       console.warn("[router:log] create failed", {
         decisionId: null,
         error: err.message,
         context: { mode, conversationId, messageId },
       });
       ```
     - Retorna decisionId fake (cuid local) para nao quebrar turno.
  2. Funcao async `updateDecision(decisionId, toolsUsed)`:
     - Deriva toolsDomains via tool-to-domain.
     - prisma.agentRouterDecision.update({where: {id: decisionId}}).
     - Try/catch com mesmo formato canonico:
       ```ts
       console.warn("[router:log] update failed", {
         decisionId, error: err.message, context: { toolsUsed }
       });
       ```
- **Verificacao:** mock prisma + unit tests.
- **Tempo:** 1h30.

### B6a. Testes embed-domains

- **Depende de:** B1.
- **Arquivo:** `embed-domains.test.ts`.
- **Acao:** 8 testes (cache hit, hash invalida, race promise).
- **Tempo:** 1h.

### B6b. Testes embed-question

- **Depende de:** B2.
- **Arquivo:** `embed-question.test.ts`.
- **Acao:** 12 testes (LRU hit/miss/eviction, normalize sensitivity).
- **Tempo:** 1h.

### B6c. Testes pick-domains

- **Depende de:** B3.
- **Arquivo:** `pick-domains.test.ts`.
- **Acao:** 30 testes (regras 1-8 cobertas).
- **Tempo:** 2h.

### B6d. Testes filter-catalog

- **Depende de:** B4.
- **Arquivo:** `filter-catalog.test.ts`.
- **Acao:** 15 testes (cenarios §11.1).
- **Tempo:** 1h.

### B6e. Testes log-decision

- **Depende de:** B5.
- **Arquivo:** `log-decision.test.ts`.
- **Acao:** 10 testes (create OK, create error, update OK, update
  error).
- **Tempo:** 1h30.

### B7. Fim de Wave B: update STATUS

- **Depende de:** B1-B6.
- **Acao:** STATUS.md "Wave B R1 concluida".
- **Tempo:** 10min.

**Wave B total: ~13h. Entregavel: motor do router funcional + testado.**

---

## Wave C: Integracao em run-agent.ts

Objetivo: router conectado ao fluxo real do Nex em modo shadow.

### C1. Wire router antes do mcpToolsToProviderTools

- **Depende de:** A1 (schema), B3, B4, B5.
- **Arquivo:** `src/lib/agent/run-agent.ts`.
- **Linhas estimadas:** ~25 adicionadas, 0 removidas.
- **Acao:** Adicionar 3 blocos:
  1. **Import (linha ~50 com outros imports):**
     ```ts
     import { pickDomains } from "./router/pick-domains";
     import { filterCatalog } from "./router/filter-catalog";
     import { createDecision, updateDecision } from "./router/log-decision";
     ```
  2. **Chamada do router** apos carregar settings, antes do bloco que
     busca tools do MCP (procurar `mcpToolsToProviderTools` no
     arquivo):
     ```ts
     // R1 router: filtra catalogo de tools por dominio (shadow + active)
     const routerForceDisable = process.env.ROUTER_FORCE_DISABLE === "true";
     const routerEnabled = !routerForceDisable && (settingsRow?.routerEnabled ?? false);
     const routerDecision = await pickDomains(userMessage, {
       threshold: settingsRow?.routerThreshold ?? 0.55,
       topK: settingsRow?.routerTopK ?? 3,
     });
     const { decisionId } = await createDecision({
       decision: routerDecision,
       mode: routerEnabled ? "active" : "shadow",
       catalogSizeFull: allTools.length,
       conversationId,
       messageId,
       userQuestion: userMessage,
       llmModelUsed: settings.llmModel ?? null,
     });
     const tools = filterCatalog(allTools, routerDecision, { routerEnabled });
     const catalogSizeOffered = tools.length;
     ```
  3. **Capturar toolsUsed e UPDATE** (apos loop de tool execution,
     antes de enviar resposta):
     ```ts
     // R1 router: registra tools usadas para auditoria do router
     const toolsUsed: string[] = capturedToolCalls.map(c => c.name);
     updateDecision(decisionId, toolsUsed, catalogSizeOffered).catch(err =>
       console.warn("[router:log] update failed:", err.message));
     ```
- **Verificacao:** tsc verde, run-agent.test verde.
- **Tempo:** 1h30.

### C2. Integracao com V1-V5 (retry condicional) - isolada e flagueada

- **Depende de:** C1, B3.
- **Arquivo:** `src/lib/agent/validation/auto-validator.ts` +
  `src/lib/agent/validation/router-retry.ts` (novo).
- **Linhas estimadas:** ~10 adicionadas em auto-validator (so chamada),
  ~50 em router-retry novo.
- **Acao:**
  1. Adicionar coluna `routerRetryEnabled Boolean @default(false)` em
     AppSetting (atualizar Wave A1).
  2. Criar `router-retry.ts` com funcao isolada
     `maybeExpandCatalogAndRetry(input): RetryDecision | null` que
     encapsula toda a logica:
     ```ts
     export async function maybeExpandCatalogAndRetry({
       routerEnabled, routerRetryEnabled, validator, routerContext,
     }) {
       if (!routerEnabled || !routerRetryEnabled) return null;
       if (validator.reason !== "sem_metrica") return null;
       if (!routerContext || routerContext.decision.fallback.triggered) return null;
       const topScore = routerContext.decision.topScore ?? 0;
       if (topScore >= routerContext.expandThreshold) return null;
       return {
         shouldRetry: true,
         expandedCatalog: routerContext.allTools,
         reason: "router_expand",
       };
     }
     ```
  3. Em `auto-validator.ts`, no ponto onde retry e' decidido, chamar
     essa funcao. Se retorna `null`, segue fluxo normal. Se retorna
     RetryDecision, dispara retry **reusando o budget existente
     (cap=1, igual ao motor atual)**.
  4. Backward compat: parametro `routerContext` e' opcional.
- **Verificacao:** unit test do auto-validator passa; unit test do
  router-retry isolado passa.
- **Risco:** baixo, isolamento + feature flag protegem.
- **Tempo:** 2h.

### C3. Testes integracao Wave C

- **Depende de:** C1, C2.
- **Arquivo:** `src/lib/agent/__tests__/run-agent.router.test.ts`.
- **Acao:** 5 cenarios principais:
  - Shadow: catalogo inteiro entregue, decisao logada.
  - Active: catalogo filtrado, caminho3 incluso.
  - Multi-tool: toolsActuallyUsed captura todas.
  - Retry V5 expanded: cenario sintetico dispara retry.
  - ROUTER_FORCE_DISABLE=true forca shadow mesmo com setting active.
- **Verificacao:** `npm test -- run-agent.router` verde.
- **Tempo:** 2h30.

### C4. Fim de Wave C: update STATUS

- **Tempo:** 10min.

**Wave C total: ~5h40min. Entregavel: router conectado no agente.**

---

## Wave D: Admin UI (painel)

Objetivo: aba "Router (shadow)" funcional em `/admin/qualidade`.

### D1. ui-ux-pro-max planning pass

- **Depende de:** nada.
- **Acao:** invocar skill `ui-ux-pro-max` com brief: KPIs + histograma
  + latencia + tabela discordancias + controles + botao calibragem,
  layout para super_admin em desktop. Anexar screenshot de outra aba
  do /admin/qualidade pra consistencia visual. Produz wireframe
  textual.
- **Verificacao:** wireframe registrado em
  `docs/superpowers/research/2026-05-28-router-ui-design.md`.
- **Tempo:** 1h.

### D2a. Server action getRouterKpis

- **Depende de:** A1.
- **Arquivo:** `src/app/admin/qualidade/router/queries.ts`.
- **Acao:** funcao retorna `{topOneAcc, allInTopKAcc, latencyP50, p95,
  p99}` com filtro `mode IN ('shadow','active') AND createdAt >
  now() - 7 days AND (toolsActuallyUsed nao vazio E createdAt <
  now() - 60s)`.
- **Tempo:** 1h.

### D2b. Server action getRouterHistogram

- **Depende de:** A1.
- **Acao:** SQL exato:
  ```sql
  SELECT width_bucket(top_score::float, 0, 1, 10) AS bucket,
         count(*) AS qty
  FROM agent_router_decision
  WHERE mode IN ('shadow', 'active')
    AND created_at > now() - interval '7 days'
    AND top_score IS NOT NULL
  GROUP BY bucket ORDER BY bucket;
  ```
  Retorna array de 10 buckets.
- **Tempo:** 45min.

### D2c. Server action getRouterDiscordancias

- **Depende de:** A1.
- **Acao:** retorna ultimas 50 onde toolsActuallyUsed nao vazio E
  nenhum elemento de toolsDomains esta em pickedDomains.
- **Tempo:** 45min.

### D2d. Server action getRouterLatencyTimeseries

- **Depende de:** A1.
- **Acao:** p50/p95/p99 por dia nos ultimos 7 dias.
- **Tempo:** 30min.

### D2e. Server action getRouterEligibleToActivate

- **Depende de:** D2a.
- **Acao:** retorna `{eligible: bool, reason: string}` aplicando gate
  de seguranca §10.1.6 da SPEC v3.
- **Tempo:** 30min.

### D3. Server action updateRouterSettings (com rate limit)

- **Depende de:** A1, D2e.
- **Arquivo:** `src/lib/actions/router-settings.ts`.
- **Acao:** super_admin only, valida ranges, valida gate (so liga se
  D2e.eligible OR usuario marca bypass), atualiza AppSetting, audita
  em AuditLog.
- **Rate limit:** max 10 alteracoes/min/user via infra existente
  (procurar `rateLimit` em src/lib). Sem isso, admin pode flood o log
  acidentalmente.
- **Tempo:** 1h30.

### D4a. Componente RouterKpiCards

- **Depende de:** D1, D2a.
- **Arquivo:** `src/components/agent/qualidade/router-tab/RouterKpiCards.tsx`.
- **Acao:** 2 KPIs grandes, valores formatados (%).
- **Tempo:** 30min.

### D4b. Componente RouterHistogram

- **Depende de:** D1, D2b.
- **Arquivo:** `.../RouterHistogram.tsx`.
- **Acao:** grafico de barras 10 buckets.
- **Lib de chart:** confirmar em `package.json` (provavel: `recharts`,
  usar BarChart). Se nao recharts, ajustar.
- **Tempo:** 45min.

### D4c. Componente RouterLatencyChart

- **Depende de:** D1, D2d.
- **Arquivo:** `.../RouterLatencyChart.tsx`.
- **Acao:** linha 7 dias com p50/p95/p99.
- **Tempo:** 45min.

### D4d. Componente RouterDiscordanciasTable

- **Depende de:** D1, D2c.
- **Arquivo:** `.../RouterDiscordanciasTable.tsx`.
- **Acao:** tabela com paginacao simples (50 por pagina).
- **Tempo:** 1h.

### D4e. Componente RouterControls + dialog

- **Depende de:** D1, D2e, D3.
- **Arquivo:** `.../RouterControls.tsx`.
- **Acao:** toggle + 3 inputs numericos + dialog de confirmacao
  forte quando elegibilidade negativa.
- **Tempo:** 1h.

### D4f. Componente RouterCalibrationButton (botao apenas)

- **Depende de:** D1, E4 (handler do botao).
- **Arquivo:** `.../RouterCalibrationButton.tsx`.
- **Acao:** botao + spinner + status do ultimo run.
- **Tempo:** 30min.

### D5. Rota e tab

- **Depende de:** D4a-D4f.
- **Arquivo:** `src/app/admin/qualidade/router/page.tsx`, alteracao em
  layout pra adicionar tab.
- **Acao:** rota nova + tab nav.
- **Verificacao:** navegacao em dev.
- **Tempo:** 1h.

### D6. ui-ux-pro-max review pass

- **Depende de:** D5.
- **Acao:** segunda invocacao da skill apos componentes prontos,
  review visual.
- **Verificacao:** report em
  `docs/superpowers/research/2026-05-28-router-ui-review.md`.
- **Tempo:** 1h.

### D7. Fim de Wave D: update STATUS

- **Tempo:** 10min.

**Wave D total: ~11h20min. Entregavel: painel funcional + auditavel.**

---

## Wave E: Calibragem + kill-switch

Objetivo: ferramentas operacionais que protegem producao.

### E1. Endpoint kill-switch

- **Depende de:** A1.
- **Arquivo:** `src/app/api/admin/router/kill/route.ts`.
- **Acao:**
  - POST handler, valida sessao super_admin via middleware existente.
  - Body Zod `{reason: string}`.
  - UPDATE AppSetting.routerEnabled = false.
  - Audita em AuditLog (`setting_updated`).
  - Retorna `{ok: true, newState: 'disabled'}`.
- **Verificacao:** integration test §11.2 `router-kill-endpoint.test.ts`.
- **Tempo:** 1h.

### E2. Script calibragem

- **Depende de:** B3.
- **Arquivo:** `scripts/router/calibrate-against-batteries.ts`.
- **Acao:** Pura simulacao, **sem chamada LLM**:
  1. Le ConversationQualityEvaluation das rodadas R8-R23 com
     `userQuestion` + `toolsUsed` (do historico real).
  2. Para cada pergunta unica:
     - Chama `pickDomains` (importa do modulo).
     - Cria row AgentRouterDecision com mode=`"calibracao_R-X"`,
       toolsActuallyUsed = tool real chamada no historico (do
       Message.toolCalls).
  3. Calcula taxa de acerto top-1 e top-K.
  4. Salva relatorio em `docs/router-calibration-r1.md`.
- **Verificacao:** rodar localmente, conferir saida.
- **Tempo:** 2h.

### E3. Env var override + .env.example

- **Depende de:** C1.
- **Arquivo:** `src/lib/agent/run-agent.ts` (ja incluido em C1.2),
  `.env.example`.
- **Acao:** documentar variavel em .env.example:
  ```
  # R1 router kill-switch (nivel 3, ultimo recurso).
  # Quando "true", forca router em shadow independente do AppSetting.
  ROUTER_FORCE_DISABLE=false
  ```
- **Verificacao:** unit test simulando env (incluido em C3).
- **Tempo:** 15min.

### E4. Handler do botao calibragem

- **Depende de:** D4f, E2.
- **Arquivo:** `src/app/api/admin/router/calibrate/route.ts`.
- **Acao:** POST handler, valida sessao super_admin, dispara script E2
  inline (foreground por ser rapido, ~30s).
- **Tempo:** 45min.

### E5. Fim de Wave E: update STATUS

- **Tempo:** 10min.

**Wave E total: ~4h10min. Entregavel: operacao protegida + calibragem
acessivel.**

---

## Wave F: Cobertura adicional de teste

Objetivo: cobertura completa dos cenarios de §11.

### F1a. router-shadow integration

- **Depende de:** C1.
- **Arquivo:** `mcp/__tests__/router-shadow.test.ts`.
- **Acao:** ambiente test, routerEnabled=false, pergunta de estoque,
  AgentRouterDecision criada, pickedDomains contem "estoque",
  catalogo entregue ao LLM mock e' inteiro.
- **Tempo:** 30min.

### F1b. router-active integration

- **Depende de:** C1.
- **Arquivo:** `mcp/__tests__/router-active.test.ts`.
- **Acao:** routerEnabled=true, catalogo filtrado, caminho3 presente.
- **Tempo:** 30min.

### F1c. router-multi-tool integration

- **Depende de:** C1.
- **Arquivo:** `mcp/__tests__/router-multi-tool.test.ts`.
- **Acao:** turno com 3 tools chamadas, valida arrays toolsActuallyUsed
  e toolsDomains.
- **Tempo:** 30min.

### F1d. router-retry-v5 integration (cenario detalhado)

- **Depende de:** C2.
- **Arquivo:** `mcp/__tests__/router-retry-v5.test.ts`.
- **Acao:** active mode, mock validator retorna
  `reason='sem_metrica'`, mock decision com `topScore=0.5` e
  `routerRetryExpandBelow=0.7`, fallback.triggered=false,
  `routerRetryEnabled=true`. Valida:
  1. `maybeExpandCatalogAndRetry` retornou RetryDecision nao null.
  2. filterCatalog foi chamado **de novo** com routerEnabled=false
     simulado (catalogo inteiro).
  3. AgentRouterDecision.fallbackReason contem
     `"+retry_v5_expanded"`.
- **Tempo:** 1h.

### F1e. router-empty-domain integration

- **Depende de:** C1.
- **Arquivo:** `mcp/__tests__/router-empty-domain.test.ts`.
- **Acao:** active, pergunta cai em crm (sem tools), valida catalogo
  nao vazio.
- **Tempo:** 30min.

### F1f. router-kill-endpoint integration

- **Depende de:** E1.
- **Arquivo:** `mcp/__tests__/router-kill-endpoint.test.ts`.
- **Acao:** sem sessao → 403, com sessao → 200 + AppSetting + AuditLog.
- **Tempo:** 45min.

### F2. Benchmark pickDurationMs (subset reproducivel)

- **Depende de:** B3.
- **Arquivo:** `scripts/router/benchmark.ts`.
- **Acao:** subset reproducivel:
  - 100 perguntas aleatorias das rodadas R8-R23.
  - Seed `42` no PRNG (Math.seedrandom ou similar) para
    reproducibilidade entre runs.
  - Mede pickDurationMs em todas, reporta p50/p95/p99 + media + max.
  - Salva `docs/router-benchmark-r1.md` com tabela + plot ASCII.
- **Verificacao:** rodar, conferir p95 < 200ms.
- **Tempo:** 1h.

### F3. Fim de Wave F: update STATUS

- **Tempo:** 10min.

**Wave F total: ~4h55min. Entregavel: cobertura tecnica completa.**

---

## Wave G: Verificacao + promocao

Objetivo: validar zero regressao e abrir PR.

### G1. Rebuild containers + smoke test

- **Depende de:** A1 aplicada e tudo das Waves A-F.
- **Acao:**
  1. `docker compose build app worker mcp` (todos por causa do schema).
  2. `docker compose up -d app worker mcp`.
  3. Confirma containers no ar (StartedAt apos commit final).
  4. `npm run dev:fresh` para Next.js dev local.
  5. Roda `scripts/quality-audit/tool-smoke-test.ts`.
- **Verificacao:** smoke verde, 0 erros.
- **Registro:** HISTORY.md com `scope=infra`.
- **Tempo:** 1h.

### G2. Calibragem inicial obrigatoria (paralelizavel com Wave D)

- **Depende de:** E2 (que depende de B3 + B5 prontos).
- **Acao:** rodar script E2, conferir relatorio. Se acerto top-1 < 85%,
  ajustar descriptions em A2 e re-rodar.
- **Iteracoes esperadas:** 1-3.
- **Pode rodar em paralelo com Wave D (UI):** G2 nao depende de UI;
  depende so de motor do router. Se quiser otimizar, dispara G2 logo
  apos B5 enquanto desenvolve D.
- **Tempo:** 2h (incluindo iteracoes).

### G3. Bateria R-X em shadow

- **Depende de:** G1.
- **Acao:** disparar bateria de qualidade. Comando provavel
  (validar):
  ```
  npm run quality-audit -- --bateria=R24
  ```
  ou `npx tsx scripts/quality-audit/run-bateria.ts` se existir.
  Investigar antes da execucao, registrar comando exato em STATUS.md.
- **Criterio:** >= 95,5% CORRETO (baseline).
- **Tempo:** 1h30 (bateria roda automatica, leitura ~30min).

### G4. Code review

- **Depende de:** todas as anteriores.
- **Acao:** rodar `/gsd-code-review` na branch.
- **Acao:** aplicar fixes criticos se houver.
- **Tempo:** 1-2h.

### G5. UI review

- **Depende de:** D5, D6.
- **Acao:** rodar `/gsd-ui-review` na aba nova.
- **Acao:** aplicar fixes visuais se houver.
- **Tempo:** 1h.

### G6. PR contra main

- **Depende de:** G1-G5.
- **Acao:** abrir PR contra `main` (PR #30 ja mergeado).
- **Body do PR (template):**
  ```
  ## Summary
  - Implementa R1 router de catalogo por embedding.
  - Modo shadow default, ativacao gradual via flag de admin.
  - Sem impacto no comportamento atual do Nex (95,5% baseline
    preservado).

  ## Test plan
  - [x] tsc verde
  - [x] ESLint sem regressao
  - [x] X testes unitarios novos verdes
  - [x] Y testes integracao verdes
  - [x] Migration idempotente
  - [x] Rebuild containers feito
  - [x] Bateria R-X em shadow: <X>%
  - [x] Benchmark pickDurationMs p95: <X>ms
  - [x] Calibragem top-1: <X>%
  - [x] Painel funcional em dev
  - [x] Code review sem criticos
  - [x] UI review sem criticos
  ```
- **Avaliacao do PR pelo proprio Claude:** preencher body completo
  com numeros reais.
- **Merge:** humano decide.
- **Tempo:** 1h.

### G7. Atualizacao CLAUDE.md (opcional)

- **Depende de:** G6 aberto.
- **Acao:** se faz sentido, adicionar decisao canonica 12: "router de
  catalogo por embedding e' o padrao para escalar acima de 100 tools".
  Commit separado em `scope=docs`.
- **Tempo:** 30min.

### G8. Fechamento da sessao multi-agente

- **Depende de:** G6.
- **Acao:** deletar `docs/agents/active/claude-router-catalogo-r1.md`,
  append final em `docs/agents/HISTORY.md`.
- **Tempo:** 15min.

**Wave G total: ~9h. Entregavel: PR pronto, qualidade verificada.**

---

## Resumo de esforco

| Wave | Conteudo | Tempo |
|---|---|---|
| G0 | Pre-flight rebase | ~30min |
| A | Schema + tipos + utils puros | ~5h45min |
| B | Core router | ~13h |
| C | Integracao run-agent.ts | ~5h40min |
| D | Admin UI | ~11h20min |
| E | Calibragem + kill-switch | ~4h10min |
| F | Cobertura testes | ~4h55min |
| G | Verificacao + promocao | ~9h |
| **Total** | **soma direta (sem paralelismo)** | **~54h** |

Realista com foco continuo e TDD inline: **22-28h em 5-7 dias** (TDD
reduz overhead de troca de contexto, modelo Opus 4.7 mantem qualidade).

---

## Gates de qualidade (checklist final)

1. [ ] tsc verde.
2. [ ] ESLint verde, sem regressao.
3. [ ] Todos os testes unitarios verdes (~85 novos esperados).
4. [ ] Todos os integration tests verdes.
5. [ ] Migration aplicavel sem erro, idempotente.
6. [ ] Rebuild de containers feito e registrado.
7. [ ] Bateria R-X em shadow >= 95,5%.
8. [ ] Benchmark pickDurationMs p95 < 200ms.
9. [ ] Calibragem inicial top-1 >= 85%.
10. [ ] Painel `/admin/qualidade` aba "Router (shadow)" funcional.
11. [ ] Code review sem achados criticos.
12. [ ] UI review sem achados criticos.
13. [ ] active/*.md atualizado/fechado.
14. [ ] HISTORY.md com entrada de promocao.
15. [ ] PR aberto, avaliado, body completo.

---

## Open questions (todas resolvidas em v3)

- P1. **topScore denormalizado:** RESOLVIDO §0 (errata SPEC v3.1
  incorporada).
- P2. **B5 erros loggados:** RESOLVIDO formato canonico em B5.
- P3. **D2 queries:** RESOLVIDO §0 (Prisma default, $queryRaw so para
  D2b com width_bucket).
- P4. **G3 comando bateria R-X:** RESOLVIDO via G0.2 (investigacao
  obrigatoria antes de G3).
- P5. **PR contra main com hotfix pendente:** RESOLVIDO via G0.1
  (verificar se hotfix existe e aguardar merge antes de rebasear).
- P6. **D4 chart lib:** RESOLVIDO D4b (confirmar recharts em
  package.json).
- P7. **F2 benchmark subset:** RESOLVIDO F2 (100 perguntas seed 42).

PLAN v3 e' definitivo para execucao. Mudancas exigem nova SPEC/PLAN.

---

## Proxima acao

Comecar execucao na ordem **G0 → A → B → C → (D paralelo G2) → E →
F → G**. Modelo Opus 4.7 inline, TDD por unidade. Multi-agente: ler
`active/*.md` alheios antes de tocar arquivo compartilhado.

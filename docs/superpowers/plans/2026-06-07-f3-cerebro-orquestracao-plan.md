# F3 , Cérebro de Orquestração , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** dar ao agente Nex um cérebro determinístico que recupera as tools certas por embedding, classifica a intenção da pergunta e verifica a resposta antes de devolver, eliminando "tool errada" e "alucina/trunca".

**Architecture:** camada determinística em `src/lib/agent/router/` e `src/lib/agent/validation/`, dentro do orquestrador `run-agent.ts`. Reusa o router de domínio por embeddings, o cache em memória de vetores, o RBAC em camadas e o `auto-validator`. Tudo config-gated com fallback ao comportamento atual; nada nasce `active`.

**Tech Stack:** TypeScript, Next.js, Prisma v7 (`@prisma/adapter-pg`), OpenAI embeddings `text-embedding-3-small` (via `rag/embed.ts`), Jest, MCP (`@modelcontextprotocol/sdk`).

**Spec:** `docs/superpowers/specs/2026-06-07-f3-cerebro-orquestracao-design.md` (v3).

---

## File Structure

**Onda 3a , Tool Retrieval + Router ativo**
- Create `mcp/catalog/embedding-text.ts` , `embeddingText` canônico por tool (lado MCP, onde `ToolEntry` vive) + check de cobertura.
- Modify `mcp/server.ts` , publicar `embeddingText` na `description` de `tools/list` (dobra o texto que cruza a fronteira).
- Create `src/lib/agent/router/embed-tools.ts` , cache em memória dos vetores de tool (espelha `embed-domains.ts`).
- Create `src/lib/agent/router/pick-tools.ts` , ranking top-K + núcleo mínimo garantido.
- Modify `src/lib/agent/router/types.ts` , `RetrievalTool` (name+description) e tipos de saída do retrieval.
- Modify `src/lib/agent/router/filter-catalog.ts` , camada C (retrieval) após A/B, gated por flag.
- Modify `prisma/schema.prisma` + nova migration , campos de shadow-compare em `AgentRouterDecision`.
- Modify `src/lib/agent/run-agent.ts` , fiar retrieval no fluxo, popular shadow-compare.

**Onda 3b , Intenção + Verificador**
- Create `src/lib/agent/router/classify-intent.ts` , classificador determinístico + precedência.
- Modify `src/lib/agent/run-agent.ts` , injeção de args (limit/orderBy/sample) entre `tc.arguments` e `callTool`.
- Modify `src/lib/agent/validation/auto-validator.ts` , checks V5 (totais×itens), V6 (datas no período), V7 (anti-JOIN), todos modo shadow.

**Onda 3c , "Fora do Catálogo"**
- Rename dir `mcp/tools/caminho3/ → mcp/tools/fora-do-catalogo/` + imports.
- Modify rótulos user-facing: `mcp/lib/recusa.ts`, `src/components/agent/router/router-decision-drilldown.tsx`, `router-decisions-table.tsx`, prompt/identidade, docs ativos.
- Modify `src/lib/agent/run-agent.ts` , ramo determinístico "Fora de Escopo" + ligação do gap (Falta Honesta).

**Verificação**
- Create `src/lib/agent/router/__tests__/e2e/mini-oraculo.json` , 30-50 perguntas com tool-esperada.
- Create `src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts` , runner tsx (recall@K).

---

## ONDA 3a , Tool Retrieval + Router ativo

> Grafo (spec §7): 3a habilita o catálogo enxuto e o limiar usado pelo 3c.

### Task 3a.1: `embeddingText` canônico por tool (lado MCP)

**Files:**
- Create: `mcp/catalog/embedding-text.ts`
- Test: `mcp/catalog/__tests__/embedding-text.test.ts`

- [ ] **Step 1: Teste de cobertura (falha)** , para cada `ToolEntry` do catálogo de leitura, `embeddingTextFor(tool)` retorna string não-trivial (>= 40 chars) combinando `descricao` + frases-gatilho.

```ts
import { catalogo } from "../index";
import { embeddingTextFor, assertEmbeddingTextCoverage } from "../embedding-text";

describe("embeddingText", () => {
  it("toda read-tool tem embeddingText nao-trivial", () => {
    const readTools = catalogo.filter((t) => !("operation" in t) || (t as { operation?: string }).operation !== "write");
    for (const t of readTools) {
      const txt = embeddingTextFor(t);
      expect(txt.length).toBeGreaterThanOrEqual(40);
    }
  });
  it("assertEmbeddingTextCoverage nao lanca com o catalogo atual", () => {
    expect(() => assertEmbeddingTextCoverage(catalogo)).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar (falha)** , `npx jest mcp/catalog/__tests__/embedding-text.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** , `embedding-text.ts`: mapa `TOOL_TRIGGERS: Record<toolId, string[]>` com frases-gatilho pt-br (derivadas das perguntas `[OK]` do dossie) para as ~35-40 read-tools; `embeddingTextFor(t) = [t.descricao, ...(TOOL_TRIGGERS[t.id] ?? [])].join(". ")`; `assertEmbeddingTextCoverage(catalogo)` lança se alguma read-tool produz `< 40` chars (força curadoria). Comentar que write-tools não entram no retrieval.
- [ ] **Step 4: Rodar (passa)** , `npx jest mcp/catalog/__tests__/embedding-text.test.ts` → PASS. `npx tsc -p mcp/tsconfig.json --noEmit`.
- [ ] **Step 5: Commit** , `feat(f3): embeddingText canonico por tool + check de cobertura`.

> NOTA de execução: a curadoria das frases-gatilho é trabalho real (1 entrada por read-tool). Paralelizável por domínio via workflow Opus (1 agente por domínio escreve os triggers das suas tools a partir das perguntas-ouro do dossie); o orquestrador integra o mapa inline.

### Task 3a.2: publicar `embeddingText` na description do `tools/list`

**Files:**
- Modify: `mcp/server.ts` (registro de tool, ~:180-187)
- Test: `mcp/__tests__/integration.test.ts` (assert tools/list)

- [ ] **Step 1: Teste (falha)** , em `integration.test`, a `description` de uma tool conhecida (ex.: `fiscal_faturamento_periodo`) contém uma frase-gatilho curada (substring de `TOOL_TRIGGERS`).
- [ ] **Step 2: Rodar (falha)**.
- [ ] **Step 3: Implementar** , no registro MCP, `description: embeddingTextFor(tool)` em vez de `tool.descricao` cru (mantém a descrição rica para o LLM E para o retrieval app-side). Limite de tamanho: se `> 600` chars, truncar preservando a 1ª frase + triggers.
- [ ] **Step 4: Rodar (passa)** + `tsc mcp`.
- [ ] **Step 5: Commit** , `feat(f3): tools/list publica embeddingText na description`.

### Task 3a.3: cache de vetores de tool (`embed-tools.ts`)

**Files:**
- Create: `src/lib/agent/router/embed-tools.ts`
- Test: `src/lib/agent/router/__tests__/embed-tools.test.ts`

- [ ] **Step 1: Teste (falha)** , `getToolVectors(tools)` retorna `Record<name, number[]>` (mock de `embed` → vetor fixo); chamadas concorrentes compartilham promise (race-safe); cache invalida quando a lista de nomes+texto muda (hash).

```ts
jest.mock("../../rag/embed", () => ({ embed: jest.fn(async () => [0.1, 0.2, 0.3]) }));
import { getToolVectors, __resetToolCache } from "../embed-tools";
```

- [ ] **Step 2: Rodar (falha)**.
- [ ] **Step 3: Implementar** , espelhar `embed-domains.ts`: cache em memória `cachedHash/cachedVectors/pendingPromise`; hash = sha dos pares `name|description`; embed sequencial por tool via `embed(description, {model,dimensions})` de `getRouterEmbeddingConfig()`. `__resetToolCache()` para testes. Comentar custo (~40×1536 floats ≈ 245KB).
- [ ] **Step 4: Rodar (passa)** + `tsc`.
- [ ] **Step 5: Commit** , `feat(f3): cache em memoria de vetores de tool (espelha embed-domains)`.

### Task 3a.4: tipos do retrieval

**Files:**
- Modify: `src/lib/agent/router/types.ts`

- [ ] **Step 1:** adicionar `export type RetrievalTool = { name: string; description: string };` e `export type ToolRetrievalResult = { picked: string[]; scores: Record<string, number>; floorAdded: string[] };`. `tsc`.
- [ ] **Step 2: Commit** , `feat(f3): tipos de retrieval de tool`.

### Task 3a.5: `pick-tools.ts` (ranking top-K + núcleo mínimo)

**Files:**
- Create: `src/lib/agent/router/pick-tools.ts`
- Test: `src/lib/agent/router/__tests__/pick-tools.test.ts`

- [ ] **Step 1: Testes (falha)** , casos:
  1. tool com maior cosseno entra no top-K;
  2. **núcleo mínimo:** TODAS as tools dos `pickedDomains` entram mesmo com score baixo (via `getToolDomain`);
  3. domínios `EXCLUDE_FROM_FILTERING` (transversal, dominios-vazios, caminho3) sempre entram;
  4. tool externa (`getToolDomain → _desconhecido`) sempre entra;
  5. K limita só candidatas cross-domínio (não corta o núcleo);
  6. retrieval vazio/baixa confiança → retorna todas (fallback).

```ts
import { pickTools } from "../pick-tools";
// mock getToolVectors + questionVector; assert picked inclui nucleo + topK cross-domain
```

- [ ] **Step 2: Rodar (falha)**.
- [ ] **Step 3: Implementar** , `pickTools({ tools: RetrievalTool[], questionVector, pickedDomains, k }): ToolRetrievalResult`:
  - cosseno(questionVector, toolVector) por tool;
  - `floor = tools` cujo `getToolDomain(name) ∈ pickedDomains ∪ EXCLUDE_FROM_FILTERING ∪ {UNKNOWN_DOMAIN}`;
  - `topK = ` top-K por cosseno entre as NÃO-floor;
  - `picked = floor ∪ topK`; `floorAdded` = floor não presentes no topK (telemetria);
  - se `questionVector` ausente → `picked = all` (fallback).
- [ ] **Step 4: Rodar (passa)** + `tsc`.
- [ ] **Step 5: Commit** , `feat(f3): pick-tools ranking top-K com nucleo minimo garantido`.

### Task 3a.6: migration shadow-compare no `AgentRouterDecision`

**Files:**
- Modify: `prisma/schema.prisma` (model `AgentRouterDecision`)
- Create: `prisma/migrations/<ts>_f3_router_decision_retrieval/migration.sql` (MANUAL, `migrate deploy`)

- [ ] **Step 1:** adicionar ao model: `retrievalOfferedTools String[] @map("retrieval_offered_tools")`, `retrievalScores Json? @map("retrieval_scores")`, `chosenToolRank Int? @map("chosen_tool_rank")`. `npx prisma validate`.
- [ ] **Step 2:** `npx prisma generate`; `grep -rq retrievalOfferedTools src/generated/prisma/`.
- [ ] **Step 3:** escrever migration SQL idempotente (`ADD COLUMN IF NOT EXISTS ... text[]`, `jsonb`, `integer`).
- [ ] **Step 4:** `npx prisma migrate deploy` (NUNCA `migrate dev`); conferir `\d agent_router_decision`.
- [ ] **Step 5: Commit** , `feat(f3): AgentRouterDecision ganha campos de shadow-compare de retrieval` + `agente schema-changed`.

### Task 3a.7: camada C (retrieval) no `filter-catalog` + flag

**Files:**
- Modify: `src/lib/agent/router/filter-catalog.ts`
- Test: `src/lib/agent/router/__tests__/filter-catalog.test.ts`

- [ ] **Step 1: Teste (falha)** , quando `toolRetrieval` (novo input opcional `{ picked: Set<string> }`) presente E flag ativa, a saída contém só as tools em `picked` (após A/B); quando ausente/flag off, comportamento atual inalterado (camada B intacta).
- [ ] **Step 2: Rodar (falha)**.
- [ ] **Step 3: Implementar** , adicionar input opcional `toolRetrieval?: { picked: ReadonlySet<string> }`. Camada C após B: `if (toolRetrieval) afterC = afterPermissionB.filter(t => toolRetrieval.picked.has(t.name))`. RBAC (B) **antes** de C sempre. Diagnóstico ganha `retrievalApplied`.
- [ ] **Step 4: Rodar (passa)** + `tsc`.
- [ ] **Step 5: Commit** , `feat(f3): filter-catalog camada C de retrieval (gated)`.

### Task 3a.8: fiar retrieval no `run-agent` (shadow) + popular telemetria

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (~:473-582 router; ~:1131 updateDecision)
- Test: cobertura via `filter-catalog`/`pick-tools` (unit) + E2E (Task V).

- [ ] **Step 1:** após `pickDomains`, computar `questionVector` (reusar `safeEmbedQuestion`), `getToolVectors(allToolsBeforeRouter)`, `pickTools(...)`. Em modo **shadow** (`routerToolRetrieval !== "active"`), NÃO filtrar; só logar `retrievalOfferedTools`/`retrievalScores`. Em **active**, passar `toolRetrieval` ao `filterCatalog`.
- [ ] **Step 2:** em `updateDecision` (~:1131), gravar `chosenToolRank` = posição da tool usada pelo LLM dentro de `retrievalOfferedTools` (null se fora).
- [ ] **Step 3:** flag `routerToolRetrieval` em `AgentSettings` (default `shadow`); `tsc` + `npx jest src/lib/agent/router`.
- [ ] **Step 4: Commit** , `feat(f3): run-agent computa retrieval em shadow e loga chosenToolRank`.

---

## ONDA 3b , Classificador de Intenção + Verificador

### Task 3b.1: `classify-intent.ts` + precedência

**Files:**
- Create: `src/lib/agent/router/classify-intent.ts`
- Test: `src/lib/agent/router/__tests__/classify-intent.test.ts`

- [ ] **Step 1: Testes (falha)** , tabela de casos pt-br:
  - "quais são todos os produtos" → `exaustiva`;
  - "top 5 clientes por valor" → `ranking`;
  - "me dá um exemplo de produto parado" → `amostragem`;
  - "qual o faturamento de maio" → `pontual`;
  - **precedência:** "quais são os 5 maiores clientes" → `ranking` (ranking > exaustiva);
  - variantes: "me lista tudo"→exaustiva, "top dez"→ranking, "alguns exemplos"→amostragem, número por extenso.

```ts
import { classifyIntent } from "../classify-intent";
expect(classifyIntent("quais sao os 5 maiores clientes")).toBe("ranking");
```

- [ ] **Step 2: Rodar (falha)**.
- [ ] **Step 3: Implementar** , função pura `classifyIntent(q: string): "exaustiva"|"ranking"|"amostragem"|"pontual"`. Normaliza (lowercase, sem acento). Detecta sinais por regex; aplica precedência **ranking > amostragem > exaustiva > pontual**. `pontual` default. Suporta "top N"/"N maiores"/número por extenso (mapa 0-20).
- [ ] **Step 4: Rodar (passa)** + `tsc`.
- [ ] **Step 5: Commit** , `feat(f3): classify-intent deterministico com precedencia`.

### Task 3b.2: injeção de args de intenção no `run-agent`

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (~:1214, entre `tc.arguments` e `session.callTool`)
- Test: `src/lib/agent/router/__tests__/apply-intent-args.test.ts` (extrair helper puro `applyIntentArgs`)

- [ ] **Step 1: Teste (falha)** , `applyIntentArgs(intent, toolName, llmArgs, toolSupports)`:
  - exaustiva → `limit=50` (cap; se LLM mandou maior, vence o cap);
  - amostragem → `limit ∈ [3,5]`;
  - ranking → preserva `orderBy` do LLM; se tool não suporta `orderBy` (`toolSupports.orderBy=false`) → degrada para `pontual` + `aviso`;
  - pontual → mantém args do LLM.
- [ ] **Step 2: Rodar (falha)**.
- [ ] **Step 3: Implementar** , helper puro `applyIntentArgs` em `router/apply-intent-args.ts`; chamar em `run-agent` antes do `callTool`, derivando `toolSupports` do inputSchema da tool (presença de `limit`/`orderBy`). Registrar o `aviso` no envelope/log.
- [ ] **Step 4: Rodar (passa)** + `tsc`.
- [ ] **Step 5: Commit** , `feat(f3): injecao deterministica de args por intencao (cap limit/orderBy)`.

### Task 3b.3: verificador V5 totais×itens (no `auto-validator`)

**Files:**
- Modify: `src/lib/agent/validation/auto-validator.ts`
- Test: `src/lib/agent/validation/__tests__/auto-validator-v5.test.ts`

- [ ] **Step 1: Teste (falha)** , envelope com `_agregado.total` e linhas com campo de valor: se `soma(linhas.valor) !== total` (fora da tolerância) → V5 sinaliza incoerência; envelope SEM campo de total → V5 retorna "não verificável" (sem falso positivo).
- [ ] **Step 2: Rodar (falha)**.
- [ ] **Step 3: Implementar** , V5 como nova checagem dentro do pipeline V1-V4 existente, modo shadow; opera só quando o shape expõe total + linhas com valor conhecido (lista de tools elegíveis derivada do shape, não hardcode frágil). Tolerância de arredondamento (0.01).
- [ ] **Step 4: Rodar (passa)** + `tsc`.
- [ ] **Step 5: Commit** , `feat(f3): verificador V5 totais x itens (shadow, so onde o envelope expoe total)`.

### Task 3b.4: verificador V6 datas no período

**Files:**
- Modify: `src/lib/agent/validation/auto-validator.ts`
- Test: `.../__tests__/auto-validator-v6.test.ts`

- [ ] **Step 1: Teste (falha)** , quando o envelope expõe `periodoDe/periodoAte` e datas por linha: data fora do intervalo → V6 sinaliza; sem esses campos → "não verificável".
- [ ] **Step 2-4:** implementar V6 (shadow), rodar, `tsc`.
- [ ] **Step 5: Commit** , `feat(f3): verificador V6 datas dentro do periodo (shadow)`.

### Task 3b.5: verificador V7 anti-JOIN-duplicado

**Files:**
- Modify: `src/lib/agent/validation/auto-validator.ts`
- Test: `.../__tests__/auto-validator-v7.test.ts`

- [ ] **Step 1: Teste (falha)** , heurística conservadora: contagem de itens muito acima do total declarado/distintos → sinal de duplicação por join; caso normal → sem sinal.
- [ ] **Step 2-4:** implementar V7 (shadow), rodar, `tsc`.
- [ ] **Step 5: Commit** , `feat(f3): verificador V7 anti-JOIN-duplicado (shadow)`.

### Task 3b.6: unificar retry (cap=1 compartilhado) + Falta Honesta

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (~:965-1060 retry do auto-validator)
- Test: `src/lib/agent/validation/__tests__/retry-budget.test.ts`

- [ ] **Step 1: Teste (falha)** , um único retry corretivo por turno (cap total 1) mesmo com V5-V7 falhando junto do V1-V4; após o retry, falha persistente → caminho de Falta Honesta (não inventa).
- [ ] **Step 2-4:** garantir que V5-V7 entram no mesmo ponto de retry existente (sem novo retry independente); falha final → Falta Honesta; `tsc` + `npx jest src/lib/agent/validation`.
- [ ] **Step 5: Commit** , `feat(f3): retry corretivo unico (cap 1) cobre V1-V7, falha => Falta Honesta`.

---

## ONDA 3c , "Fora do Catálogo"

### Task 3c.1: renomear diretório de tools (mecânico no código de tool)

**Files:**
- Rename: `mcp/tools/caminho3/ → mcp/tools/fora-do-catalogo/`
- Modify: imports em `mcp/catalog/index.ts` e onde `caminho3/` é importado.

- [ ] **Step 1:** `git mv mcp/tools/caminho3 mcp/tools/fora-do-catalogo`; atualizar imports (`grep -rl "tools/caminho3" mcp/`).
- [ ] **Step 2:** `npx tsc -p mcp/tsconfig.json --noEmit` + `npx jest mcp/__tests__/integration.test.ts` verdes (ids de tool inalterados).
- [ ] **Step 3: Commit** , `refactor(f3): mcp/tools/caminho3 -> fora-do-catalogo (ids estaveis)`.

### Task 3c.2: renomear rótulos user-facing (NÃO a chave de domínio)

**Files:**
- Modify: `mcp/lib/recusa.ts`, `src/components/agent/router/router-decision-drilldown.tsx`, `router-decisions-table.tsx`, prompt/identidade (`src/lib/agent/prompt/identity-base.ts`), docs ativos.
- **NÃO tocar:** chave `caminho3` em `domain-vocabulary.ts`, `tool-to-domain.ts`, `queries.ts`, role SQL `nexus_mcp_bi`, env, `provision-mcp.sql`.

- [ ] **Step 1:** trocar textos visíveis "Caminho 3"/"caminho 3" por "Fora do Catálogo" (e ramos: Falta Honesta / Fora de Escopo / Consulta BI Avançada) nos arquivos user-facing. Adicionar comentário em `domain-vocabulary.ts` explicando que a chave `caminho3` é identificador estável (não renomear).
- [ ] **Step 2: Verificação** , `grep -rniE "caminho 3|caminho3" src/components mcp/lib/recusa.ts src/lib/agent/prompt` retorna 0 (user-facing limpo); a chave técnica `caminho3` permanece só em código de router/infra com comentário. `tsc` raiz + mcp.
- [ ] **Step 3: Commit** , `refactor(f3): rotulos user-facing Caminho 3 -> Fora do Catalogo (chave de dominio estavel)`.

### Task 3c.3: ramo determinístico "Fora de Escopo" + ligação do gap

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (fast-path de recusa ~:542; safety-net de gap ~:790)
- Test: `src/lib/agent/router/__tests__/fora-do-catalogo.test.ts` (helper puro `decideForaDoCatalogo`)

- [ ] **Step 1: Teste (falha)** , `decideForaDoCatalogo({ retrievalEmpty, topScore, limiar, dominiosUsuario })`:
  - retrieval vazio acima do limiar + assunto fora dos domínios → `"fora_de_escopo"`;
  - dado no escopo mas inexistente → `"falta_honesta"`;
  - senão → `"prosseguir"`.
- [ ] **Step 2: Rodar (falha)**.
- [ ] **Step 3: Implementar** , helper puro em `router/fora-do-catalogo.ts`; fiar no `run-agent`: `fora_de_escopo` → recusa educada via `mcp/lib/recusa.ts` (LLM só redige); `falta_honesta` → `registrar_lacuna` (reusa safety-net + `formatarLacunaAmbiguidade`). Tudo gated (shadow→active).
- [ ] **Step 4: Rodar (passa)** + `tsc` + `npx jest src/lib/agent`.
- [ ] **Step 5: Commit** , `feat(f3): ramo deterministico Fora de Escopo + ligacao do gap (Falta Honesta)`.

---

## VERIFICAÇÃO (após as 3 ondas)

### Task V.1: mini-oráculo da F3

**Files:**
- Create: `src/lib/agent/router/__tests__/e2e/mini-oraculo.json`

- [ ] **Step 1:** 30-50 perguntas pt-br (das `[OK]` do dossie) com `{ pergunta, toolEsperada, dominioEsperado }` anotados à mão. Comentar que é subconjunto-semente (golden formal é F5).
- [ ] **Step 2: Commit** , `test(f3): mini-oraculo de selecao de tool (semente, nao golden F5)`.

### Task V.2: E2E recall@K (runner tsx)

**Files:**
- Create: `src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`

- [ ] **Step 1:** runner tsx (não jest, pelo client/embeddings): para cada pergunta do mini-oráculo, embeda, roda `pickDomains` + `pickTools`, mede `recall@K` (tool esperada ∈ picked) e taxa de falso-fora-de-escopo. Imprime métricas; sai != 0 se `recall@K < 0.98`.
- [ ] **Step 2: Rodar** , `set -a; . ./.env.local; set +a; npx tsx src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`. Ajustar K (faixa 5-8) até recall@K ≥ 98%.
- [ ] **Step 3: Commit** , `test(f3): E2E recall@K do retrieval contra mini-oraculo (K calibrado)`.

### Task V.3: rebuild + shadow-compare + suite

- [ ] **Step 1:** rebuild da worktree: `docker compose --env-file .env.local build app && up -d --force-recreate worker app`; `up -d --build mcp`. Provar `embeddingText` no `tools/list` do container.
- [ ] **Step 2:** rodar em shadow um período; conferir `chosenToolRank` populado no `AgentRouterDecision`; medir % turnos com tool usada no top-K. Só recomendar `active` se ≥ 98%.
- [ ] **Step 3:** `npx tsc --noEmit && npx tsc -p mcp/tsconfig.json --noEmit && npx eslint mcp src/lib/agent && npx jest` , tudo verde.
- [ ] **Step 4: Commit** , `chore(f3): rebuild + verificacao final (shadow-compare, suite verde)`.

### Task V.4: code review + PR

- [ ] **Step 1:** auto-review do diff F3 (bugs, segurança, RBAC antes do retrieval, fallbacks, nada nasce active).
- [ ] **Step 2:** push + abrir PR para `main` com auto-avaliação, evidências (tsc/jest/recall@K) e link spec/plan. Avisar o humano (merge = decisão dele).

---

## Self-Review (cobertura da spec)

- §4 retrieval → Tasks 3a.1-3a.8 (embeddingText, vetores, pick-tools, camada C, shadow-compare). ✓
- §5.1 intenção → 3b.1-3b.2 (precedência + injeção de args). ✓
- §5.2 verificador → 3b.3-3b.6 (V5-V7 no auto-validator, retry cap=1, Falta Honesta). ✓
- §6 Fora do Catálogo → 3c.1-3c.3 (rename user-facing + dir, Fora de Escopo, gap). ✓
- §4.5/§9 shadow-compare + recall@K → 3a.6, V.1-V.3. ✓
- §8 fallbacks: cada task nova é gated/shadow com fallback. ✓
- Premissas corrigidas pelas reviews [R] honradas: embeddingText (não examples), cache de processo (não pgvector), chave `caminho3` estável, migration p/ shadow-compare, verificador estende auto-validator. ✓

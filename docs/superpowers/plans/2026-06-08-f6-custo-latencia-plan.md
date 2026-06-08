# F6 Custo / Latencia , Implementation Plan (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar a telemetria de custo por CONSULTA (hoje 3 chamadas LLM nao logam), criar um gate de regressao de custo reusando o golden F5, e ativar o retrieval de tools (shadow->active) sob gate de qualidade, sem nenhuma migration.

**Architecture:** Reuso total da infra existente (`LlmUsage`, `calculateCost`, `logUsage`, harness golden F5). Onda 1 adiciona `logUsage` nas 3 chamadas silenciosas via um helper puro testavel, agrega custo por `conversationId` em `usage-stats.ts`, e cria um runner E2E (`cost-regression.e2e.ts`, guard `E2E=1`) que roda `runAgent` num subconjunto representativo e soma o custo real por consulta vs snapshot por cenario. Onda 2 adiciona um `routerOverride` ao `runAgent` (para nao mutar `AgentSettings` global no banco compartilhado), valida o gate triplo (recall@K>=98% + golden F5 verde + golden-under-active verde) e documenta o procedimento de promocao da flag.

**Tech Stack:** TypeScript, Prisma v7 (`LlmUsage`/`AgentSettings`), Jest (unit), `tsx` runner com `--env-file=.env.local` (E2E contra cache real), Zod.

**Historico de revisao:** v1 (12 tasks). v2/v3 aplicam 2 reviews adversariais (Opus). Achados materiais corrigidos: (a) `channel` e campo OBRIGATORIO de `RunAgentInput` , faltava nos runners; (b) o filtro `kpiOuro` colapsava a amostra para 4 entradas (uma `volatil`) , trocado por `classe==="prosseguir" && toolEsperada` (~101 candidatos); (c) enhance so dispara com `source` bubble/suggestion , o harness de custo roda com `source:"bubble"`; (d) NAO mutar `AgentSettings` global (banco compartilhado entre worktrees) , novo `routerOverride` no `runAgent`; (e) Task 5: mock com `chips:[]` fazia o parser lancar antes da assercao , mock corrigido; call-site usa `conversation.slice(-5)`/`agentSettings.maxSuggestions`; (f) `estimarCustoUsd` tautologico , redesenhado como projecao por cenario; (g) mock de `costUsd` usa `Prisma.Decimal` real; (h) cold-cache: o harness mede pior caso , registra `tokensCachedInput` e usa mediana p/ alvo, media p/ regressao do mesmo cenario; (i) gate de qualidade da Onda 2 checa numero, nao so nome de tool; (j) import nao-usado na Task 2 , importar so `ORIGENS`.

**Conta de custo de referencia (spec v3 secao 3):** ~2c/consulta hoje (gpt-5.4-mini, 3 reqs @20k in/800 out). Caching (06-03) + retrieval active -> ~0,96c. O alvo 1-2c ja e o patamar atual; model-tiering FORA.

**Fora de escopo (spec v3 secao 4.3):** model-tiering, short-circuit 1-tool, cache de roteamento/entidade. Nenhuma migration.

**Custo do proprio gate (declarado):** cada execucao do `cost-regression.e2e` roda ~24 consultas reais (~$0,30-0,45 em tokens da credencial de producao). O gate duplo da Onda 2 (Task 14) roda o harness 2x + golden , estimar ~$1 por execucao completa. Rodar na verificacao de onda, nunca em loop.

---

## File Structure

**Onda 1:**
- Create: `src/lib/agent/llm/build-usage-args.ts` (+ test) , helper puro `buildUsageArgs` + `ORIGENS`.
- Modify: `src/lib/agent/run-agent.ts` , `origin` no log do loop; `logUsage` da correcao guardrail e do retry autoValidator; passar `logCtx` ao `enhanceWithChips`.
- Modify: `src/lib/agent/enhance-chips.ts` , `enhanceWithChips` recebe `logCtx` e faz `await logUsage` com `origin: ENHANCE`.
- Modify: `src/lib/agent/llm/usage-stats.ts` , `agregarCustoPorConversa` + tipo `CustoPorConsulta`.
- Modify: `src/lib/agent/llm/catalog.ts` , `estimarCustoUsd` (projecao por cenario).
- Create: `src/lib/agent/llm/__tests__/agregar-custo.test.ts`, `.../estimar-custo.test.ts`.
- Create: `src/lib/agent/evals/cost-regression.e2e.ts` (+ `golden/cost-scorecard.json` gerado).

**Onda 2:**
- Modify: `src/lib/agent/run-agent.ts` , `routerOverride?` em `RunAgentInput`, aplicado apos `loadAgentSettings()`.
- Create: `src/lib/agent/evals/golden-under-active.e2e.ts` , golden via `runAgent` com retrieval active (override), checando tool + numero.
- Create: `docs/RUNBOOK-retrieval-ativacao.md`.

---

## ONDA 1 , Custo por consulta + gate de regressao (SEM migration)

### Task 1: Helper puro `buildUsageArgs` + constantes `ORIGENS`

**Files:**
- Create: `src/lib/agent/llm/build-usage-args.ts`
- Test: `src/lib/agent/llm/__tests__/build-usage-args.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/agent/llm/__tests__/build-usage-args.test.ts
import { buildUsageArgs, ORIGENS } from "../build-usage-args";
import type { ChatResult } from "../types";

const baseResult: ChatResult = {
  message: "ok",
  usage: { tokensInput: 1000, tokensOutput: 200, tokensCachedInput: 800, costUsd: 0.001 },
  reasoningTokens: 30,
};

describe("buildUsageArgs", () => {
  it("monta LogUsageArgs a partir do ChatResult + contexto + origin", () => {
    const args = buildUsageArgs(baseResult, {
      provider: "openai", model: "gpt-5.4-mini", credentialId: "cred-1",
      conversationId: "conv-1", userId: "user-1", isPlayground: false, durationMs: 1234,
    }, ORIGENS.ENHANCE);
    expect(args).toMatchObject({
      provider: "openai", model: "gpt-5.4-mini", credentialId: "cred-1",
      conversationId: "conv-1", userId: "user-1", tokensInput: 1000, tokensOutput: 200,
      tokensCachedInput: 800, reasoningTokens: 30, durationMs: 1234, origin: "enhance", isPlayground: false,
    });
  });
  it("usa defaults seguros quando campos opcionais faltam", () => {
    const r: ChatResult = { message: "x", usage: { tokensInput: 5, tokensOutput: 1, costUsd: 0 } };
    const args = buildUsageArgs(r, { provider: "openai", model: "m" }, ORIGENS.GUARDRAIL);
    expect(args.tokensCachedInput).toBe(0);
    expect(args.reasoningTokens).toBeNull();
    expect(args.origin).toBe("guardrail");
    expect(args.toolCallsCount).toBe(0);
  });
  it("ORIGENS expoe os 4 papeis", () => {
    expect(ORIGENS).toEqual({
      LOOP: "loop_principal", ENHANCE: "enhance", GUARDRAIL: "guardrail", AUTO_VALIDATOR: "auto_validator",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/agent/llm/__tests__/build-usage-args.test.ts`
Expected: FAIL ("Cannot find module '../build-usage-args'").

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/agent/llm/build-usage-args.ts
import type { ChatResult } from "./types";
import type { LogUsageArgs } from "./usage-logger";

/** Origem da chamada LLM dentro de um turno do agente (tag "Origem" no consumo). */
export const ORIGENS = {
  LOOP: "loop_principal",
  ENHANCE: "enhance",
  GUARDRAIL: "guardrail",
  AUTO_VALIDATOR: "auto_validator",
} as const;

export type Origem = (typeof ORIGENS)[keyof typeof ORIGENS];

export interface UsageBase {
  provider: string;
  model: string;
  credentialId?: string;
  conversationId?: string;
  userId?: string;
  isPlayground?: boolean;
  durationMs?: number;
  promptChars?: number;
  responseChars?: number;
}

/**
 * Monta LogUsageArgs a partir de um ChatResult de uma chamada LLM de
 * pos-processamento (enhance/guardrail/autoValidator). Puro e testavel.
 */
export function buildUsageArgs(result: ChatResult, base: UsageBase, origin: Origem): LogUsageArgs {
  return {
    provider: base.provider,
    model: base.model,
    credentialId: base.credentialId,
    conversationId: base.conversationId,
    userId: base.userId,
    isPlayground: base.isPlayground ?? false,
    tokensInput: result.usage.tokensInput,
    tokensOutput: result.usage.tokensOutput,
    tokensCachedInput: result.usage.tokensCachedInput ?? 0,
    reasoningTokens: result.reasoningTokens ?? null,
    toolCallsCount: result.toolCalls?.length ?? 0,
    toolNames: result.toolCalls?.map((t) => t.name) ?? [],
    durationMs: base.durationMs,
    promptChars: base.promptChars,
    responseChars: base.responseChars ?? result.message.length,
    origin,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/agent/llm/__tests__/build-usage-args.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/llm/build-usage-args.ts src/lib/agent/llm/__tests__/build-usage-args.test.ts
git commit -m "feat(f6): helper puro buildUsageArgs + ORIGENS (base da telemetria por consulta)"
```

---

### Task 2: `origin` no logUsage do loop principal

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (~:803)

> NOTA: NAO refatorar o log do loop para usar `buildUsageArgs`. O log do loop tem campos proprios (`promptChars` condicional por iteracao, `errorMessage` de `max_iterations`) que o helper nao cobre; refatorar e risco em codigo de producao testado sem ganho. O helper cobre SO as 3 chamadas de pos-processamento (Tasks 3-5). Aqui so adicionamos a tag `origin`.

- [ ] **Step 1: Add import of ORIGENS (apenas ORIGENS, para nao deixar import nao-usado)**

No topo de `run-agent.ts`, junto aos imports `./llm/*`:

```typescript
import { ORIGENS } from "./llm/build-usage-args";
```

- [ ] **Step 2: Add `origin` to the main-loop logUsage**

No objeto passado a `logUsage` no loop, apos a propriedade `errorMessage: ...`:

```typescript
          errorMessage:
            i === MAX_ITERATIONS - 1 && (result.toolCalls?.length ?? 0) > 0
              ? "max_iterations_exceeded"
              : undefined,
          origin: ORIGENS.LOOP,
```

- [ ] **Step 3: Verify it compiles + lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/agent/run-agent.ts`
Expected: limpo (sem import nao-usado).

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/run-agent.ts
git commit -m "feat(f6): origin=loop_principal no log do loop do agente"
```

---

### Task 3: logUsage da correcao guardrail

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (~:1042-1054 e o import do topo)

- [ ] **Step 1: Estender o import do topo para incluir buildUsageArgs**

Trocar `import { ORIGENS } from "./llm/build-usage-args";` por:

```typescript
import { buildUsageArgs, ORIGENS } from "./llm/build-usage-args";
```

- [ ] **Step 2: Add logUsage right after obtaining `correction`**

Dentro do `try` da correcao, apos `message = correction.message;`:

```typescript
              if (correction.message && correction.message.trim().length > 0) {
                message = correction.message;
              }
              usageWrites.push(
                logUsage(
                  buildUsageArgs(
                    correction,
                    {
                      provider: client.provider,
                      model: client.model,
                      credentialId: resolvedLlm.credentialId ?? undefined,
                      conversationId: args.conversationId,
                      userId: args.userId,
                      isPlayground: args.isPlayground,
                    },
                    ORIGENS.GUARDRAIL,
                  ),
                ),
              );
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors (`client.provider`/`client.model` existem; `usageWrites`/`resolvedLlm` em escopo).

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/run-agent.ts
git commit -m "feat(f6): logUsage origin=guardrail na correcao factual"
```

---

### Task 4: logUsage do retry autoValidator

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (~:1154)

- [ ] **Step 1: Add logUsage right after `retry` resolves**

Apos `const retry = await Promise.race([retryPromise, timeoutPromise]);`:

```typescript
                  const retry = await Promise.race([retryPromise, timeoutPromise]);
                  usageWrites.push(
                    logUsage(
                      buildUsageArgs(
                        retry,
                        {
                          provider: client.provider,
                          model: client.model,
                          credentialId: resolvedLlm.credentialId ?? undefined,
                          conversationId: args.conversationId,
                          userId: args.userId,
                          isPlayground: args.isPlayground,
                          durationMs: Date.now() - retryStart,
                        },
                        ORIGENS.AUTO_VALIDATOR,
                      ),
                    ),
                  );
                  if (retry.message && retry.message.trim().length > 0) {
```

> NOTA: em timeout, o `Promise.race` rejeita e cai no `catch` , nesse caso nao ha `usage` (a chamada pode custar no provider mas nao temos o resultado; custo nao medido conhecido, raro). OK.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/run-agent.ts
git commit -m "feat(f6): logUsage origin=auto_validator no retry corretivo"
```

---

### Task 5: logUsage do enhance (two-pass chips)

**Files:**
- Modify: `src/lib/agent/enhance-chips.ts` (`enhanceWithChips`, ~:128-167)
- Modify: `src/lib/agent/run-agent.ts` (call site ~:837)
- Test: `src/lib/agent/__tests__/enhance-chips-usage.test.ts` (create)

> NOTA: `enhanceWithChips` so e chamado quando `args.source === "bubble" || "suggestion"` (run-agent.ts:833). Logo `origin=enhance` so aparece nesses cenarios , o harness de custo (Task 8) roda com `source:"bubble"` para exercer este caminho.

- [ ] **Step 1: Write the failing test** (mock com `chips` NAO-vazio , senao o parser lanca antes da assercao)

```typescript
// src/lib/agent/__tests__/enhance-chips-usage.test.ts
jest.mock("../llm/usage-logger", () => ({ logUsage: jest.fn().mockResolvedValue(undefined) }));
import { logUsage } from "../llm/usage-logger";
import { enhanceWithChips } from "../enhance-chips";

const fakeClient = {
  provider: "openai",
  model: "gpt-5.4-mini",
  chat: jest.fn().mockResolvedValue({
    // chips NAO-vazio: parseEnhanceResponse lanca EnhanceChipsError se chips=[]
    message: JSON.stringify({ cleanMessage: "oi", chips: ["Quer ver os proximos?"] }),
    usage: { tokensInput: 500, tokensOutput: 100, tokensCachedInput: 0, costUsd: 0.0005 },
  }),
} as any;

it("enhanceWithChips faz await logUsage com origin=enhance quando logCtx e fornecido", async () => {
  await enhanceWithChips({
    client: fakeClient,
    agentResponse: "oi",
    recentHistory: [],
    maxContextual: 3,
    logCtx: { conversationId: "c1", userId: "u1", credentialId: "cred", isPlayground: false },
  });
  expect(logUsage).toHaveBeenCalledTimes(1);
  expect((logUsage as jest.Mock).mock.calls[0][0]).toMatchObject({
    origin: "enhance", conversationId: "c1", tokensInput: 500, tokensOutput: 100,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/agent/__tests__/enhance-chips-usage.test.ts`
Expected: FAIL (`logCtx` nao existe / logUsage nao chamado).

- [ ] **Step 3: Implement , estender `enhanceWithChips`**

Imports no topo de `enhance-chips.ts`:

```typescript
import { logUsage } from "./llm/usage-logger";
import { buildUsageArgs, ORIGENS } from "./llm/build-usage-args";
```

Estender a assinatura (adicionar `logCtx?`):

```typescript
export async function enhanceWithChips(args: {
  client: ProviderClient;
  agentResponse: string;
  recentHistory: ChatMessage[];
  maxContextual: number;
  logCtx?: {
    conversationId?: string;
    userId?: string;
    credentialId?: string;
    isPlayground?: boolean;
  };
}): Promise<EnhanceChipsResult> {
```

Apos `const result = await Promise.race([chatPromise, timeoutPromise]);` e ANTES de `if (!result.message)` (logar antes do parse , o provider ja cobrou mesmo que o parse falhe; `await` elimina race com a agregacao do harness):

```typescript
  const result = await Promise.race([chatPromise, timeoutPromise]);
  if (args.logCtx) {
    await logUsage(
      buildUsageArgs(
        result,
        {
          provider: args.client.provider,
          model: args.client.model,
          credentialId: args.logCtx.credentialId,
          conversationId: args.logCtx.conversationId,
          userId: args.logCtx.userId,
          isPlayground: args.logCtx.isPlayground,
        },
        ORIGENS.ENHANCE,
      ),
    );
  }
  if (!result.message) throw new EnhanceChipsError("resposta vazia");
```

- [ ] **Step 4: Pass logCtx from the run-agent call site**

Em `run-agent.ts` (~:837), no objeto de `enhanceWithChips`, manter os args reais (`recentHistory: conversation.slice(-5)`, `maxContextual: agentSettings.maxSuggestions`) e ADICIONAR `logCtx`:

```typescript
            const enhanced = await enhanceWithChips({
              client,
              agentResponse: result.message,
              recentHistory: conversation.slice(-5),
              maxContextual: agentSettings.maxSuggestions,
              logCtx: {
                conversationId: args.conversationId,
                userId: args.userId,
                credentialId: resolvedLlm.credentialId ?? undefined,
                isPlayground: args.isPlayground,
              },
            });
```

> NOTA: confirme os nomes reais no call-site atual antes de editar; SO adicione `logCtx`, preservando `recentHistory`/`maxContextual` exatamente como ja estao.

- [ ] **Step 5: Run tests (novo + os existentes de enhance-chips) + tsc**

Run: `npx jest src/lib/agent/__tests__/enhance-chips-usage.test.ts src/lib/agent/enhance-chips.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (o import de `usage-logger` nao quebra o carregamento do modulo; `enhance-chips.test.ts` so testa funcoes puras e segue verde) + tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/enhance-chips.ts src/lib/agent/run-agent.ts src/lib/agent/__tests__/enhance-chips-usage.test.ts
git commit -m "feat(f6): logUsage origin=enhance no two-pass de chips (await, sem race)"
```

---

### Task 6: `estimarCustoUsd` , projecao de custo por CENARIO (nao tautologico)

**Files:**
- Modify: `src/lib/agent/llm/catalog.ts`
- Test: `src/lib/agent/llm/__tests__/estimar-custo.test.ts` (create)

> Redesenho (review #2 C2): um alias de `calculateCost` seria tautologico. `estimarCustoUsd` projeta o custo de UMA consulta a partir de um cenario (n reqs, tokens medios, taxa de cache), codificando a "conta de custo de referencia" da spec secao 3. Reusa `calculateCost` para o pricing.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/agent/llm/__tests__/estimar-custo.test.ts
import { estimarCustoUsd } from "../catalog";

it("projeta custo por consulta a partir do cenario (cache reduz o custo)", () => {
  const semCache = estimarCustoUsd({
    modelId: "gpt-5.4-mini", nReqs: 3, avgInputTokens: 20000, avgOutputTokens: 800, cacheHitRate: 0,
  });
  const comCache = estimarCustoUsd({
    modelId: "gpt-5.4-mini", nReqs: 3, avgInputTokens: 20000, avgOutputTokens: 800, cacheHitRate: 0.85,
  });
  expect(semCache.costKnown).toBe(true);
  // gpt-5.4-mini: $0.25/1M in, $2.0/1M out. 3 reqs @20k in/800 out, sem cache:
  // 3*(20000*0.25 + 800*2.0)/1e6 = 3*(0.005+0.0016) = 0.0198
  expect(semCache.custoUsd).toBeCloseTo(0.0198, 4);
  expect(comCache.custoUsd).toBeLessThan(semCache.custoUsd); // cache barateia o input
});

it("modelo desconhecido -> costKnown=false", () => {
  expect(estimarCustoUsd({
    modelId: "modelo-inexistente-xyz", nReqs: 1, avgInputTokens: 100, avgOutputTokens: 100, cacheHitRate: 0,
  }).costKnown).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/agent/llm/__tests__/estimar-custo.test.ts`
Expected: FAIL ("estimarCustoUsd is not a function").

- [ ] **Step 3: Implement (em catalog.ts, apos calculateCost)**

```typescript
export interface CenarioCusto {
  modelId: string;
  nReqs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  /** Fracao do input servida do cache de prompt (0..1). Default 0. */
  cacheHitRate?: number;
}

/**
 * Projeta o custo USD de UMA consulta a partir de um cenario (conta de custo de
 * referencia da F6, spec secao 3). Reusa calculateCost para o pricing por req,
 * dividindo o input em cacheado (fracao do preco) e nao-cacheado.
 */
export function estimarCustoUsd(c: CenarioCusto): { custoUsd: number | null; costKnown: boolean } {
  const cacheRate = Math.min(Math.max(c.cacheHitRate ?? 0, 0), 1);
  const cachedIn = Math.round(c.avgInputTokens * cacheRate);
  const porReq = calculateCost(c.modelId, c.avgInputTokens, c.avgOutputTokens, { cachedInputTokens: cachedIn });
  if (!porReq.costKnown || porReq.costUsd === null) return { custoUsd: null, costKnown: false };
  return { custoUsd: Number((porReq.costUsd * c.nReqs).toFixed(10)), costKnown: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/agent/llm/__tests__/estimar-custo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/llm/catalog.ts src/lib/agent/llm/__tests__/estimar-custo.test.ts
git commit -m "feat(f6): estimarCustoUsd projeta custo por consulta a partir do cenario"
```

---

### Task 7: Agregacao "custo por consulta" em usage-stats.ts

**Files:**
- Modify: `src/lib/agent/llm/usage-stats.ts`
- Test: `src/lib/agent/llm/__tests__/agregar-custo.test.ts` (create, mock prisma com `Prisma.Decimal` real)

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/agent/llm/__tests__/agregar-custo.test.ts
jest.mock("@/lib/prisma", () => ({ prisma: { llmUsage: { findMany: jest.fn() } } }));
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { agregarCustoPorConversa } from "../usage-stats";

it("soma custo/tokens/latencia (Decimal real) e quebra por origin", async () => {
  (prisma.llmUsage.findMany as jest.Mock).mockResolvedValue([
    { costUsd: new Prisma.Decimal("0.0100"), tokensInput: 20000, tokensOutput: 800, tokensCachedInput: 0, durationMs: 1200, costKnown: true, origin: "loop_principal" },
    { costUsd: new Prisma.Decimal("0.0005"), tokensInput: 500, tokensOutput: 100, tokensCachedInput: 0, durationMs: 300, costKnown: true, origin: "enhance" },
  ]);
  const r = await agregarCustoPorConversa("conv-1");
  expect(r.nReqs).toBe(2);
  expect(r.custoUsdTotal).toBeCloseTo(0.0105, 6);
  expect(r.tokensInput).toBe(20500);
  expect(r.latenciaMsTotal).toBe(1500);
  expect(r.todosCustoConhecido).toBe(true);
  expect(r.breakdownPorOrigin.loop_principal.custoUsd).toBeCloseTo(0.01, 6);
  expect(r.breakdownPorOrigin.enhance.custoUsd).toBeCloseTo(0.0005, 6);
});

it("todosCustoConhecido=false quando alguma linha tem costKnown=false", async () => {
  (prisma.llmUsage.findMany as jest.Mock).mockResolvedValue([
    { costUsd: null, tokensInput: 0, tokensOutput: 0, tokensCachedInput: 0, durationMs: 100, costKnown: false, origin: null },
  ]);
  const r = await agregarCustoPorConversa("conv-2");
  expect(r.todosCustoConhecido).toBe(false);
});
```

> NOTA: confirmar o caminho real do client Prisma gerado (`@/generated/prisma/client`); ver um import existente de `Prisma`/`PrismaClient` no repo e usar o mesmo.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/agent/llm/__tests__/agregar-custo.test.ts`
Expected: FAIL ("agregarCustoPorConversa is not a function").

- [ ] **Step 3: Implement (em usage-stats.ts)**

```typescript
export interface CustoPorConsulta {
  conversationId: string;
  nReqs: number;
  custoUsdTotal: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCachedInput: number;
  latenciaMsTotal: number;
  todosCustoConhecido: boolean;
  breakdownPorOrigin: Record<string, { nReqs: number; custoUsd: number; tokensInput: number; tokensOutput: number }>;
}

/**
 * Soma TODAS as linhas LlmUsage de uma consulta (mesmo conversationId) , o custo
 * real do turno, cobrindo loop + enhance + guardrail + autoValidator.
 * todosCustoConhecido=false se qualquer linha veio costKnown=false (o harness de
 * custo deve falhar/marcar indisponivel, nunca somar 0 em silencio).
 */
export async function agregarCustoPorConversa(conversationId: string): Promise<CustoPorConsulta> {
  const rows = await prisma.llmUsage.findMany({
    where: { conversationId },
    select: {
      costUsd: true, costKnown: true, tokensInput: true, tokensOutput: true,
      tokensCachedInput: true, durationMs: true, origin: true,
    },
  });
  const acc: CustoPorConsulta = {
    conversationId, nReqs: rows.length, custoUsdTotal: 0, tokensInput: 0,
    tokensOutput: 0, tokensCachedInput: 0, latenciaMsTotal: 0,
    todosCustoConhecido: true, breakdownPorOrigin: {},
  };
  for (const r of rows) {
    const custo = r.costUsd == null ? 0 : Number(r.costUsd);
    acc.custoUsdTotal += custo;
    acc.tokensInput += r.tokensInput ?? 0;
    acc.tokensOutput += r.tokensOutput ?? 0;
    acc.tokensCachedInput += r.tokensCachedInput ?? 0;
    acc.latenciaMsTotal += r.durationMs ?? 0;
    if (!r.costKnown) acc.todosCustoConhecido = false;
    const key = r.origin ?? "desconhecido";
    const b = (acc.breakdownPorOrigin[key] ??= { nReqs: 0, custoUsd: 0, tokensInput: 0, tokensOutput: 0 });
    b.nReqs += 1; b.custoUsd += custo; b.tokensInput += r.tokensInput ?? 0; b.tokensOutput += r.tokensOutput ?? 0;
  }
  return acc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/agent/llm/__tests__/agregar-custo.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS + tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/llm/usage-stats.ts src/lib/agent/llm/__tests__/agregar-custo.test.ts
git commit -m "feat(f6): agregarCustoPorConversa (custo real por consulta + breakdown por origin)"
```

---

### Task 8: Runner E2E de regressao de custo (gate)

**Files:**
- Create: `src/lib/agent/evals/cost-regression.e2e.ts`
- Create (gerado): `src/lib/agent/evals/golden/cost-scorecard.json`

> Conjunto: `classe==="prosseguir" && toolEsperada` (~101 candidatos; `kpiOuro` e irrelevante para MEDIR custo). Ordenacao estavel por `id`, take 24. Roda com `channel:"bubble"` e `source:"bubble"` (enhance dispara , custo fiel). Trata `runAgent` retornando `{ok:false}` (falta credencial) como ERRO, nao "0 reqs". Registra `tokensCachedInput` agregado (cold-cache e auditavel). Mediana p/ alvo absoluto; media p/ regressao do MESMO cenario.

- [ ] **Step 1: Implement o runner**

```typescript
// src/lib/agent/evals/cost-regression.e2e.ts
// F6 , gate de regressao de CUSTO (runner tsx, guard E2E=1). CUSTA TOKENS (~$0,4/run):
// roda runAgent de verdade num subconjunto do golden (classe=prosseguir) e soma o
// custo real por consulta (todas as linhas LlmUsage do conversationId). Compara com
// o snapshot do MESMO cenario (modelo+flags). Spec: 2026-06-07-f6-custo-latencia-design.md.
//
// Gerar baseline:  E2E=1 COST_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts
// Conferir:        E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { runAgent } from "../run-agent";
import { agregarCustoPorConversa } from "../llm/usage-stats";
import { GoldenSchema, type GoldenEntry } from "./golden-schema";

if (process.env.E2E !== "1") { console.log("SKIP cost-regression (E2E=1 para rodar)"); process.exit(0); }

const GOLDEN_PATH = join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json");
const SNAP_PATH = join(process.cwd(), "src/lib/agent/evals/golden/cost-scorecard.json");
const ALVO_USD = 0.03;        // teto de sanidade (cold-cache infla; alvo real ~1c com cache+retrieval, medido separado)
const COST_KNOWN_MIN = 0.9;   // >=90% das consultas com custo conhecido
const REGRESSAO_TOL = 0.25;   // 25% acima do snapshot do mesmo cenario => falha (variancia de LLM)
const N = 24;

const golden: GoldenEntry[] = GoldenSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")));
const amostra = golden
  .filter((e) => e.classe === "prosseguir" && e.toolEsperada)
  .sort((a, b) => a.id.localeCompare(b.id))
  .slice(0, N);

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function cenarioAtual() {
  const s = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { routerEnabled: true, routerToolRetrieval: true, autoValidatorMode: true, intelligenceModel: true },
  });
  return {
    routerEnabled: s?.routerEnabled ?? false,
    routerToolRetrieval: s?.routerToolRetrieval ?? "shadow",
    autoValidatorMode: s?.autoValidatorMode ?? "shadow",
    modelo: s?.intelligenceModel ?? "(default)",
  };
}
const chaveCenario = (c: Record<string, unknown>) =>
  `${c.modelo}|router=${c.routerEnabled}|retrieval=${c.routerToolRetrieval}|validator=${c.autoValidatorMode}`;

async function main() {
  const cenario = await cenarioAtual();
  const chave = chaveCenario(cenario);
  const porConsulta: number[] = [];
  let comCustoConhecido = 0;
  let tokensCachedTotal = 0;
  let tokensInputTotal = 0;

  for (let idx = 0; idx < amostra.length; idx++) {
    const e = amostra[idx];
    const convId = `cost-f6-${idx}-${e.id}`;
    let res;
    try {
      res = await runAgent({
        userMessage: e.pergunta,
        conversationId: convId,
        userId: "f6-cost",
        channel: "bubble",
        isPlayground: false,
        source: "bubble",
      });
    } catch (err) {
      console.error(`[cost] runAgent THROW em ${e.id}:`, err); process.exit(1);
    }
    if (!res || res.ok !== true) {
      console.error(`[cost] runAgent {ok:false} em ${e.id} (credencial LLM ausente?):`, res); process.exit(1);
    }
    const agg = await agregarCustoPorConversa(convId);
    if (agg.nReqs === 0) { console.warn(`[cost] ${e.id}: 0 linhas LlmUsage`); continue; }
    if (agg.todosCustoConhecido) comCustoConhecido += 1;
    porConsulta.push(agg.custoUsdTotal);
    tokensCachedTotal += agg.tokensCachedInput;
    tokensInputTotal += agg.tokensInput;
    console.log(`[cost] ${e.id}: $${agg.custoUsdTotal.toFixed(5)} reqs=${agg.nReqs} origins=${Object.keys(agg.breakdownPorOrigin).join(",")}`);
  }

  if (porConsulta.length === 0) { console.error("FALHA: nenhuma consulta medida"); process.exit(1); }
  const fracaoConhecida = comCustoConhecido / porConsulta.length;
  const media = porConsulta.reduce((a, b) => a + b, 0) / porConsulta.length;
  const med = mediana(porConsulta);
  const cacheHitRate = tokensInputTotal > 0 ? tokensCachedTotal / tokensInputTotal : 0;
  const scorecard = {
    cenario, chave, n: porConsulta.length, mediaUsd: media, medianaUsd: med,
    maxUsd: Math.max(...porConsulta), fracaoCustoConhecido: fracaoConhecida, cacheHitRate,
  };
  console.log("SCORECARD", JSON.stringify(scorecard, null, 2));

  if (fracaoConhecida < COST_KNOWN_MIN) {
    console.error(`FALHA: costKnown insuficiente (${(fracaoConhecida * 100).toFixed(0)}% < ${COST_KNOWN_MIN * 100}%)`); process.exit(1);
  }
  if (med > ALVO_USD) {
    console.error(`FALHA: mediana $${med.toFixed(5)} > teto $${ALVO_USD}`); process.exit(1);
  }
  if (existsSync(SNAP_PATH)) {
    const prev = JSON.parse(readFileSync(SNAP_PATH, "utf8"));
    if (prev.chave === chave && media > prev.mediaUsd * (1 + REGRESSAO_TOL)) {
      console.error(`FALHA: regressao , media $${media.toFixed(5)} > baseline $${prev.mediaUsd.toFixed(5)} +${REGRESSAO_TOL * 100}%`); process.exit(1);
    }
  }
  if (process.env.COST_WRITE === "1") {
    writeFileSync(SNAP_PATH, JSON.stringify(scorecard, null, 2));
    console.log("baseline gravado:", SNAP_PATH);
  }
  console.log("OK , custo dentro do teto e sem regressao");
  process.exit(0);
}
main();
```

> NOTA: confirmar o nome do campo de classe em `GoldenEntry` (`classe`) no `golden-schema.ts`; se for outro, ajustar o filtro. `runAgent` agora recebe `channel` (obrigatorio).

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: limpo (sem cast `as`; o objeto bate com `RunAgentInput`).

- [ ] **Step 3: Gerar baseline contra o cache real**

Run: `E2E=1 COST_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts`
Expected: custo por consulta + SCORECARD (`medianaUsd` ~0,01-0,02; `cacheHitRate` registrado; `fracaoCustoConhecido>=0.9`). Em pelo menos parte das consultas, `origins` deve incluir `enhance` (alem de `loop_principal`); guardrail/auto_validator so aparecem se dispararem (telemetria de excecao, coberta por unit tests). Grava `cost-scorecard.json`.

- [ ] **Step 4: Conferir o gate (sem write)**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts`
Expected: "OK , custo dentro do teto e sem regressao", exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/evals/cost-regression.e2e.ts src/lib/agent/evals/golden/cost-scorecard.json
git commit -m "feat(f6): gate de regressao de custo (runAgent real + LlmUsage por consulta + snapshot por cenario)"
```

---

### Task 9: Suite completa + verificacao Onda 1

**Files:** nenhum (verificacao) + STATUS/HISTORY

- [ ] **Step 1: Jest completo** , Run: `npx jest --silent 2>&1 | tail -5` , Expected: todas verdes.
- [ ] **Step 2: tsc raiz + mcp** , Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p mcp/tsconfig.json` , Expected: limpos.
- [ ] **Step 3: Golden F5 verde** , Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts` , Expected: GOLDEN_VERDE.
- [ ] **Step 4: Atualizar STATUS.md/HISTORY.md (Onda 1 completa) e commit**

```bash
git add STATUS.md docs/agents/HISTORY.md
git commit -m "docs(f6): Onda 1 completa , telemetria por consulta + gate de regressao de custo verdes"
```

---

## ONDA 2 , Ativar retrieval sob gate (SEM migration)

> DEPENDENCIA: coordenar ordem de merge com a worktree `feat/router-ativacao-r2` (UI do drill-down do Router). NAO tocar aquela branch. Alinhar com o usuario antes de promover a flag em producao.

### Task 10: `routerOverride` em `runAgent` (evita mutar AgentSettings global)

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (`RunAgentInput` ~:200; apos `loadAgentSettings()` ~:409)
- Test: `src/lib/agent/__tests__/router-override.test.ts` (create) , opcional/leve

> Motivo (review #1 A3 / #2 C5): o banco e COMPARTILHADO entre worktrees e com o `npm run dev` da main. Mutar `AgentSettings(id="global")` durante um teste E2E afeta producao/outras sessoes e, se o teste crashar, deixa o estado corrompido. Um override por parametro isola o cenario no escopo da chamada.

- [ ] **Step 1: Add `routerOverride?` ao `RunAgentInput`**

Apos `source?: ...;` em `RunAgentInput`:

```typescript
  /**
   * Override de cenario de router APENAS para harnesses/testes (F6 Onda 2):
   * sobrescreve routerEnabled/routerToolRetrieval lidos do banco, sem mutar
   * AgentSettings global (DB compartilhado). Ausente em producao.
   */
  routerOverride?: {
    enabled?: boolean;
    toolRetrieval?: "shadow" | "active";
  };
```

- [ ] **Step 2: Aplicar o override apos `loadAgentSettings()`**

Logo apos `const agentSettings = await loadAgentSettings();` (~:409):

```typescript
    const agentSettings = await loadAgentSettings();
    if (args.routerOverride) {
      if (args.routerOverride.enabled !== undefined) {
        (agentSettings as { routerEnabled: boolean }).routerEnabled = args.routerOverride.enabled;
      }
      if (args.routerOverride.toolRetrieval !== undefined) {
        (agentSettings as { routerToolRetrieval: string }).routerToolRetrieval = args.routerOverride.toolRetrieval;
      }
    }
```

> NOTA: confirmar a forma exata do objeto retornado por `loadAgentSettings()` (os campos `routerEnabled`/`routerToolRetrieval` existem , linhas 302/316). Ajustar os casts ao tipo real (idealmente sem `as`, se os campos forem mutaveis).

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/run-agent.ts
git commit -m "feat(f6): routerOverride no runAgent (isola cenario de retrieval sem mutar AgentSettings global)"
```

---

### Task 11: Harness , golden F5 sob retrieval active (tool + numero)

**Files:**
- Create: `src/lib/agent/evals/golden-under-active.e2e.ts`

> Gate de QUALIDADE da ativacao: roda `runAgent` com `routerOverride:{enabled:true, toolRetrieval:"active"}` (catalogo cortado) e verifica, por consulta: (a) a `toolEsperada` foi chamada (via `LlmUsage.toolNames`), EXCLUINDO tools do nucleo `EXCLUDE_FROM_FILTERING` (que nunca sao cortadas , gate trivial); (b) onde houver `kpiOuro` nao-volatil, o NUMERO da resposta bate (review #2 C4: nome de tool nao prova acerto). O numero-verdade tambem e coberto pelo `golden-nex.e2e` (handler direto, retrieval-independente) , aqui provamos a ponta a ponta com catalogo cortado.

- [ ] **Step 1: Implement o harness**

```typescript
// src/lib/agent/evals/golden-under-active.e2e.ts
// F6 Onda 2 , gate de QUALIDADE da ativacao do retrieval (guard E2E=1, CUSTA tokens).
// Roda runAgent com routerOverride active (catalogo cortado) e verifica que a tool
// esperada foi chamada (excluindo nucleo) e, quando houver kpiOuro nao-volatil, que
// o numero bate. Complementa retrieval.e2e.ts (recall@K offline).
//   E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-under-active.e2e.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { runAgent } from "../run-agent";
import { GoldenSchema, type GoldenEntry } from "./golden-schema";
import { EXCLUDE_FROM_FILTERING } from "../router/filter-catalog";

if (process.env.E2E !== "1") { console.log("SKIP (E2E=1)"); process.exit(0); }

const golden: GoldenEntry[] = GoldenSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json"), "utf8")),
);
// So entradas cuja tool esperada PODE ser cortada (fora do nucleo) , senao o gate e trivial.
const amostra = golden
  .filter((e) => e.classe === "prosseguir" && e.toolEsperada && !EXCLUDE_FROM_FILTERING.has(e.toolEsperada))
  .sort((a, b) => a.id.localeCompare(b.id))
  .slice(0, 24);

async function main() {
  const falhas: string[] = [];
  for (let idx = 0; idx < amostra.length; idx++) {
    const e = amostra[idx];
    const convId = `active-gate-${idx}-${e.id}`;
    const res = await runAgent({
      userMessage: e.pergunta, conversationId: convId, userId: "f6-active",
      channel: "bubble", isPlayground: false, source: "bubble",
      routerOverride: { enabled: true, toolRetrieval: "active" },
    });
    if (!res || res.ok !== true) { falhas.push(`${e.id}: runAgent {ok:false}`); continue; }
    const rows = await prisma.llmUsage.findMany({ where: { conversationId: convId }, select: { toolNames: true } });
    const chamadas = new Set(rows.flatMap((r) => r.toolNames ?? []));
    if (!chamadas.has(e.toolEsperada!)) {
      falhas.push(`${e.id}: tool ${e.toolEsperada} NAO chamada sob active (catalogo cortado escondeu?) chamou=${[...chamadas].join(",")}`);
      continue;
    }
    // Checagem de numero quando ha kpiOuro nao-volatil: a resposta textual deve conter o valor ouro.
    if (e.kpiOuro?.length && !e.volatil) {
      for (const k of e.kpiOuro) {
        if (k.match && k.match !== "exato") continue; // so valores exatos sao verificaveis no texto
        const alvo = String(k.valor);
        if (!res.message.includes(alvo)) {
          falhas.push(`${e.id}.${k.chave}: valor ouro ${alvo} ausente na resposta sob active`);
        }
      }
    }
  }
  if (falhas.length) { console.error(`FALHA gate active (${falhas.length}):\n` + falhas.join("\n")); process.exit(1); }
  console.log(`OK , ${amostra.length} consultas sob retrieval=active: tool esperada chamada e numero ouro presente`);
  process.exit(0);
}
main();
```

> NOTAS: (1) confirmar que `EXCLUDE_FROM_FILTERING` e exportado de `filter-catalog.ts` e e um `Set<string>` (a review #1 viu o import em run-agent.ts:60); se for outra estrutura/nome, ajustar. (2) A checagem de numero por `includes` no texto e conservadora (pode haver formatacao); se gerar falso-negativo, restringir aos kpiOuro com valor inteiro/identificador e documentar. O numero-verdade canonico segue no `golden-nex.e2e`.

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/evals/golden-under-active.e2e.ts
git commit -m "feat(f6): harness gate de qualidade do retrieval active (tool chamada + numero ouro, via routerOverride)"
```

---

### Task 12: Rodar o gate triplo e medir o ganho

**Files:**
- Create: `docs/RUNBOOK-retrieval-ativacao.md`

> Serializar (rodar um por vez , o cost-regression em active e medido com `routerOverride` no harness, sem UPDATE global concorrente). Nenhuma alteracao de schema.

- [ ] **Step 1: Gate A , recall@K >= 98%**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`
Expected: recall@K >= 98% nas 30 congeladas (exit 0).

- [ ] **Step 2: Gate B , golden F5 padrao verde (numero-verdade)**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts`
Expected: GOLDEN_VERDE.

- [ ] **Step 3: Gate C , golden sob retrieval active**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-under-active.e2e.ts`
Expected: OK (tool chamada + numero presente em todas as consultas da amostra).

- [ ] **Step 4: Medir ganho de custo shadow vs active**

```bash
# baseline shadow (estado atual de prod)
E2E=1 COST_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts
```
Para medir em active sem mutar prod: rodar o `cost-regression` com o cenario active e necessario; como o harness le o cenario do banco, criar uma variante de medicao usando o `golden-under-active` (que ja usa override) instrumentado para somar `agregarCustoPorConversa`, OU promover a flag temporariamente numa janela exclusiva combinada com o usuario. Registrar os dois scorecards (chaves de cenario diferentes => duas baselines) e comparar `medianaUsd`.
Expected: `medianaUsd` em active menor que em shadow (esperado ~-26% pela conta da spec).

> NOTA: se a medicao em active exigir promover a flag em prod, isso e o passo de PROMOCAO (abaixo) e deve ter aval do usuario , nao rodar autonomamente.

- [ ] **Step 5: Escrever o RUNBOOK de promocao**

```markdown
# Runbook , Ativacao do retrieval de tools (routerToolRetrieval shadow->active)

## Pre-condicoes (gate triplo, OBRIGATORIO antes de promover em prod)
- [ ] recall@K >= 98% (retrieval.e2e.ts) , evidencia: <colar saida>
- [ ] golden F5 padrao verde (golden-nex.e2e.ts) , evidencia: <colar saida>
- [ ] golden-under-active verde (golden-under-active.e2e.ts) , evidencia: <colar saida>
- [ ] cost-regression: medianaUsd(active) < medianaUsd(shadow) , evidencia: dois scorecards

## Promocao (config de banco, SEM migration)
A flag vive em AgentSettings(id="global"). Promover via UI de Integracoes/Router
(super_admin) OU script pontual em JANELA EXCLUSIVA (sem outras sessoes/app ativo no DB):
  UPDATE agent_settings SET router_enabled=true, router_tool_retrieval='active' WHERE id='global';
NAO alterar o default do schema (evita migration). Aplicar so apos o gate triplo verde.

## Rollback
  UPDATE agent_settings SET router_tool_retrieval='shadow' WHERE id='global';
(reversivel em segundos; o catalogo volta a ir inteiro ao LLM)

## Coordenacao multi-branch
Banco compartilhado entre worktrees. Alinhar ordem de merge com feat/router-ativacao-r2
antes de promover em prod. A promocao da flag e decisao do usuario (afeta prod).
```

- [ ] **Step 6: Commit**

```bash
git add docs/RUNBOOK-retrieval-ativacao.md src/lib/agent/evals/golden/cost-scorecard.json
git commit -m "docs(f6): runbook de ativacao do retrieval + evidencias do gate triplo e ganho de custo"
```

---

### Task 13: Verificacao final F6 + STATUS/HISTORY + PR

**Files:** STATUS.md, docs/agents/HISTORY.md

- [ ] **Step 1: Suite + tsc final** , Run: `npx jest --silent 2>&1 | tail -5 && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p mcp/tsconfig.json` , Expected: tudo verde.
- [ ] **Step 2: Atualizar STATUS.md (F6 COMPLETA) e HISTORY.md** , telemetria por consulta + gate de regressao verdes; retrieval com gate triplo verde + runbook; alvo 1-2c documentado e medido; sem migration.
- [ ] **Step 3: Commit + push + PR**

```bash
git add STATUS.md docs/agents/HISTORY.md
git commit -m "docs(f6): F6 completa , custo/latencia (telemetria por consulta + gate + retrieval sob gate)"
git push -u origin feat/nex-reconstrucao
gh pr create --title "F6 , Custo/Latencia: telemetria por consulta + gate de regressao + retrieval sob gate" --body "<corpo: escopo, evidencias de teste, conta de custo (~2c hoje -> ~0,96c com retrieval), dependencia de merge com feat/router-ativacao-r2, nenhuma migration>"
```

- [ ] **Step 4: Avaliar o PR no corpo. Antes do merge para main, CONFIRMAR com o usuario a ordem de merge vs `feat/router-ativacao-r2`** (a promocao da flag e o merge para main exigem aval do usuario).

---

## Self-Review (apos 2 reviews adversariais aplicadas)

**Spec coverage:** Onda 1 (logUsage nas 4 origens [T2-T5], agregacao por consulta [T7], estimarCustoUsd por cenario [T6], harness com costKnown+snapshot por cenario+mediana [T8]) e Onda 2 (routerOverride [T10], gate triplo recall@K + golden + golden-under-active com numero [T11-T12], ganho medido, runbook [T12]) cobrem a spec v3 secoes 4.1/4.2/6. Fora de escopo ausente. Sem migration.

**Achados das reviews aplicados:** channel obrigatorio (T8/T11); amostra `prosseguir` n=24 nao `kpiOuro` n=4 (T8/T11); source=bubble p/ enhance disparar (T8); routerOverride em vez de mutar DB global (T10/T11); mock chips nao-vazio + call-site real (T5); estimarCustoUsd por cenario nao tautologico (T6); Prisma.Decimal real no mock (T7); cold-cache auditavel + mediana/teto (T8); gate de qualidade checa numero (T11); import so ORIGENS na T2 (T2); nota anti-refactor do loop (T2); checklist de ordem de merge (T13).

**Type consistency:** `LogUsageArgs`/`ChatResult`/`ChatUsage`/`CenarioCusto`/`CustoPorConsulta`/`ORIGENS`/`buildUsageArgs`/`agregarCustoPorConversa`/`estimarCustoUsd`/`routerOverride` consistentes entre tasks e batendo com o codigo real verificado.

# F6 Custo / Latencia , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar a telemetria de custo por CONSULTA (hoje 3 chamadas LLM nao logam), criar um gate de regressao de custo reusando o golden F5, e ativar o retrieval de tools (shadow->active) sob gate de qualidade, sem nenhuma migration.

**Architecture:** Reuso total da infra existente (`LlmUsage`, `calculateCost`, `logUsage`, harness golden F5). Onda 1 adiciona `logUsage` nas 3 chamadas silenciosas via um helper puro testavel, agrega custo por `conversationId` em `usage-stats.ts`, e cria um runner E2E (`cost-regression.e2e.ts`, guard `E2E=1`) que roda `runAgent` num subconjunto representativo e soma o custo real por consulta vs snapshot por cenario. Onda 2 valida o gate duplo (recall@K>=98% + golden verde com a flag em active) e documenta o procedimento de promocao da flag (config de banco, nao default de schema).

**Tech Stack:** TypeScript, Prisma v7 (`LlmUsage`/`AgentSettings`), Jest (unit), `tsx` runner com `--env-file=.env.local` (E2E contra cache real), Zod.

**Conta de custo de referencia (da spec v3 secao 3):** ~2c/consulta hoje (gpt-5.4-mini, 3 reqs @20k in/800 out). Caching (ja entregue na spec 06-03) + retrieval active -> ~0,96c. O alvo 1-2c ja e o patamar atual; model-tiering fica FORA (desnecessario e sem gate textual inline).

**Fora de escopo (spec v3 secao 4.3):** model-tiering, short-circuit 1-tool, cache de roteamento/entidade. Nenhuma migration.

---

## File Structure

**Onda 1:**
- Create: `src/lib/agent/llm/build-usage-args.ts` , helper puro que monta `LogUsageArgs` a partir de um `ChatResult` + contexto + `origin`. Constantes `ORIGENS`.
- Create: `src/lib/agent/llm/__tests__/build-usage-args.test.ts` , unit.
- Modify: `src/lib/agent/run-agent.ts` , (a) `origin: ORIGENS.LOOP` no logUsage do loop principal (~:803); (b) `logUsage` da correcao guardrail (~:1048); (c) `logUsage` do retry autoValidator (~:1154).
- Modify: `src/lib/agent/enhance-chips.ts` , `enhanceWithChips` recebe contexto de log e chama `logUsage` com `origin: ORIGENS.ENHANCE`.
- Modify: `src/lib/agent/run-agent.ts` (call site de `enhanceWithChips`, ~:837) , passar o contexto de log.
- Modify: `src/lib/agent/llm/usage-stats.ts` , `agregarCustoPorConversa(conversationId)` + tipo `CustoPorConsulta`.
- Modify: `src/lib/agent/llm/catalog.ts` , `estimarCustoUsd` (wrapper fino sobre `calculateCost`).
- Create: `src/lib/agent/llm/__tests__/agregar-custo.test.ts` , unit (mock prisma).
- Create: `src/lib/agent/evals/cost-regression.e2e.ts` , runner E2E (gate de regressao).
- Create: `src/lib/agent/evals/golden/cost-scorecard.json` , snapshot por cenario (gerado pelo runner).

**Onda 2:**
- Create: `src/lib/agent/evals/golden-under-active.e2e.ts` , roda o golden F5 com `routerToolRetrieval=active` forcado (gate de qualidade).
- Modify: `docs/RUNBOOK-retrieval-ativacao.md` (criar) , procedimento de promocao da flag + evidencias do gate duplo.

---

## ONDA 1 , Custo por consulta + gate de regressao (SEM migration)

### Task 1: Helper puro `buildUsageArgs` + constantes `ORIGENS`

**Files:**
- Create: `src/lib/agent/llm/build-usage-args.ts`
- Test: `src/lib/agent/llm/__tests__/build-usage-args.test.ts`

Contexto: as 3 chamadas LLM novas (enhance/guardrail/autoValidator) compartilham a mesma forma de montar `LogUsageArgs` a partir de um `ChatResult`. DRY num helper puro e testavel.

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
      provider: "openai",
      model: "gpt-5.4-mini",
      credentialId: "cred-1",
      conversationId: "conv-1",
      userId: "user-1",
      isPlayground: false,
      durationMs: 1234,
    }, ORIGENS.ENHANCE);

    expect(args).toMatchObject({
      provider: "openai",
      model: "gpt-5.4-mini",
      credentialId: "cred-1",
      conversationId: "conv-1",
      userId: "user-1",
      tokensInput: 1000,
      tokensOutput: 200,
      tokensCachedInput: 800,
      reasoningTokens: 30,
      durationMs: 1234,
      origin: "enhance",
      isPlayground: false,
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

  it("ORIGENS expoe os 4 papeis de pos-processamento + loop", () => {
    expect(ORIGENS).toEqual({
      LOOP: "loop_principal",
      ENHANCE: "enhance",
      GUARDRAIL: "guardrail",
      AUTO_VALIDATOR: "auto_validator",
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
export function buildUsageArgs(
  result: ChatResult,
  base: UsageBase,
  origin: Origem,
): LogUsageArgs {
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
- Modify: `src/lib/agent/run-agent.ts` (~:803, dentro do `logUsage({...})` do loop)

Contexto: o log do loop principal ja existe e esta correto; so falta a tag `origin` (hoje NULL), para a agregacao distinguir o loop dos pos-processadores.

- [ ] **Step 1: Add import of ORIGENS**

No topo de `run-agent.ts`, junto aos imports de `./llm/*`, adicionar:

```typescript
import { buildUsageArgs, ORIGENS } from "./llm/build-usage-args";
```

- [ ] **Step 2: Add `origin` to the main-loop logUsage**

Localizar o objeto passado a `logUsage` no loop (logo apos `errorMessage: ... "max_iterations_exceeded" : undefined,`). Adicionar a propriedade:

```typescript
          errorMessage:
            i === MAX_ITERATIONS - 1 && (result.toolCalls?.length ?? 0) > 0
              ? "max_iterations_exceeded"
              : undefined,
          origin: ORIGENS.LOOP,
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/run-agent.ts
git commit -m "feat(f6): origin=loop_principal no log do loop do agente"
```

---

### Task 3: logUsage da correcao guardrail

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (~:1042-1054, bloco `const correction = await client.chat(...)`)

Contexto: a correcao factual chama `client.chat` mas nao loga. `client`, `resolvedLlm`, `args`, `usageWrites` estao em escopo (mesma funcao). Logar via `usageWrites.push` para ser aguardado antes do return.

- [ ] **Step 1: Add logUsage right after obtaining `correction`**

Dentro do `try` da correcao, logo apos a atribuicao de `message` no `if (correction.message ...)`, antes do `}` do `try`:

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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors. (Confirme que `client.provider`/`client.model` existem , sao usados no log do loop principal.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/run-agent.ts
git commit -m "feat(f6): logUsage origin=guardrail na correcao factual"
```

---

### Task 4: logUsage do retry autoValidator

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (~:1154, apos `const retry = await Promise.race(...)`)

Contexto: o retry corretivo (modo active) chama `client.chat` mas nao loga. Logar apos o `Promise.race` resolver com sucesso.

- [ ] **Step 1: Add logUsage right after `retry` resolves**

Logo apos `const retry = await Promise.race([retryPromise, timeoutPromise]);` e antes/depois do `if (retry.message ...)`:

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

Nota: em timeout o `Promise.race` rejeita e cai no `catch` , nesse caso nao ha `usage` (a chamada pode ainda custar no provider, mas nao temos o resultado; aceitavel, raro, fica como custo nao medido conhecido). Documentar no comentario.

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

Contexto: `enhanceWithChips` descarta `result.usage`. Seguir o padrao de `embed.ts`/`contextualize.ts` (logam internamente com `void logUsage`). Estender a assinatura com um campo opcional `logCtx`.

- [ ] **Step 1: Write the failing test (enhance loga uso)**

```typescript
// src/lib/agent/__tests__/enhance-chips-usage.test.ts
import { enhanceWithChips } from "../enhance-chips";

jest.mock("../llm/usage-logger", () => ({ logUsage: jest.fn().mockResolvedValue(undefined) }));
import { logUsage } from "../llm/usage-logger";

const fakeClient = {
  provider: "openai",
  model: "gpt-5.4-mini",
  chat: jest.fn().mockResolvedValue({
    message: JSON.stringify({ cleanMessage: "oi", chips: [] }),
    usage: { tokensInput: 500, tokensOutput: 100, tokensCachedInput: 0, costUsd: 0.0005 },
  }),
} as any;

it("enhanceWithChips loga uso com origin=enhance quando logCtx e fornecido", async () => {
  await enhanceWithChips({
    client: fakeClient,
    agentResponse: "oi",
    recentHistory: [],
    maxContextual: 3,
    logCtx: { conversationId: "c1", userId: "u1", credentialId: "cred", isPlayground: false },
  });
  expect(logUsage).toHaveBeenCalledTimes(1);
  expect((logUsage as jest.Mock).mock.calls[0][0]).toMatchObject({
    origin: "enhance",
    conversationId: "c1",
    tokensInput: 500,
    tokensOutput: 100,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/agent/__tests__/enhance-chips-usage.test.ts`
Expected: FAIL (`logCtx` nao existe / logUsage nao chamado).

- [ ] **Step 3: Implement , estender `enhanceWithChips`**

No topo de `enhance-chips.ts` adicionar imports:

```typescript
import { logUsage } from "./llm/usage-logger";
import { buildUsageArgs, ORIGENS } from "./llm/build-usage-args";
```

Estender a assinatura do objeto `args` (adicionar campo opcional):

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

Logo apos `const result = await Promise.race([chatPromise, timeoutPromise]);` (linha 163) e antes do `if (!result.message)`:

```typescript
  const result = await Promise.race([chatPromise, timeoutPromise]);
  if (args.logCtx) {
    void logUsage(
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

Em `run-agent.ts` (~:837), no objeto passado a `enhanceWithChips`, adicionar:

```typescript
            const enhanced = await enhanceWithChips({
              client,
              agentResponse: result.message,
              recentHistory: history,
              maxContextual: MAX_CONTEXTUAL_CHIPS,
              logCtx: {
                conversationId: args.conversationId,
                userId: args.userId,
                credentialId: resolvedLlm.credentialId ?? undefined,
                isPlayground: args.isPlayground,
              },
            });
```

Nota: confira os nomes reais dos argumentos atuais de `enhanceWithChips` no call site (ex.: `recentHistory`/`maxContextual`) e mantenha-os; so ADICIONE `logCtx`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx jest src/lib/agent/__tests__/enhance-chips-usage.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS + tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/enhance-chips.ts src/lib/agent/run-agent.ts src/lib/agent/__tests__/enhance-chips-usage.test.ts
git commit -m "feat(f6): logUsage origin=enhance no two-pass de chips"
```

---

### Task 6: `estimarCustoUsd` (wrapper fino sobre calculateCost)

**Files:**
- Modify: `src/lib/agent/llm/catalog.ts` (adicionar export apos `calculateCost`)
- Test: `src/lib/agent/llm/__tests__/estimar-custo.test.ts` (create)

Contexto: criterio de aceite pede `estimarCustoUsd`; e so um nome de dominio sobre `calculateCost`, sem reimplementar tabela.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/agent/llm/__tests__/estimar-custo.test.ts
import { estimarCustoUsd, calculateCost } from "../catalog";

it("estimarCustoUsd == calculateCost (mesmo modelo/tokens)", () => {
  const a = estimarCustoUsd("gpt-5.4-mini", 20000, 800);
  const b = calculateCost("gpt-5.4-mini", 20000, 800);
  expect(a.costUsd).toBe(b.costUsd);
  expect(a.costKnown).toBe(b.costKnown);
});

it("modelo desconhecido -> costKnown=false", () => {
  expect(estimarCustoUsd("modelo-inexistente-xyz", 100, 100).costKnown).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/agent/llm/__tests__/estimar-custo.test.ts`
Expected: FAIL ("estimarCustoUsd is not a function").

- [ ] **Step 3: Implement (em catalog.ts, logo apos calculateCost)**

```typescript
/**
 * Estima o custo USD de uma chamada LLM. Wrapper de dominio sobre
 * `calculateCost` (mesma tabela de precos versionada); existe para o
 * harness de custo da F6 expressar intencao sem reimplementar pricing.
 */
export function estimarCustoUsd(
  modelId: string,
  tokensInput: number,
  tokensOutput: number,
  extras?: { durationMs?: number; cachedInputTokens?: number },
): { costUsd: number | null; costKnown: boolean } {
  return calculateCost(modelId, tokensInput, tokensOutput, extras);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/agent/llm/__tests__/estimar-custo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/llm/catalog.ts src/lib/agent/llm/__tests__/estimar-custo.test.ts
git commit -m "feat(f6): estimarCustoUsd (wrapper de dominio sobre calculateCost)"
```

---

### Task 7: Agregacao "custo por consulta" em usage-stats.ts

**Files:**
- Modify: `src/lib/agent/llm/usage-stats.ts` (adicionar funcao + tipo)
- Test: `src/lib/agent/llm/__tests__/agregar-custo.test.ts` (create, mock prisma)

Contexto: hoje a agregacao e por conversa inteira/dia/modelo. Falta somar o custo REAL de UMA consulta (todas as linhas `LlmUsage` daquele `conversationId`), com breakdown por `origin` e guarda de `costKnown`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/agent/llm/__tests__/agregar-custo.test.ts
jest.mock("@/lib/prisma", () => ({
  prisma: { llmUsage: { findMany: jest.fn() } },
}));
import { prisma } from "@/lib/prisma";
import { agregarCustoPorConversa } from "../usage-stats";

const rows = (over: Partial<Record<string, unknown>>[] = []) => over;

it("soma custo/tokens/latencia e quebra por origin", async () => {
  (prisma.llmUsage.findMany as jest.Mock).mockResolvedValue([
    { costUsd: "0.0100", tokensInput: 20000, tokensOutput: 800, durationMs: 1200, costKnown: true, origin: "loop_principal" },
    { costUsd: "0.0005", tokensInput: 500, tokensOutput: 100, durationMs: 300, costKnown: true, origin: "enhance" },
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

it("marca todosCustoConhecido=false quando alguma linha tem costKnown=false", async () => {
  (prisma.llmUsage.findMany as jest.Mock).mockResolvedValue([
    { costUsd: null, tokensInput: 0, tokensOutput: 0, durationMs: 100, costKnown: false, origin: null },
  ]);
  const r = await agregarCustoPorConversa("conv-2");
  expect(r.todosCustoConhecido).toBe(false);
});
```

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
 * Soma TODAS as linhas LlmUsage de uma consulta (mesmo conversationId) , o
 * custo real do turno, cobrindo loop + enhance + guardrail + autoValidator.
 * `todosCustoConhecido=false` se qualquer linha veio costKnown=false (o
 * harness de custo deve falhar/marcar indisponivel, nunca somar 0 em silencio).
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

Contexto: este runner CUSTA tokens (roda `runAgent` de verdade). Guard `E2E=1`. Roda um subconjunto representativo do golden (perguntas com `kpiOuro`, "prosseguir"), uma por `conversationId` unico, le `agregarCustoPorConversa`, soma por consulta, grava snapshot por cenario e FALHA em regressao / alvo estourado / costKnown insuficiente. Padrao espelha `golden-nex.e2e.ts` (cabecalho, guard, tsx).

- [ ] **Step 1: Implement o runner**

```typescript
// src/lib/agent/evals/cost-regression.e2e.ts
// F6 , gate de regressao de CUSTO (runner tsx, guard E2E=1). CUSTA TOKENS:
// roda runAgent de verdade num subconjunto do golden e soma o custo real por
// consulta (todas as linhas LlmUsage do conversationId). Compara com o snapshot
// do MESMO cenario (modelo+flags). Spec: 2026-06-07-f6-custo-latencia-design.md.
//
// Gerar baseline:  E2E=1 COST_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts
// Conferir:        E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { runAgent } from "../run-agent";
import { agregarCustoPorConversa } from "../llm/usage-stats";
import { GoldenSchema, type GoldenEntry } from "./golden-schema";

if (process.env.E2E !== "1") {
  console.log("SKIP cost-regression (defina E2E=1 para rodar contra o cache real)");
  process.exit(0);
}

const GOLDEN_PATH = join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json");
const SNAP_PATH = join(process.cwd(), "src/lib/agent/evals/golden/cost-scorecard.json");
const ALVO_USD = 0.02;           // 2 centavos , teto da spec
const COST_KNOWN_MIN = 0.9;      // >=90% das consultas com custo conhecido
const REGRESSAO_TOL = 0.15;      // 15% acima do snapshot do mesmo cenario => falha

const golden: GoldenEntry[] = GoldenSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")));
// Subconjunto representativo: perguntas de dado (tem toolEsperada e kpiOuro).
const amostra = golden.filter((e) => e.toolEsperada && e.kpiOuro && e.kpiOuro.length > 0).slice(0, 12);

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

  for (let idx = 0; idx < amostra.length; idx++) {
    const e = amostra[idx];
    const convId = `cost-f6-${idx}-${e.id}`;
    try {
      await runAgent({
        userMessage: e.pergunta,
        conversationId: convId,
        userId: "f6-cost",
        isPlayground: true,
        source: "playground",
      } as Parameters<typeof runAgent>[0]);
    } catch (err) {
      console.warn(`[cost] runAgent falhou em ${e.id}:`, err);
      continue;
    }
    const agg = await agregarCustoPorConversa(convId);
    if (agg.nReqs === 0) { console.warn(`[cost] ${e.id}: 0 linhas LlmUsage`); continue; }
    if (agg.todosCustoConhecido) comCustoConhecido += 1;
    porConsulta.push(agg.custoUsdTotal);
    console.log(`[cost] ${e.id}: $${agg.custoUsdTotal.toFixed(5)} reqs=${agg.nReqs} origins=${Object.keys(agg.breakdownPorOrigin).join(",")}`);
  }

  if (porConsulta.length === 0) { console.error("FALHA: nenhuma consulta medida"); process.exit(1); }
  const fracaoConhecida = comCustoConhecido / porConsulta.length;
  const media = porConsulta.reduce((a, b) => a + b, 0) / porConsulta.length;
  const scorecard = {
    cenario, chave, n: porConsulta.length, mediaUsd: media,
    maxUsd: Math.max(...porConsulta), fracaoCustoConhecido: fracaoConhecida,
  };
  console.log("SCORECARD", JSON.stringify(scorecard, null, 2));

  // costKnown insuficiente => indisponivel (nunca aprovar somando 0 em silencio)
  if (fracaoConhecida < COST_KNOWN_MIN) {
    console.error(`FALHA: costKnown insuficiente (${(fracaoConhecida * 100).toFixed(0)}% < ${COST_KNOWN_MIN * 100}%)`);
    process.exit(1);
  }
  // alvo absoluto
  if (media > ALVO_USD) {
    console.error(`FALHA: media $${media.toFixed(5)} > alvo $${ALVO_USD}`);
    process.exit(1);
  }
  // regressao vs snapshot do MESMO cenario
  if (existsSync(SNAP_PATH)) {
    const prev = JSON.parse(readFileSync(SNAP_PATH, "utf8"));
    if (prev.chave === chave && media > prev.mediaUsd * (1 + REGRESSAO_TOL)) {
      console.error(`FALHA: regressao , media $${media.toFixed(5)} > baseline $${prev.mediaUsd.toFixed(5)} +${REGRESSAO_TOL * 100}%`);
      process.exit(1);
    }
  }
  if (process.env.COST_WRITE === "1") {
    writeFileSync(SNAP_PATH, JSON.stringify(scorecard, null, 2));
    console.log("baseline gravado:", SNAP_PATH);
  }
  console.log("OK , custo dentro do alvo e sem regressao");
  process.exit(0);
}
main();
```

Nota de assinatura: ajustar os campos de `runAgent({...})` aos nomes reais da assinatura atual (verificar em `run-agent.ts` os campos obrigatorios: `userMessage`, `conversationId`, `userId`, `source`, etc.). O cast existe so para o plano; na execucao, usar os nomes reais.

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: limpo (apos ajustar a assinatura de runAgent aos nomes reais).

- [ ] **Step 3: Gerar baseline contra o cache real**

Run: `E2E=1 COST_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts`
Expected: imprime custo por consulta, SCORECARD com `mediaUsd` na ordem de ~0,01-0,02; grava `cost-scorecard.json`. Conferir que `fracaoCustoConhecido >= 0.9` e que os `origins` incluem `loop_principal` e (quando aplicavel) `enhance`/`guardrail`/`auto_validator`.

- [ ] **Step 4: Conferir o gate (sem write)**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts`
Expected: "OK , custo dentro do alvo e sem regressao", exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/evals/cost-regression.e2e.ts src/lib/agent/evals/golden/cost-scorecard.json
git commit -m "feat(f6): gate de regressao de custo (runAgent real + LlmUsage por consulta + snapshot por cenario)"
```

---

### Task 9: Suite completa + verificacao Onda 1

**Files:** nenhum (verificacao)

- [ ] **Step 1: Jest completo**

Run: `npx jest --silent 2>&1 | tail -5`
Expected: todas as suites verdes (sem regressao vs baseline F5).

- [ ] **Step 2: tsc raiz + mcp**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p mcp/tsconfig.json`
Expected: ambos limpos.

- [ ] **Step 3: Golden F5 continua verde (qualidade preservada)**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts`
Expected: GOLDEN_VERDE (numero/alucinacao/desambiguacao).

- [ ] **Step 4: Atualizar STATUS.md/HISTORY.md (Onda 1 completa) e commit**

```bash
git add STATUS.md docs/agents/HISTORY.md
git commit -m "docs(f6): Onda 1 completa , telemetria por consulta + gate de regressao de custo verdes"
```

---

## ONDA 2 , Ativar retrieval sob gate duplo (SEM migration)

> DEPENDENCIA: coordenar ordem de merge com a worktree `feat/router-ativacao-r2` (UI do drill-down do Router). NAO tocar aquela branch. Alinhar com o usuario antes de promover a flag em producao.

### Task 10: Harness , golden F5 sob `routerToolRetrieval=active`

**Files:**
- Create: `src/lib/agent/evals/golden-under-active.e2e.ts`

Contexto: o golden F5 hoje roda chamando `tool.handler` direto (nao passa pelo retrieval). O gate da Onda 2 precisa provar que, com o catalogo CORTADO (retrieval active), o agente ainda seleciona a tool certa e acerta. Este harness roda `runAgent` (que aplica o filtro) com a flag forcada para active e verifica que a tool esperada foi chamada e o numero bate.

- [ ] **Step 1: Implement o harness**

```typescript
// src/lib/agent/evals/golden-under-active.e2e.ts
// F6 Onda 2 , gate de QUALIDADE da ativacao do retrieval (guard E2E=1, CUSTA tokens).
// Roda runAgent com routerEnabled=true + routerToolRetrieval=active forcados e
// verifica que a tool esperada do golden foi efetivamente chamada (catalogo
// cortado nao escondeu a tool certa). Complementa retrieval.e2e.ts (recall@K).
//   E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-under-active.e2e.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { runAgent } from "../run-agent";
import { GoldenSchema, type GoldenEntry } from "./golden-schema";

if (process.env.E2E !== "1") { console.log("SKIP (E2E=1)"); process.exit(0); }

const golden: GoldenEntry[] = GoldenSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json"), "utf8")),
);
const amostra = golden.filter((e) => e.toolEsperada && e.kpiOuro?.length).slice(0, 12);

async function main() {
  // Forca o cenario active SOMENTE para a duracao do teste; restaura no fim.
  const prev = await prisma.agentSettings.findUnique({
    where: { id: "global" }, select: { routerEnabled: true, routerToolRetrieval: true },
  });
  await prisma.agentSettings.update({
    where: { id: "global" }, data: { routerEnabled: true, routerToolRetrieval: "active" },
  });
  const falhas: string[] = [];
  try {
    for (let idx = 0; idx < amostra.length; idx++) {
      const e = amostra[idx];
      const convId = `active-gate-${idx}-${e.id}`;
      const res = await runAgent({
        userMessage: e.pergunta, conversationId: convId, userId: "f6-active",
        isPlayground: true, source: "playground",
      } as Parameters<typeof runAgent>[0]);
      // Verifica via LlmUsage.toolNames que a tool esperada foi chamada no turno.
      const rows = await prisma.llmUsage.findMany({ where: { conversationId: convId }, select: { toolNames: true } });
      const chamadas = new Set(rows.flatMap((r) => r.toolNames ?? []));
      if (!chamadas.has(e.toolEsperada!)) {
        falhas.push(`${e.id}: tool ${e.toolEsperada} NAO chamada (catalogo cortado escondeu?) chamou=${[...chamadas].join(",")}`);
      }
    }
  } finally {
    await prisma.agentSettings.update({
      where: { id: "global" },
      data: {
        routerEnabled: prev?.routerEnabled ?? false,
        routerToolRetrieval: prev?.routerToolRetrieval ?? "shadow",
      },
    });
  }
  if (falhas.length) { console.error("FALHA gate active:\n" + falhas.join("\n")); process.exit(1); }
  console.log(`OK , ${amostra.length} consultas: tool esperada chamada sob retrieval=active`);
  process.exit(0);
}
main();
```

Nota: confirmar que `LlmUsage.toolNames` e populado no turno (Task 2 mantem `toolNames` no log do loop). Se a verificacao por `toolNames` for fraca para alguma tool, complementar checando o numero `kpiOuro` na resposta (reusar `getKpi` de golden-nex.e2e.ts).

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: limpo (ajustar assinatura de runAgent aos nomes reais).

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/evals/golden-under-active.e2e.ts
git commit -m "feat(f6): harness gate de qualidade do retrieval active (tool esperada chamada com catalogo cortado)"
```

---

### Task 11: Rodar o gate duplo e medir o ganho

**Files:**
- Create: `docs/RUNBOOK-retrieval-ativacao.md`

Contexto: executar as duas metades do gate e medir shadow vs active. Nenhuma alteracao de schema; a promocao e config de banco.

- [ ] **Step 1: Gate A , recall@K >= 98%**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`
Expected: recall@K >= 98% nas 30 congeladas (exit 0).

- [ ] **Step 2: Gate B , golden de qualidade sob active**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-under-active.e2e.ts`
Expected: OK (tool esperada chamada em todas as consultas da amostra).

- [ ] **Step 3: Golden F5 padrao continua verde**

Run: `E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts`
Expected: GOLDEN_VERDE.

- [ ] **Step 4: Medir ganho de custo shadow vs active**

```bash
# baseline shadow (estado atual)
E2E=1 COST_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts
# liga active so para medir, mede, e o proprio golden-under-active restaura;
# para medir custo em active, setar manualmente via UI/script, rodar cost-regression de novo,
# comparar mediaUsd dos dois cenarios (chaves de cenario diferentes => duas baselines).
```
Expected: `mediaUsd` em active menor que em shadow (esperado ~-26% pela conta da spec). Registrar os dois scorecards.

- [ ] **Step 5: Escrever o RUNBOOK de promocao**

```markdown
# Runbook , Ativacao do retrieval de tools (routerToolRetrieval shadow->active)

## Pre-condicoes (gate duplo, OBRIGATORIO)
- [ ] recall@K >= 98% (retrieval.e2e.ts) , evidencia: <colar saida>
- [ ] golden-under-active verde , evidencia: <colar saida>
- [ ] golden F5 padrao verde , evidencia: <colar saida>
- [ ] cost-regression: mediaUsd(active) < mediaUsd(shadow) , evidencia: dois scorecards

## Promocao (config de banco, SEM migration)
A flag vive em AgentSettings (id="global"). Promover via UI de Integracoes/Router
(super_admin) OU script pontual:
  UPDATE agent_settings SET router_enabled=true, router_tool_retrieval='active' WHERE id='global';
NAO alterar o default do schema (evita migration). Producao: aplicar so apos o gate verde.

## Rollback
  UPDATE agent_settings SET router_tool_retrieval='shadow' WHERE id='global';
(reversivel em segundos; o catalogo volta a ir inteiro ao LLM)

## Coordenacao multi-branch
Alinhar ordem de merge com feat/router-ativacao-r2 antes de promover em prod.
```

- [ ] **Step 6: Commit**

```bash
git add docs/RUNBOOK-retrieval-ativacao.md src/lib/agent/evals/golden/cost-scorecard.json
git commit -m "docs(f6): runbook de ativacao do retrieval + evidencias do gate duplo e ganho de custo"
```

---

### Task 12: Verificacao final F6 + STATUS/HISTORY + PR

**Files:** STATUS.md, docs/agents/HISTORY.md

- [ ] **Step 1: Suite + tsc final**

Run: `npx jest --silent 2>&1 | tail -5 && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p mcp/tsconfig.json`
Expected: tudo verde.

- [ ] **Step 2: Atualizar STATUS.md (F6 COMPLETA) e HISTORY.md**

Marcar F6 completa: telemetria por consulta + gate de regressao de custo verdes; retrieval com gate duplo verde e runbook de promocao pronto; alvo 1-2c documentado e medido; sem migration.

- [ ] **Step 3: Commit + push + PR**

```bash
git add STATUS.md docs/agents/HISTORY.md
git commit -m "docs(f6): F6 completa , custo/latencia (telemetria por consulta + gate + retrieval sob gate)"
git push -u origin feat/nex-reconstrucao
gh pr create --title "F6 , Custo/Latencia: telemetria por consulta + gate de regressao + retrieval sob gate" --body "<corpo com escopo, evidencias de teste, conta de custo, dependencia de merge com feat/router-ativacao-r2>"
```

- [ ] **Step 4: Avaliar o PR no corpo e aguardar decisao de merge do usuario** (merge para main e o unico ponto que exige confirmacao).

---

## Self-Review (preenchido pelo autor)

**Spec coverage:** Onda 1 (criterios: logUsage completo nas 4 origens [T2-T5], agregacao por consulta [T7], estimarCustoUsd [T6], harness com costKnown+snapshot por cenario [T8]) e Onda 2 (gate duplo recall@K + golden active [T10-T11], ganho medido, runbook [T11]) cobrem a spec v3 secoes 4.1/4.2/6. Fora de escopo (model-tiering/short-circuit/cache) corretamente ausentes. Sem migration em nenhuma task.

**Placeholder scan:** as duas notas de "ajustar assinatura real de runAgent/enhanceWithChips" sao verificacoes deliberadas (o executor confirma os nomes no codigo), nao placeholders de logica , o codigo concreto esta todo presente.

**Type consistency:** `LogUsageArgs` (usage-logger), `ChatResult`/`ChatUsage` (types.ts), `ORIGENS`/`buildUsageArgs` (T1) e `CustoPorConsulta`/`agregarCustoPorConversa` (T7) usados de forma consistente entre tasks.

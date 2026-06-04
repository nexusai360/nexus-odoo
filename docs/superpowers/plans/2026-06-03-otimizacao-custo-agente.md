# Otimização de custo do Agente Nex , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir o custo por pergunta do Agente Nex destravando o prompt caching da OpenAI e limitando o volume de dados que as tools de listagem entregam ao LLM, sem degradar qualidade.

**Architecture:** Três frentes independentes. (A) Caching: estabilizar o prefixo do prompt (data sai do topo), ler/persistir/precificar tokens cacheados. (B+C+D) Paginação: uma engrenagem central (`mcp/lib/paginacao.ts`) + adoção `limit`/`offset` nas tools de lista grande, com `LIMIT/OFFSET` no SQL e `COUNT`, ordenação estável. (E) Prompt ensina o agente a listar 10 por vez e pedir "os próximos" via offset. Paginação stateless: o offset vive no histórico da conversa.

**Tech Stack:** TypeScript, Prisma v7, Zod, `@modelcontextprotocol/sdk`, OpenAI Responses API, Jest.

**Spec:** `docs/superpowers/specs/2026-06-03-otimizacao-custo-agente-design.md`

---

## Fase A , Alavanca 1: Prompt caching da OpenAI

### Task A1: Mover a data atual para fora do prefixo cacheável

**Files:**
- Modify: `src/lib/agent/run-agent.ts:426` (montagem do `systemPrompt`)
- Modify: `src/lib/agent/run-agent.ts:588-592` (montagem de `conversation`)
- Test: `src/lib/agent/run-agent.contextual.test.ts` (ou novo `run-agent.prompt-prefix.test.ts`)

- [ ] **Step 1: Write the failing test** , o system prompt não pode conter a data/hora; ela vira item de input antes da pergunta.

```ts
// run-agent.prompt-prefix.test.ts
import { montarConversa } from "@/lib/agent/prompt/montar-conversa";

test("system prompt nao contem data (prefixo estavel)", () => {
  const { conversation } = montarConversa({
    systemPromptBase: "REGRAS FIXAS",
    historyMessages: [],
    userMessage: "quanto faturei?",
    agoraBrt: "quarta-feira, 2026-06-03",
  });
  const system = conversation.find((m) => m.role === "system");
  expect(system?.content).toBe("REGRAS FIXAS");
  expect(system?.content).not.toMatch(/2026-06-03/);
});

test("data entra como item de input imediatamente antes da pergunta", () => {
  const { conversation } = montarConversa({
    systemPromptBase: "REGRAS FIXAS",
    historyMessages: [],
    userMessage: "quanto faturei?",
    agoraBrt: "quarta-feira, 2026-06-03",
  });
  const idxData = conversation.findIndex((m) => m.content.includes("2026-06-03"));
  const idxPergunta = conversation.findIndex((m) => m.content.includes("quanto faturei?"));
  expect(idxData).toBeGreaterThanOrEqual(0);
  expect(idxData).toBe(idxPergunta - 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest run-agent.prompt-prefix -i`
Expected: FAIL ("Cannot find module montar-conversa").

- [ ] **Step 3: Extrair a montagem da conversa para uma função pura testável**

```ts
// src/lib/agent/prompt/montar-conversa.ts
import type { ChatMessage, ToolCall } from "@/lib/agent/llm/types";

export interface MontarConversaArgs {
  systemPromptBase: string;
  historyMessages: ChatMessage[];
  userMessage: string;
  /** Ex.: "quarta-feira, 2026-06-03". Vai como item de input, fora do prefixo. */
  agoraBrt: string;
}

export function montarConversa(args: MontarConversaArgs): { conversation: ChatMessage[] } {
  const dataItem: ChatMessage = {
    role: "user",
    content:
      `[Contexto] Data atual (America/Sao_Paulo, UTC-3): ${args.agoraBrt}. ` +
      `Use SEMPRE esta data para resolver "hoje", "ontem", "amanha", "mes corrente", "essa semana" e "este ano".`,
  };
  const conversation: ChatMessage[] = [
    { role: "system", content: args.systemPromptBase },
    ...args.historyMessages,
    dataItem,
    { role: "user", content: args.userMessage },
  ];
  return { conversation };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest run-agent.prompt-prefix -i`
Expected: PASS.

- [ ] **Step 5: Ligar a função no run-agent** , substituir a montagem inline (linhas 426 e 588-592) por `montarConversa(...)`. Remover a concatenação da data no `systemPrompt` (linha 426); o `systemPrompt` passa a ser só `systemPromptBase`. Calcular `agoraBrt` com granularidade de **dia + dia da semana** (sem hora/segundos).

```ts
// substitui a linha 426
const systemPrompt = systemPromptBase;
// ... onde hoje monta `conversation` (588-592):
const { conversation } = montarConversa({
  systemPromptBase: systemPrompt,
  historyMessages,
  userMessage: args.userMessage,
  agoraBrt, // ja calculado acima, agora so com dia + dia-da-semana
});
```

- [ ] **Step 6: Run full agent tests + tsc**

Run: `npx jest run-agent -i && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/prompt/montar-conversa.ts src/lib/agent/run-agent.ts src/lib/agent/prompt/*.test.ts
git commit -m "fix(agent): data atual sai do topo do prompt (prefixo estavel p/ cache OpenAI)"
```

### Task A2: Ler tokens cacheados no provider OpenAI

**Files:**
- Modify: `src/lib/agent/llm/providers/openai.ts` (parsing de `usage`)
- Modify: `src/lib/agent/llm/types.ts` (campo `tokensCachedInput` em `ChatUsage`)
- Test: `src/lib/agent/llm/providers/openai.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("le cached_tokens da Responses API", () => {
  const usage = parseOpenAiUsage({
    input_tokens: 20000,
    output_tokens: 800,
    input_tokens_details: { cached_tokens: 18000 },
  });
  expect(usage.tokensInput).toBe(20000);
  expect(usage.tokensCachedInput).toBe(18000);
});

test("fallback cached_tokens ausente => 0", () => {
  const usage = parseOpenAiUsage({ input_tokens: 100, output_tokens: 10 });
  expect(usage.tokensCachedInput).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest openai.test -i`
Expected: FAIL ("parseOpenAiUsage is not a function").

- [ ] **Step 3: Implementar `parseOpenAiUsage` e usar nos dois branches (responses + chat)**

```ts
// openai.ts
export function parseOpenAiUsage(u: {
  input_tokens?: number; output_tokens?: number;
  prompt_tokens?: number; completion_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  prompt_tokens_details?: { cached_tokens?: number };
}): { tokensInput: number; tokensOutput: number; tokensCachedInput: number } {
  const tokensInput = u.input_tokens ?? u.prompt_tokens ?? 0;
  const tokensOutput = u.output_tokens ?? u.completion_tokens ?? 0;
  const tokensCachedInput =
    u.input_tokens_details?.cached_tokens ??
    u.prompt_tokens_details?.cached_tokens ??
    0;
  return { tokensInput, tokensOutput, tokensCachedInput };
}
```

Substituir as leituras manuais (`data.usage?.prompt_tokens ?? 0`, etc.) por `parseOpenAiUsage(data.usage ?? {})` nos dois branches. Passar `tokensCachedInput` adiante no objeto de usage retornado.

- [ ] **Step 4: Add `tokensCachedInput` to `ChatUsage` type** em `types.ts` (default 0; campo opcional para não quebrar Anthropic/Gemini).

- [ ] **Step 5: Run tests + tsc**

Run: `npx jest openai.test -i && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/llm/providers/openai.ts src/lib/agent/llm/types.ts src/lib/agent/llm/providers/openai.test.ts
git commit -m "feat(agent): provider OpenAI le cached_tokens (responses + chat)"
```

### Task A3: Migração Prisma , coluna de tokens cacheados

**Files:**
- Modify: `prisma/schema.prisma` (modelo de uso/billing , o usado por `usage-logger`)
- Migration: `prisma/migrations/<ts>_add_tokens_cached_input/`
- Test: n/a (migração)

- [ ] **Step 1: Localizar o modelo de uso** , `grep -n "model .*Usage\|tokensInput\|tokens_input" prisma/schema.prisma`. Adicionar:

```prisma
  tokensCachedInput Int @default(0) @map("tokens_cached_input")
```

- [ ] **Step 2: Avisar schema change** (protocolo) , anunciar ao usuário que vai rodar migration; outras worktrees podem precisar sincronizar.

- [ ] **Step 3: Rodar migration**

Run: `npx prisma migrate dev --name add_tokens_cached_input`
Expected: migração aplicada; `prisma generate` ok.

- [ ] **Step 4: `agente schema-changed`** , registrar o sinal para outras worktrees.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): coluna tokens_cached_input no registro de uso"
```

### Task A4: Persistir e precificar tokens cacheados

**Files:**
- Modify: `src/lib/agent/llm/usage-logger.ts` (gravar `tokensCachedInput`)
- Modify: `src/lib/agent/llm/billing.ts` (cálculo de custo com fração cacheada)
- Modify: catálogo de preços de modelo (onde `calculateCost` lê preço/token) , localizar via `grep -rn "calculateCost\|pricePerInput\|inputPrice" src/lib/agent/llm`
- Test: `src/lib/agent/llm/billing.test.ts` (ou `usage-logger.test.ts`)

- [ ] **Step 1: Write the failing test** , custo com cache < custo sem cache.

```ts
test("custo aplica preco reduzido na fracao cacheada", () => {
  const semCache = calculateCost("gpt-5.4-mini", 20000, 800, 0).costUsd;
  const comCache = calculateCost("gpt-5.4-mini", 20000, 800, 18000).costUsd;
  expect(comCache).toBeLessThan(semCache);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest billing.test -i`
Expected: FAIL (assinatura de `calculateCost` não aceita 4º arg).

- [ ] **Step 3: Estender `calculateCost`** com `cachedInputTokens` (default 0) e preço de input cacheado por modelo. Fórmula:

```ts
// custo = (input - cached) * precoIn + cached * precoInCached + output * precoOut
const cached = Math.min(cachedInputTokens, tokensInput);
const naoCacheado = tokensInput - cached;
const cost =
  naoCacheado * preco.input +
  cached * (preco.inputCached ?? preco.input) +
  tokensOutput * preco.output;
```

Adicionar `inputCached` ao registro de preços do(s) modelo(s) OpenAI (fração documentada pelo provider; quando desconhecido, usar `input` , degrada sem quebrar).

- [ ] **Step 4: Gravar `tokensCachedInput` no `usage-logger`** , propagar do `ChatUsage` para o insert.

- [ ] **Step 5: Run tests + tsc**

Run: `npx jest billing.test usage-logger.test -i && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/llm/billing.ts src/lib/agent/llm/usage-logger.ts src/lib/agent/llm/*.test.ts
git commit -m "feat(agent): custo reflete tokens cacheados (input cached price)"
```

### Task A5: `prompt_cache_key` estável (best-effort)

**Files:**
- Modify: `src/lib/agent/llm/providers/openai.ts` (Responses API body)
- Test: `src/lib/agent/llm/providers/openai.test.ts`

- [ ] **Step 1: Write the failing test** , o body da Responses API inclui `prompt_cache_key` derivado da versão do system.

```ts
test("inclui prompt_cache_key estavel no body responses", () => {
  const body = buildResponsesBody({ model: "gpt-5.4-mini", instructions: "REGRAS", input: [], cacheKey: "nex-sys-abc123" });
  expect(body.prompt_cache_key).toBe("nex-sys-abc123");
});
```

- [ ] **Step 2: Run test to verify it fails** , `npx jest openai.test -i` => FAIL.

- [ ] **Step 3: Implementar** , aceitar `cacheKey` opcional e setar `prompt_cache_key` no body quando presente. O `run-agent` passa `cacheKey = "nex-sys-" + hashCurto(systemPromptBase)`.

- [ ] **Step 4: Run tests + tsc** , PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(agent): prompt_cache_key estavel por versao de system"
```

---

## Fase B , Engrenagem central de paginação

### Task B1: Módulo `mcp/lib/paginacao.ts`

**Files:**
- Create: `mcp/lib/paginacao.ts`
- Test: `mcp/lib/paginacao.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { resolverPaginacao, montarPaginacaoMeta, PAGINACAO_LIMIT_DEFAULT } from "./paginacao";

test("resolverPaginacao aplica defaults e teto", () => {
  expect(resolverPaginacao({})).toEqual({ limit: 10, offset: 0 });
  expect(resolverPaginacao({ limit: 999 })).toEqual({ limit: 50, offset: 0 });
  expect(resolverPaginacao({ limit: 5, offset: 20 })).toEqual({ limit: 5, offset: 20 });
});

test("montarPaginacaoMeta calcula janela, temMais e proximoOffset", () => {
  expect(montarPaginacaoMeta(100, 0, 10, 10)).toEqual({
    total: 100, mostrando: "1-10 de 100", temMais: true, proximoOffset: 10,
  });
  expect(montarPaginacaoMeta(15, 10, 10, 5)).toEqual({
    total: 15, mostrando: "11-15 de 15", temMais: false, proximoOffset: null,
  });
  expect(montarPaginacaoMeta(0, 0, 10, 0)).toEqual({
    total: 0, mostrando: "0 de 0", temMais: false, proximoOffset: null,
  });
});
```

- [ ] **Step 2: Run test to verify it fails** , `npx jest paginacao.test -i` => FAIL.

- [ ] **Step 3: Implementar `mcp/lib/paginacao.ts`**

```ts
import { z } from "zod";

export const PAGINACAO_LIMIT_DEFAULT = 10;
export const PAGINACAO_LIMIT_MAX = 50;

/** Shape para espalhar (...) no inputShape de tools paginadas. */
export const paginacaoInputShape = {
  limit: z.number().int().positive().max(PAGINACAO_LIMIT_MAX).optional()
    .describe("Quantos itens retornar por pagina (default 10, max 50)."),
  offset: z.number().int().min(0).optional()
    .describe("A partir de qual item (0 = inicio). Use proximoOffset para paginar."),
};

export interface PaginacaoMeta {
  total: number;
  mostrando: string;
  temMais: boolean;
  proximoOffset: number | null;
}

export function resolverPaginacao(i: { limit?: number; offset?: number }): { limit: number; offset: number } {
  const limit = Math.min(PAGINACAO_LIMIT_MAX, Math.max(1, i.limit ?? PAGINACAO_LIMIT_DEFAULT));
  const offset = Math.max(0, i.offset ?? 0);
  return { limit, offset };
}

export function montarPaginacaoMeta(total: number, offset: number, limit: number, retornados: number): PaginacaoMeta {
  const temMais = offset + retornados < total;
  const inicio = total === 0 ? 0 : offset + 1;
  const fim = offset + retornados;
  return {
    total,
    mostrando: total === 0 ? "0 de 0" : `${inicio}-${fim} de ${total}`,
    temMais,
    proximoOffset: temMais ? offset + limit : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes** , `npx jest paginacao.test -i` => PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/paginacao.ts mcp/lib/paginacao.test.ts
git commit -m "feat(mcp): engrenagem central de paginacao (input shape + metadados)"
```

### Task B2: Expor `_PAGINACAO` via `enriquecerEnvelope`

**Files:**
- Modify: `mcp/lib/with-responder.ts` (`EnvelopeExtras`, `EnriquecerOptions`, `calcularExtras`)
- Test: `mcp/lib/with-responder.test.ts`

- [ ] **Step 1: Write the failing test** , passar `paginacao` em options injeta `_PAGINACAO` no envelope e deriva `_listaTruncada = temMais`.

```ts
test("enriquecerEnvelope injeta _PAGINACAO e deriva _listaTruncada", () => {
  const env = enriquecerEnvelope(envBase, "cadastro_buscar_parceiro", {
    paginacao: { total: 100, mostrando: "1-10 de 100", temMais: true, proximoOffset: 10 },
  });
  expect(env.dados._PAGINACAO?.temMais).toBe(true);
  expect(env.dados._listaTruncada).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails** , `npx jest with-responder.test -i` => FAIL.

- [ ] **Step 3: Implementar** , adicionar `_PAGINACAO?: PaginacaoMeta` a `EnvelopeExtras`, `paginacao?: PaginacaoMeta` a `EnriquecerOptions`, e em `calcularExtras`: quando `options.paginacao` presente, setar `_PAGINACAO` e `_listaTruncada = paginacao.temMais` e `_AVISO_TRUNCAMENTO` textual ("Mostrando X de Y. Peça 'os próximos' para ver mais.").

- [ ] **Step 4: Run tests + tsc** , PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(mcp): _PAGINACAO no envelope, reconciliado com _listaTruncada"
```

---

## Fase C , Tool de referência (template canônico)

### Task C1: Paginar `cadastro_parceiros_novos` (tool + query) , TEMPLATE

> Esta é a referência completa. Todas as tasks da Fase D repetem este padrão
> (input shape, query com take/skip + count, envelope com `paginacao`).

**Files:**
- Modify: `mcp/tools/cadastros/parceiros-novos.ts`
- Modify: `src/lib/reports/queries/cadastros.ts` (a função de query usada por ela)
- Test: `mcp/tools/cadastros/parceiros-novos.test.ts`

- [ ] **Step 1: Write the failing test** , a tool aceita `limit`/`offset`, retorna `_PAGINACAO` correto e página estável.

```ts
test("parceiros_novos pagina: 10 por vez, total e proximoOffset corretos", async () => {
  const r1: any = await cadastroParceirosNovos.handler({ limit: 10, offset: 0 } as any, ctx);
  expect(r1.dados.linhas.length).toBeLessThanOrEqual(10);
  expect(r1.dados._PAGINACAO.total).toBeGreaterThanOrEqual(r1.dados.linhas.length);
  if (r1.dados._PAGINACAO.temMais) {
    const r2: any = await cadastroParceirosNovos.handler({ limit: 10, offset: 10 } as any, ctx);
    const ids1 = r1.dados.linhas.map((l: any) => l.odooId);
    const ids2 = r2.dados.linhas.map((l: any) => l.odooId);
    expect(ids1.filter((id: number) => ids2.includes(id))).toEqual([]); // sem overlap
  }
});
```

- [ ] **Step 2: Run test to verify it fails** , `npx jest parceiros-novos -i` => FAIL.

- [ ] **Step 3: Atualizar a QUERY** (`src/lib/reports/queries/cadastros.ts`) , aceitar `{ limit, offset }`, retornar `{ linhas, total }`, com `ORDER BY` estável + desempate por `odooId`, `take`/`skip` e `count` na MESMA cláusula `where`.

```ts
export async function queryParceirosNovos(
  prisma: PrismaClient,
  f: { desde?: Date; limit: number; offset: number },
): Promise<{ linhas: LinhaParceiroNovo[]; total: number }> {
  const where = { /* ...filtro existente (desde etc.)... */ };
  const [linhas, total] = await Promise.all([
    prisma.fatoParceiro.findMany({
      where,
      orderBy: [{ criadoEm: "desc" }, { odooId: "asc" }], // estavel + desempate
      take: f.limit,
      skip: f.offset,
      select: { /* ...campos existentes... */ },
    }),
    prisma.fatoParceiro.count({ where }),
  ]);
  return { linhas, total };
}
```

- [ ] **Step 4: Atualizar a TOOL** (`mcp/tools/cadastros/parceiros-novos.ts`)

```ts
import { paginacaoInputShape, resolverPaginacao, montarPaginacaoMeta } from "../../lib/paginacao.js";

const inputSchema = z.object({
  desde: z.string().optional(),
  ...paginacaoInputShape,
});
// no schema `dados`, adicionar: _PAGINACAO: z.any().optional()

handler: async (input, ctx) => {
  const { limit, offset } = resolverPaginacao(input);
  const envelope = await withFreshness(ctx.prisma, ["fato_parceiro"], async () => {
    const { linhas, total } = await queryParceirosNovos(ctx.prisma, { /*desde*/ limit, offset });
    return { linhas, total };
  });
  if (envelope.estado === "preparando") return envelope;
  const total = (envelope.dados as any).total ?? envelope.dados.linhas.length;
  const meta = montarPaginacaoMeta(total, offset, limit, envelope.dados.linhas.length);
  return enriquecerEnvelope(envelope, "cadastro_parceiros_novos", { paginacao: meta });
}
```

- [ ] **Step 5: Run test to verify it passes** , `npx jest parceiros-novos -i` => PASS.

- [ ] **Step 6: tsc + commit**

```bash
npx tsc --noEmit
git add mcp/tools/cadastros/parceiros-novos.ts src/lib/reports/queries/cadastros.ts mcp/tools/cadastros/parceiros-novos.test.ts
git commit -m "feat(mcp): paginacao na tool de referencia parceiros_novos (template)"
```

---

## Fase D , Roll-out da paginação (lista grande)

> Aplicar o template da Task C1 em cada tool de lista grande. **Regra de ORDER BY
> determinística (vale para todas):** preservar a ordenação semântica existente
> da query; sempre acrescentar desempate por chave única (`odooId`/`id` ASC). Se a
> query não tinha `ORDER BY`, ordenar pela métrica principal DESC + desempate.
> Cada tool: input ganha `...paginacaoInputShape`; query ganha `take/skip/count`;
> envelope ganha `{ paginacao: meta }`; teste de não-overlap entre páginas.

> **Execução:** por domínio, via subagente Opus com briefing (template C1 +
> `paginacao.ts` + esta regra). Um subagente por task abaixo. Cada um roda
> `npx jest <dominio> -i && npx tsc --noEmit` e commita por domínio.

> **Integração obrigatória por tool (review #2):**
> 1. **Schema `dados`:** adicionar `_PAGINACAO: z.any().optional()` ao objeto Zod
>    `dados` da tool, senão a validação do `outputSchema` rejeita o campo
>    injetado. (Mesma necessidade do `_listaTruncada` já presente.)
> 2. **Tools sem `enriquecerEnvelope`:** se a tool monta o `dados` à mão (não
>    chama `enriquecerEnvelope`), setar `dados._PAGINACAO = meta` e
>    `dados._listaTruncada = meta.temMais` diretamente. Não introduzir
>    `enriquecerEnvelope` só por isso , menor mudança.
> 3. **Teste tolerante a fato vazio:** o teste de não-overlap roda só quando
>    `temMais` (igual ao template C1); fato vazio passa sem exercer paginação.
> 4. **Commit incremental:** commitar a cada 2-3 tools dentro do domínio, não só
>    no fim, para isolar regressão.

### Task D1: cadastros (restantes)
Tools: `buscar-parceiro`, `parceiros-por-cidade`, `parceiros-por-uf`, `parceiros-sem-documento`, `servico-buscar`, `servico-listar`. (Query fuzzy de `buscar-parceiro`: ordenar resultado final de forma estável e fatiar `[offset, offset+limit)`; `total` = tamanho do conjunto encontrado , documentado como exceção ao SQL pagination.)
Commit: `feat(mcp): paginacao nas tools de cadastros`

### Task D2: comercial
Tools: `parcelas-a-vencer`, `pedidos-atrasados`, `pedidos-por-uf`, `pedidos-listar-top-valor`, `pedido-travados-por-etapa`, `pedidos-por-vendedor`, `pedidos-por-etapa`, `pedidos-sem-vendedor`, `produtos-por-margem`, `preco-tabela`, `preco-produto`.
Commit: `feat(mcp): paginacao nas tools de comercial`

### Task D3: fiscal
Tools: `dfe-pendentes-manifestacao`, `dfe-por-fornecedor`, `dfe-importados-periodo`, `mdfe-manifestos`, `notas-emitidas`, `notas-emitidas-por-cliente`, `notas-recebidas-por-fornecedor`, `notas-emitidas-por-produto`, `notas-recebidas`, `reinf-eventos`, `referencia-buscar`, `produtos-faturados`, `faturamento-por-cliente`, `carta-correcao`, `certificados`.
Commit: `feat(mcp): paginacao nas tools de fiscal`

### Task D4: estoque + financeiro + contábil
Tools estoque: `locais-por-produto`, `produtos-saldo-zero`, `produtos-parados`, `saldo-produto`. Financeiro: `cobranca-bancaria`. Contábil: `movimento-conta`, `plano-de-contas`.
Commit: `feat(mcp): paginacao nas tools de estoque, financeiro e contabil`

### Task D5: factory `makeHonestTool`
**Files:** `mcp/tools/lib/honest-tool.ts` , a função `query` passa a receber `{ limit, offset }` resolvidos e retornar `{ linhas, total, truncado }`; o handler injeta `montarPaginacaoMeta` e expõe `_PAGINACAO`. As 6 tools que usam o factory ganham `...paginacaoInputShape` no `inputShape`.
Commit: `feat(mcp): paginacao no factory makeHonestTool`

> **Não paginar (decisão da spec):** agregados e listas naturalmente pequenas ,
> `apuracao-fiscal`, `faturamento-por-marca`, `faturamento-por-uf`,
> `resultado-por-conta`, `resultado-por-natureza`, `valor-armazem`,
> `conta-referencial`, `centro-custo`, `saldo-conta`, `filiais-listar`,
> `vendedores-cadastrados`, `cidades-listar`, `bi-consulta-avancada`.

---

## Fase E , Prompt: listar 10 por vez e paginar

### Task E1: Regras de paginação no prompt do agente

**Files:**
- Modify: `src/lib/agent/prompt/identity-base.ts` (seção de listas, próximo à §12c/§12d)
- Test: `src/lib/agent/prompt/compose.test.ts` (asserir presença das frases-chave)

- [ ] **Step 1: Write the failing test** , o prompt composto contém a instrução de paginação.

```ts
test("prompt instrui paginacao de 10 e uso de proximoOffset", () => {
  const p = composePrompt(/* defaults */);
  expect(p).toMatch(/no maximo 10 itens/i);
  expect(p).toMatch(/proximoOffset|os proximos/i);
});
```

- [ ] **Step 2: Run test to verify it fails** , `npx jest compose.test -i` => FAIL.

- [ ] **Step 3: Adicionar a regra** (sem travessão, linguagem natural):

```
- Listas: mostre no maximo 10 itens por resposta. Quando o resultado da tool
  trouxer `_PAGINACAO` com `temMais: true`, encerre a lista dizendo quantos
  itens existem no total (`mostrando`) e ofereca continuar ("quer ver os
  proximos?"). Se o usuario pedir "os proximos", "mais" ou "continuar", chame a
  MESMA tool de novo passando `offset` igual ao `proximoOffset` que veio na
  ultima resposta. Nunca invente itens alem dos retornados.
```

- [ ] **Step 4: Run test to verify it passes** , PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(prompt): regra de paginacao (10 por vez + proximoOffset)"
```

---

## Fase F , Verificação E2E e rebuild

### Task F1: Rebuild dos containers afetados

- [ ] **Step 1: Rebuild** , mudou `mcp/**` e `src/lib/reports/queries/**` (→ `mcp`), `src/**` (→ `app`), `prisma/schema.prisma` (→ todos).

```bash
docker compose build app
docker compose up -d --force-recreate worker app
docker compose up -d --build mcp
```

- [ ] **Step 2: Verificar imagem nova**

```bash
docker image inspect nexus-odoo:local --format '{{.Created}}'   # tem que ser AGORA
```

### Task F2: E2E contra dado real

- [ ] **Step 1: Caching** , fazer a mesma pergunta 2x na bubble; conferir no menu de consumo que a 2ª chamada registra `cached_tokens > 0` e custo menor.
- [ ] **Step 2: Paginação** , perguntar "quantos produtos eu tenho?" → recebe 10 + total; "liste os próximos" → 11-20 sem repetição; repetir uma vez mais (21-30).
- [ ] **Step 3: Janela de histórico** , confirmar que conversas longas não regridem (contexto dos últimos pares preservado).
- [ ] **Step 4: Registrar evidências** no resumo final.

### Task F3: Auditoria final

- [ ] **Step 1:** `npx tsc --noEmit && npx eslint . && npx jest` , tudo verde.
- [ ] **Step 2:** `/gsd-code-review` nos arquivos tocados.
- [ ] **Step 3:** Atualizar `docs/agents/HISTORY.md`.

---

## Critérios de conclusão

- 2ª chamada de pergunta repetida com `cached_tokens > 0` e custo menor no menu.
- Tools de lista grande respeitam `limit=10`/`offset` com `total`/`temMais`/`proximoOffset` corretos e páginas sem overlap.
- Agente lista 10 por vez e atende "os próximos".
- `tsc`/`eslint`/`jest` verdes; E2E conferido; sem regressão de qualidade.

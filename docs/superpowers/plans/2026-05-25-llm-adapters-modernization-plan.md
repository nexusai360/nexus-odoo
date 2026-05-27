# PLAN v3 FINAL - Modernização dos adapters de LLM (Execução)

> **Changelog v2 → v3 (Review #2 aplicada — ver `plan-review-2.md`):**
>
> - `effortToBudget("auto")` retorna `budgetRange[1]` (teto).
> - Spikes: scripts em `scripts/` **não-commitados** (gitignore);
>   snapshots em `docs/spikes/` commitados (evidência).
> - T5.5 explicitamente **bloqueada por T5.0**.
> - T7.1 chamada literal da skill `ui-ux-pro-max` documentada;
>   output salvo em `docs/superpowers/specs/2026-05-25-reasoning-card-ui-design.md`.
> - T8.3 ambiente local (DB `nexus_odoo_l1`, backend `localhost:3000`);
>   produção só após push em main.
> - **T8.2.1 NOVO**: preparar credenciais Anthropic/Gemini/OpenRouter
>   se disponíveis; senão marcar M correspondente como pulado.

---

# PLAN v2 - Modernização dos adapters de LLM (Execução)

> **Changelog v1 → v2 (Review #1 aplicada — ver `plan-review-1.md`):**
>
> - **T2.0 NOVO**: setup de mock para `getClient` antes da matriz de testes.
> - **T2.1**: trechos de código `before/after` literais em vez de
>   referência a número de linha.
> - **T5.0 NOVO**: spike de `thoughtSignature` com `includeThoughts:false`
>   antes de T5.5.
> - **T5.5**: corrigida — multi-turn salva parts com `thoughtSignature`,
>   não parts `thought:true` (que são suprimidas).
> - **T4.7**: handler `content_block_stop` adicionado; teste de
>   `tool_use` com partial_json em 3 chunks + stop.
> - **T6.1**: dividida em T6.1.A (aceito) e T6.1.B (rejeitado), spike
>   S0.3 decide qual executar.
> - **T7.0 NOVO**: verificação de infra de teste UI (`@testing-library/react`
>   instalado? senão decidir entre instalar ou Playwright).
> - **T3.6**: lista de eventos SSE Responses condicionada ao spike S0.1
>   (handle ou ignore-explícito documentado).
> - **T1.3 / T1.4**: comandos Prisma literais (`migrate dev --name X --create-only`,
>   edit para `IF NOT EXISTS`, então `migrate dev`).
> - **T8.7 / T8.8**: invocação clara — `Skill skill="gsd-code-review"`,
>   resultado em `REVIEW.md`, iterar até zero High/Critical, sem subagente.
> - **T5.4**: lista de fallback codes (404 + 400 com "streaming"/"not
>   supported" + Content-Type não reconhecido após 3s).
> - **T3.9**: comentário razão histórica documentado no código.
> - Estimativa 20h marcada como aspiracional.

---

# PLAN v1 - Modernização dos adapters de LLM (Execução)

**Spec base:** `docs/superpowers/specs/2026-05-25-llm-adapters-modernization-design.md` (v3)
**Tabela de caps:** `docs/superpowers/specs/2026-05-25-reasoning-caps-table.md`
**Branch:** feat/f4-leitura-expansao
**Modelo de execução:** Opus 4.7 inline, sem subagentes (regra CLAUDE.md §6/[8]).

> Decomposição máxima. Cada task é uma unidade verificável isoladamente
> com arquivo(s) específico(s) e critério de done. Passará por 2 reviews
> de plano antes de virar v3 e executar.

---

## Ondas

```
0. Spikes (Gemini + OpenRouter + OpenAI shape checks)
1. Foundations (types + catalog + migrations + DB)
2. run-agent + conversation helpers + logger
3. OpenAI adapter (refator Responses canônica)
4. Anthropic adapter (extended thinking + interleaved)
5. Gemini adapter (thinkingConfig + streaming)
6. OpenRouter adapter (reasoning unificado)
7. UI (ReasoningCard dinâmico + reconcile + revalidatePath)
8. Verificação real + code review + UI review + push
```

Dependências: cada onda depende da anterior. Onda 3, 4, 5, 6 são
independentes entre si (depois da onda 2), poderiam ir em paralelo;
execução inline = sequencial nesta ordem.

---

## Onda 0 - Spikes (3 tasks)

### S0.1 - Spike OpenAI Responses output shape

**Arquivo:** novo `scripts/spike-openai-responses.ts` (descartável após).
**Ação:**
- `curl -X POST https://api.openai.com/v1/responses` com `model=gpt-5.4-nano`,
  `tools=[<um tool MCP qualquer>]`, `reasoning.effort=medium`,
  uma mensagem `qual o saldo de mola espiral em aço?`.
- Logar response inteira em JSON com pretty-print.
- Confirmar shape de `output[]` items: `reasoning` shape, `function_call`
  shape, `message` shape, e `usage.output_tokens_details.reasoning_tokens`.
- Confirmar shape SSE de streaming (`stream:true` no body) — capturar
  primeiros 20 eventos.

**Done quando:** dois snapshots JSON salvos em `docs/spikes/`
(`openai-responses-shape.json` + `openai-responses-stream.txt`).

### S0.2 - Spike Gemini streamGenerateContent

**Arquivo:** novo `scripts/spike-gemini-streaming.ts` (descartável).
**Ação:**
- `curl` ao endpoint `:streamGenerateContent?alt=sse` para
  `gemini-2.5-flash` com `thinkingConfig.thinkingBudget=2048` +
  `tools[functionDeclarations]` + uma pergunta forçando tool call.
- Logar **header HTTP** (`Content-Type` esperado) e primeiros
  1000 bytes do body.
- Confirmar se o shape é SSE (`data: <json>\n\n`) ou JSON Lines
  (`{...}\n{...}`) ou JSON array streamed.

**Done quando:** snapshot salvo em
`docs/spikes/gemini-streaming-shape.txt` com a decisão registrada
na primeira linha (`# Shape: SSE | JSONL | JSON_ARRAY`).

### S0.3 - Spike OpenRouter reasoning_details em multi-turn

**Arquivo:** novo `scripts/spike-openrouter-reasoning.ts` (descartável).
**Ação:**
- Fazer 1ª chamada `deepseek/deepseek-r1` com `reasoning.effort=medium`
  + tools. Capturar `choices[0].message.reasoning_details`.
- Fazer 2ª chamada **enviando** `messages[<assistant>].reasoning_details`
  preservado da 1ª resposta + um `tool_result`. Conferir se OpenRouter
  aceita ou ignora.
- Logar status 200/erro e shape da resposta.

**Done quando:** decisão registrada em `docs/spikes/openrouter-reasoning-multi-turn.md`:
"aceito" ou "ignorado/rejeitado" + comportamento de fallback decidido.

---

## Onda 1 - Foundations (8 tasks)

### T1.1 - Atualizar `types.ts` com novos tipos

**Arquivo:** `src/lib/agent/llm/types.ts`
**Ação:** adicionar conforme spec §4.1:
- `ReasoningEffort` ganha `"auto"`.
- `ReasoningContext { provider; data: unknown }`.
- `ChatRequest.reasoningHistory?: ReasoningContext[]`.
- `ChatResult.reasoningTokens?`, `.reasoningContext?`, `.streamed: boolean` (obrigatório).

**Done quando:** `tsc` verde com tipos novos exportados.

### T1.2 - Implementar `REASONING_CAPS` em `catalog.ts`

**Arquivo:** `src/lib/agent/llm/catalog.ts`
**Ação:**
- Adicionar `interface ReasoningCap` + `REASONING_CAPS: Record<string, ReasoningCap>`
  preenchido conforme `reasoning-caps-table.md` (todos os modelos
  listados).
- Helpers: `reasoningCapsOf(modelId)`, `effortToBudget(modelId, effort)`,
  `modelOutputCap(modelId)`.
- Manter `modelSupportsReasoning(id)` agora baseado em `cap.enabled`.
- Manter `reasoningLevelsOf(id)` retornando `cap.levels`.
- **Remover** `REASONING_LEVELS` antigo e `requiresResponsesApi` regex.

**Done quando:** `tsc` verde, sem referências quebradas.

### T1.3 - Migration `llm_usage_reasoning_tokens`

**Arquivo:** `prisma/migrations/<timestamp>_llm_usage_reasoning_tokens/migration.sql`
**Ação:**
- Antes: `\d llm_usage` no DB local pra confirmar que coluna não existe.
- SQL: `ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS reasoning_tokens INTEGER;`
- Atualizar `prisma/schema.prisma`: `LlmUsage.reasoningTokens Int? @map("reasoning_tokens")`.

**Done quando:** `npx prisma migrate dev --create-only` cria sem erro;
migration aplicada localmente; `prisma generate` regerou client.

### T1.4 - Migration `conversations_reasoning_history`

**Arquivo:** `prisma/migrations/<timestamp>_conversations_reasoning_history/migration.sql`
**Ação:**
- Antes: `\d conversations` no DB local.
- SQL: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reasoning_history JSONB NOT NULL DEFAULT '[]'::jsonb;`
- Atualizar `prisma/schema.prisma`: `Conversation.reasoningHistory Json @map("reasoning_history") @default("[]")`.

**Done quando:** migration aplicada; `prisma generate` ok.

### T1.5 - Tests do catálogo

**Arquivo:** `src/lib/agent/llm/catalog.test.ts`
**Ação:** ~6 testes:
- `reasoningCapsOf("gpt-5.4-nano")` retorna cap com `levels` corretos.
- `reasoningCapsOf("modelo-inexistente")` retorna `null`.
- `reasoningCapsOf("claude-haiku-4-5")` retorna `supportsWithTools=false`.
- `effortToBudget("claude-haiku-4-5","medium")` retorna valor dentro do range.
- `effortToBudget("gpt-5.4-nano","auto")` retorna null (OpenAI ignora budget).
- `modelOutputCap("claude-haiku-4-5")` retorna 64000.

**Done quando:** `jest catalog.test.ts` verde.

### T1.6 - Helpers `conversation.ts`

**Arquivo:** `src/lib/agent/conversation.ts`
**Ação:** adicionar:
```ts
export async function loadConversationReasoningHistory(conversationId: string): Promise<ReasoningContext[]>;
export async function saveConversationReasoningHistory(conversationId: string, history: ReasoningContext[]): Promise<void>;
```
+ helper `capReasoningHistory(history, maxItems=20, maxBytes=50_000)` que
trunca mantendo últimas iterações.

**Done quando:** funções exportadas, sem testes ainda (vêm em T1.7).

### T1.7 - Tests `conversation.test.ts` (extensão)

**Arquivo:** `src/lib/agent/conversation.test.ts`
**Ação:** 4 testes:
- `load` vazio retorna `[]`.
- `save + load` round-trip preserva ordem.
- `cap` por contagem (>20 trunca).
- `cap` por bytes (>50KB trunca).

**Done quando:** verde.

### T1.8 - Commit 1

**Ação:** stage só os arquivos das tasks T1.x. Commit:
```
feat(llm): types + REASONING_CAPS + reasoning_history persistence

- ReasoningEffort ganha "auto"
- REASONING_CAPS no catalog substitui REASONING_LEVELS + requiresResponsesApi
- ChatResult.streamed flag
- Migrations: llm_usage.reasoning_tokens + conversations.reasoning_history JSONB
- Helpers conversation.ts para load/save/cap history
```
+ append em HISTORY.md.

**Done quando:** `git commit` ok; `tsc + eslint + jest` verdes.

---

## Onda 2 - run-agent + checkpoint + logger (5 tasks)

### T2.1 - `reasoningAllowed` e effort em `run-agent.ts`

**Arquivo:** `src/lib/agent/run-agent.ts`
**Ação:** substituir bloco atual (linhas 374-385) por:
```ts
const cap = reasoningCapsOf(agentSettings.activeModelId);
const checkpointAllows = ...; // matriz da spec §5.1
const reasoningAllowed = cap !== null && cap.enabled && cap.supportsWithTools && checkpointAllows;
const effortForRequest = !reasoningAllowed ? undefined
  : (cap.levels.length === 1 && cap.levels[0] === "auto" ? "auto" : agentSettings.reasoningEffort);
```
Passar `effortForRequest` em `client.chat({ reasoningEffort: effortForRequest, reasoningHistory })`.

**Done quando:** `tsc` verde.

### T2.2 - Multi-turn `reasoningHistory` no loop

**Arquivo:** `src/lib/agent/run-agent.ts`
**Ação:**
- Antes do loop: `const history = await loadConversationReasoningHistory(args.conversationId)`.
- Após cada iteração: `if (result.reasoningContext) history.push(result.reasoningContext)`.
- Ao final do loop: `await saveConversationReasoningHistory(args.conversationId, capReasoningHistory(history))`.

**Done quando:** `tsc` verde.

### T2.3 - Logger inclui `reasoning_tokens`

**Arquivo:** `src/lib/agent/llm/usage-logger.ts`
**Ação:** `logUsage({ ..., reasoningTokens: result.reasoningTokens ?? null })`.
Schema do logger aceita nullable. Persiste no banco.

**Done quando:** `tsc` verde; teste do logger atualizado.

### T2.4 - Tests integration `run-agent.test.ts`

**Arquivo:** `src/lib/agent/run-agent.test.ts`
**Ação:** 5 testes novos:
- `OFF` checkpoint: nenhuma chamada recebe `reasoningEffort`.
- `PLAYGROUND` + `source=bubble`: chamada recebe `undefined`.
- `PLAYGROUND` + `source=playground`: chamada recebe `agentSettings.reasoningEffort`.
- 2 iterações: 2º `chat()` recebe `history` com 1 elemento.
- `cap.supportsWithTools=false`: nenhuma chamada recebe effort.

**Done quando:** verde.

### T2.5 - Tests checkpoint matrix isolados

**Arquivo:** `src/lib/agent/run-agent.checkpoint.test.ts` (novo arquivo,
desacoplado dos demais).
**Ação:** 12 testes da matriz da spec §5.1 (3 sources × 3 checkpoints + 3 caps especiais).
Cada teste:
1. Setar `agentSettings` mock.
2. Spy em `client.chat` para capturar argumentos.
3. Chamar `runAgent({ source, ... })`.
4. Assertar presença ou ausência de `reasoningEffort` na chamada.

**Done quando:** verde.

---

## Onda 3 - OpenAI adapter (11 tasks)

### T3.1 - Extrair `mapMessagesToResponsesInput` para função independente

**Arquivo:** `src/lib/agent/llm/providers/openai.ts`
**Ação:** já existe; renomear para `buildResponsesInput` e estender
para receber `reasoningHistory` e produzir items na ordem:
`[user, ...history.flatMap(...)]` conforme spec §6.1 (generalizado).

**Done quando:** `tsc` verde, unit test escrito em T3.10.

### T3.2 - `instructions` field para system

**Arquivo:** `openai.ts`
**Ação:** `buildResponsesInput` separa role:"system" e retorna
`{ instructions: string, input: items }`.

**Done quando:** schema do body monta `{model, instructions, input, ...}`.

### T3.3 - `chat()` rotear via Responses para todos modelos com cap

**Arquivo:** `openai.ts`
**Ação:** substituir `requiresResponsesApi` por:
```ts
const cap = reasoningCapsOf(this.model);
if (cap?.openaiEndpoint === "responses") {
  return await this.chatViaResponses(request);
}
```
Cair para `/v1/chat/completions` só quando cap=null ou cap.openaiEndpoint="chat-completions".

**Done quando:** `tsc` verde.

### T3.4 - `chatViaResponses` aceita `reasoningEffort`

**Arquivo:** `openai.ts`
**Ação:**
- Body: `instructions` + `input` + `tools` + `reasoning` (quando effort presente) + `max_output_tokens` (opcional) + `stream` + `store:false`.
- Mapear `effort="auto"` → `"medium"` (OpenAI não tem auto nativo, mas o valor "medium" sinaliza ao modelo "decida sozinho dentro de medium").
- Mapear `effort="minimal"` → "low" apenas para modelos cuja `cap.levels` não inclui "minimal".

**Done quando:** body inclui `reasoning.effort` correto.

### T3.5 - `chatViaResponses` build `reasoningContext` no return

**Arquivo:** `openai.ts`
**Ação:** após parse do response, filtrar `output[]` por
`type === "reasoning" || type === "function_call" || (type === "message" && finished)`. Salvar em `result.reasoningContext.data = { items }`.
Adapter na próxima chamada extrai `items` do
`reasoningHistory[i].data.items` e injeta em `buildResponsesInput`.

**Done quando:** `tsc` verde.

### T3.6 - SSE parser de Responses (`#parseResponsesStream`)

**Arquivo:** `openai.ts`
**Ação:** novo método espelhando o `#parseStream` do Anthropic:
- Lê `body.getReader()`, decodifica em linhas `data: `.
- Eventos:
  - `response.output_text.delta` → `onToken(delta.text)`, `streamed = true`.
  - `response.function_call_arguments.delta` → acumular `args` por `call_id`.
  - `response.output_item.added` com `type:"reasoning"` → criar entrada em `reasoningItems`.
  - `response.completed` → extrair `usage.output_tokens_details.reasoning_tokens`.

**Done quando:** parser implementado com cobertura visual no spike S0.1.

### T3.7 - `AbortSignal.timeout`

**Arquivo:** `openai.ts`
**Ação:** `fetch(URL, { signal: AbortSignal.timeout(cap.requestTimeoutMs ?? 90000), ... })`.
Erro `OpenAI timeout em Ns` lançado quando aborta.

**Done quando:** `tsc` verde.

### T3.8 - Mapping `output_tokens_details.reasoning_tokens`

**Arquivo:** `openai.ts`
**Ação:** `result.reasoningTokens = data.usage?.output_tokens_details?.reasoning_tokens`.

**Done quando:** `tsc` verde, teste em T3.10.

### T3.9 - Remover trava `noTools` em chat-completions

**Arquivo:** `openai.ts`
**Ação:** o branch `chat/completions` pode passar `reasoning_effort` mesmo
com tools (a trava era herdada de bug específico do nano que agora vai
pela Responses API).

**Done quando:** trava removida; comentário atualizado.

### T3.10 - Tests `openai.test.ts`

**Arquivo:** `src/lib/agent/llm/providers/openai.test.ts`
**Ação:** 18 testes da spec §9.1:
- Roteamento: Responses para `gpt-5.4-nano`; chat-completions para
  modelo sem cap (mockar `reasoningCapsOf`).
- Body Responses: `instructions` presente; `tools` com `type:function`
  direto; `reasoning.effort` correto; ausente quando effort undefined.
- Multi-turn ordering: input com history.
- Streaming: `onToken` por delta; `function_call_arguments.delta` acumula;
  `usage.output_tokens_details.reasoning_tokens` extraído.
- Mapping: minimal→low quando levels não inclui minimal.
- Timeout: AbortSignal.timeout aplicado.

**Done quando:** 18 testes verdes; `streamed=true` quando SSE.

### T3.11 - Commit 3

**Ação:**
```
refactor(openai): migrar para /v1/responses canonica com reasoning + streaming

- Roteamento por cap.openaiEndpoint (substitui regex requiresResponsesApi)
- instructions field separado do input items
- store:false (stateless)
- Multi-turn com reasoning_history items
- SSE streaming (#parseResponsesStream)
- AbortSignal.timeout
- Mapping minimal->low por modelo
- 18 testes
```

**Done quando:** verde + HISTORY append.

---

## Onda 4 - Anthropic adapter (11 tasks)

### T4.1 - `thinking` no body quando effort + cap.supportsWithTools

**Arquivo:** `src/lib/agent/llm/providers/anthropic.ts`
**Ação:**
```ts
const cap = reasoningCapsOf(this.model);
if (request.reasoningEffort && cap?.supportsWithTools) {
  body.thinking = {
    type: cap.anthropicThinking === "adaptive" ? "adaptive" : "enabled",
    budget_tokens: effortToBudget(this.model, request.reasoningEffort),
    display: "summarized",
  };
}
```

**Done quando:** `tsc` verde.

### T4.2 - `max_tokens` com clamp

**Arquivo:** `anthropic.ts`
**Ação:** `body.max_tokens = Math.min(body.thinking?.budget_tokens + (request.maxTokens ?? 1024), cap?.outputCap ?? 200_000)`.

**Done quando:** `tsc` verde.

### T4.3 - Beta header interleaved para 4.5

**Arquivo:** `anthropic.ts`
**Ação:** quando `cap.anthropicInterleavedAuto === false && cap.supportsWithTools`,
adicionar header `"anthropic-beta": "interleaved-thinking-2025-05-14"`.

**Done quando:** header presente nos cenários certos.

### T4.4 - Haiku 4.5 drop silencioso

**Arquivo:** `anthropic.ts`
**Ação:** quando `cap.supportsWithTools === false && tools.length > 0`,
não enviar `thinking` (já garantido pelo guard em T4.1).
Logger: `console.info("[anthropic] reasoning desligado: modelo nao suporta com tools")`.

**Done quando:** Haiku 4.5 nunca recebe thinking.

### T4.5 - Multi-turn: injetar blocos do history

**Arquivo:** `anthropic.ts`
**Ação:** em `mapMessages`, para cada `history[i] em reasoningHistory`,
inserir `{ role:"assistant", content: history[i].data.blocks }` na
posição correta (entre user e tool_result).

**Done quando:** mensagens reconstituídas em multi-turn.

### T4.6 - Build `reasoningContext.data.blocks` na resposta

**Arquivo:** `anthropic.ts`
**Ação:** após parse, coletar `content[]` blocks tipo `thinking`,
`redacted_thinking`, `tool_use` (preservar ordem) em
`result.reasoningContext.data = { blocks }`.

**Done quando:** retorno inclui contexto.

### T4.7 - SSE estender `#parseStream`

**Arquivo:** `anthropic.ts`
**Ação:** adicionar handlers em `content_block_delta`:
- `delta.type === "thinking_delta"` → acumular em `thinkingMap[index].text`.
- `delta.type === "signature_delta"` → acumular em `thinkingMap[index].signature`.

Em `content_block_start`:
- `block.type === "thinking"` → criar `thinkingMap[index] = { text:"", signature:"" }`.
- `block.type === "redacted_thinking"` → preservar `data` cru.

No final: reconstruir `reasoningContext.data.blocks` na ordem (text + signature por bloco; redacted preserva data).

**Done quando:** stream completa preserva contexto.

### T4.8 - `AbortSignal.timeout`

**Arquivo:** `anthropic.ts`
**Ação:** análogo a T3.7.

### T4.9 - `reasoningTokens = undefined`

**Arquivo:** `anthropic.ts`
**Ação:** logger grava NULL; comentário inline explica
"Anthropic não expõe reasoning_tokens".

### T4.10 - Tests `anthropic.test.ts`

**Arquivo:** `src/lib/agent/llm/providers/anthropic.test.ts`
**Ação:** 16 testes da spec §9.1 Anthropic:
- thinking body em vários modos.
- max_tokens clamp.
- Beta header presente/ausente.
- Haiku 4.5 drop.
- Multi-turn message reconstrução.
- Streaming deltas (text + thinking + signature + redacted).

**Done quando:** verde.

### T4.11 - Commit 4

```
feat(anthropic): extended thinking adaptive + interleaved tools + streaming

- type: adaptive vs enabled por cap
- budget_tokens via effortToBudget + max_tokens clamp ao outputCap
- Beta header interleaved-thinking-2025-05-14 para 4.5
- Haiku 4.5 drop silencioso com log
- Multi-turn injeta blocos do reasoning_history como assistant content
- #parseStream com thinking_delta + signature_delta + redacted_thinking
- AbortSignal.timeout
- 16 testes
```

---

## Onda 5 - Gemini adapter (12 tasks)

### T5.1 - Decidir shape do streaming pós-spike S0.2

**Arquivo:** `src/lib/agent/llm/providers/gemini.ts`
**Ação:** baseado no resultado do spike S0.2, escolher parser:
- Se SSE: parser de linhas `data: <json>\n\n`.
- Se JSONL: parser de linhas `<json>\n`.
- Se JSON_ARRAY: parser incremental de array.

Implementar **somente o shape confirmado**.

**Done quando:** parser comentado/implementado.

### T5.2 - `thinkingConfig` no body

**Arquivo:** `gemini.ts`
**Ação:**
```ts
const cap = reasoningCapsOf(this.model);
if (request.reasoningEffort && cap?.supportsWithTools) {
  const config: Record<string, unknown> = {};
  if (cap.adaptiveMode) {
    config.thinkingBudget = -1;
  } else if (cap.geminiShape === "level") {
    config.thinkingLevel = mapEffortToLevel(request.reasoningEffort);
  } else {
    config.thinkingBudget = effortToBudget(this.model, request.reasoningEffort);
  }
  config.includeThoughts = false;
  generationConfig.thinkingConfig = config;
}
```

**Done quando:** body inclui thinkingConfig.

### T5.3 - `:streamGenerateContent`

**Arquivo:** `gemini.ts`
**Ação:** quando `request.stream === true && onToken`:
- URL: `${GEMINI_BASE_URL}/${model}:streamGenerateContent?alt=sse&key=${key}` (ou `:streamGenerateContent` sem `alt` conforme spike).
- Parser conforme T5.1.
- Marcar `streamed = true` no result.

**Done quando:** stream funcional contra Gemini real.

### T5.4 - Fallback unário em erro 404

**Arquivo:** `gemini.ts`
**Ação:** try `:streamGenerateContent` → se 404, retentar
`:generateContent` unário sem `onToken`. `streamed=false` no result.

**Done quando:** fallback testado.

### T5.5 - Build `reasoningContext.data.parts` na resposta

**Arquivo:** `gemini.ts`
**Ação:** após parse, salvar **todas** as parts da resposta (text com
thoughtSignature, functionCall, etc) em
`result.reasoningContext.data = { parts: [...] }`.

**Done quando:** retorno inclui contexto completo.

### T5.6 - Multi-turn `contents[]` com history

**Arquivo:** `gemini.ts`
**Ação:** `mapMessages` recebe `reasoningHistory` e injeta cada
`history[i].data.parts` como `{ role: "model", parts }` em ordem.

**Done quando:** request multi-turn correto.

### T5.7 - `reasoningTokens = thoughtsTokenCount`

**Arquivo:** `gemini.ts`
**Ação:** `result.reasoningTokens = data.usageMetadata?.thoughtsTokenCount`.

**Done quando:** logger grava.

### T5.8 - `AbortSignal.timeout`

**Arquivo:** `gemini.ts`
**Ação:** análogo.

### T5.9 - Modelo sem cap não envia thinkingConfig

**Arquivo:** `gemini.ts`
**Ação:** guard `cap?.supportsWithTools` evita.

### T5.10 - Streaming parser do shape escolhido + thought parts

**Arquivo:** `gemini.ts`
**Ação:** parser identifica `parts[i].thought === true` como part de
raciocínio (acumula em buffer interno; não chama onToken). `parts[i].text`
sem thought → `onToken(text)`. `parts[i].functionCall` → tool call inteira.

**Done quando:** parser produz `messageText`, `toolCalls`, e
`reasoningContext.data.parts`.

### T5.11 - Tests `gemini.test.ts`

**Arquivo:** `src/lib/agent/llm/providers/gemini.test.ts`
**Ação:** 17 testes:
- thinkingConfig shapes (level vs budget vs adaptive).
- `-1` quando adaptiveMode.
- Range clamp.
- Multi-turn parts injetadas.
- thoughtsTokenCount mapeado.
- Streaming: text deltas, thought deltas, functionCall completo.
- Fallback 404.
- Modelo sem cap não envia config.

**Done quando:** verde.

### T5.12 - Commit 5

```
feat(gemini): thinkingConfig + thought signatures + streamGenerateContent

- Shape escolhido por cap.geminiShape (level | budget) + adaptiveMode (-1)
- Range clamp por modelo
- reasoning_history preservada como parts arrays
- Multi-turn injeta parts como role:model em ordem
- Streaming (<shape do spike>) com thought parts separadas
- Fallback :generateContent em 404
- thoughtsTokenCount mapeado
- 17 testes
```

---

## Onda 6 - OpenRouter adapter (10 tasks)

### T6.1 - Decidir estratégia multi-turn pós-spike S0.3

**Arquivo:** `src/lib/agent/llm/providers/openrouter.ts`
**Ação:** se spike confirmou aceitação de `reasoning_details` em
request, implementar reenvio. Se não, aceitar limitação e documentar
no commit.

### T6.2 - `reasoning` body

**Arquivo:** `openrouter.ts`
**Ação:**
```ts
const cap = reasoningCapsOf(this.model);
if (request.reasoningEffort && cap?.supportsWithTools) {
  if (cap.openrouterShape === "effort" || cap.adaptiveMode) {
    body.reasoning = { effort: mapEffort(request.reasoningEffort), exclude: false };
  } else if (cap.openrouterShape === "max_tokens") {
    body.reasoning = { max_tokens: effortToBudget(this.model, request.reasoningEffort) ?? 8192, exclude: false };
  }
}
```

### T6.3 - Streaming SSE OpenAI-compatible

**Arquivo:** `openrouter.ts`
**Ação:** `stream: true`. Parser análogo ao Chat Completions: linhas
`data: <json>`, cada chunk com `choices[0].delta.content` (token) e
`choices[0].delta.reasoning_details` (acumular).

### T6.4 - Build `reasoningContext.data.details`

**Arquivo:** `openrouter.ts`
**Ação:** `result.reasoningContext.data = { details: message.reasoning_details }`.

### T6.5 - Multi-turn (condicional ao spike)

**Arquivo:** `openrouter.ts`
**Ação:** se aceito, em `mapMessages` injetar `reasoning_details` no
assistant message do history.

### T6.6 - `reasoningTokens = usage.reasoning_tokens`

**Arquivo:** `openrouter.ts`
**Ação:** mapeamento direto.

### T6.7 - `AbortSignal.timeout`

**Arquivo:** `openrouter.ts`
**Ação:** análogo.

### T6.8 - Modelo sem cap não envia reasoning

**Arquivo:** `openrouter.ts`
**Ação:** guard `cap?.supportsWithTools`.

### T6.9 - Tests `openrouter.test.ts`

**Arquivo:** `src/lib/agent/llm/providers/openrouter.test.ts`
**Ação:** 13 testes da spec §9.1:
- reasoning shape (effort vs max_tokens).
- adaptiveMode → effort always.
- Multi-turn (caso aceito).
- Streaming deltas + reasoning_details.
- Headers preservados.
- normalize model id.
- Modelo sem cap não envia.

**Done quando:** verde.

### T6.10 - Commit 6

```
feat(openrouter): reasoning unificado + reasoning_details + streaming

- reasoning body por cap.openrouterShape
- adaptiveMode usa effort com teto alto
- Multi-turn reasoning_details preservada (se aceito pelo spike)
- SSE OpenAI-compatible com reasoning_details deltas
- reasoning_tokens em usage mapeado
- 13 testes
```

---

## Onda 7 - UI ReasoningCard (11 tasks)

> Skill `ui-ux-pro-max` invocada ANTES de qualquer mudança visual
> (regra de raiz §6/[2] CLAUDE.md).

### T7.1 - Invocar `ui-ux-pro-max` para os 5 estados

**Skill:** `ui-ux-pro-max`
**Ação:** apresentar à skill os 5 estados (`no_reasoning`,
`blocked_by_tools`, `auto_only`, `adaptive_with_ceiling`, `custom`)
e receber sugestões de:
- Hierarquia visual.
- Microcopy para cada estado.
- Tratamento de `disabled` (cor, cursor, hover, aria).
- Animação de transição entre estados quando o modelo muda.

**Done quando:** decisões documentadas inline no card.

### T7.2 - Computar `state` em `reasoning-card.tsx`

**Arquivo:** `src/components/agent/reasoning-card.tsx`
**Ação:** adicionar `cap = reasoningCapsOf(modelId)`; computar `state`
conforme spec §8.1.

**Done quando:** `tsc` verde; estado exposto em prop.

### T7.3 - `state="no_reasoning"`

**Arquivo:** `reasoning-card.tsx`
**Ação:** card disabled, banner cinza "Este modelo não suporta raciocínio."

### T7.4 - `state="blocked_by_tools"`

**Arquivo:** `reasoning-card.tsx`
**Ação:** banner amber + dropdown disabled.

### T7.5 - `state="auto_only"`

**Arquivo:** `reasoning-card.tsx`
**Ação:** dropdown disabled mostrando "Auto" + subtítulo
"Modelo define automaticamente (autoModeHint)".

### T7.6 - `state="adaptive_with_ceiling"`

**Arquivo:** `reasoning-card.tsx`
**Ação:** dropdown habilitado com `cap.levels`; subtítulo "Modelo decide até este nível."

### T7.7 - `state="custom"` (preservar atual)

**Arquivo:** `reasoning-card.tsx`
**Ação:** comportamento atual mantido com `cap.levels` filtrado.

### T7.8 - `reconcileReasoningEffort` na Server Action

**Arquivo:** `src/lib/actions/llm-config.ts`
**Ação:** ao trocar modelo ativo, chamar helper que aplica as 4 regras
da spec §5.2.

**Done quando:** `tsc` verde.

### T7.9 - `revalidatePath` após mudança

**Arquivo:** `src/lib/actions/llm-config.ts`
**Ação:** `revalidatePath("/agente/recursos"); revalidatePath("/agente/configuracao");`
depois de salvar.

### T7.10 - Tests UI

**Arquivo:** `src/components/agent/__tests__/reasoning-card.test.tsx` (novo).
**Ação:** 11 testes:
- 5 estados renderizados corretos.
- Disabled correto em 3 estados.
- autoModeHint visível em `auto_only`.
- Reconcile aplicado em troca de modelo (mock action).
- aria-disabled presente.

**Done quando:** verde (se @testing-library disponível); senão Playwright spec.

### T7.11 - Commit 7

```
feat(ui): ReasoningCard dinamico com 5 estados + reconcile + revalidatePath

- 5 estados computados de reasoningCapsOf
- ui-ux-pro-max aplicada
- reconcileReasoningEffort na Server Action
- revalidatePath cobre /recursos e /configuracao
- 11 testes UI
```

---

## Onda 8 - Verificação + reviews + push (10 tasks)

### T8.1 - `tsc` + `eslint` + `jest` full

**Ação:** `npm run typecheck && npm run lint && npm test`.
**Done quando:** tudo verde.

### T8.2 - Verificar credenciais

**Ação:** SQL `SELECT provider, name FROM llm_credentials WHERE provider IN (...) ORDER BY provider`.
Decidir quais M*s vão rodar agora.

### T8.3 - Verificação M1 (OpenAI bubble)

**Ação:** com nano + checkpoint=PRODUCTION, mandar pergunta no
bubble. SQL `SELECT * FROM llm_usage ORDER BY created_at DESC LIMIT 3`.
Assertar `reasoning_tokens > 0`.

### T8.4 - Verificação M2 (checkpoint matrix por source)

**Ação:** 3 cenários (bubble OFF, bubble PRODUCTION, playground PLAYGROUND).
Conferir SQL.

### T8.5 - Verificação M5/M6 (UI estados)

**Ação:** trocar modelo entre `gpt-5.4-nano`, `claude-haiku-4-5`,
`gemini-3.1-pro`. Conferir que o card muda de estado.

### T8.6 - Verificação M7 best-effort

**Ação:** se credenciais Anthropic/Gemini/OpenRouter disponíveis,
mandar 1 pergunta com cada. Confirmar SQL e UI.

### T8.7 - `/gsd-code-review`

**Ação:** rodar review. Aplicar fixes High/Critical.

### T8.8 - `/gsd-ui-review`

**Ação:** rodar review na onda 7. Aplicar fixes BLOCK.

### T8.9 - HISTORY append final + delete active file

**Ação:** linha final em HISTORY.md sumarizando os 7 commits.
Deletar `docs/agents/active/claude-nex-llm-adapters-modernization.md`.

### T8.10 - `git push origin feat/f4-leitura-expansao`

**Ação:** push após `gh run list` confirmar nada queued.
**Done quando:** CI passa na branch.

---

## Critérios de done (igual à spec §13)

Lista completa replicada da spec. Plano serve para acompanhar
execução em tempo real.

## Riscos de plano

| # | Risco | Mitigação |
|---|---|---|
| P1 | Spike S0.1/S0.2/S0.3 dão resultado inesperado | Antes da onda 3/5/6, parar e reescrever a task afetada. |
| P2 | UI testing infrastructure não está configurada | T7.10 vira Playwright spec se Jest não suportar `.tsx`. Verificar em T7.10 setup. |
| P3 | Migration colide com agente paralelo | T1.3/T1.4 conferem `docs/agents/active/` antes. |
| P4 | Reasoning tokens em produção dispara custo | Checkpoint default OFF; só admin pode ligar. |
| P5 | Conversa antiga sem reasoning_history não tem signature | Aceito (default `[]`); Gemini reconstroi gradualmente. |

## Estimativa de esforço

- Onda 0 (spikes): 1h
- Onda 1: 2h
- Onda 2: 2h
- Onda 3 (OpenAI refator): 4h
- Onda 4 (Anthropic): 3h
- Onda 5 (Gemini com streaming novo): 3h
- Onda 6 (OpenRouter): 2h
- Onda 7 (UI): 2h
- Onda 8 (verificação): 1h

**Total estimado: ~20h** de execução inline.

---

## Fim do PLAN v1.

Próximo passo: Review crítica #1 sobre este plano →
`2026-05-25-llm-adapters-plan-review-1.md` → PLAN v2 → Review #2 →
PLAN v3.

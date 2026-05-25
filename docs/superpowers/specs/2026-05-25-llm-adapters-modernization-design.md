# SPEC v3 FINAL - Modernização dos adapters de LLM (Multi-provider Reasoning + Tools)

**Autor:** claude-nex-llm-adapters-modernization
**Data:** 2026-05-25
**Branch:** feat/f4-leitura-expansao
**Status:** v3 (final, base do plano de execução)

> Histórico:
> - v1: rejeitada na Review #1 (15 críticos, 5 menores). Ver `2026-05-25-llm-adapters-review-1.md`.
> - v2: rejeitada na Review #2 (8 críticos, 5 médios, 4 menores). Ver `2026-05-25-llm-adapters-review-2.md`.
> - v3: incorpora TODOS os achados. Esta é a base do plano.
>
> Tabela canônica de capability em arquivo separado:
> `2026-05-25-reasoning-caps-table.md`.

---

## 1. Contexto e motivação

O usuário identificou em 2026-05-25 que `gpt-5.4-nano` aceita
`reasoning_effort` + function calling simultaneamente via OpenAI
Responses API. Pesquisa nos 4 providers confirma o mesmo padrão para
suas próprias famílias de modelos. O código atual mantém todos os
modelos não `-pro` na Chat Completions, derruba reasoning quando há
tools, e não tem wiring de raciocínio em Anthropic, Gemini ou OpenRouter.
Resultado: o agente Nex roda em **modo rápido sem raciocínio em
nenhum provider**.

Em paralelo, o usuário pediu três exigências de UI/UX:

1. **Checkpoint funcional.** OFF/PLAYGROUND/PRODUCTION devem
   efetivamente decidir se o adapter envia `reasoning` no body.
2. **Nível de esforço dinâmico por modelo.** Cada modelo expõe
   níveis próprios; quando o modelo não permite escolher, UI mostra
   "Modelo define automaticamente" + range interno como subtítulo.
3. **Adaptive nativa do provider.** A "inteligência" de quando e
   quanto pensar é do provider (Anthropic adaptive, Gemini -1).
   Sem heurística client-side.

## 2. Objetivos (O*) e critérios de sucesso (M*)

### Objetivos

- (O1) Raciocínio + tools simultâneos funcionando nos 4 providers,
  para todos os modelos que suportam.
- (O2) Checkpoint respeitado ponta a ponta.
- (O3) Nível de esforço como teto dinâmico, com fallback "auto".
- (O4) Adaptive delegada ao provider.
- (O5) Streaming token-a-token quando solicitado (4 providers).
- (O6) Multi-turn preservando contexto de raciocínio em conversas
  longas (não só na iteração imediata).

### Critérios mensuráveis

- (M1) `checkpoint=PRODUCTION`, `gpt-5.4-nano`, chamada via bubble:
  `llm_usage.reasoning_tokens > 0`.
- (M2) `checkpoint=PLAYGROUND`, `gpt-5.4-nano`: bubble grava `NULL`,
  playground grava `>0`. WhatsApp grava `NULL`.
- (M3) `checkpoint=OFF`: nenhum source envia `reasoning` no body
  (assert via spy).
- (M4) Trocar modelo em `/agente/configuracao` → `revalidatePath` →
  navegar para `/agente/recursos` mostra efforts atualizados sem
  reload manual.
- (M5) Modelo sem reasoning (ex.: `gpt-3.5-turbo` se existir):
  card disabled, banner "Este modelo não suporta raciocínio."
- (M6) Modelo com `adaptiveMode=true` ou `levels=["auto"]`: dropdown
  disabled, autoModeHint visível, adapter envia o sinal nativo
  (`type:"adaptive"`, `thinkingBudget:-1`, etc).
- (M7) Verificação real (best-effort por credencial):
  - `gpt-5.4-nano`: `reasoning_tokens > 0`.
  - `claude-haiku-4-5`: **checkpoint=OFF forçado** + banner UI.
  - `claude-sonnet-4-6` adaptive: round-trip completo;
    `reasoning_history` array crescente na tabela.
  - `gemini-2.5-flash`: `thoughtsTokenCount > 0`.
  - `deepseek/deepseek-r1` via OpenRouter: `reasoning_tokens > 0`.
- (M8) Streaming: `result.streamed=true` em chamadas onde houve
  delta real (4 providers); `result.streamed=false` em fallback
  unário (a UI da bolha usa para decidir typewriter frontend).

## 3. Não-objetivos

Mantidos de v2:

- Mudar prompt/identidade/guardrails do agente.
- Adicionar providers novos (Grok, Cohere, etc).
- Mudar catálogo de tools do MCP.
- Implementar tools nativas da OpenAI (web_search, file_search).
- Persistir `reasoning_summary`/`thinking` no banco (só usage).
- Heurística client-side de complexidade.

## 4. Arquitetura geral (decisões transversais)

### 4.1 Contrato opaco entre `run-agent` e adapters

`types.ts`:

```ts
export type LlmProvider = "openai" | "anthropic" | "gemini" | "openrouter";

/** Inclui "auto" para modelos que decidem internamente. */
export type ReasoningEffort = "auto" | "minimal" | "low" | "medium" | "high";

/** Estado opaco por turno. Cada adapter sabe seu shape; run-agent trata como caixa preta. */
export interface ReasoningContext {
  provider: LlmProvider;
  data: unknown;
}

export interface ChatRequest {
  // ... existente ...
  reasoningEffort?: ReasoningEffort;
  /** Override do mapping effort→budget (Anthropic/Gemini/OpenRouter max_tokens). */
  reasoningMaxTokens?: number;
  /**
   * Histórico de contextos de raciocínio das iterações anteriores da
   * MESMA conversa. Crescente. Capado em 20 ou 50KB.
   */
  reasoningHistory?: ReasoningContext[];
}

export interface ChatResult {
  // ... existente ...
  /** Tokens de raciocínio. Sub-set de tokensOutput conceitualmente. */
  reasoningTokens?: number;
  /** Contexto deste turno para append em reasoningHistory. */
  reasoningContext?: ReasoningContext;
  /** True quando o adapter emitiu pelo menos um onToken durante o parse. */
  streamed: boolean;
}
```

`run-agent` nunca inspeciona `.data`. Mantém um array
`reasoningHistory` e dá append a cada iteração que produzir
`result.reasoningContext`.

### 4.2 REASONING_CAPS no catálogo

Interface completa documentada em
`2026-05-25-reasoning-caps-table.md`. Aqui o que importa:

```ts
interface ReasoningCap {
  levels: ReasoningEffort[];
  enabled: boolean;
  supportsWithTools: boolean;
  adaptiveMode: boolean;        // novo em v3 (separado de levels)
  openaiEndpoint?: "responses" | "chat-completions";
  anthropicThinking?: "adaptive" | "enabled";
  anthropicInterleavedAuto?: boolean;
  budgetRange?: [number, number];
  geminiShape?: "level" | "budget";
  openrouterShape?: "effort" | "max_tokens";
  outputCap?: number;            // opcional (OpenAI omite)
  autoModeHint?: string;
  requestTimeoutMs?: number;     // novo em v3
}
export function reasoningCapsOf(modelId: string): ReasoningCap | null;
export function effortToBudget(modelId: string, effort: ReasoningEffort): number | null;
```

### 4.3 Streaming homogêneo + flag `streamed`

`ChatRequest.stream=true && onToken` ativa SSE em todos. Adapter que
não suportar SSE para o modelo cai para unário, **NÃO chama
`onToken`** durante, e retorna `streamed: false`. Consumidor (bolha
do Nex) usa essa flag para acionar typewriter frontend (que já
existe e funciona bem hoje).

Adapter que conseguiu SSE retorna `streamed: true` — o consumidor
sabe que os deltas já vieram pelo `onToken` durante a chamada.

### 4.4 Timeouts

Toda `fetch(...)` recebe `AbortSignal.timeout(cap.requestTimeoutMs ?? 90000)`.
Erro estruturado: `Error("<provider> timeout em Ns")`.

### 4.5 Logging mínimo

```
[<provider>] start model=<id> tools=<n> reasoning=<level|off> source=<bubble|playground|whatsapp|suggestion>
[<provider>] done in=<n> out=<n> reasoning_tokens=<n|null> ms=<n> streamed=<bool>
```

Erros estruturados. Sem logar texto de thinking.

### 4.6 Cost calc

Sem mudança no `calculateCost`. `reasoning_tokens` vai para coluna
nova de auditoria, não para cobrança (OpenAI já inclui em
`output_tokens` na fatura).

## 5. Checkpoint funcional (CRIT-A8/M1-M3)

### 5.1 Semântica

`AgentSettings.reasoningCheckpoint` é `OFF | PLAYGROUND | PRODUCTION`.

| Checkpoint | bubble | playground | whatsapp |
|---|---|---|---|
| OFF | sem | sem | sem |
| PLAYGROUND | sem | com | sem |
| PRODUCTION | com | com | com |

`run-agent.ts`:

```ts
const cap = reasoningCapsOf(agentSettings.activeModelId);
const checkpointAllows =
  agentSettings.reasoningCheckpoint === "PRODUCTION" ||
  (agentSettings.reasoningCheckpoint === "PLAYGROUND" && args.source === "playground");
const reasoningAllowed =
  cap !== null
  && cap.enabled
  && cap.supportsWithTools     // Haiku 4.5 = false → sempre falso
  && checkpointAllows;

const effortForRequest: ReasoningEffort | undefined =
  !reasoningAllowed ? undefined
  : (cap.levels.includes("auto") ? "auto" : agentSettings.reasoningEffort);

await client.chat({
  // ... resto ...
  reasoningEffort: effortForRequest,
  reasoningHistory: loadedHistory,
});
```

### 5.2 reconcileReasoningEffort (CRIT-A2-9, MED-A2-14)

Server Action `updateActiveLlmConfig(modelId)` em
`src/lib/actions/llm-config.ts` chama, na sequência da atualização:

```ts
async function reconcileReasoningEffort(modelId: string) {
  const cap = reasoningCapsOf(modelId);
  const settings = await loadAgentSettings();

  if (!cap || !cap.enabled) {
    // modelo não suporta reasoning
    await update({ reasoningEffort: null, reasoningCheckpoint: "OFF" });
    return;
  }
  if (!cap.supportsWithTools) {
    // suporta mas não com tools (Haiku 4.5)
    await update({ reasoningCheckpoint: "OFF" });
    return;
  }
  if (cap.levels.length === 1 && cap.levels[0] === "auto") {
    await update({ reasoningEffort: "auto" });
    return;
  }
  if (settings.reasoningEffort && !cap.levels.includes(settings.reasoningEffort)) {
    // valor atual não está mais nos levels permitidos: pega o mais alto suportado
    const newEffort = cap.levels[cap.levels.length - 1];
    await update({ reasoningEffort: newEffort });
  }
}
```

Banner UI explicará a mudança ("Modelo selecionado não suporta
raciocínio com ferramentas. Modo de raciocínio desativado
automaticamente.") quando aplicável.

## 6. Adapters - mudanças individuais

### 6.1 OpenAI (`openai.ts`)

#### Decisões

1. **Rota canônica = Responses API** quando
   `cap.openaiEndpoint === "responses"` (todos modelos com reasoning
   na tabela). Chat Completions fica como fallback para modelos sem
   cap (ex.: hipotético gpt-4o sem reasoning).
2. **`instructions`** (string) para system, não message item (CRIT-A5).
3. **`store: false`** (CRIT-A6). Stateless.
4. **Multi-turn ordering generalizado** (CRIT-A2-10):
   ```
   input = [
     { type:"message", role:"user", content:[{type:"input_text",text:userMsg}] },
     ...iterations.flatMap(it => {
       const items = [...(it.reasoningItems ?? [])];
       if (it.functionCall) {
         items.push(it.functionCall, it.functionCallOutput);
       }
       if (it.assistantMessage) {
         items.push(it.assistantMessage);
       }
       return items;
     })
   ]
   ```
5. **`reasoning.effort`** + **`reasoning.summary: "auto"`**.
   - `reasoningEffort="auto"` (sinal interno do agente para modelos
     da OpenAI que não estão em `adaptiveMode=true`) → mapeia
     para `"medium"` no adapter. Catálogo só usa `"auto"` para
     casos onde adaptiveMode é verdadeiro; OpenAI não é o caso típico.
   - `reasoningEffort="minimal"` em modelos que aceitam (`gpt-5.x` exceto pro/o-series):
     enviado literalmente. Em modelos que NÃO aceitam (`o3`, `o3-pro`, `o1`, `o1-pro`,
     `gpt-5.4-pro`, `gpt-5.5-pro`): mapeia para `"low"`. Catálogo já reflete via `levels`.
6. **Tools `type:"function"` direto**, `strict:false`.
7. **`max_output_tokens`** quando `request.maxTokens` é dado;
   senão omitido. **Sem clamp** para OpenAI (CRIT-A2-13). Confiar
   no provider.
8. **Streaming SSE Responses**:
   - `response.output_text.delta` → `onToken(delta.text)`,
     marca `streamed=true`.
   - `response.function_call_arguments.delta` → acumular args do
     tool call.
   - `response.output_item.added` com `type:"reasoning"` → criar
     entrada na `reasoningItems[]` do contexto.
   - `response.completed` → extrair `usage.output_tokens_details.reasoning_tokens`.
9. **Sem `encrypted_content`**.

#### Schema final (Responses)

```json
{
  "model": "gpt-5.4-nano",
  "instructions": "<system prompt>",
  "input": [
    { "type":"message", "role":"user", "content":[{"type":"input_text","text":"qual o saldo?"}] },
    { "type":"reasoning", "id":"rs_abc", "summary":[...] },
    { "type":"function_call", "id":"fc_xyz", "call_id":"call_1", "name":"estoque_saldo_produto", "arguments":"{...}" },
    { "type":"function_call_output", "call_id":"call_1", "output":"{...}" }
  ],
  "tools": [
    { "type":"function", "name":"estoque_saldo_produto", "description":"...", "parameters":{...}, "strict":false }
  ],
  "reasoning": { "effort":"medium", "summary":"auto" },
  "max_output_tokens": 4096,
  "stream": true,
  "store": false
}
```

Response shape: ver `2026-05-25-reasoning-caps-table.md` + doc OpenAI.

### 6.2 Anthropic (`anthropic.ts`)

#### Decisões

1. **`thinking`** quando `reasoningAllowed`:
   - `adaptiveMode=true` (Opus 4.7/4.6, Sonnet 4.6) → `{ type:"adaptive", budget_tokens, display:"summarized" }`.
   - `adaptiveMode=false` (4.5 family, Haiku/Opus/Sonnet) → `{ type:"enabled", budget_tokens, display:"summarized" }`.
   - Budget calculado por `effortToBudget(model, effort)` (mapping no
     arquivo de caps).
2. **`max_tokens` com clamp**: `min(budget + (request.maxTokens ?? 1024), cap.outputCap)`.
3. **Beta header** `anthropic-beta: interleaved-thinking-2025-05-14`
   quando `cap.anthropicInterleavedAuto=false` e `supportsWithTools`.
4. **Haiku 4.5**: `cap.supportsWithTools=false`. `reconcileReasoningEffort`
   já força `checkpoint=OFF`. Adapter dropa thinking silenciosamente
   se receber `effort` por engano. Log informa.
5. **Multi-turn**: `reasoningHistory[i].data = { blocks: [...content] }`
   onde content vem da resposta anterior (thinking + tool_use ordem
   preservada). Próximo request:
   ```
   messages: [
     { role:"user", content: userMsg },
     { role:"assistant", content: history[0].data.blocks },
     { role:"user", content: [{ type:"tool_result", tool_use_id, content }] },
     { role:"assistant", content: history[1].data.blocks },
     ...
     { role:"user", content: novaUserMsg }
   ]
   ```
6. **Streaming**: parser estendido com `thinking_delta`,
   `signature_delta`, `redacted_thinking` (preservar `data`).
   Reconstroi `reasoningContext.data.blocks` no final.
7. **`reasoningTokens = undefined`** (Anthropic não expõe). Logger
   grava NULL.

### 6.3 Gemini (`gemini.ts`)

#### Decisões

1. **`thinkingConfig`** dentro de `generationConfig`:
   - `cap.geminiShape="budget"` (2.5 family): `thinkingBudget`
     numérico via `effortToBudget`.
   - `cap.geminiShape="level"` (3.x family): `thinkingLevel`
     direto (string).
   - `cap.adaptiveMode=true` (3.1 Pro): `thinkingBudget: -1`.
   - `includeThoughts: false` (default).
2. **Multi-turn com `reasoningHistory` array** (CRIT-A2-7):
   - Cada `history[i].data = { parts: [...response_parts] }` (texto
     com `thought:true`, functionCalls, etc).
   - Cap em 20 iterações ou 50KB serialized (cap aplicado em
     `run-agent.ts` antes de salvar no banco).
   - Em conversas longas, a 6ª pergunta do usuário recebe
     `contents` reconstruído com TODAS as iterações anteriores
     preservadas em ordem.
3. **Streaming**:
   - Endpoint: `:streamGenerateContent?alt=sse&key=...`
   - Parser detecta `Content-Type` (SSE vs JSON Lines vs JSON array
     stream). **Plan task de prototipagem** antes de implementar
     final.
   - Fallback `:generateContent` com `streamed=false` se erro 404.
4. **`reasoningTokens = usage.thoughtsTokenCount`**.

### 6.4 OpenRouter (`openrouter.ts`)

#### Decisões

1. **`reasoning` body**:
   - `cap.openrouterShape="effort"`: `{"reasoning":{"effort":<level>,"exclude":false}}`
   - `cap.openrouterShape="max_tokens"`: `{"reasoning":{"max_tokens":<derived>,"exclude":false}}`
   - `cap.adaptiveMode=true` + `levels=["auto"]`: `{"reasoning":{"effort":"high","exclude":false}}` (assume teto alto, deixa modelo decidir).
2. **Preservação multi-turn**: `reasoningHistory[i].data = { reasoning_details: [...] }`. **Plan task de spike** (MED-A2-16): testar se OpenRouter aceita `reasoning_details` no request quando reenviado em `messages[i]`. Se não aceitar, aceitar limitação documentada.
3. **Streaming SSE**: shape OpenAI-compatible. Parser extrai `choices[0].delta.content` para `onToken`; `choices[0].delta.reasoning_details` para acumular contexto.
4. **`reasoningTokens = usage.reasoning_tokens`**.
5. **Sem `usage:{include:true}`** (CRIT-A12).
6. Headers existentes (`HTTP-Referer`, `X-Title`) mantidos.

## 7. Catalog / Types / run-agent / DB

### 7.1 catalog.ts

- `REASONING_LEVELS` removido.
- `REASONING_CAPS` adicionado conforme tabela.
- Helpers: `reasoningCapsOf`, `effortToBudget`, `modelSupportsReasoning`,
  `reasoningLevelsOf` (compat: retorna `caps.levels`).
- Regex `requiresResponsesApi` removido. Substituído por
  `cap.openaiEndpoint`.

### 7.2 types.ts

Conforme §4.1.

### 7.3 run-agent.ts

- `loadConversationReasoningHistory(conversationId)` carrega array
  (default `[]`).
- A cada iteração:
  - `request.reasoningHistory = history`.
  - Após `result`, se `result.reasoningContext`:
    `history.push(result.reasoningContext)`.
- Ao final do loop, persistir:
  `saveConversationReasoningHistory(id, capArray(history, 20, 50_000))`.
- Cap helper trunca por contagem ou por tamanho serializado, mantendo
  últimas iterações.
- `reasoningAllowed` conforme §5.1.

### 7.4 Migrations Prisma

Verificar primeiro o schema atual:

```sql
\d llm_usage
\d conversations
```

Migrations idempotentes (timestamps a determinar no commit):

```sql
-- llm_usage_reasoning_tokens
ALTER TABLE llm_usage ADD COLUMN IF NOT EXISTS reasoning_tokens INTEGER;

-- conversations_reasoning_history
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reasoning_history JSONB NOT NULL DEFAULT '[]'::jsonb;
```

Antes do commit, coordenação:
- Verificar `docs/agents/active/` (sem outro agente em migrations).
- Registrar em `docs/agents/HISTORY.md`.
- AGENTS.md flag de `prisma/migrations/` compartilhado.

### 7.5 conversation.ts

```ts
export async function loadConversationReasoningHistory(id: string): Promise<ReasoningContext[]>;
export async function saveConversationReasoningHistory(id: string, history: ReasoningContext[]): Promise<void>;
```

Validation com Zod no save (cap de tamanho), retorna void.

## 8. UI dinâmica (`/agente/recursos` ReasoningCard)

> **Regra de raiz §6/[2] CLAUDE.md:** UI exige skill `ui-ux-pro-max`.
> Aplicada ANTES da implementação dos estados visuais. Estados são:
> Estado 1 (sem reasoning, banner cinza), Estado 2 (sem tools, badge
> amber), Estado 3 (auto, dropdown disabled), Estado 4 (custom,
> dropdown habilitado).

### 8.1 Estados computados

```ts
const cap = reasoningCapsOf(modelId);
if (!cap || !cap.enabled) {
  state = "no_reasoning";  // Estado 1
}
else if (!cap.supportsWithTools) {
  state = "blocked_by_tools";  // Estado 2
}
else if (cap.levels.length === 1 && cap.levels[0] === "auto") {
  state = "auto_only";  // Estado 3
}
else if (cap.adaptiveMode) {
  state = "adaptive_with_ceiling";  // novo, Estado 4'
}
else {
  state = "custom";  // Estado 4
}
```

Estado 4' (`adaptive_with_ceiling`, ex.: Opus 4.7 com
`adaptiveMode=true` e `levels=["low","medium","high"]`): dropdown
habilitado para o usuário escolher o teto; subtítulo da UI: "Modelo
decide automaticamente até este nível."

### 8.2 Live sync via revalidatePath (CRIT-A2-11)

- `updateActiveLlmConfig` no `LlmConfigForm` chama
  `revalidatePath("/agente/recursos")` após salvar.
- Quando o usuário navega de configuração → recursos, o RSC
  refeta `AgentSettings` + `modelsByProvider`. ReasoningCard
  recebe modelId atualizado e recomputa estado.
- Sem window event. Sem cross-tab. **Documentado:** se o usuário
  tem 2 abas abertas, uma com `/agente/recursos` e altera modelo
  na outra, precisa F5 para ver atualizado.

### 8.3 aria/cursor/microcopy

- `state="auto_only"`:
  - Dropdown `disabled aria-disabled="true"`.
  - Cursor `not-allowed`.
  - Valor mostrado: "Auto".
  - Subtítulo: "Modelo define automaticamente ({cap.autoModeHint})".
- `state="blocked_by_tools"`:
  - Banner amber: "Este modelo suporta raciocínio mas não junto com
    ferramentas. Como o agente usa ferramentas em toda consulta, o
    raciocínio fica desligado automaticamente."
  - Card visualmente em opacidade reduzida.
  - Server Action salva `checkpoint=OFF` (já forçado por
    `reconcileReasoningEffort`).
- `state="no_reasoning"`:
  - Banner cinza: "Este modelo não suporta raciocínio."
  - Card inteiro disabled.
- `state="adaptive_with_ceiling"`:
  - Dropdown habilitado com `cap.levels`.
  - Subtítulo: "Modelo decide até este nível."
- `state="custom"`:
  - Dropdown habilitado.
  - Subtítulo padrão atual ("Consumo {leve|moderado|alto|intenso}").

### 8.4 Multi-agente compliance

`src/components/agent/reasoning-card.tsx` é arquivo compartilhado.
Verificar `docs/agents/active/` antes de tocar. Hoje só temos
`claude-nex-bubble-storytelling` em area disjunta.

## 9. Testes (92 esperados)

### 9.1 Por adapter

- **OpenAI:** 18 (15 base + 3: instructions, store:false,
  multi-turn ordering generalizado).
- **Anthropic:** 16 (15 + 1: adaptiveMode flag).
- **Gemini:** 17 (15 + 2: reasoningHistory array crescente,
  content-type detection).
- **OpenRouter:** 13 (12 + 1: rejeita modelo sem cap).

### 9.2 Run-agent integration

- 5 testes: carregar history, fazer 2 iter, salvar history cap, OFF
  bloqueia, PLAYGROUND condicional por source.

### 9.3 Checkpoint matrix

12 testes (3 sources × 3 checkpoints + 3 caps especiais).

### 9.4 UI

11 testes (4 estados + 3 reconcile + 3 disabled UX + 1 sync via
revalidatePath).

### 9.5 Estratégia de mock

- Adapter tests: mockar `fetch` global (jest setup já existente).
- Multi-turn: passar `request.reasoningHistory` literal nos testes.
- UI tests: `@testing-library/react` se disponível, senão Playwright.
  Plan verifica disponibilidade no setup atual.

## 10. Verificação contra APIs reais

### 10.1 Pré-requisito

Antes da execução, plan verifica credenciais em `llm_credentials`:

```sql
SELECT provider, name FROM llm_credentials WHERE provider IN ('openai','anthropic','gemini','openrouter') ORDER BY provider;
```

- M1 (OpenAI): **bloqueante** (já em produção).
- M2-M3-M4 e M7 demais: **best-effort**, pular se credencial ausente
  com nota no relatório.

### 10.2 Procedimento por provider

1. Trocar modelo ativo em `/agente/configuracao` para o alvo.
2. Setar checkpoint conforme cenário.
3. Pergunta padrão: "qual o saldo de mola espiral em aço?" (força
   tool call em `estoque_saldo_produto`).
4. Confirmar via SQL no `llm_usage` e `conversations`.
5. Verificar UI: resposta usa o dado real, sem alucinação.

### 10.3 Spikes prévios (antes da implementação final)

Plan inclui:

- **Spike Gemini:** `curl :streamGenerateContent?alt=sse` para
  modelo Flash. Log `Content-Type` e primeiros 500 bytes. Define
  shape de parser.
- **Spike OpenRouter:** chamada Chat Completions enviando
  `messages[i].reasoning_details` em assistant intermediário. Confirma
  aceitação ou define limitação.
- **Spike OpenAI:** chamada Responses com tools + reasoning ao nano,
  capturar shape de `response.output_item.added` para `type:"reasoning"`.

## 11. Rollout

- Branch única: `feat/f4-leitura-expansao`.
- Commits atômicos (com testes inclusos):
  1. `feat(llm): types + REASONING_CAPS + reconcileReasoningEffort`
  2. `feat(llm): migrations reasoning_tokens + reasoning_history`
  3. `refactor(openai): migrar para /v1/responses canônica`
  4. `feat(anthropic): extended thinking adaptive + interleaved`
  5. `feat(gemini): thinkingConfig + reasoning_history + streamGenerateContent`
  6. `feat(openrouter): reasoning unificado + reasoning_details`
  7. `feat(ui): ReasoningCard com 5 estados dinâmicos`
- Sem feature flag.
- `tsc` + `eslint` + `jest` verdes a cada commit.

### 11.1 Rollback (MED-A2-17)

Cada commit é revertível isolado: `git revert <SHA>` + push +
deploy automático. Tempo esperado de rollback: <5 min.
Em caso de falha no M1 pós-merge, reverter commit 3 (OpenAI) — os
demais providers ficam quietos sem afetar produção (não há credencial
ativa).

## 12. Riscos atualizados

| # | Risco | Mitigação |
|---|---|---|
| R1 | Multi-turn reasoning_history infla banco | Cap de 20 iter / 50KB; truncamento mantém últimas. |
| R2 | Streaming Responses tem shape inesperado | Spike OpenAI antes da implementação. |
| R3 | Anthropic beta header errado | Catálogo é fonte; testes validam. |
| R4 | Gemini streaming corta functionCall | Spike Gemini; fallback unário documentado. |
| R5 | OpenRouter rejeita reasoning_details no request | Spike OpenRouter; se rejeitado, aceitar limitação. |
| R6 | Migration conflita com agente paralelo | Verificar `docs/agents/active/` antes; AGENTS.md compliance. |
| R7 | Custo dispara se admin liga effort=high | Checkpoint default OFF; só admin altera. |
| R8 | Anthropic não expõe reasoning_tokens | NULL aceito. |
| R9 | UI live-sync limitado a navegação dentro da aba | Documentado; aceito como trade-off. |
| R10 | Timeout 90s pode ser curto para high+pro | Override por modelo via `cap.requestTimeoutMs`. |
| R11 | Credencial faltando para verificação | Best-effort; M1 OpenAI é único bloqueante. |
| R12 | `reasoningEffort="auto"` no banco em modelo não-adaptive | reconcileReasoningEffort previne; teste cobre. |
| R13 | Conversa antiga sem reasoning_history continua quebrando Gemini | Hoje conversas antigas têm history=[] (default); rebuild gradual conforme uso. |

## 13. Critérios de aceitação

- [ ] `tsc` verde.
- [ ] `eslint` verde.
- [ ] `jest` verde com **~92 testes novos**.
- [ ] Verificação real M1 (OpenAI bubble) → `reasoning_tokens > 0`.
- [ ] Verificação real M2 (checkpoint matrix por source).
- [ ] Verificação real M5-M6 (UI estados dinâmicos).
- [ ] Spikes documentados (Gemini, OpenRouter, OpenAI).
- [ ] Verificação real M7 best-effort para Anthropic/Gemini/OpenRouter.
- [ ] `/gsd-code-review` sem findings High/Critical.
- [ ] `/gsd-ui-review` sem BLOCK (UI tocou ReasoningCard).
- [ ] `docs/agents/HISTORY.md` atualizado.
- [ ] Active agent file deletado.
- [ ] Tabela de capability completada com pesquisa contra docs
      oficiais de cada provider (uma task no plano).

## 14. Notas de design

- **PII no reasoning_history:** pode haver texto do usuário replicado
  em parts. Política: retenção por 30 dias (job cron fora desta
  entrega). Documentado.
- **Migration timestamp:** `YYYYMMDDHHmm_descricao` baseado no
  horário do commit, conforme padrão Prisma do repo.
- **`reasoningEffort="auto"` no banco:** quando salvo, indica
  apenas que `reconcileReasoningEffort` escolheu auto-mode. Adapter
  faz o mapping correto.

---

## Fim da SPEC v3 FINAL.

Próximo passo: PLAN v1 derivado desta spec, em
`docs/superpowers/plans/2026-05-25-llm-adapters-modernization-plan.md`.
PLAN passa por 2 reviews críticas antes de virar v3.

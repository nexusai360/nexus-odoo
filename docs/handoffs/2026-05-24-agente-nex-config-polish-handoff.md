# Handoff — Agente Nex config polish (continuar reasoning nos 3 adapters restantes)

> Data: 2026-05-24 ~03:25. Branch: `feat/f4-leitura-expansao` (pushed).
> Última sessão: claude-agente-nex-config-polish.
> Próxima sessão deve continuar a partir daqui.

## Estado atual (o que já foi feito, validado e pushed)

### Tela /agente/configuracao
- Botão "Atualizar modelos" pílula violet ghost ao lado da label "Modelo" com spinner "Atualizando…" em loading.
- Alinhamento Provedor/Modelo via placeholder invisível `<span class="h-7">`.
- Título `<h3>Configuração do LLM</h3>` substitui a linha sutil.
- Cards Disponibilidade/Recursos com `pt-5 pb-5` simétrico.
- "Outro (digitar manualmente)" sempre no topo via `SearchableSelect.pinnedFirst` (ignora filtro).
- Modelos OpenRouter mostram `ProviderBadge` à esquerda do `TierBadge` via `SearchableSelectOption.startAdornment`.
- Modelos `:free` recebem `tier: "free"` e `TierBadge` verde.
- Helper `labelWithLegacy(m)` mostra "(legado)" para `released < "2024-01"`.

### Catálogo / ordenação
- `CostTier` ampliado com `"free"`.
- `sortModels` ordena por família/versão (helper `familyScore`) → data desc → custo desc → alfabético.
- `sortOpenrouterModels` separado: tier (premium > high > medium > low > free) → data desc → alfabético, SEM agrupar por provedor.
- `listModels` filtra pré-2024 (exceto `use === "áudio"`) e filtra `use === "áudio"` do dropdown principal.
- `getModel(id)` continua retornando legados (não filtra).
- `loadEffectiveModelsByProvider` faz o mesmo despacho com `includeLegacy?`.

### Catálogo (entries adicionadas/removidas)
- Removidos do base: `gpt-4`, `gpt-4-turbo` (legados não-conversacionais).
- Adicionados: `gemini-3-pro`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-thinking`, `gemini-2.5-pro-thinking`, `x-ai/grok-4-fast`, `meta-llama/llama-4-scout:free`, `deepseek/deepseek-v3.1:free`.
- Pricing oficial preenchido para Grok 3, Grok 3 mini, Grok 4 (eram null).
- `REASONING_LEVELS` expandido de 18 para 34 entries cobrindo OpenAI GPT-5/o-series + Claude 4.x + Gemini 2.5/3.x + DeepSeek R1 + Qwen QwQ (mesmos via OpenRouter).

### Sync
- `fetchAnthropic` (x-api-key + anthropic-version: 2023-06-01).
- `fetchGemini` (`v1beta/models?key=`, filtra `generateContent`, stripa `models/`).
- `fetchOpenRouter` agora humaniza labels (`humanizeOpenrouterLabel`) e filtra modelos não-text (`isOpenrouterNonChat` + architecture + created >= 2024).
- `syncProvider` cobre os 4 providers.
- OpenRouter força upsert no banco mesmo se id já está na base (trazer pricing fresco).
- Whitelist ampliada e restringida — sem embeddings/tts/realtime/image/search/legacy.

### Cleanup
- `scripts/cleanup-llm-model-entry.ts` (`pnpm cleanup:llm-models [--apply]`):
  - Classifica entries em keep/deprecate/delete.
  - Consulta refs em LlmConfig + AgentSettings.{audio,image}Model + PlaygroundSession.model.
  - Heurística agressiva: snapshots datados, variantes pouco usadas (chat-latest, codex, realtime, search), pricing=null em non-OpenRouter (exceto tts/whisper/embedding).
- Executado: ~93 entries órfãs removidas. Banco com 0 lixo OpenAI.

### OpenAI Responses API (`/v1/responses`)
- `requiresResponsesApi(model)` detecta `-pro`, `o[1-9]-pro`, `gpt-5.X-pro`.
- `chatViaResponses()` no OpenAIClient:
  - `mapMessagesToResponsesInput` converte ChatMessage[] (incl. tool_calls e tool results) em items tipados.
  - `mapToolsToResponses` converte ToolDefinition[] no formato sem wrapping.
  - Parser do output reconhece message (output_text) e function_call.
  - `reasoning: {effort}` mapeado (minimal → low).
  - `max_output_tokens` no body quando `maxTokens` setado.
- `test-connection.ts` para OpenAI faz probe específico em `/v1/responses` quando o modelo bate em `-pro`.
- Tradução pt-BR para erro "This is not a chat model".

### Validação
- tsc verde, jest 17/17 nos providers (`src/lib/agent/llm/providers`), build verde, audit:tools verde.

### Commits finais (na branch `feat/f4-leitura-expansao`)
- `46c52ac` — adapter `/v1/responses` OpenAI (sem tools)
- `bf63a52` — humanizador OpenRouter + filtros + erro pt-BR
- `6a9e886` — tools no `/v1/responses` (function calling completo)

---

## O que falta — para a próxima sessão fazer

### 1. Anthropic (`src/lib/agent/llm/providers/anthropic.ts`)
**Extended thinking ainda não implementado.** Precisa:
- Ler `request.reasoningEffort` no método `chat()`.
- Quando setado, adicionar no body:
  ```ts
  body.thinking = {
    type: "enabled",
    budget_tokens: { low: 2048, medium: 8192, high: 16384 }[effort] ?? 4096,
  };
  ```
- `request.maxTokens` precisa ser `>= budget_tokens + 1024` (Anthropic exige).
- Resposta vem com bloco `{type: "thinking", thinking: "..."}` + bloco final `{type: "text", text: "..."}` — extrair apenas o `text` para `message`, ignorar thinking.

### 2. Gemini (`src/lib/agent/llm/providers/gemini.ts`)
**Thinking config ainda não implementado.** Precisa:
- Ler `request.reasoningEffort`.
- Adicionar no body `generationConfig`:
  ```ts
  body.generationConfig = {
    ...body.generationConfig,
    thinkingConfig: {
      thinkingBudget: { low: 1024, medium: 4096, high: 8192 }[effort] ?? -1,
      includeThoughts: false,
    },
  };
  ```
- Aplicar apenas para modelos cuja lista `reasoningLevels` esteja preenchida (cobre 2.5 pro/flash, 3 pro, 3.5 flash).

### 3. OpenRouter (`src/lib/agent/llm/providers/openrouter.ts`)
- Propagar `reasoning_effort` no body (OpenRouter aceita o campo e repassa). Lógica idêntica ao OpenAI direto.
- Testar empiricamente `openai/gpt-5.5-pro` via OpenRouter — se der erro "not a chat model", precisa rotear pelo endpoint `/v1/responses` deles (existe em `openrouter.ai/api/v1/responses`).
- Caso seja necessário endpoint Responses para alguns modelos via OpenRouter: replicar a estrutura do `chatViaResponses` no openrouter adapter (mesmo schema).

### 4. Tests
- 1 teste unit por adapter cobrindo o caso reasoning (mocking fetch).
- Idealmente 1 E2E real chamando a chave de cada provider — pode rodar via `npm test` quando as chaves estiverem disponíveis em `.env.local`.

---

## Como retomar

1. Abrir nova sessão na branch `feat/f4-leitura-expansao`.
2. Apontar para este handoff (`docs/handoffs/2026-05-24-agente-nex-config-polish-handoff.md`).
3. Começar pelo item 1 (Anthropic), depois 2 (Gemini), depois 3 (OpenRouter).
4. Validar com `pnpm tsc --noEmit && pnpm jest src/lib/agent/llm/providers`.

## Arquivos chave (referências rápidas)

| Caminho | Linhas | Propósito |
|---|---|---|
| `src/lib/agent/llm/providers/openai.ts` | 1-220 | Adapter OpenAI com chat completions + Responses + tools |
| `src/lib/agent/llm/providers/anthropic.ts` | — | TODO: thinking config |
| `src/lib/agent/llm/providers/gemini.ts` | — | TODO: thinking config |
| `src/lib/agent/llm/providers/openrouter.ts` | — | TODO: reasoning_effort + responses |
| `src/lib/agent/llm/providers/test-connection.ts` | 209-241 | Probe /v1/responses para -pro |
| `src/lib/agent/llm/catalog.ts` | 251-300 | REASONING_LEVELS por modelo |
| `src/lib/agent/llm/sync-catalog.ts` | 52-130 | fetchOpenRouter humanizado + filtros |
| `src/lib/agent/llm/sync-whitelist.ts` | 15-50 | Whitelist por sub-família |
| `scripts/cleanup-llm-model-entry.ts` | full | Limpeza idempotente do banco |

Sem bloqueios. Tudo verde, pushed.

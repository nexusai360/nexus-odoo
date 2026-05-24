# SPEC v3 (final) — Agente Nex configuração polish

> Incorpora R1–R18 (review 1) e S1–S14 (review 2). Lê com v2 ao lado para
> contexto.

## Escopo final mínimo

### Visual (V)
- V1: botão "Atualizar modelos" pílula violet ghost (não link), ícone + texto, à direita da Label "Modelo", spinner inline em loading; sem `title` duplicado.
- V2: SearchableSelect prop `pinnedFirst?: SearchableSelectOption[]` — sempre topo, ignora filtro. "Outro (digitar manualmente)" entra como pinned.
- V3: TierBadge tier `"free"` (verde, label "FREE").
- V4: ProviderBadge à esquerda da TierBadge para OpenRouter. Lookup table (openai/anthropic/google/deepseek/meta/qwen/mistral/cohere/xai/microsoft/perplexity).
- V5: SearchableSelectOption.startAdornment? opcional.
- V6: Recursos header `pt-5 pb-5` (simétrico ao pb-5 do content).
- V7: Helper `isLegacyModel(m)`; UI mostra `${label} (legado)` quando `released < "2024-01"`.

### Dados (D)
- D1: `loadEffectiveModelsByProvider` filtra pré-2024 EXCETO `use === "áudio"`.
- D2: `listModels` (catalog) também filtra pré-2024 EXCETO áudio.
- D3: `getModel` continua retornando legados.
- D4: Entries OpenRouter `:free` recebem `tier: "free"`.

### Sync (S)
- S1: Whitelist OpenAI ampliada: gpt-5*, gpt-4o*, gpt-4.1*, o1, o3, o4*, transcribe, whisper-1, tts-1, embeddings.
- S2: Whitelist Anthropic ampliada: claude-(opus|sonnet|haiku)-4-{5,6,7}, claude-3-(5|7)-*.
- S3: Whitelist Gemini ampliada: gemini-(1.5|2.0|2.5)-(pro|flash|flash-lite|flash-8b)(-thinking)?.
- S4: Whitelist OpenRouter restringida por sub-família (anti-lixo).
- S5: fetchAnthropic (`/v1/models`, x-api-key + anthropic-version: 2023-06-01).
- S6: fetchGemini (`/v1beta/models?key=`), stripar `models/` prefix, filtrar `supportedGenerationMethods.includes("generateContent")`.
- S7: Filtro `released >= 2024-01` no sync (descartar antes do upsert).
- S8: deriveTier — caso "free" (id endsWith `:free` ou pricing=null+notes=free).
- S9: Acentuação em strings do refresh feedback.
- S10: Reasoning sync postergado para próxima onda (registrar débito em RADAR).

### Cleanup (C)
- C1: Script `scripts/cleanup-llm-model-entry.ts` — varre LlmModelEntry, coleta refs de LlmConfig/AgentSettings.{audio,image}Model/PlaygroundSession.model. Classifica: keep (válida) / deprecate (inválida mas em uso) / delete (inválida e sem uso). `--dry-run` default; `--apply` para executar.
- C2: Adicionar `pnpm cleanup:llm-models` no package.json.
- C3: Executar uma vez em dev após a entrega (`--apply`).

### Tipos
- T1: `CostTier = "free" | "low" | "medium" | "high" | "premium"`.
- T2: `SearchableSelectOption.startAdornment?: ReactNode`.
- T3: `SearchableSelectProps.pinnedFirst?: SearchableSelectOption[]`.

### Acentuação garantida em todo texto novo (palavras-chave: atualização, modelos, configuração, permissão, provedor, raciocínio, sincronização, padrão, também, está, não, ações, página, preço, preços, catálogo, já)

## Critérios de aceite
1. tsc + eslint + jest + audit:tools + build verdes.
2. UI exibe botão violet ghost; "Outro" pinned; OpenRouter com provider badge; modelos free verdes; Recursos simétrico.
3. Sync funcional nos 4 providers.
4. Cleanup `--dry-run` e `--apply` testados; dropdown OpenAI fica ~15-20 modelos.
5. Snapshot MCP regenerado (sem regressões).
6. Sem texto pt-BR sem acento em strings novas.

## Débito técnico registrado
- Reasoning sync para Anthropic/Gemini/DeepSeek (próxima onda).
- UI de curadoria manual de pricing para Anthropic/Gemini.

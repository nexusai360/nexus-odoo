# SPEC v2 — Agente Nex configuração polish (incorporando R1–R18)

## 1. Mudanças visuais finais

| ID | Mudança | Local |
|---|---|---|
| V1 | Botão "Atualizar modelos" pílula violet ghost (não link sublinhado), ícone + texto, à direita da Label "Modelo". Spinner inline em loading | llm-config-form.tsx |
| V2 | SearchableSelect: nova prop `pinnedFirst?: SearchableSelectOption[]` — items aparecem sempre no topo, ignoram filtro de busca; "Outro (digitar manualmente)" passa a ser pinned | searchable-select.tsx + llm-config-form.tsx |
| V3 | TierBadge ganha tier "free" verde (FREE) | tier-badge.tsx + types.ts |
| V4 | ProviderBadge neutro à esquerda da TierBadge para OpenRouter (OpenAI/Anthropic/Google/DeepSeek/Meta/Qwen/Mistral/Cohere/xAI/Microsoft/Perplexity) | NOVO + llm-config-form.tsx |
| V5 | SearchableSelectOption.startAdornment opcional | searchable-select.tsx |
| V6 | Recursos: header `pt-5 pb-5` simétrico ao `pb-5` do content | configuracao/page.tsx |
| V7 | Modelo legado (pré-2024) mostra "(legado)" no label visualmente | catalog formatador |

## 2. Mudanças de catálogo (dados)

| ID | Mudança | Local |
|---|---|---|
| D1 | `listModels`/`loadEffectiveModelsByProvider` filtram pré-2024, EXCETO `use === "áudio"` | catalog.ts + effective-catalog.ts |
| D2 | `getModel(id)` continua retornando legados (não filtra) | catalog.ts (já é) |
| D3 | Modelos `:free` (OpenRouter) ganham `tier: "free"` | catalog.ts (entries) |
| D4 | Atualizar/ampliar Anthropic: confirmar Claude Sonnet 4.7 e Opus 4.7 (já estão); adicionar 3-7-sonnet se ainda não | catalog.ts |
| D5 | Atualizar/ampliar Gemini: confirmar 2.5 pro/flash/flash-lite (já estão); validar gemini-2.5-flash-thinking | catalog.ts |
| D6 | OpenRouter: novos modelos free populares (Llama 4 Scout free, DeepSeek V4 free) | catalog.ts |
| D7 | REASONING_LEVELS apenas OpenAI nesta onda (decisão R10) | catalog.ts (sem mudança) |

## 3. Mudanças de sync (backend)

| ID | Mudança | Local |
|---|---|---|
| S1 | Whitelist OpenAI ampliada: gpt-5*, gpt-4o*, gpt-4.1*, o1, o3, o4*, gpt-4o-transcribe, whisper-1, tts-1, embeddings | sync-whitelist.ts |
| S2 | Whitelist Anthropic ampliada: claude-(opus/sonnet/haiku)-4* + claude-3-(5/7)-* | sync-whitelist.ts (já bate) |
| S3 | Whitelist Gemini ampliada: gemini-(1.5/2.0/2.5)-(pro/flash/flash-lite/flash-8b)(-thinking)? | sync-whitelist.ts |
| S4 | Whitelist OpenRouter: padrões existentes + deepseek/*, meta-llama/llama-(3.3/4)*, mistralai/*, qwen/*, x-ai/grok-*, perplexity/sonar* | sync-whitelist.ts |
| S5 | fetchAnthropic: `GET https://api.anthropic.com/v1/models` com headers `x-api-key` + `anthropic-version: 2023-06-01`. Sem pricing na API (entry vai com pricing=null) | sync-catalog.ts |
| S6 | fetchGemini: `GET https://generativelanguage.googleapis.com/v1beta/models?key=<KEY>`. Stripar prefix `models/` do id. Sem pricing na API | sync-catalog.ts |
| S7 | Filtro `released >= 2024-01` no sync: para modelos que vêm com data, pular pré-2024. Modelos sem data: aceitar | sync-catalog.ts |
| S8 | `deriveTier`: adicionar caso `free` (pricing=null && id endsWith ":free") | sync-catalog.ts |
| S9 | Reasoning sync (S7 do plan v1) — postergado para próxima onda (decisão R10) | – |

## 4. Limpeza de banco

| ID | Mudança | Local |
|---|---|---|
| C1 | `scripts/cleanup-llm-model-entry.ts`: lista LlmModelEntry; classifica em `delete` (sem uso em LlmConfig/AgentSettings, fora da whitelist ou pré-2024 ou sem pricing+source=sync), `deprecate` (em uso, mas inválido), `keep` (válido). Suporta `--dry-run`. | NOVO |
| C2 | Adicionar script ao package.json como `pnpm cleanup:llm-models` | package.json |
| C3 | Rodar 1 vez em dev após implementação | manual |

## 5. Tipos

| ID | Mudança | Local |
|---|---|---|
| T1 | `CostTier = "free"|"low"|"medium"|"high"|"premium"` | types.ts |
| T2 | `SearchableSelectOption.startAdornment?: ReactNode` | searchable-select.tsx |
| T3 | `SearchableSelectProps.pinnedFirst?: SearchableSelectOption[]` | searchable-select.tsx |

## 6. Acentuação

Todo texto pt-BR novo deve usar acentos corretos. Lista de palavras
sentinela: "atualização", "modelos", "configuração", "permissão",
"provedor", "raciocínio", "sincronização", "padrão", "também", "está",
"não", "também", "está", "ações", "página".

## 7. Critérios de aceite

1. tsc + eslint + jest + audit:tools + build verdes.
2. UI:
   - botão "Atualizar modelos" violet ghost com hover sublinha, texto
     visível, ao lado da label "Modelo"
   - "Outro (digitar manualmente)" SEMPRE primeiro item, mesmo com filtro
   - OpenRouter mostra ProviderBadge à esquerda do TierBadge
   - modelos `:free` mostram tier verde "FREE"
   - Recursos com pt-5 pb-5 simétrico
3. Sync:
   - 4 providers funcionam (Anthropic e Gemini via novas funções)
   - Anthropic e Gemini entries criadas com pricing=null (curadoria
     manual)
   - filtro pré-2024 ativo
4. Cleanup:
   - dry-run lista o que seria afetado
   - run real remove órfãs (sem uso) e marca deprecated as em uso
   - dropdown OpenAI passa de 30+ para ~15-20 modelos válidos
5. Snapshot do catálogo regenerado: `pnpm gen:mcp-catalog` (não afeta
   esta onda, mas valida que outras coisas não quebraram).

## 8. Próximo passo

SPEC v3 após review crítica adversarial profunda.

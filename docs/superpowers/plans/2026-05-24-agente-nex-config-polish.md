# PLAN v1 — Agente Nex config polish

## Bloco T (Tipos)
- T.1: `src/lib/agent/llm/types.ts` — `CostTier` ganha `"free"`.

## Bloco V (Visual primitivos)
- V.1: `src/components/ui/tier-badge.tsx` — adicionar caso `free` (verde, label "FREE").
- V.2: `src/components/ui/provider-badge.tsx` (NOVO) — recebe `providerKey: string`, faz lookup e retorna badge neutro slate/zinc.
- V.3: `src/components/ui/searchable-select.tsx` — adicionar `startAdornment?: ReactNode` em `SearchableSelectOption`; adicionar `pinnedFirst?: SearchableSelectOption[]` em props; render pinned acima de filtered, ignora `query`.

## Bloco D (Dados)
- D.1: `src/lib/agent/llm/catalog.ts`:
  - Helper `isLegacyModel(m: ModelEntry): boolean` (released < "2024-01").
  - `listModels(provider, opts?: {includeLegacy?: boolean})` — filtra pré-2024 quando `!opts.includeLegacy && m.use !== "áudio"`.
  - `listAudioModels` mantém todos (whisper-1 inclusive).
  - `listVisionModels` mesmo filtro de listModels.
  - Marcar entries OpenRouter `:free` com `tier: "free"`.
  - Sem remoção de modelos do array MODELS.
- D.2: `src/lib/agent/llm/effective-catalog.ts`:
  - `loadEffectiveModelsByProvider(provider, opts?: {includeLegacy?: boolean})` — aplicar mesmo filtro.

## Bloco S (Sync)
- S.1: `src/lib/agent/llm/sync-whitelist.ts`:
  - Ampliar regexes conforme SPEC v3 §S1-S4.
- S.2: `src/lib/agent/llm/sync-catalog.ts`:
  - `fetchAnthropic(apiKey)` — GET `/v1/models` com `x-api-key` + `anthropic-version: 2023-06-01`. Retorna `{id, label, pricingInput:null, pricingOutput:null}`.
  - `fetchGemini(apiKey)` — GET `/v1beta/models?key=` com filtro `supportedGenerationMethods.includes("generateContent")`. Stripar `models/` prefix do `name`.
  - Switch em `syncProvider` cobrindo `anthropic` e `gemini`.
  - Filtro pré-2024: ignorar entries com `released` ausente OU `released >= "2024-01"` (sem `released` aceito porque API sem data).
  - `deriveTier`: adicionar caso `free` quando id endsWith `:free`.
- S.3: Acentuação em `llm-config-form.tsx` (toast).

## Bloco U (UI Config)
- U.1: `src/components/agent/llm-config-form.tsx`:
  - Substituir SyncModelsButton: pílula violet ghost com texto "Atualizar modelos".
  - Trocar `fromCatalog.push({...Outro})` por `pinnedFirst: [{...Outro}]` no SearchableSelect.
  - Para provider === "openrouter": montar `startAdornment` com `<ProviderBadge />` derivado do prefix do id.
  - Aplicar `isLegacyModel` no label.
  - Toast com acentos.
- U.2: `src/app/(protected)/agente/configuracao/page.tsx`:
  - `<CardHeader className="pt-5 pb-5">` no card de Recursos (era `pt-6 pb-3`).

## Bloco C (Cleanup)
- C.1: `scripts/cleanup-llm-model-entry.ts` (NOVO):
  - Carrega todas LlmModelEntry.
  - Coleta refs: `LlmConfig.model`, `AgentSettings.audioModel`, `AgentSettings.imageModel`, `PlaygroundSession.model`.
  - Para cada entry: classifica `keep` (passa whitelist + released >= 2024 + pricing OK ou em uso) / `deprecate` (inválida mas em uso, marca deprecatedAt) / `delete` (inválida e sem uso, hard delete).
  - Flag `--dry-run` (default) imprime tabela; `--apply` executa.
- C.2: `package.json`: `"cleanup:llm-models": "tsx scripts/cleanup-llm-model-entry.ts"`.

## Bloco V&V (Validação)
- VV.1: `pnpm tsc --noEmit`
- VV.2: `pnpm lint`
- VV.3: `pnpm jest`
- VV.4: `pnpm audit:tools`
- VV.5: `pnpm cleanup:llm-models` (dry-run)
- VV.6: `pnpm cleanup:llm-models -- --apply` (no banco dev)
- VV.7: `pnpm gen:mcp-catalog`
- VV.8: `pnpm build`

## Bloco I (Commit + Push + HISTORY)
- I.1: commits atômicos por bloco.
- I.2: push branch.
- I.3: HISTORY append.
- I.4: remove active.

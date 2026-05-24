# Review Crítica #1 — SPEC v1 Agente Nex Config Polish

> Achados reais, não carimbo. Cada um gera mudança na SPEC v2.

## R1 — D2 remove `whisper-1` mas ele é usado em produção como audio model

Em `catalog.ts:130-132`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` e
`whisper-1` são modelos de transcrição usados em `audioModel` da
`AgentSettings`. Se eu remover `whisper-1` do base, qualquer configuração
existente quebra. **Não posso simplesmente remover.**

→ **Decisão v2**: NÃO remover gpt-4 / whisper-1 / mistral-7b:free do base.
Em vez disso, marcar como `released: "2023-..."` (já estão) e o **filtro
de exibição** em `listModels`/`listAudioModels`/`listVisionModels`/
`loadEffectiveModelsByProvider` opta entre incluir/não pré-2024 via flag
opcional `includeLegacy?: boolean` (default false). Audio models são uma
exceção: como o user usa whisper-1 ativamente, audio filtering vai
permitir whisper-1 pre-2024 explicitamente.

Aliás, melhor critério: filtrar pré-2024 **somente para conversação
(use !== "áudio")**. Áudio mantém todos.

## R2 — D1 quebra telas que mostram modelos legados

Mesmo raciocínio do R1. `loadEffectiveModelsByProvider` é chamado em
`configuracao/page.tsx:106-112`. Se filtrar agressivo, o user que tem
config antiga (`gpt-4`) vai ver "modelo não encontrado".

→ **Decisão v2**: filtrar a exibição mas garantir que `getModel(id)`
continua retornando os legados (não filtrar essa função). UI mostra "(legado)"
ao lado do label se `released < 2024-01`.

## R3 — `CostTier` adicionar "free" não-trivial

`types.ts:21` é exportado. Adicionar "free" pode ter side-effects em
`deriveTier()`, em `pricingPerMinute` checks, em tests. Listar consumidores:

- `tier-badge.tsx:7-10` (Record<CostTier>) — adicionar "free"
- `sync-catalog.ts:76-82` (deriveTier) — adicionar branch "free"
- prisma `tier: String` (sem enum) — banco aceita
- testes existentes do TierBadge — precisam de novo caso

→ **Decisão v2**: ampliação do tipo + atualização de cada consumidor.
Lista explícita no plan.

## R4 — Pricing-overrides separado é redundante

A spec v1 propôs `pricing-overrides.ts` como tabela paralela. Mas o
`catalog.ts` JÁ É a source of truth pra base versionada, e o sync atual
respeita base sobre banco (linha 142-144 do sync). Adicionar tabela
paralela é over-engineering.

→ **Decisão v2**: descartar pricing-overrides. Curadoria de pricing
continua sendo no `catalog.ts`. Sync apenas adiciona modelos NOVOS
ao banco (com pricing OFICIAL da API quando disponível,
OpenRouter expõe; OpenAI/Anthropic/Gemini não → entry vai com
pricing=null).

## R5 — fetchAnthropic precisa de header `anthropic-version`

A API Anthropic exige `anthropic-version: 2023-06-01` no header
(documentação pública). Sem ele, 400.

→ **Decisão v2**: detalhar no plan que fetchAnthropic envia
`x-api-key: <key>` + `anthropic-version: 2023-06-01`.

## R6 — fetchGemini retorna `name: "models/gemini-2.5-pro"` prefixado

Precisa stripar prefix `models/` antes do upsert (caso contrário ficaria
id inválido).

→ **Decisão v2**: stripar prefixo no fetchGemini.

## R7 — C1 cleanup deleta entries com FK em LlmConfig

`LlmConfig.model` é string (não FK), então não há constraint relacional.
**Mas** pode haver `LlmConfig` ativa usando id que vai ser deletado.

→ **Decisão v2**: cleanup verifica primeiro se o id está em uso
(`SELECT model FROM llm_config WHERE model IN (...)`); se estiver, MARCA
`deprecatedAt` em vez de deletar. Se não, deleta. Idem para
`AgentSettings.audioModel` / `imageModel` / `reasoning fields`.

## R8 — ProviderBadge: lookup explícito

Lista candidata para OpenRouter:
- `openai/*` → "OpenAI"
- `anthropic/*` → "Anthropic"
- `google/*` → "Google"
- `deepseek/*` → "DeepSeek"
- `meta-llama/*` → "Meta"
- `qwen/*` → "Qwen"
- `mistralai/*` → "Mistral"
- `cohere/*` → "Cohere"
- `x-ai/*` → "xAI"
- `microsoft/*` → "Microsoft"
- `perplexity/*` → "Perplexity"
- fallback: capitalize do prefixo

→ **Decisão v2**: lookup table explícito em `provider-badge.tsx`.

## R9 — "Outro (digitar manualmente)" e o filtro de busca

Se o user digitar "GPT" no search field, "Outro" deveria aparecer ou
desaparecer? UX-wise: "Outro" deveria **sempre aparecer** (é um escape
hatch, não um modelo). Mas o `filtered` do SearchableSelect filtra por
substring no `label` (linha relevante a confirmar).

→ **Decisão v2**: adicionar prop `pinnedFirst?: SearchableSelectOption[]`
ao SearchableSelect. Esses sempre aparecem no topo, IGNORANDO o filtro
de busca. "Outro" entra como pinned.

## R10 — Reasoning levels: nem todo modelo tem 4 níveis

DeepSeek R1 tem thinking nativo SEM `reasoning_effort` (é on/off). Claude
tem extended thinking via `thinking: { type: "enabled", budget_tokens: N }`.
Gemini 2.5 tem `thinking_config`. Diferente do OpenAI (`reasoning_effort`).

Modelar tudo como `low/medium/high` é forçar. Mas se a UI atual só sabe
mostrar esses 4, ampliar agora gera complexidade.

→ **Decisão v2**: para esta entrega, **não popular reasoningLevels
automaticamente para non-OpenAI**. O sync deteta suporte mas sinaliza
em campo separado `supportsReasoning: boolean` (já implícito no
`reasoningLevels.length > 0`). Para Anthropic/Gemini/DeepSeek que têm
thinking, marcar `reasoningLevels: ["medium"]` (1 nível = "ligado").
A UI mostra "Ligado" e não dropdown. Backlog: ampliar UI mais tarde.

Espera — mais simples: para entrega ATUAL, ignorar reasoning de outros
providers e manter só OpenAI. User pediu sync identificar suporte, mas
não exigiu UI nova. Deixar para próxima onda.

→ **Decisão final v2**: sync de reasoning fica APENAS para OpenAI nesta
onda (status quo). Documentar débito técnico de cobertura para
Anthropic/Gemini/DeepSeek.

## R11 — V1 botão visual

Texto sublinhado roxo é HOVER-state padrão de link. Botão sempre
sublinhado fica visualmente carregado.

→ **Decisão v2**: pílula violet ghost com ícone + "Atualizar modelos"
ao lado direito da Label "Modelo". Hover: bg-violet-500/10. Loading:
spinner inline.

## R12 — V6 espaçamento

`<CardHeader className="pt-6 pb-3">`. O bottom-of-content é `pb-5`. Para
simetria visual do título com o bottom: usar `pt-5 pb-5` no header.
Verificar se isso não cria gap excessivo entre header e primeiro
elemento de conteúdo — provavelmente fica equilibrado.

→ **Decisão v2**: trocar `pt-6 pb-3` → `pt-5 pb-5` no header de Recursos.

## R13 — Cleanup script opt-in

Script deve ser invocável manualmente (`pnpm cleanup:llm-models`) e
**não rodar em build/migration**. Idempotente.

→ **Decisão v2**: confirma estrutura como command-line script com
log claro do que vai fazer + flag `--dry-run`.

## R14 — `syncProviderModels` action: onde pega API key?

Action precisa receber `provider` e usar a chave de API cadastrada
em `credentials`. Verificar `src/lib/actions/sync-models.ts`.

→ **Decisão v2**: Plan inclui task de leitura desse arquivo antes da
implementação para entender o fluxo.

## R15 — Campo `use` (modelo tipo) já existe

Sem mudança.

## R16 — Outros consumidores de `listModels`

`listAudioModels`, `listVisionModels` em catalog.ts:334-340. Idem
`getActiveConfig` em get-active-config.ts.

→ **Decisão v2**: filtros aplicados centralmente em `listModels` /
`loadEffectiveModelsByProvider`. As variantes audio/vision herdam
naturalmente.

## R17 — Acentuação

V1 não menciona acentos pt-BR nos textos novos. Vou garantir desde
o início.

## R18 — Toast feedback do refresh

Atual: 1 toast com listas. Para uma sync grande (50 modelos novos),
isso pode ficar gigante.

→ **Decisão v2**: toast resumido + cliçável "ver detalhes" abrindo
modal? Não. Manter simples: toast com counts.

## Resumo das mudanças para v2

| # | Mudança |
|---|---|
| R1 | Pré-2024 filtrado só para `use !== "áudio"`; whisper-1 ok |
| R2 | `getModel` sempre retorna; UI mostra "(legado)" se pré-2024 |
| R3 | Lista explícita de consumidores de `CostTier` |
| R4 | Descartar pricing-overrides separado |
| R5 | fetchAnthropic com `anthropic-version` |
| R6 | fetchGemini stripa prefix `models/` |
| R7 | Cleanup: deprecated_at em vez de delete quando id em uso |
| R8 | ProviderBadge lookup explícito |
| R9 | "Outro" via prop `pinnedFirst` no SearchableSelect, ignora filtro |
| R10 | Reasoning sync mantém só OpenAI nesta onda |
| R11 | Botão refresh = pílula violet ghost, hover sublinha |
| R12 | Recursos: pt-5 pb-5 simétrico |
| R13 | Cleanup script opt-in + dry-run |
| R14 | Plan inclui leitura de sync-models.ts antes da implementação |
| R16 | Filtros centralizados |
| R17 | Acentos pt-BR garantidos em todo texto novo |
| R18 | Toast atual mantido |

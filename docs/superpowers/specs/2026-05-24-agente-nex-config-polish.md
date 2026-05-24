# SPEC v1 — Agente Nex configuração: polish completo

## 1. Contexto

O usuário identificou 12 pontos de melhoria na tela `/agente/configuracao`,
todos demonstrados em prints. Investigação real foi feita nos arquivos
relevantes; achados materiais documentados em §3.

## 2. Achados de código (referências concretas)

### 2.1. Alinhamento Provedor x Modelo
- `llm-config-form.tsx:438-442`: o `<Label>Modelo</Label>` está dentro de
  um `<div flex items-center justify-between>` junto com `<SyncModelsButton>`.
  Visualmente o row da Label fica mais alto que o do Provedor, MAS o trigger
  do select abaixo tem `min-h-[44px]` igual ao do Provedor — então a base
  da caixa alinha. O que destoa é o **botão refresh** sendo um ícone
  discreto no canto, parecendo um afterthought.
- Print confirma: caixas alinhadas verticalmente, refresh quase invisível.

### 2.2. Botão refresh
- `llm-config-form.tsx:58-104`: SyncModelsButton renderiza só ícone
  RefreshCw 14x14 (h-7 w-7 button). Tooltip e aria-label OK, mas
  visualmente é frio e perdido no canto.

### 2.3. Sync por provider
- `sync-catalog.ts:38-50`: fetchOpenAI funciona (lista GET /v1/models, sem
  pricing).
- `sync-catalog.ts:52-74`: fetchOpenRouter funciona (com pricing).
- `sync-catalog.ts:102-104`: Anthropic e Gemini retornam "ainda não
  implementada". **GAP REAL.**

### 2.4. Filtros do sync
- `sync-catalog.ts:121-138`: aplica whitelist + exige pricing
  (exceto se já estiver na base). **Não filtra por data**.
- `sync-whitelist.ts:17-19`: regex OpenAI aceita `gpt-5*` e `gpt-4o*`
  apenas — **rejeita `gpt-4.1`, `o1`, `o3`, `o4`** que estão no base.
  Quando sincronizou, esses modelos não passaram pela whitelist no upsert
  mas continuaram no banco (LlmModelEntry) por algum sync antigo. Vão
  aparecer no dropdown porque `effective-catalog.ts:66-78` agrega base +
  banco sem refiltrar.

### 2.5. Modelos órfãos no banco
- Print 5 (lista quebrada): `o4-mini`, `gpt-4.1-2025-04-14`,
  `gpt-4.1-mini-2025-04-14`, `gpt-4.1-nano-2025-04-14`, `gpt-image-1`,
  `gpt-4.1-nano` — todos com "preço sob consulta" e fora da whitelist
  atual. Vieram de sync antigo (antes do whitelist).

### 2.6. "Outro (digitar manualmente)"
- `llm-config-form.tsx:190-196`: `fromCatalog.push(...)` no FIM da lista.
  O usuário pediu no TOPO.

### 2.7. Tier-badge
- `tier-badge.tsx:7-34`: 4 tiers (low/medium/high/premium →
  $/$$/$$$/$$$$ azul/amber/orange/red). **Falta tier "free" verde.**
- `types.ts:21`: `CostTier = "low"|"medium"|"high"|"premium"`. Precisa
  expandir.

### 2.8. Tag de provedor para OpenRouter
- Não existe. OpenRouter agrega vários provedores no mesmo id
  (`openai/gpt-...`, `anthropic/claude-...`, `deepseek/...`, etc.).
- `searchable-select.tsx:14-19`: SearchableSelectOption tem apenas
  `endAdornment` (sem `startAdornment`).

### 2.9. Modelos pré-2024 no catálogo base
- `catalog.ts:128`: `gpt-4` released 2023-03.
- `catalog.ts:132`: `whisper-1` released 2022-09.
- `catalog.ts:173`: `mistralai/mistral-7b-instruct:free` released 2023-09.
- 3 outliers, resto é 2024+.

### 2.10. Reasoning Card
- `reasoning-card.tsx:79`: usa `reasoningLevelsOf(activeModelId)`. Já
  adapta por modelo. ✅
- `catalog.ts:251-275`: REASONING_LEVELS hardcoded só pra OpenAI.
  Modelos de outros providers (claude-sonnet-4-7 com thinking, gemini-2.5
  com thinking, deepseek-r1) não estão marcados como suporting reasoning,
  mesmo sendo reasoning-capable.

### 2.11. Espaçamento "Recursos"
- `configuracao/page.tsx:148-150`: `<CardHeader className="pt-6 pb-3">`.
  O `pt-6 pb-3` faz com que o título "Recursos" fique colado no topo do
  card e fartamente espaçado do conteúdo abaixo. O bottom do card
  (`<CardContent className="pb-5">`) é mais generoso (pb-5).
- Pedido: simetria entre o topo e o bottom.

### 2.12. Nível de esforço (Reasoning Card)
- `reasoning-card.tsx:115-124`: CustomSelect com `notes` já mostra
  "Consumo leve/moderado/alto/intenso". O custo por nível é o mesmo
  (tarifa fixa por token de output) — `reasoning-card.tsx:144-149` já
  documenta isso. **Não há valor por nível** (não cabe a UI sugerida do
  user). Manter atual + atualizar custo.

## 3. Escopo

### 3.1. Mudanças visuais

| # | Mudança | Local |
|---|---|---|
| V1 | Botão "Atualizar modelos" texto+ícone, sublinhado roxo, ao lado da Label "Modelo" | llm-config-form.tsx:438-442 |
| V2 | "Outro (digitar manualmente)" como PRIMEIRO item da lista, sempre fixo | llm-config-form.tsx:183-198 |
| V3 | Tier "FREE" (verde) no TierBadge | tier-badge.tsx |
| V4 | ProviderBadge neutro à esquerda da TierBadge para OpenRouter | NOVO + llm-config-form.tsx |
| V5 | SearchableSelectOption.startAdornment opcional | searchable-select.tsx |
| V6 | Espaçamento Recursos: simétrico topo/bottom | configuracao/page.tsx:148-150 |

### 3.2. Mudanças de catálogo (dados)

| # | Mudança | Local |
|---|---|---|
| D1 | Filtro `released >= 2024-01` em listModels / loadEffective | catalog.ts + effective-catalog.ts |
| D2 | Remover pré-2024 do base: gpt-4, whisper-1, mistralai-7b:free | catalog.ts |
| D3 | Marcar modelos `:free` (OpenRouter) com tier="free" | catalog.ts (entries) |
| D4 | Adicionar modelos novos OpenRouter (DeepSeek V4, Llama 4, etc.) e Anthropic 4.7 já existentes; ampliar Gemini com versões mais recentes | catalog.ts |
| D5 | Marcar modelos de raciocínio non-OpenAI: claude-opus/sonnet-4* (com thinking), gemini-2.5-pro (com thinking), deepseek-r1*, qwen-qwq | catalog.ts REASONING_LEVELS |

### 3.3. Mudanças de sync (backend)

| # | Mudança | Local |
|---|---|---|
| S1 | Ampliar whitelist OpenAI: gpt-4.1*, o1, o3, o4, gpt-image | sync-whitelist.ts |
| S2 | Ampliar whitelist Anthropic: claude-opus/sonnet-4-{5,6,7}, claude-3-5/3-7 | sync-whitelist.ts |
| S3 | Ampliar whitelist Gemini: gemini-{1.5,2.0,2.5}-(pro/flash/flash-lite/flash-8b)+thinking | sync-whitelist.ts |
| S4 | fetchAnthropic (GET /v1/models com X-Api-Key + anthropic-version) | sync-catalog.ts |
| S5 | fetchGemini (GET https://generativelanguage.googleapis.com/v1beta/models?key=) | sync-catalog.ts |
| S6 | Filtro `released >= 2024-01` no sync | sync-catalog.ts |
| S7 | Identificar suporte a raciocínio durante sync (heurística por id) e popular reasoningLevels do LlmModelEntry | sync-catalog.ts |
| S8 | Tier derivado: "free" quando id endsWith ":free" ou pricing=null+notes=free | sync-catalog.ts (deriveTier) |
| S9 | Pricing OFICIAL por provider — para OpenAI/Anthropic/Gemini que não têm pricing na API: tabela hardcoded local em `pricing-overrides.ts` com fonte oficial | NOVO |

### 3.4. Limpeza de banco (one-shot)

| # | Mudança | Local |
|---|---|---|
| C1 | Script remove LlmModelEntry que não passem na whitelist atual OU released < 2024 OU pricing nulo+source=sync | NOVO scripts/cleanup-llm-model-entry.ts |
| C2 | Rodar script no banco de dev como parte da entrega | run |

## 4. Critérios de aceite

1. UI: botão "Atualizar modelos" texto+ícone violet underline; "Outro" no
   topo; OpenRouter mostra provider badge à esquerda do tier; modelos
   `:free` mostram tier verde "FREE"; Recursos com espaçamento simétrico.
2. Sync: roda OK para os 4 providers; filtra pré-2024; preenche
   reasoningLevels; atualiza pricing oficial.
3. Limpeza: banco fica sem órfãs após cleanup. Dropdown só mostra
   modelos 2024+ válidos.
4. Validation: tsc + eslint + jest + audit:tools + build verdes.
5. UX: provider drop OpenAI mostra ~14 modelos (não 30+ com órfãs).

## 5. Não-objetivos (fora desta entrega)

- Implementar pricing dinâmico via scraping (manter pricing-overrides).
- Mudar visual do CustomSelect (provider/credencial) — já está OK.
- Reescrever ReasoningCard (já adapta por modelo; pedido do user diz
  para manter).
- Webhook para invalidar cache de catálogo (não pediu).

## 6. Próximo passo

SPEC v2 após review crítica adversarial real (não fake).

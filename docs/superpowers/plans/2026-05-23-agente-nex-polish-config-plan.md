# PLAN v1 — Agente Nex polish (cobre SPEC v3)

Data: 2026-05-23
Branch: `feat/f4-leitura-expansao`
SPEC: `specs/2026-05-23-agente-nex-polish-config-v3.md`

> Tasks bite-sized, cada uma com 1 unidade de trabalho, 1 verificação,
> 1 resultado esperado. Vai passar por duas reviews antes de executar.

---

## Pré-condição global

- Cliente Prisma regenerado (`pnpm prisma generate`).
- `pnpm dev` precisa ser reiniciado após pull (deixar no README).
- Executor: Opus 4.7 obrigatório.

---

## Onda A — Banco + extensões

### A1. Migration `whatsapp_enabled`
- Arquivo: `prisma/migrations/20260523090000_agent_whatsapp_enabled/migration.sql`
- Conteúdo:
  ```sql
  ALTER TABLE "agent_settings"
    ADD COLUMN "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true;
  ```
- Editar `prisma/schema.prisma`: adicionar `whatsappEnabled Boolean @default(true) @map("whatsapp_enabled")` em `AgentSettings`.
- Rodar `pnpm prisma generate`.
- Verificação: `pnpm prisma migrate status` mostra a migration aplicada.

### A2. Migration `search_unaccent_trgm`
- Arquivo: `prisma/migrations/20260523090100_search_unaccent_trgm/migration.sql`
- Conteúdo:
  ```sql
  CREATE EXTENSION IF NOT EXISTS unaccent;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS fato_estoque_saldo_unaccent_nome_idx
    ON fato_estoque_saldo (lower(unaccent(produto_nome)));
  CREATE INDEX IF NOT EXISTS raw_product_template_unaccent_name_idx
    ON raw_product_template (lower(unaccent(name)));
  ```
- (Confirmar nomes das colunas reais no schema antes; ajustar.)
- Verificação: `psql -c "SELECT 1 FROM pg_indexes WHERE indexname='fato_estoque_saldo_unaccent_nome_idx'"`.

### A3. Migration `llm_model_entry_deprecated`
- Arquivo: `prisma/migrations/20260523090200_llm_model_entry_deprecated/migration.sql`
- Conteúdo:
  ```sql
  ALTER TABLE "LlmModelEntry"
    ADD COLUMN "deprecated_at" TIMESTAMP(3) NULL;
  ```
- Editar schema: `deprecatedAt DateTime? @map("deprecated_at")` em `LlmModelEntry`.
- Verificação: tipo gerado em `src/generated/prisma/models/LlmModelEntry.ts` tem `deprecatedAt`.

### A4. Migration `agent_chat_message_source` (condicional)
- Verificar se `agent_chat_message` (ou nome equivalente) existe em
  `schema.prisma`. Se sim:
  ```sql
  ALTER TABLE "<tabela>" ADD COLUMN "source" TEXT NULL;
  ```
- Se não existir, marcar a task como skipped no PLAN-EXEC log.

---

## Onda B — Backend: tipos e actions

### B1. Tipos `AgentSettingsData` ganham `whatsappEnabled`
- Arquivo: `src/lib/actions/agent-config-types.ts`
- Adicionar campo `whatsappEnabled: boolean` no tipo.

### B2. `getAgentSettings()` retorna `whatsappEnabled`
- Arquivo: `src/lib/actions/agent-config.ts`
- Acrescentar `whatsappEnabled` em select e mapeamento.

### B3. Action `updateAgentAvailability`
- Arquivo: `src/lib/actions/agent-availability.ts` (novo)
- Assinatura:
  ```ts
  updateAgentAvailability(input: { bubbleEnabled: boolean; whatsappEnabled: boolean })
    : Promise<{ success: true } | { success: false; error: string }>
  ```
- Faz `upsert` no `agent_settings.id='global'` com ambos os campos.
- Revalida path `/agente/configuracao`.
- Adicionar teste em `agent-availability.test.ts`.

### B4. `compose.ts` — diretrizes novas
- Arquivo: `src/lib/agent/prompt/compose.ts`
- Adicionar bloco `## Comportamento` (texto da SPEC v3 §3.2) ao prompt
  base. Param `source?: 'suggestion' | 'bubble' | 'whatsapp' | 'playground'`
  na função composer. Quando `source==='suggestion'`, injetar linha
  extra:
  > O usuário clicou em uma sugestão de pergunta. Responda direto, sem nova clarificação.
- Renomear "sugestões clicáveis" → "sugestões de pergunta" nas strings.
- Atualizar `compose.test.ts`: asserções de presença das diretrizes e do
  source.

### B5. SSE route aceita `meta.source`
- Arquivos: `src/app/api/agent/stream/route.ts` e
  `src/app/api/agent/playground/stream/route.ts`.
- Body schema ganha `meta: { source: enum }.optional()`.
- Repassa `source` para `runAgent({ ..., source })`.

### B6. `run-agent.ts` propaga `source`
- Param novo `source?: SuggestionSource`.
- Passa para `compose()`.
- Atualizar `run-agent.test.ts`.

### B7. Tool labels
- Arquivo: `src/lib/agent/progress-labels.ts` (já existe) — verificar e
  completar mapa para tools faltantes.
- Coverage: garantir todas as tools de `mcp/tools/**/index.ts` tenham
  rótulo humano. Test em `progress-labels.test.ts`.

### B8. Busca acento-insensível em estoque
- Arquivo: `src/lib/reports/queries/estoque.ts`
- Substituir o `findMany` puro pelo padrão híbrido:
  1. Quando `termo` vier: usar `$queryRaw` com `unaccent` para puxar
     `produtoId` matched + fallback `pg_trgm` se < 4.
  2. Depois carregar os fatos com `findMany` filtrando por `produtoId IN`.
- Teste em `estoque.test.ts` com fixture cobrindo "mola espiral em aço",
  "aco", "açoo".

### B9. Demais tools com busca por nome
- Auditar `mcp/tools/**/*.ts` por uso de `contains` em nome/descrição.
- Aplicar mesma estratégia em qualquer match user-facing.
- Lista candidata: `cadastros/buscar-parceiro.ts`,
  `cadastros/servico-buscar.ts`, `comercial/preco-produto.ts`,
  `comercial/preco-tabela.ts`, `fiscal/produtos-faturados.ts`.

### B10. Sync de catálogo + whitelist
- Arquivo novo: `src/lib/agent/llm/sync-whitelist.ts` (conforme SPEC §3.13).
- Editar `src/lib/agent/llm/sync-catalog.ts`:
  - Aplicar whitelist + pricing + validFrom **antes** de upsert.
  - Emitir contadores (`synced`, `ignoredNoPricing`, `ignoredAge`,
    `ignoredWhitelist`).
  - Marcar `deprecated_at = now()` em entradas existentes do banco que
    não vieram no sync.
- Teste `sync-catalog.test.ts` cobrindo cada filtro.

### B11. Endpoint de sync devolve sumário
- Arquivo: action `syncLlmCatalog` em `src/lib/actions/llm-catalog.ts`
  (verificar nome real).
- Retorno `{ success, summary }` com contagens.

### B12. Effective catalog respeita deprecated
- `src/lib/agent/llm/effective-catalog.ts`:
  - Modelo com `deprecatedAt != null` aparece como entry com flag
    `deprecated: true` em vez de sumir.
- Teste em `effective-catalog.test.ts`.

---

## Onda C — UI: componentes base

### C1. `popover-trigger-width` em `CustomSelect`
- Arquivo: `src/components/ui/custom-select.tsx`
- Setar `Popover.Content` (ou container) com
  `style={{ minWidth: 'var(--radix-popover-trigger-width)' }}` ou
  measurement-based fallback.
- Teste interaction em `custom-select.test.tsx`: trigger width === popover width.

### C2. `popover-trigger-width` em `SearchableSelect`
- Mesmo de C1 em `searchable-select.tsx`.

### C3. `ResourceCard` extraído + collapsible
- Arquivo novo: `src/components/agent/resource-card.tsx`
- Copiar do `resources-toggles.tsx` (linhas 484-522) com adições:
  - props: `id: string`, `collapsible?: boolean`, `defaultCollapsed?: boolean`
  - chevron `▾/▸` que é `button aria-expanded aria-controls`
  - estado: `useState(defaultCollapsed)`; `useEffect` lê localStorage.
- Teste: `resource-card.test.tsx`.

### C4. `ResourceCard` shared usado em `ReasoningCard`
- `reasoning-card.tsx` consome `ResourceCard` em vez do wrapper próprio.

### C5. `ToolCallChip` (renomear / endurecer ProgressTrail)
- Hoje o `ProgressTrail` agrupa todos os passos numa lista. O problema
  reportado é mais sobre **timing**: o `progressMsgId` permanece, mas o
  flicker vem de:
  - `tool_result` chega com label que não bate com `tool_call`, então
    fica running pra sempre **OU** o `dropLoading` remove a mensagem.
- Mudanças concretas:
  - SSE: passar `tool_call_id` (id correlacional) nos eventos `tool_call`
    e `tool_result` quando o provider expuser.
  - `chat-panel.tsx`: matching por `id` (não FIFO label) quando id
    disponível; fallback FIFO.
  - Garantir que `progressMsgId` **nunca** caia em `dropLoading`.
  - Adicionar `aria-live=polite` no container.
  - Mantém `done` permanente; nada de remoção.
- Teste: `progress-trail.test.tsx` cobrindo:
  - matching por id
  - matching FIFO fallback
  - sem desmount durante done

### C6. Animação aprimorada no `ProgressTrail`
- Adicionar `animate-pulse` no texto enquanto running (com
  `motion-reduce:animate-none`).
- Done permanece estático.

---

## Onda D — UI: configuração e telas

### D1. `ResourcesToggles` — usar `ResourceCard` shared
- Substituir `ResourceCard` interno pelo importado.

### D2. Renomear "Sugestões clicáveis" → "Sugestão de pergunta"
- Arquivo: `resources-toggles.tsx`
- Atualizar `title`, `subtitle`, `ariaLabel`.
- Atualizar testes.

### D3. Reposicionar "Máximo por resposta"
- Mover o bloco para layout em coluna: label + pill-group **abaixo** do
  título, alinhamento à esquerda.

### D4. Reasoning — consumo qualitativo + texto
- Em `reasoning-card.tsx`:
  - Trocar bloco `Custo de saída` por:
    - linha 1: tarifa fixa em destaque (igual hoje).
    - linha 2: "Consumo deste nível: <Leve/Moderado/Alto/Intenso>" com
      tooltip explicando.
  - Texto incompatível: "Para usar raciocínio, escolha um modelo
    compatível na seção de conexão."
- Tests: `reasoning-card.test.tsx`.

### D5. `AgentAvailabilityCard`
- Arquivo novo: `src/components/agent/agent-availability-card.tsx`
- Card no topo da `configuracao/page.tsx` com dois `Switch`
  (bubble/whatsapp), sumário textual.
- Substitui o toggle "Agente Nex ativo" anterior.
- Quando ambos `false`, no `(protected)/layout.tsx` a `<AgentBubble />`
  não monta.
- Teste: `agent-availability-card.test.tsx`.

### D6. `LlmConfigForm` — botão Atualizar + layout
- Reposicionar botão "Atualizar" como botão pequeno fixado à direita do
  label "Modelo" (linha do header), com `Loader2` + texto "Atualizando…"
  durante sync.
- Toast final com sumário (B11).
- Alinhar provedor e modelo na mesma baseline.
- Banner amarelo quando modelo deprecated.

### D7. Larguras de tela
- Atualizar cada `(protected)/agente/<rota>/page.tsx` (ou layout local)
  com:
  - `configuracao`: `max-w-3xl mx-auto px-6 lg:px-8`
  - `chaves`: `max-w-4xl mx-auto px-6 lg:px-8`
  - `prompt`: `max-w-4xl mx-auto px-6 lg:px-8`
  - `consumo`: `max-w-4xl mx-auto px-6 lg:px-8`
  - `playground`: `max-w-4xl mx-auto px-6 lg:px-8`
  - `plugar-mcps`: `max-w-5xl mx-auto px-6 lg:px-8`
- Plug MCPs: `grid lg:grid-cols-[1fr,320px] gap-6`.

### D8. Margem superior do header "Recursos"
- Em `configuracao/page.tsx` (ou no card que envolve `ResourcesToggles`):
  - Adicionar `pt-6` (ou equivalente) no card para alinhar com card de
    cima.

### D9. ProgressTrail wiring (correção de flicker)
- `chat-panel.tsx`: matching por id, anti-drop, animação.

### D10. Suggestion source no fetch
- `chat-panel.tsx`: quando usuário envia mensagem clicando numa
  sugestão, body POST inclui `meta: { source: 'suggestion' }`. Caso
  contrário, `meta: { source: 'bubble' }` (ou playground onde for o
  caso).

---

## Onda E — Testes E2E

### E1. Teste de busca acento-insensível (mock prisma)
- Garante 4 resultados para "mola espiral em aço" / "aco" / "açoo".

### E2. Teste sugestão clicada não pede clarificação
- Mock LLM que recebe prompt com `source=suggestion`, asserta que a
  diretriz foi injetada.

### E3. Teste disponibilidade — 4 estados
- Para cada combinação de bubble/whatsapp, asserta o sumário textual e
  o estado da bubble in-app.

### E4. Teste sync catálogo — filtros + dedup + deprecated
- Catálogo upstream com 10 entradas, whitelist filtra para 4, 2 sem
  pricing, 1 deprecated do anterior.

---

## Onda F — Verificação final

### F1. tsc + eslint + test + build
- `pnpm tsc --noEmit`
- `pnpm eslint .`
- `pnpm test`
- `pnpm build`

### F2. Smoke manual no `next dev`
- Roteiro:
  1. Reiniciar dev.
  2. Trocar nível de raciocínio: sem erro.
  3. Trocar máx sugestões: sem erro.
  4. Toggle bubble off → bubble desaparece.
  5. Toggle whatsapp on/off persiste.
  6. Buscar "mola espiral em aço": agente devolve resultados (ver fatos).
  7. Clicar sugestão "Mostre lançamentos financeiros recentes": resposta
     direta sem clarificação.
  8. Verificar ProgressTrail: chip aparece, persiste enquanto inflight,
     congela em done.
  9. Dropdown de modelo abre com largura ≥ trigger.
  10. Plug MCPs: layout balanceado.
- Documentar saída em `docs/superpowers/runs/2026-05-23-polish-smoke.md`.

### F3. `gsd-code-review` e `gsd-ui-review`
- Executar nos arquivos tocados.
- Aplicar achados críticos.

### F4. Commits + push
- Granularidade por onda. Mensagens em pt-br sem travessão.

---

## Dependências entre ondas

```
A (banco) ─┬─► B (backend) ─┬─► E (testes E2E)
            └─► C (UI base) ─┴─► D (UI agente) ─► F (verificação)
```

A e C podem rodar em paralelo. D depende de C. E depende de B e D.

---

## Próximo passo

→ Review #1 do PLAN. Saída: PLAN v2.

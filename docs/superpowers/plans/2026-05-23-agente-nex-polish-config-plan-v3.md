# PLAN v3 — Agente Nex polish (executável)

Pós review #2. Granularidade máxima — uma unidade por task.

> **Convenção:** cada task descreve **um arquivo (ou grupo coeso)**, a
> mudança, a verificação. Sem placeholders.

---

## Onda A — Banco

### A0. Mapear nomes reais de tabelas/colunas
- Ler `prisma/schema.prisma`.
- Listar nome de tabela e coluna para: `fato_estoque_saldo` (coluna
  produto nome), `raw_product_template` (se existir), `LlmModelEntry`,
  `AgentSettings`.
- Anotar em comentário no PLAN-EXEC log.

### A1. Migration `agent_whatsapp_enabled`
- Criar diretório `prisma/migrations/20260523HHMMSS_agent_whatsapp_enabled/`
- Conteúdo `migration.sql`:
  ```sql
  ALTER TABLE "agent_settings"
    ADD COLUMN "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true;
  ```
- Editar `prisma/schema.prisma`: campo `whatsappEnabled Boolean @default(true) @map("whatsapp_enabled")` em `AgentSettings`.
- Rodar `pnpm prisma migrate dev --name agent_whatsapp_enabled` (ou criar manual + `migrate status`).
- Verificação: `pnpm prisma migrate status` mostra a migration.

### A2. Migration `search_unaccent_trgm`
- `prisma/migrations/20260523HHMMSS_search_unaccent_trgm/migration.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS unaccent;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS fato_estoque_saldo_unaccent_produto_nome_idx
    ON "fato_estoque_saldo" (lower(unaccent("produto_nome")));
  -- segundo índice condicional — só se A0 confirmar a tabela:
  -- CREATE INDEX IF NOT EXISTS raw_product_template_unaccent_name_idx
  --   ON "raw_product_template" (lower(unaccent("name")));
  ```
- Verificação: `psql ... -c "\di fato_estoque_saldo_unaccent*"`.

### A3. Migration `llm_model_entry_deprecated`
- `prisma/migrations/20260523HHMMSS_llm_model_entry_deprecated/migration.sql`:
  ```sql
  ALTER TABLE "llm_model_entry"
    ADD COLUMN "deprecated_at" TIMESTAMP(3) NULL;
  ```
  (Confirmar nome real em A0.)
- Schema: `deprecatedAt DateTime? @map("deprecated_at")` em `LlmModelEntry`.

### A4. `pnpm prisma generate`
- Verificação: `grep -c "deprecatedAt\|whatsappEnabled" src/generated/prisma/models/*.ts` ≥ 2.

### A_commit. Commit "feat(agente): migrations whatsapp + busca acento + modelo deprecated"

---

## Onda B — Backend

### B1. `AgentSettingsData.whatsappEnabled`
- Arquivo: `src/lib/actions/agent-config-types.ts`
- Adicionar `whatsappEnabled: boolean`.
- Verificação: `tsc --noEmit` em isolado.

### B2. `getAgentSettings` carrega `whatsappEnabled`
- Arquivo: `src/lib/actions/agent-config.ts`
- Acrescentar campo em select e mapping.
- Verificação: jest do agent-config passa.

### B3. `updateAgentAvailability` action
- Arquivo novo: `src/lib/actions/agent-availability.ts`
- Função `updateAgentAvailability(input)` faz upsert; revalida path.
- Verificação: novo teste `agent-availability.test.ts`.

### B4a. `compose.ts` — bloco "## Comportamento"
- Arquivo: `src/lib/agent/prompt/compose.ts`
- Adicionar bloco com as 4 diretrizes (defaults, limite de perguntas,
  sugestões objetivas, cobertura).
- Teste: `compose.test.ts` asserta presença de cada diretriz.

### B4b. `compose.ts` — param `source` + diretriz suggestion
- Adicionar param `source?: 'bubble'|'suggestion'|'whatsapp'|'playground'`.
- Quando `suggestion`, injetar instrução de "responda direto".
- Teste: asserta presença/ausência conforme source.

### B4c. `compose.ts` — renomear "sugestões clicáveis"
- Atualizar texto.
- Teste: asserta novo texto.

### B5a. SSE bubble aceita `meta.source`
- Arquivo: `src/app/api/agent/stream/route.ts`
- Body schema: `meta: z.object({ source: z.enum([...]).optional() }).optional()`.
- Propaga para `runAgent`.
- Teste: `stream/route.test.ts` adiciona caso suggestion.

### B5b. SSE playground aceita `meta.source`
- Arquivo: `src/app/api/agent/playground/stream/route.ts`
- Idem B5a.

### B6a. `runAgent` aceita `source`
- Arquivo: `src/lib/agent/run-agent.ts`
- Param `source?: SuggestionSource`.

### B6b. `runAgent` propaga para `compose`
- Passa o `source` ao composer.
- Teste: `run-agent.test.ts` mock.

### B7. Tool labels — completar `progress-labels.ts`
- Arquivo: `src/lib/agent/progress-labels.ts`
- Auditar `mcp/tools/**/index.ts` e garantir mapeamento para cada toolId.
- Teste: `progress-labels.test.ts` asserta cobertura via lista.

### B8a. Helper `searchProductIdsByName`
- Arquivo novo: `src/lib/reports/queries/_search-helpers.ts`
- Função `searchProductIdsByName(prisma, termo): Promise<number[]>` com
  `$queryRaw` usando `unaccent` + fallback `pg_trgm` se < 4.
- Teste: `_search-helpers.test.ts` (fixture com produtos contendo "aço").

### B8b. `querySaldoProduto` usa o helper
- Arquivo: `src/lib/reports/queries/estoque.ts`
- Quando `filtros.termo` vier, chama helper, filtra fatos por
  `produtoId IN ids` (e mantém demais filtros).
- Teste: `estoque.test.ts` cobre "mola espiral em aço".

### B9. Outras tools com busca (auditoria + sub-tasks)
- B9.audit: rodar `grep -rn "contains:" src/lib/reports/queries/ mcp/tools/` e gerar lista.
- B9.x: aplicar helper em cada arquivo identificado (uma task por arquivo).
- Verificação: testes existentes continuam passando + novo teste por arquivo cobrindo acento.

### B10a. `sync-whitelist.ts`
- Arquivo novo: `src/lib/agent/llm/sync-whitelist.ts`
- Constante `SYNC_WHITELIST` com entries (regex + validFrom).
- Função `isAllowed(provider, modelId, releaseDate)`.

### B10b. `sync-catalog.ts` aplica whitelist
- Filtrar entradas antes de upsert.
- Reportar contagens (`synced`, `ignoredNoPricing`, `ignoredAge`, `ignoredWhitelist`).

### B10c. Revive deprecated
- Quando modelId vem no sync, set `deprecated_at = NULL` no upsert.

### B10d. Mark deprecated
- Após processar sync, fazer `UPDATE LlmModelEntry SET deprecated_at = NOW() WHERE provider IN (...) AND deprecated_at IS NULL AND id NOT IN (synced ids)`.

### B10e. Testes sync
- `sync-catalog.test.ts`: cenários (whitelist filter, pricing filter,
  age filter, revive, mark deprecated).

### B11. Action `syncLlmCatalog` retorna sumário
- Arquivo: `src/lib/actions/llm-catalog.ts` (ou onde for) — verificar.
- Retorno `{ success: true, summary: { synced, ignoredNoPricing, ignoredAge, ignoredWhitelist, markedDeprecated } }`.

### B12. Effective catalog mostra deprecated
- Arquivo: `src/lib/agent/llm/effective-catalog.ts`
- Modelos com `deprecatedAt != null` ficam na lista com flag `deprecated: true`.
- Teste: `effective-catalog.test.ts`.

### B_commit. Commit "feat(agente): backend availability + source + busca acento + sync whitelist"

---

## Onda C — UI base

### C1. `popover-trigger-width` em `CustomSelect`
- Arquivo: `src/components/ui/custom-select.tsx`
- Verificar lib usada (provavelmente Radix). Aplicar
  `style={{ minWidth: 'var(--radix-popover-trigger-width)' }}` ao
  content; fallback measurement quando não-Radix.
- Teste interactivo (jsdom): `CustomSelect.test.tsx` mede largura via
  `style`.

### C2. idem `SearchableSelect`
- Arquivo: `src/components/ui/searchable-select.tsx`

### C3a. Extrair `ResourceCard` shared
- Arquivo novo: `src/components/agent/resource-card.tsx`
- Copia 1:1 do interno em `resources-toggles.tsx`.
- `resources-toggles.tsx` importa.

### C3b. Prop `collapsible` + chevron
- Em `resource-card.tsx`: prop `collapsible?: boolean`,
  `defaultCollapsed?: boolean`, `id: string`.
- Quando `collapsible`, renderiza chevron `button aria-expanded aria-controls`.

### C3c. localStorage SSR-safe
- `useState(defaultCollapsed)` inicial.
- `useEffect` lê `localStorage[ \`agent-config:resource-card:${id}\` ]`
  e sincroniza; outra `useEffect` grava no change.

### C3d. Testes `resource-card.test.tsx`
- Renderiza child.
- Toggle expand/collapse.
- localStorage persistente.

### C4. `ReasoningCard` consome `ResourceCard`
- Arquivo: `src/components/agent/reasoning-card.tsx`
- Refatorar para `<ResourceCard id="reasoning" collapsible ... />`.

### C5a. Backend SSE emite `toolCallId` no `tool_call`
- Arquivo: `src/lib/agent/run-agent.ts` (e providers em
  `src/lib/agent/llm/providers/*.ts`)
- Emite `{ type: 'tool_call', label, toolCallId }`.

### C5b. SSE emite `toolCallId` no `tool_result`

### C5c. `chat-panel.tsx` matching por id (fallback FIFO)
- Quando `evt.toolCallId` presente, match por id; senão FIFO atual.

### C5d. `chat-panel.tsx` — `dropLoading` não dropa `progressMsg`
- Atualizar `dropLoading` (ou consumers) garantindo que role `progress`
  nunca é removido.

### C5e. `progress-trail.tsx` — pulse no running
- Adicionar `animate-pulse motion-reduce:animate-none` no texto running.

### C5f. Teste `progress-trail.test.tsx` — intercalação
- Caso: tool_call A → tool_call B → tool_result A → tool_result B → done.
- Asserta ambos done, ordem preservada, nenhum some.

---

## Onda D — UI agente

### D1. `resources-toggles.tsx` usa `ResourceCard` shared
- Remover `ResourceCard` interno; importar do novo arquivo.

### D2. Renomear "Sugestões clicáveis" → "Sugestão de pergunta"
- Arquivo: `resources-toggles.tsx` (title, subtitle, ariaLabel).
- Atualizar testes.

### D3. Reposicionar "Máximo por resposta"
- Layout: linha completa abaixo do título; label esquerda + pill-group
  esquerda. `role="group"` + `aria-label`.

### D4a. `reasoning-card.tsx` — texto incompatível novo
- "Para usar raciocínio, escolha um modelo compatível na seção de
  conexão."

### D4b. `reasoning-card.tsx` — consumo qualitativo
- Substituir bloco custo por:
  - linha 1: tarifa fixa (mantém).
  - linha 2: "Consumo deste nível: \<rótulo\>" com tooltip.

### D4c. Testes `reasoning-card.test.tsx`
- Cenários: incompatível, cada nível, tooltip.

### D5a. `AgentAvailabilityCard` componente
- Arquivo novo: `src/components/agent/agent-availability-card.tsx`.
- Props: `initial: { bubbleEnabled; whatsappEnabled }`.

### D5b. Wire com `updateAgentAvailability`
- Dois `Switch` + persistência via action.

### D5c. Sumário textual computado
- Função `summarize(b, w)` retorna uma das 4 strings.

### D5d. `configuracao/page.tsx` substitui toggle antigo
- Remove o `BubbleEnabledToggle` antigo, monta `AgentAvailabilityCard`
  no topo.

### D5e. `(protected)/layout.tsx` checa `bubbleEnabled`
- Confirma e ajusta se necessário.

### D5f. Testes `agent-availability-card.test.tsx`
- 4 estados.

### D6a. `llm-config-form.tsx` — baseline provedor/modelo
- Ajustar para `flex items-end` / `grid` consistente.

### D6b. Botão "Atualizar" reposicionado
- Pequeno, à direita do label "Modelo".

### D6c. Estado loading + toast sumário
- Disabled + Loader2 + texto + toast final com `summary`.

### D6d. Banner deprecated
- Quando modelo selecionado tem `deprecated`, banner amarelo no card.

### D7a. `(protected)/agente/configuracao/page.tsx` — `max-w-3xl`
### D7b. `(protected)/agente/chaves/page.tsx` — `max-w-4xl`
### D7c. `(protected)/agente/prompt/page.tsx` — `max-w-4xl`
### D7d. `(protected)/agente/consumo/page.tsx` — `max-w-4xl`
### D7e. `(protected)/agente/playground/page.tsx` — `max-w-4xl`
### D7f. `(protected)/agente/plugar-mcps/page.tsx` — `max-w-5xl` + grid
### D7g. `(protected)/agente/page.tsx` — confirmar/ajustar

### D8. Margem superior do card "Recursos"
- `configuracao/page.tsx`: ajustar `pt-*` para alinhar com card de cima.

### D10a. `chat-panel.tsx` — meta.source no POST
- Default `'bubble'`. Quando vier de sugestão: `'suggestion'`.

### D10b. `playground-content.tsx` — meta.source
- Default `'playground'`. Sugestão: `'suggestion'`.

### D10c. `suggestions-bar.tsx` — sinaliza source
- Callback de clique inclui flag para o handler do parent.

---

## Onda E — Testes (suíte completa)

### E1. `_search-helpers.test.ts` + `estoque.test.ts` (acento)
### E2. `compose.test.ts` — suggestion source (já em B4)
### E3. `agent-availability-card.test.tsx` — 4 estados (já em D5f)
### E4. `sync-catalog.test.ts` — filtros + deprecated (em B10e)
### E5. `progress-trail.test.tsx` — intercalação (em C5f)

(E1–E5 são marcadores; tests reais ficam nas tasks correspondentes.)

---

## Onda F — Verificação

### F1. `pnpm tsc --noEmit`
### F2. `pnpm eslint .`
### F3. `pnpm test`
### F4. `pnpm build`
### F5. Smoke manual no `next dev`
- Roteiro completo (ver SPEC §5 critério 5).
- Documenta em `docs/superpowers/runs/2026-05-23-polish-smoke.md`.

### F6. `gsd-code-review` nos arquivos tocados
### F7. `gsd-ui-review` nas telas do agente
### F8. Commits por onda + push final
### F9. Resumo final ao usuário com:
- Lista do que mudou (por área).
- Instrução: "reiniciar `pnpm dev` para o Prisma client novo entrar".
- Pendências (se houver) com plano.

---

## Mapa de dependências

```
A0 → A1,A2,A3 → A4 → (B*, C*)
B (B1..B12) ↗
                   ↘
                    D (D1..D10) → E → F
C (C1..C5) ↗
```

## Próximo passo

→ Execução em ordem.

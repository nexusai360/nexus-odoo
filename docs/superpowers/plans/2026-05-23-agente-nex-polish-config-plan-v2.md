# PLAN v2 — Agente Nex polish (pós review #1)

Aplica P1–P20 do review-1. Mantém a estrutura de ondas.

> **Confirmações que o executor faz na hora**:
> - Nomes reais das colunas Prisma antes de cada migration.
> - Tabela de mensagens existe? Em caso negativo, **A4 vira skipped**.
> - Provider OpenAI já carrega `tool_call.id` no chunk? Plumbar.

---

## Onda A — Banco

### A1. `whatsapp_enabled` (inalterado)

### A2. `search_unaccent_trgm`
SQL revisado com nomes reais (verificar):
```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS fato_estoque_saldo_unaccent_produto_nome_idx
  ON "fato_estoque_saldo" (lower(unaccent("produto_nome")));
CREATE INDEX IF NOT EXISTS raw_product_template_unaccent_name_idx
  ON "raw_product_template" (lower(unaccent("name")));
```
(Confirmar `raw_product_template` existe; senão pular.)

Runbook (P9): "Em prod, rodar como superuser. Se a migration falhar
por permissão, executar manualmente `CREATE EXTENSION` e re-rodar."

### A3. `llm_model_entry_deprecated` (inalterado)

### A4. ~~`agent_chat_message_source`~~ SKIPPED (P2)

---

## Onda B — Backend

### B1. Tipos `AgentSettingsData.whatsappEnabled`

### B2. `getAgentSettings()` retorna `whatsappEnabled`

### B3. Action `updateAgentAvailability`

### B4. `compose.ts` — diretrizes + source

### B5. SSE route aceita `meta.source`

### B6. `run-agent.ts` propaga source

### B7. Tool labels — auditar mcp/tools/**/index.ts

### B8. Busca acento-insensível (refinamento P3)
- Helper novo: `src/lib/reports/queries/_search-helpers.ts`
  com `searchProductIdsByName(prisma, termo)`:
  - `$queryRaw` com `unaccent`.
  - Fallback `pg_trgm` se < 4.
  - Retorna `number[]` de ids.
- `querySaldoProduto`: quando `termo` vier, usa o helper, depois
  filtra `findMany` por `produtoId IN ids`.

### B9. Outras tools com busca por nome
Lista confirmada na execução.

### B10. Sync de catálogo + whitelist (refinamento P10)
- Ordem:
  1. Para cada modelId no novo sync: upsert com `deprecated_at = NULL`.
  2. Para cada entry **existente no banco** com provider sincronizado
     mas que não veio: set `deprecated_at = now()` se `null`.

### B11. Sync devolve sumário

### B12. Effective catalog respeita deprecated

---

## Onda C — UI base

### C1. `popover-trigger-width` em `CustomSelect`

### C2. idem `SearchableSelect`

### C3. `ResourceCard` shared + collapsible (com nota P15 sobre
deps do useEffect)

### C4. `ReasoningCard` consome `ResourceCard`

### C5. ProgressTrail / ToolCallChip robusto (refinamento P4, P7, P12)
- SSE backend emite `toolCallId` no evento `tool_call` e `tool_result`
  quando o provider expuser (`runAgent`).
- `chat-panel.tsx`:
  - matching por `toolCallId` quando presente.
  - FIFO label fallback.
  - `progressMsgId` **nunca** dropped em `dropLoading`.
  - `animate-pulse` no texto running.
- Teste novo (P7) cobrindo intercalação.

### C6. Animação aprimorada

---

## Onda D — UI agente

### D1. ResourcesToggles → ResourceCard shared
### D2. Renomear "Sugestões clicáveis" → "Sugestão de pergunta"
### D3. Reposicionar "Máximo por resposta"
### D4. Reasoning — consumo qualitativo + texto novo
### D5. AgentAvailabilityCard
- Sub-task P5: confirmar layout só monta bubble se `bubbleEnabled`.
- Sub-task P14: atualizar consumers do `AgentSettingsData`.
### D6. LlmConfigForm — botão Atualizar + alinhamento + deprecated banner
### D7. Larguras de tela (mais raiz `agente/page.tsx` — P6)
### D8. Margem superior "Recursos"
### D9. ProgressTrail wiring no chat-panel (P12)
### D10. Suggestion source no fetch (P13: aplicar também em playground)

---

## Onda E — Testes

### E1. Busca acento-insensível (fixture conforme P18)
### E2. Sugestão source → diretriz no prompt
### E3. Disponibilidade — 4 estados
### E4. Sync catálogo — filtros + deprecated revive (P10)
### E5. ProgressTrail intercalação (P7)

---

## Onda F — Verificação

### F1. tsc + eslint + test + build
### F2. Smoke no `next dev`
- Pré-condição: sync de produtos rodou (P8); se não, instruir usuário.
### F3. `gsd-code-review` + `gsd-ui-review`
### F4. Commit + push em série; mensagens pt-br sem travessão; (P20)
mantém branch atual.
### F5. Resumo final (P19) com instruções de restart.

---

## Próximo passo
Review #2 do PLAN. Saída: PLAN v3.

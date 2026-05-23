# SPEC v2 — Agente Nex: polish de configuração, catálogo, prompt e busca

Data: 2026-05-23
Branch: `feat/f4-leitura-expansao`
Status: pós-review #1

Delta vs v1: aplica A1–A16 de
`reviews/2026-05-23-agente-nex-polish-review-1.md`.

---

## 1. Resumo executivo

(Inalterado em essência. Mesmo objetivo da v1: polir configuração e
comportamento do Agente Nex em um único pacote coeso.)

## 2. Inventário de problemas

(Inalterado.)

## 3. Decisões de design por item

### 3.1 Prisma client (bloqueio)

Inalterado. `prisma generate` no fluxo de dev pós-pull.

### 3.2 Prompt do agente — objetividade

Adições da review:

5b. **Fonte de entrada `suggestion` (A4):** o endpoint SSE da bubble
recebe `meta.source` opcional. Quando vem `"suggestion"`, o composer de
prompt injeta uma directive `## Entrada` com texto: "O usuário clicou
em uma sugestão de pergunta. Responda direto com os dados solicitados;
não peça nova clarificação."

6. **Renomear referências (A6):** dentro do prompt, "sugestões
clicáveis" → "sugestões de pergunta".

### 3.3 Busca tolerante a acento (A7)

Implementação:
1. Migration: `CREATE EXTENSION IF NOT EXISTS unaccent`; idem `pg_trgm`.
2. Migration: índices funcionais
   - `CREATE INDEX IF NOT EXISTS fato_produto_unaccent_name_idx ON fato_produto (lower(unaccent(name)))`
   - `CREATE INDEX IF NOT EXISTS raw_product_template_unaccent_name_idx ON raw_product_template (lower(unaccent(name)))`
3. Tool: comparação `lower(unaccent(name)) ILIKE lower(unaccent(:term))`.
4. Estratégia em camadas:
   - Match exato com unaccent.
   - Se < 4 resultados, fazer fallback por similaridade (`pg_trgm`,
     `similarity ≥ 0.4`) e juntar até 10 resultados.

### 3.4 Animação "consultando…" (A3)

Estado:
- Tipo: `ToolCallChip { id: string; toolName: string; label: string;
  status: 'inflight' | 'done' | 'error'; startedAt: number; finishedAt?:
  number }`
- Vive no estado do `agent-bubble` (não em closure de handler).
- Cada `tool_call` do stream cria um chip; cada `tool_result` atualiza o
  chip **in-place** (mesmo id). Nenhum desmount.
- Visual: ver tabela em v1 §3.4.

### 3.5 Reasoning — custo por nível (A5)

Trocar "1x / 2x / 4x / 8x" por:
- Mínimo → "Consumo leve"
- Baixo → "Consumo moderado"
- Médio → "Consumo alto"
- Alto → "Consumo intenso"

Tooltip do bloco: "A tarifa por token de saída é a mesma. O nível
controla quantos tokens de raciocínio o modelo gera antes de responder."

### 3.6 Texto incompatível (A15)

"O modelo selecionado não tem suporte a raciocínio. Escolha um modelo
compatível na seção de conexão para liberar o recurso."

### 3.7 Expandir/recolher (A12)

`localStorage` por chave `agent-config:resource-card:<id>`.

### 3.8 Renomear (A6)

Locais a tocar:
- `resources-toggles.tsx` (título, subtitle, aria-label)
- `configuracao/page.tsx` (se houver heading externo)
- `compose.ts` (texto do prompt)
- Testes que validam strings.

### 3.9 Reposicionar "Máximo por resposta"

Inalterado vs v1.

### 3.10 Dropdown casa com trigger

Inalterado vs v1.

### 3.11 Tela respirada (A9)

Lista completa de rotas em `(protected)/agente/`:
- configuracao
- chaves
- prompt
- consumo
- playground
- plugar-mcps
- (verificar em tempo de execução se há outras; aplicar regra em todas)

Padrão: container `max-w-4xl mx-auto px-6 lg:px-8` no level da página.

### 3.12 Plug MCPs (A2)

Layout `grid lg:grid-cols-[1fr,320px] gap-6`. Coluna principal = lista
de MCPs. Coluna lateral = card de instrução/upsell. Em mobile, lateral
desce.

### 3.13 Catálogo sync (A8, A11)

Whitelist em `src/lib/agent/llm/sync-whitelist.ts`:

```ts
export interface WhitelistEntry {
  provider: 'openai' | 'anthropic' | 'google' | 'openrouter';
  // regex match contra modelId retornado pelo provider
  modelIdPattern: RegExp;
  // só aceita modelos lançados a partir desta data (ISO YYYY-MM-DD)
  validFrom: string;
}
```

Filtros aplicados antes de upsert:
- `validFrom >= '2024-01-01'` (regra geral); whitelist pode ter
  `validFrom` mais recente por provider.
- Modelo precisa ter `pricing.inputPerMTok != null && pricing.outputPerMTok != null`.
- Padrão de id passa em pelo menos uma entrada da whitelist do provider.

Reset de seleção (A11): se modelo ativo foi removido do catálogo no
sync, action `updateLlmConfig` cai para `tier === 'production'` primeiro
ou primeiro modelo disponível; emite toast warning.

### 3.14 Ativação bubble + WhatsApp (A1, A13)

Banco:
```sql
ALTER TABLE agent_settings
  ADD COLUMN whatsapp_enabled BOOLEAN NOT NULL DEFAULT true;
```

Backend:
- `getAgentSettings()` retorna `whatsappEnabled`.
- `updateAgentAvailability(input: { bubbleEnabled, whatsappEnabled })`
  como nova action.
- WhatsApp webhook (F5) checa `whatsappEnabled` antes de chamar
  `run-agent`. Se F5 ainda não estiver em produção, o campo grava no
  banco; o consumo vem quando F5 entrar.

UI:
- Substituir card "Agente Nex ativo" por card "Disponibilidade" com dois
  toggles independentes (Bubble no app / WhatsApp), e sumário textual
  computado.
- Quando ambos `false`: app não monta a bubble; layout protegido
  continua igual.

### 3.15 Operacional (A14)

Executor: Opus 4.7 exclusivamente. Sonnet proibido.

### 3.16 Mapa teste → requisito (A16)

| Teste | Cobre item |
|---|---|
| `compose.test.ts > responde direto se source=suggestion` | A4, 3.2.5b |
| `compose.test.ts > defaults razoáveis para "recente"` | 3.2.1 |
| `compose.test.ts > sugestão clicada não pede confirmação` | 2.2.1 |
| `agent-tools.product-search.test.ts > acento-insensível encontra 4` | 2.2.5, 3.3 |
| `sync-catalog.test.ts > filtros aplicados` | 3.13 |
| `availability-card.test.tsx > 4 estados` | 3.14 |
| `tool-call-chip.test.tsx > in-place no desmount` | 3.4 |
| `reasoning-card.test.tsx > consumo qualitativo por nível` | 3.5 |
| `llm-config-form.test.tsx > popover-width casa com trigger` | 3.10 |
| `resource-card.test.tsx > localStorage persiste collapse` | 3.7 |

## 4. Mudanças de banco

| Tabela | Coluna | Tipo | Default | Migration |
|---|---|---|---|---|
| `agent_settings` | `whatsapp_enabled` | `BOOLEAN NOT NULL` | `true` | `20260523xxxxxx_agent_whatsapp_enabled` |
| extensão | `unaccent` | — | — | `20260523xxxxxx_search_unaccent` |
| extensão | `pg_trgm` | — | — | mesmo |
| `fato_produto` | índice funcional `lower(unaccent(name))` | — | — | mesmo |
| `raw_product_template` | índice funcional `lower(unaccent(name))` | — | — | mesmo |

## 5. Mudanças de backend

(v1 §5 mais:)
- `src/lib/agent/llm/sync-whitelist.ts` novo.
- `src/lib/actions/agent-availability.ts` novo.
- `src/app/api/agent/run/route.ts` ou equivalente SSE: aceita
  `meta.source` no body.

## 6. Mudanças de UI

(v1 §6 mais:)
- `src/components/agent/agent-availability-card.tsx` novo.
- `src/components/agent/tool-call-chip.tsx` novo (ou ajuste do
  componente existente).
- `src/components/ui/custom-select.tsx` e `searchable-select.tsx`:
  popover-trigger-width.

## 7. Mudanças de prompt

(v1 §7 mais 3.2.5b e renomear.)

## 8. Verificação esperada

(v1 §8 + Mapa de testes §3.16.)

## 9. Fora do escopo

(Inalterado.)

## 10. Riscos

(Inalterado; A14 lembrado.)

## 11. Próximo passo

→ Review #2 (mais profunda). Saída: SPEC v3.

# SPEC v3 — Agente Nex: polish de configuração, catálogo, prompt e busca

Data: 2026-05-23
Branch: `feat/f4-leitura-expansao`
Status: final (vai para o PLAN)

Delta vs v2: aplica B1–B25 de
`reviews/2026-05-23-agente-nex-polish-review-2.md`.

---

## 1. Escopo

Polish coeso do Agente Nex em três frentes:
- Configuração (UI/UX + ativação por canal).
- Comportamento conversacional (prompt + animação tool-call + sugestões
  objetivas).
- Busca tolerante (acento + similaridade) + sync de catálogo enxuto.

## 2. Mudanças de banco

Migrations novas (ordem):

1. **`20260523_agent_whatsapp_enabled`**
   ```sql
   ALTER TABLE agent_settings
     ADD COLUMN whatsapp_enabled BOOLEAN NOT NULL DEFAULT true;
   ```

2. **`20260523_search_unaccent_trgm`**
   ```sql
   CREATE EXTENSION IF NOT EXISTS unaccent;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE INDEX IF NOT EXISTS fato_produto_unaccent_name_idx
     ON fato_produto (lower(unaccent(name)));
   CREATE INDEX IF NOT EXISTS raw_product_template_unaccent_name_idx
     ON raw_product_template (lower(unaccent(name)));
   ```

3. **`20260523_llm_model_entry_deprecated`**
   ```sql
   ALTER TABLE "LlmModelEntry"
     ADD COLUMN deprecated_at TIMESTAMP NULL;
   ```

4. **`20260523_agent_chat_message_source`** (opcional, B24)
   ```sql
   ALTER TABLE agent_chat_message
     ADD COLUMN source TEXT NULL;
   ```
   Vai existir só se a tabela já existir (verificar nome real no
   `schema.prisma` durante a execução).

## 3. Decisões finais por item

### 3.1 Prisma client

`prisma generate` documentado em `docs/git-workflow.md` como hábito
pós-pull. Sem mudança de schema fora das migrations §2.

### 3.2 Prompt — diretrizes (compose.ts)

Adicionar bloco `## Comportamento` no system prompt do agente:

> - Quando o usuário pedir algo com "recente", "atual", "do mês",
>   assuma mês do calendário (1 a último dia do mês corrente). Faça uma
>   nota curta no início da resposta indicando a janela considerada.
> - Não peça mais de uma confirmação de clarificação por turno. Se a
>   pergunta tem múltiplas leituras, escolha a mais comum e explicite.
> - Sugestões de pergunta que você gera no fim da resposta devem ser
>   perguntas **completas e objetivas**, que possam ser respondidas sem
>   nova clarificação. Não use "quer ver tal coisa?". Cubra todas as
>   fatias naturais do dado (tudo / em aberto / vencidos / por período
>   X).
> - Quando o input vier marcado como `source=suggestion`, responda
>   direto, sem nova confirmação.

`source=suggestion` injetado quando `meta.source === 'suggestion'`
chega no payload (B1).

Renomear referências internas: "sugestões clicáveis" → "sugestões de
pergunta" (B6).

### 3.3 Busca

Camada SQL:
- Pré-normalização do termo: `lower(unaccent(:term))`.
- Comparação: `lower(unaccent(name)) ILIKE '%' || lower(unaccent(:term)) || '%'`.
- Fallback `pg_trgm`: se < 4 resultados, união com
  `similarity(lower(unaccent(name)), lower(unaccent(:term))) >= 0.4`,
  limit 10.

Aplicar em:
- `src/lib/agent/tools/produto.ts` (ou correspondente).
- Qualquer outra tool de leitura que use ILIKE de nome.

Índices funcionais §2.

### 3.4 Animação "consultando" (B5, B12)

Componente: `ToolCallChip` em `src/components/agent/tool-call-chip.tsx`.

```ts
type ToolCallState = {
  id: string;            // = tool_call_id do stream, ou crypto.randomUUID()
  toolName: string;
  label: string;          // resolvido via TOOL_LABEL_MAP
  status: 'inflight' | 'done' | 'error';
  startedAt: number;
  finishedAt?: number;
}
```

Estado vive no `agent-bubble`. Stream:
- `tool_call` chega → adiciona chip `{ status: 'inflight' }`.
- `tool_result` chega → procura por id e atualiza `status: 'done'`,
  `finishedAt`.
- `error` no result → `status: 'error'`.

Visual:
- inflight: `Loader2 animate-spin` + texto `animate-pulse` "Consultando \<label\>…".
- done: `Check` muted + texto "Consultado \<label\>".
- error: `AlertTriangle` amber + "Falhou ao consultar \<label\>".

### 3.5 Reasoning — consumo qualitativo

Substitui custo numérico por nível por:

| Nível | Rótulo |
|---|---|
| Mínimo | Consumo leve |
| Baixo | Consumo moderado |
| Médio | Consumo alto |
| Alto | Consumo intenso |

Tooltip: "A tarifa por token de saída é a mesma. O nível controla
quantos tokens de raciocínio o modelo gera antes de responder.
Estimativa, não valor de fatura."

Manter exibição da **tarifa fixa** (`outputPerMTok`) em destaque.

### 3.6 Texto incompatível (B20)

"Para usar raciocínio, escolha um modelo compatível na seção de
conexão."

### 3.7 Expandir/recolher (B3, B4, B11)

- `ResourceCard` virou shared (B11) em
  `src/components/agent/resource-card.tsx`.
- `ReasoningCard` consome `ResourceCard`.
- Prop nova: `collapsible?: boolean` + `id: string`.
- Estado interno controlado: chevron `button` com `aria-expanded`,
  `aria-controls`.
- Hidratação: `useState(false)` inicial → `useEffect` lê
  `localStorage[key]` e sincroniza (B4).

### 3.8 Renomear

Locais finais (B6, B23):
- `resources-toggles.tsx`
- `configuracao/page.tsx`
- `compose.ts`
- testes correspondentes

### 3.9 Reposicionar "Máximo por resposta"

Linha completa abaixo do título do card "Sugestão de pergunta", label
"Máximo por resposta" à esquerda + pill-group à esquerda. Justify
`start`.

### 3.10 Dropdown casa com trigger

Em `custom-select.tsx` e `searchable-select.tsx`:
- Aplicar `style={{ minWidth: 'var(--radix-popover-trigger-width)' }}`
  ao `Popover.Content` (ou equivalente da lib usada).
- Se a lib não for Radix, expor variável via `ref` + medição.

### 3.11 Largura por tela (B10)

| Rota | max-w |
|---|---|
| `agente/configuracao` | `max-w-3xl` |
| `agente/chaves` | `max-w-4xl` |
| `agente/prompt` | `max-w-4xl` |
| `agente/consumo` | `max-w-4xl` |
| `agente/playground` | `max-w-4xl` |
| `agente/plugar-mcps` | `max-w-5xl` (grid 1fr/320px) |

Padding lateral: `px-6 lg:px-8`.

### 3.12 Plug MCPs

`grid lg:grid-cols-[1fr,320px] gap-6`. Em mobile vira coluna única.

### 3.13 Catálogo sync (B7, B8, B18, B19)

Whitelist: `src/lib/agent/llm/sync-whitelist.ts`.

```ts
export const SYNC_WHITELIST: WhitelistEntry[] = [
  { provider: 'openai', pattern: /^gpt-5\./, validFrom: '2024-01-01' },
  { provider: 'openai', pattern: /^gpt-4o(-mini)?(-realtime)?$/, validFrom: '2024-01-01' },
  { provider: 'openai', pattern: /^text-embedding-3-(small|large)$/, validFrom: '2024-01-01' },
  { provider: 'openai', pattern: /^whisper-1$/, validFrom: '2024-01-01' },
  { provider: 'openai', pattern: /^tts-1$/, validFrom: '2024-01-01' },
  { provider: 'openai', pattern: /^gpt-4o-mini-(transcribe|tts)$/, validFrom: '2024-01-01' },
  { provider: 'anthropic', pattern: /^claude-(opus|sonnet|haiku)-4(-\d+)?(-\d{8})?$/, validFrom: '2024-01-01' },
  { provider: 'anthropic', pattern: /^claude-3-(5|7)-(sonnet|opus|haiku).*$/, validFrom: '2024-01-01' },
  { provider: 'google', pattern: /^gemini-2\./, validFrom: '2024-01-01' },
];
```

Filtros antes de upsert (em `sync-catalog.ts`):
1. Match com algum entry do provider.
2. Pricing not null (`inputPerMTok` && `outputPerMTok`).
3. `releaseDate >= validFrom` quando provider expõe; senão aceita.
4. Não duplica (`upsert` por `(provider, modelId)`).

Reset de seleção (B8):
- Se modelo selecionado não está mais em `effectiveModels`, marca
  `deprecated_at = now()` em `LlmModelEntry` (se vier do banco), mostra
  banner amarelo no `LlmConfigForm` "este modelo foi descontinuado".
- Mantém `deprecated` na UI como entrada disabled até o usuário trocar.

Botão (B18): disabled + Loader2 + "Atualizando catálogo…". Toast final:
"Catálogo atualizado: N modelos sincronizados, M ignorados (sem pricing
ou fora da whitelist)."

Escopo (B19): atualiza todos os providers com credencial cadastrada.
Sumário enumera por provider.

### 3.14 Disponibilidade (B16, B17)

Banco: §2 migration 1.

Backend novo: `src/lib/actions/agent-availability.ts`:
```ts
export async function updateAgentAvailability(input: {
  bubbleEnabled: boolean;
  whatsappEnabled: boolean;
}): Promise<{ success: true } | { success: false; error: string }>;
```

UI: `src/components/agent/agent-availability-card.tsx` substitui o
toggle "Agente Nex ativo" no topo da configuração.

`layout.tsx`: lê só `bubbleEnabled` (B16).

WhatsApp webhook (F5) checa `whatsappEnabled` quando vier online.
Mensagem de UI sob o toggle de WhatsApp (B17): "O webhook do WhatsApp é
entregue na F5. A configuração já fica salva."

### 3.15 Operacional

Opus 4.7 exclusivamente.

## 4. Arquivos tocados (resumo)

Banco / migrations:
- `prisma/migrations/20260523*_*` (4 migrations)
- `prisma/schema.prisma`

Backend:
- `src/lib/agent/prompt/compose.ts`
- `src/lib/agent/tools/produto.ts` (e outras com ILIKE)
- `src/lib/agent/tools/labels.ts` (novo)
- `src/lib/agent/llm/sync-catalog.ts`
- `src/lib/agent/llm/sync-whitelist.ts` (novo)
- `src/lib/actions/agent-config.ts`
- `src/lib/actions/agent-availability.ts` (novo)
- `src/lib/actions/agent-config-types.ts`
- `src/app/api/agent/run/route.ts` (ou onde está o SSE; aceita meta.source)
- `src/lib/agent/run-agent.ts` (propaga source)

UI:
- `src/components/agent/resource-card.tsx` (novo, extrai do toggles)
- `src/components/agent/resources-toggles.tsx`
- `src/components/agent/reasoning-card.tsx`
- `src/components/agent/llm-config-form.tsx`
- `src/components/agent/tool-call-chip.tsx` (novo)
- `src/components/agent/agent-bubble.tsx` (consome ToolCallChip)
- `src/components/agent/agent-availability-card.tsx` (novo)
- `src/components/ui/custom-select.tsx`
- `src/components/ui/searchable-select.tsx`
- Páginas `(protected)/agente/**/page.tsx`

Testes:
- `compose.test.ts` (atualiza + adiciona)
- `agent-tools.product-search.test.ts` (novo)
- `sync-catalog.test.ts` (atualiza + adiciona)
- `availability-card.test.tsx` (novo)
- `tool-call-chip.test.tsx` (novo)
- `reasoning-card.test.tsx` (atualiza)
- `resource-card.test.tsx` (novo)

## 5. Critérios de aceitação

1. `pnpm tsc --noEmit` + `pnpm eslint` + `pnpm test` + `pnpm build` ok.
2. Bug Prisma `maxSuggestions` não reproduz após restart.
3. Trocar nível raciocínio: salva, UI mostra "Consumo X" qualitativo.
4. Card de raciocínio para modelo sem suporte: mostra texto novo.
5. Cards de recurso expandem/recolhem; estado persiste.
6. "Sugestão de pergunta" renomeado em todos os pontos.
7. Pill-group de "Máximo por resposta" alinhado à esquerda, abaixo do
   título.
8. Dropdown abre com largura ≥ trigger em todas as telas do agente.
9. Páginas do agente com largura nova (3xl/4xl/5xl conforme tabela).
10. Plug MCPs com grid balanceado.
11. Botão atualizar catálogo: filtro + sumário + reset deprecated.
12. Banner deprecated aparece quando modelo selecionado some.
13. Disponibilidade: dois toggles, 4 estados textuais, persistência ok.
14. Bubble não monta quando `bubbleEnabled=false`.
15. Buscar "mola espiral em aço" no agente: encontra 4 (ou todos que o
    Odoo retornaria) independente de acento.
16. Sugestão clicada: agente responde direto sem clarificação.
17. ToolCallChip: spinner + pulse contínuo enquanto inflight, congela
    em done.
18. Mensagens de tool-call não desmontam (sem flicker).

## 6. Fora do escopo

- F5 ponta a ponta.
- F4 onda 2 (writes).
- Outras áreas do app fora de `/agente`.

## 7. Próximo passo

→ PLAN v1.

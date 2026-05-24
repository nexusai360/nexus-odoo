# Spec Master — Renascimento do Agente Nex (Bubble + WhatsApp)

> Versão: v3 (após reviews críticas #1 e #2)
> Data: 2026-05-24
> Branch alvo: `feat/f4-leitura-expansao`
> Autoria: Claude (arquiteto autônomo) sob mandato do usuário em 2026-05-24 16:42
>
> ### Changelog v2 → v3
> - Migration UPDATE em `AgentSettings` reformulada com guardas (não cai com guardrails nulos/jsonb mal formado).
> - Absorção da trilha pelo `assistant` bubble agora tem state machine detalhada (4 transições nomeadas).
> - `fuzzySearch` whitelist tipada via union discriminada — caller não consegue passar combinação inválida.
> - `formatForChannel` para WhatsApp resolve o conflito `*bold*` (markdown italic vs WhatsApp bold): bold vira placeholder antes da conversão de italic.
> - Sanitizer usa escape Unicode para non-breaking/thin space.
> - Welcome question #4 reformulada para evitar lista vazia frustrante.
> - Notas de auditoria adicionadas para playground, exibição crua de output de tools, pré-requisitos de extensão PG, fallback Redis.
> - Comunicação ao admin documentada (toast pós-update).

## 0. Por que este documento existe

O Agente Nex hoje funciona, mas não impressiona. A experiência conversacional na bubble está empobrecida: o indicador de "consultando" vira uma bolha cinza órfã que fica acima da resposta final, criando o gap visual que o usuário circulou em vermelho; sugestões iniciais são ambíguas ("Qual o saldo atual de estoque?" pode ser valor, quantidade ou ambos); textos do prompt usam travessões (`—`) que o usuário proibiu na raiz do projeto e que cruzam para a UI do administrador; a busca por produto, embora tenha uma camada `unaccent+pg_trgm` para `fato_estoque_saldo`, falha em outras tabelas e em variações comuns (quantidade de matches devolvida não bate com o Odoo); o canal WhatsApp herda o comportamento da bubble sem adaptação ao meio. O resultado é um agente que parece um wrapper de chat, não um agente de IA de produto de classe mundial.

Este documento é o blueprint arquitetural para mudar isso em cinco ondas coordenadas. A meta é elevar o Agente Nex ao patamar das melhores experiências conversacionais de produto que existem hoje (ChatGPT, Claude.ai, Perplexity, Linear AI), respeitando o domínio específico de ERP e a operação Matrix Fitness Group.

## 1. Princípios arquiteturais

1. **Fidelidade total ao dado.** Toda informação numérica vem de uma tool MCP. Zero invenção.
2. **Visibilidade do raciocínio.** A trilha de progresso é persistente, parte da bolha de resposta.
3. **Linguagem de operador.** Zero jargão técnico em UI ou prompt.
4. **Adaptação por canal.** Orquestrador é headless; renderizador por canal interpreta os eventos.
5. **Tolerância a erros humanos.** Acentos, cedilha, ordem de palavras, abreviações, tudo absorvido.
6. **Sem travessão em lugar nenhum.** Defesa em três camadas: substituição one-shot da árvore atual, sanitizer runtime nas Server Actions, ESLint rule que impede o caractere voltar.
7. **Latência percebida ≠ latência real.** Status visual em < 200ms; streaming acelerado; cache de tools deterministas.
8. **Acessibilidade obrigatória.** Tudo novo tem aria-label, focus visible, keyboard nav, suporte a prefers-reduced-motion.
9. **Reversibilidade por onda.** Commits agrupados; cada onda pode ser revertida sem afetar as outras.
10. **Falha graciosa de dependências externas.** Redis fora? Tools continuam. PTAX fora? Cotação cai pro último valor.

## 2. Estado atual auditado

### 2.1 Prompt e identidade
- `src/lib/agent/prompt/identity-base.ts` (157 linhas) com 41 ocorrências de `—`.
- `src/lib/agent/prompt/defaults.ts` com `DEFAULT_PERSONALITY`, `DEFAULT_TONE`, `DEFAULT_GUARDRAILS` (8 itens). 13 ocorrências de `—`.
- `src/lib/agent/prompt/compose.ts` compõe identityBase + personality + tone + guardrails + KB + terminology + sugestões. Aceita `AgentPromptSource` (`bubble`/`suggestion`/`whatsapp`/`playground`) mas só usa `"suggestion"`; `"whatsapp"` não muda comportamento hoje.

### 2.2 Loop e tools
- `src/lib/agent/run-agent.ts` (462 linhas) orquestrador com loop de tool calling.
- `mcp/tools/` — 50 read tools em 9 domínios.
- `src/lib/reports/queries/_search-helpers.ts` — `searchProductIdsByName` (unaccent + trgm@0.30). Cobre só `fato_estoque_saldo`. Migration `20260523090100_search_unaccent_trgm` criou índices funcionais só para essa tabela.

### 2.3 Bubble (chat-panel.tsx + progress-trail.tsx)
- `WELCOME_SUGGESTIONS` hardcoded (`chat-panel.tsx:71-75`).
- Modelo atual de estado da trilha: `messages: UiMessage[]` com roles `user`, `assistant`, `progress`. Cada `tool_call` empurra step no item `progress`; `tool_result` marca done; em `type: "done"` o item `progress` continua existindo na lista, separado do item `assistant`. Resultado visual: duas bolhas distintas com espaço entre elas (o gap).
- `chat-panel.tsx:557` renderiza `<ProgressTrail key={m.id} steps={m.steps ?? []} />` quando `m.role === "progress"`.

### 2.4 Streaming (SSE)
- `src/app/api/agent/stream/route.ts` emite `status`, `token`, `tool_call`, `tool_result`, `done`, `error`. Não emite metadados ricos (latência, fallback de busca, ambiguidade detectada).
- Evento `status` JÁ existe (audit nota: confirmado por `chat-panel.tsx:240`).

### 2.5 WhatsApp
- `src/app/api/integrations/whatsapp/inbound/route.ts` existe; pipeline recebe e responde. Comportamento adaptado por canal não implementado.

### 2.6 Playground
- `src/components/agent/playground-content.tsx` existe; precisa auditar se usa `ChatPanel` ou tem renderer próprio. Audit task na onda C: confirmar antes de declarar "herda automaticamente".

### 2.7 Dependências (`package.json`)
- `react-markdown` + `remark-gfm` + sanitizer: **validar na onda C antes de codar**. Se faltarem: instalar, justificar bundle (< 80kb gzip), atualizar lockfile.

### 2.8 Postgres
- `pg_trgm` e `unaccent` já instalados em prod (migration `20260523090100` rodou). Pre-requisito documentado: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS unaccent;` em qualquer ambiente novo.

### 2.9 Redis
- Disponível via `src/lib/redis.ts`. Usado para cache de PTAX. Padrão de fallback: try/catch em volta de get/set, se falhar continua sem cache.

## 3. Segmentação

| Onda | Nome curto | Objetivo central | Depende de |
|---|---|---|---|
| A | Higiene | Tirar travessões; reescrever welcome; sanitizar input | nada |
| B | Busca robusta universal | unaccent+trgm em todas as buscas; ambiguidade ao agente | nada (paralelizável com A) |
| C | UX da bubble | Trilha absorvida na bolha; gap zero; formatação rica | B (consome `ambiguidade`) |
| D | Inteligência do loop | Memória curta; menos clarificação; telemetria | B, C |
| E | WhatsApp adaptativo | Formatter por canal; heartbeat; sugestões textuais | A, B, C, D |

## 4. Onda A — Higiene de prompt

### 4.1 Substituição one-shot
Escopo: `src/`, `mcp/`, `docs/handoffs/2026-05-24*`, `docs/superpowers/specs/2026-05-24-*`. Regras:
- ` — ` → `, ` (vírgula) ou `. ` (ponto) conforme a frase.
- `—` colado → `,`.
- `–` (en-dash) → `,`.
- `…` → `...`.
- `«»` → `""`.

Manual, frase por frase. Não automatizar cegamente.

### 4.2 ESLint rule custom
Plugin local em `eslint-plugins/no-travessao/index.js`:
```js
module.exports = {
  rules: {
    "no-travessao": {
      meta: { type: "problem", messages: { found: "Travessão (—) ou en-dash (–) proibidos. Use vírgula ou ponto." }},
      create(context) {
        const check = (node, text) => { if (/[—–]/.test(text)) context.report({ node, messageId: "found" }); };
        return {
          Literal(node) { if (typeof node.value === "string") check(node, node.value); },
          TemplateElement(node) { check(node, node.value.raw); },
        };
      }
    }
  }
};
```
Integrar em `eslint.config.mjs`. Roda em CI; falha o build.

### 4.3 Sanitizer runtime
Módulo novo `src/lib/agent/prompt/sanitize.ts`:
```ts
export function sanitizePromptText(input: string): string {
  return input
    .replace(/[—–]/g, ",")
    .replace(/…/g, "...")
    .replace(/«/g, '"').replace(/»/g, '"')
    .replace(/[    ]/g, " ")  // non-breaking + thin + figure + narrow no-break
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```
Preserva acento, cedilha, ç, ã, õ, quebras de linha simples e duplas.

Aplicação via zod transformer:
```ts
const sanitizedText = (max: number) => z.string().max(max).transform(sanitizePromptText);
```

Server Actions afetadas (auditar e aplicar):
- `updateAgentIdentityBaseAction({ identityBase: sanitizedText(MAX_PROMPT_LEN) })`
- `updateAgentBehaviorAction({ personality, tone, guardrails })`
- `updateAgentAdvancedOverrideAction({ advancedOverride })`
- `updateAgentTerminologyAction({ terminology })` — sanitiza key e value.
- `addGuardrailAction`, `updateGuardrailAction`.

### 4.4 Welcome suggestions
Substituir em arquivo novo `src/lib/agent/welcome-suggestions.ts`:
```ts
export const WELCOME_SUGGESTIONS = [
  "Quantos itens diferentes temos em estoque agora?",
  "Quanto faturamos no mês corrente?",
  "Quais pedidos de venda estão atrasados?",
  "Qual o valor total do estoque em armazém?",
];
```
4 perguntas fixas, todas executáveis sem clarificação. Cobertura: estoque (2), faturamento (1), comercial (1). Substituí a "títulos vencidos nos últimos 7 dias" (risco de lista vazia frustrante) por "valor total do estoque em armazém" (sempre tem retorno; complementa a #1 que é quantidade).

### 4.5 Reescrita do seed dos guardrails
Cada item dos 8 guardrails reescrito sem travessão. Exemplo:
- Antes: `"Nunca invente números, datas ou nomes — use sempre as ferramentas de consulta; se o dado não existir, diga que não está disponível."`
- Depois: `"Nunca invente números, datas ou nomes. Use sempre as ferramentas de consulta. Se o dado não existir, diga isso com franqueza."`

Reescrita completa de cada um vai no PLAN.

### 4.6 Migration de dados existentes
Configs já gravadas em `AgentSettings` precisam de sanitização. Migration SQL `20260524XXXXXX_sanitize_prompt_strings`:
```sql
-- Personality / tone (campos string simples)
UPDATE "AgentSettings"
SET personality = regexp_replace(coalesce(personality, ''), '[—–]', ',', 'g'),
    tone        = regexp_replace(coalesce(tone, ''),        '[—–]', ',', 'g')
WHERE personality ~ '[—–]' OR tone ~ '[—–]';

-- Guardrails (jsonb array de strings). Usa subquery com agg defensivo.
UPDATE "AgentSettings" s
SET guardrails = (
  SELECT jsonb_agg(to_jsonb(regexp_replace(value, '[—–]', ',', 'g')))
  FROM jsonb_array_elements_text(s.guardrails) AS value
)
WHERE jsonb_typeof(s.guardrails) = 'array'
  AND s.guardrails::text ~ '[—–]';

-- IdentityBase / advancedOverride (opcionais, nulos comuns)
UPDATE "AgentSettings"
SET "identityBase" = regexp_replace("identityBase", '[—–]', ',', 'g')
WHERE "identityBase" IS NOT NULL AND "identityBase" ~ '[—–]';

UPDATE "AgentSettings"
SET "advancedOverride" = regexp_replace("advancedOverride", '[—–]', ',', 'g')
WHERE "advancedOverride" IS NOT NULL AND "advancedOverride" ~ '[—–]';
```
Migration roda em transação; rollback automático em caso de erro. Validar com `SELECT count(*) FROM "AgentSettings" WHERE personality ~ '[—–]'` antes e depois.

### 4.7 Comunicação ao admin
Após deploy, próximo login do super_admin em `/agente/comportamento` mostra toast informativo: "Atualizamos a redação dos guardrails para remover travessões. Reveja se quiser ajustar a nova versão." Toast aparece uma vez (controlado por flag em localStorage `nex:travessao-migration-seen`).

### 4.8 Testes da onda A
- `sanitize.test.ts` — 8 cenários (em-dash, en-dash, reticências, aspas francesas, non-breaking space, idempotência, preserva acentos, preserva \n duplo).
- `welcome-suggestions.test.ts` — 4 items, domínios distintos.
- ESLint roda contra a árvore atual e dá verde (após substituição one-shot).
- E2E: criar config nova → ler do DB → zero `—`.

### 4.9 Definition of Done — Onda A
```bash
pnpm tsc --noEmit
pnpm jest src/lib/agent/prompt
pnpm lint
pnpm prisma migrate deploy
grep -rn '—' src/ mcp/ docs/superpowers/specs/2026-05-24-*.md   # zero matches
```

## 5. Onda B — Busca robusta universal

### 5.1 Whitelist tipada de combinações
```ts
type SearchTarget =
  | { table: "fato_estoque_saldo";   pkColumn: "produto_id";    nameColumn: "produto_nome" }
  | { table: "fato_parceiro";        pkColumn: "parceiro_id";   nameColumn: "nome" }
  | { table: "fato_titulo_receber";  pkColumn: "titulo_id";     nameColumn: "cliente_nome" }
  | { table: "fato_titulo_pagar";    pkColumn: "titulo_id";     nameColumn: "fornecedor_nome" };
  // ... cada nova combinação requer expansão explícita do tipo
```
O caller passa um literal; TypeScript impede combinação inválida.

### 5.2 `fuzzySearch<T>` universal
Módulo novo `src/lib/reports/queries/_search-universal.ts`:
```ts
export async function fuzzySearch(opts: {
  prisma: PrismaClient;
  target: SearchTarget;
  term: string;
  tenantSql?: string;            // ex.: 'AND tenant_id = $X'
  tenantParams?: unknown[];
  limit?: number;                // default 50
}): Promise<{
  ids: Array<string | number>;
  totalMatches: number;          // total real (sem cap), até 200
  layer: "exact" | "fuzzy" | "none";
}>;
```

Pipeline:
1. **Tokenização AND.** `term.split(/\s+/)` filtra vazios. Cada token vira `lower(unaccent(col)) LIKE '%token%'` combinados com `AND`. Resolve ordem das palavras.
2. **Camada exata unaccent.** Se ≥4 ids → retorna.
3. **Camada fuzzy trgm** com threshold dinâmico:
   - `term.length < 4` → 0.50
   - `term.length > 12` → 0.20
   - resto → 0.30
4. Retorna `{ ids, totalMatches, layer }`.

`totalMatches` calculado via `COUNT(*)` separado (sem `LIMIT`) para o caller saber se há mais.

### 5.3 Migrations
Migration `prisma/migrations/20260524XXXXXX_search_unaccent_trgm_universal/migration.sql`:
```sql
-- Pré-requisito (já existem em prod; idempotente para dev novo)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_fato_parceiro_nome_unaccent_trgm
  ON fato_parceiro USING gin (lower(public.f_unaccent_immutable(nome)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_fato_titulo_receber_cliente_unaccent_trgm
  ON fato_titulo_receber USING gin (lower(public.f_unaccent_immutable(cliente_nome)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_fato_titulo_pagar_fornecedor_unaccent_trgm
  ON fato_titulo_pagar USING gin (lower(public.f_unaccent_immutable(fornecedor_nome)) gin_trgm_ops);
```
Audit task antes da migration: confirmar nome real das colunas (`nome` vs `parceiro_nome` etc) no schema Prisma. Schema é fonte da verdade.

### 5.4 Campo `ambiguidade` opt-in nas tools
Tools que usam `fuzzySearch` adicionam:
```ts
const ambiguidadeSchema = z.object({
  totalMatches: z.number().int(),
  layer: z.enum(["exact", "fuzzy", "none"]),
  topCandidates: z.array(z.object({
    id: z.union([z.number(), z.string()]),
    nome: z.string(),
    context: z.string().optional(),
  })).max(5),
}).optional();
```
Tool só preenche quando `totalMatches > 1` E o cenário levaria o agente a escolher arbitrariamente. Quando `totalMatches === 1`, não preenche (resposta óbvia).

### 5.5 Tools afetadas
- `estoque_saldo_produto`
- `cadastro_buscar_parceiro`
- `financeiro_titulos_vencidos`, `financeiro_contas_a_receber`, `financeiro_contas_a_pagar`
- `comercial_pedidos_por_vendedor`, `comercial_preco_produto`
- `fiscal_faturamento_por_cliente`

Total: 8 tools (ajustar lista no PLAN após audit do schema real).

### 5.6 Prompt: instruções sobre `ambiguidade`
Adicionar bloco em `identity-base.ts`:
> "Quando uma tool devolver `ambiguidade` no resultado, NÃO escolha o primeiro candidato como resposta. Apresente a contagem total (ex: 'Encontrei 4 produtos com esse nome'), liste os candidatos com nome + contexto, e peça para o usuário especificar. Use o `[[suggestions]]` para listar os candidatos como opções clicáveis."

### 5.7 Telemetria
Cada `fuzzySearch` loga em `MetricLog` (criar tabela se não existe): `{ kind: "fuzzy_search", target, term, layer, totalMatches, ms }`.

### 5.8 Audit nota: UI que mostra output cru de tool
A onda B muda o output schema das tools (adiciona `ambiguidade`). Audit task: grep no `src/components/agent/playground-*` por display cru de tool result. Se houver, garantir backward-compat (campo é opcional).

### 5.9 Testes da onda B
- `_search-universal.test.ts` — tokenização AND, threshold dinâmico, whitelist TS impede combinação inválida, fallback fuzzy quando exato < 4, `totalMatches` correto.
- Migration roda; `EXPLAIN ANALYZE` confirma uso de index funcional.
- E2E: as 6 variantes de "mola espiral em aço" retornam mesmo conjunto.

### 5.10 Definition of Done — Onda B
```bash
pnpm tsc --noEmit
pnpm jest src/lib/reports/queries
pnpm prisma migrate deploy
# Manual: bubble com 4 variantes → 4 produtos sempre, mostrando ambiguidade
```

## 6. Onda C — UX conversacional da bubble

### 6.1 Trilha absorvida na bolha — state machine
Mudança no modelo de `UiMessage`:
```ts
type UiMessage = {
  id: string;
  role: "user" | "assistant";   // "progress" removido
  content: string;
  steps?: ProgressStep[];        // só em assistant
  stepsCollapsed?: boolean;      // controle do chevron
  startedAt?: number;            // ms para calcular duração total
  doneAt?: number;
  suggestions?: string[];
  streaming?: boolean;
};
```

State machine (transições no `chat-panel.tsx`):

| Evento SSE | Estado antes | Estado depois |
|---|---|---|
| (usuário envia) | nenhuma bolha assistant | adiciona `{ role: "user", ... }` + bolha placeholder `{ role: "assistant", streaming: true, startedAt: Date.now(), stepsCollapsed: false }` (cria já com steps vazio) |
| `status` | placeholder existe | sem mudança (placeholder já mostra "Pensando...") |
| `tool_call` | placeholder | empurra step em `messages[].steps` da bolha assistant atual |
| `tool_result` | step running | marca step como done |
| `token` | placeholder ou bolha com content | acumula `content` (cria conteúdo abaixo da trilha) |
| `done` | streaming | `streaming = false`, `doneAt = Date.now()`, `stepsCollapsed = true`, `content = evt.message`, `suggestions = evt.suggestions` |
| `error` | streaming | `streaming = false`, `content = "**Erro:** " + evt.error` |

Chave: a bolha assistant **sempre existe desde o início do turno**. Steps e content vivem juntos. Zero `role: "progress"`. Zero gap.

### 6.2 Render da bolha do assistant
```
[ ─────────────────────────────────────── ]
[ ▾ Pensando...                          ]  ← chevron + título
[   ◐ Consultando estoque                ]
[   ✓ Consultou valor em armazém         ]
[                                         ]
[ R$ 51.906.178,58                       ]  ← content
[ Atualizado em 22/05/2026.              ]
[                                         ]
[ Dados de 14:32  ·  2 etapas em 1,3s    ]  ← footer
[ ─────────────────────────────────────── ]
[ [chip] [chip] [chip]                   ]  ← suggestions
```
Durante streaming: trilha aberta, título "Pensando...".
Após `done`: trilha colapsada, título "Como cheguei aqui · N etapas · Xs". Click no chevron expande de volta.

### 6.3 A11Y
- `aria-expanded` no chevron, `aria-controls` aponta para `<ul>` de steps.
- `aria-live="polite"` no `<ul>` enquanto streaming.
- `aria-busy="true"` na bolha durante streaming; `aria-busy="false"` após done.
- Tab order: chevron → conteúdo → footer → cada chip.
- `prefers-reduced-motion`: desabilita animate-spin/pulse.
- Atalho de teclado: `Esc` colapsa trilha quando focada.

Validação manual com axe DevTools (extensão browser); não dependemos de axe-core CI por enquanto.

### 6.4 Indicador "pensando" expressivo
Componente novo `<AgentThinkingHeader>`: ícone Brain pulse + label "Pensando...". É o estado inicial do chevron durante streaming sem steps.

### 6.5 Formatação rica
Componente novo `<AgentMarkdown content={string} />` em `src/components/agent/agent-markdown.tsx`:
- Gate: validar `react-markdown` + `remark-gfm` no `package.json`. Se faltarem: `pnpm add react-markdown remark-gfm rehype-sanitize`. Documentar tamanho do bundle (esperado < 50kb gzip).
- Sanitização: `rehype-sanitize` com schema custom (whitelist apenas `p, strong, em, code, pre, ul, ol, li, table, thead, tbody, tr, th, td, a, br`; atributo `href` em `<a>` filtrado para http/https).
- Renderer custom `<strong>`: quando match com pattern numérico (`R$ X` ou `X%`), wrap em badge violet sutil.
- Renderer custom `<table>`: scroll-x; cap 6 linhas com "ver mais" se exceder.
- Renderer `<code>`: estilo mono, foreground/30, sem syntax highlight (Pasta Prism muito pesado).

### 6.6 Streaming acelerado (server-side)
`src/app/api/agent/stream/route.ts` agrupa tokens: buffer in-memory; envia chunk quando `buf.length >= 8` OU `Date.now() - lastFlush >= 50ms`. Garante flush em `tool_call` e `done` (não engolir mensagem).

### 6.7 Auto-scroll suave
`useEffect` ouve nova mensagem assistant; faz `ref.scrollIntoView({ block: "start", behavior: prefersReducedMotion ? "auto" : "smooth" })`. Antes rolava pro fim.

### 6.8 Freshness footer
Footer dentro da bolha: `Dados de hh:mm · N etapas em Xs`. Hora vem do `atualizadoEm` do output do tool mais recente.

### 6.9 Feature flag
`NEXT_PUBLIC_NEX_TRILHA_ABSORVIDA="true"` controla rollout. Quando `false`, render volta ao comportamento atual (com `role: "progress"` separado). Permite reverter em prod via env var sem deploy.

### 6.10 Audit playground
Confirmar se `playground-content.tsx` reusa `ChatPanel` ou tem renderer próprio. Se reusa → herda automaticamente. Se tem renderer próprio → decidir: portar mesma mudança OU deixar legacy. Decisão padrão: deixar legacy (playground é interno; bubble é o produto).

### 6.11 Testes da onda C
- Snapshot da bolha em 3 estados (streaming sem step, streaming com 2 steps, done com 3 steps colapsados).
- Unit: parser markdown rejeita `<script>`, `<iframe>`, atributos `onclick`.
- Unit: chevron toggle expande/colapsa.
- Unit: chunking de tokens (8 chars / 50ms).
- Visual: gap zero entre bolha user anterior e bolha assistant.
- A11Y: axe DevTools sem violações high/serious.

### 6.12 Definition of Done — Onda C
```bash
pnpm tsc --noEmit
pnpm jest src/components/agent
pnpm build
# Manual: abrir bubble, perguntar "qual o valor de estoque?" → trilha dentro da bolha, zero gap, chevron funciona
```

## 7. Onda D — Inteligência do loop

### 7.1 Memória curta intra-sessão
Em `runAgent`, manter `sessionFacts: Map<string, CachedToolResult>` por `conversationId`. TTL 10 min. Antes de chamar tool, hash de `(toolName, canonicalArgs)`; hit válido → reusa.

### 7.2 Prompt anti-clarificação repetida
Em `compose.ts` bloco "Comportamento":
> "Se o usuário já respondeu uma desambiguação nesta conversa (últimos 10 turnos), NÃO repita a pergunta. Use a resposta dele e prossiga."

### 7.3 Telemetria por tool
Reuso de `MetricLog` ou tabela nova; ver schema. `{ kind: "tool_latency", tool, ms, conversationId, userId, success }`. Painel novo aba "Latência de tools" em `/agente/consumo` com p50/p95/p99 + lista de tools acima do p95 do dia.

### 7.4 Telemetria de UX
Instrumentação client: `userEnteredAt`, `firstStatusAt`, `firstTokenAt`, `doneAt`. POST batch a cada 5 turnos para `/api/agent/ux-metrics`. Persiste em `MetricLog`. Privado (não exposto pro user).

### 7.5 Budget hard cap
5 tool calls por turno. Se atingir: parar; responder com o que tem + nota "consultei até onde dava".

### 7.6 Cache Redis para tools deterministas
Wrapper `withRedisCache(toolFn, { ttlSeconds: 60, scope: "tenant" })`. Chave: `tool:{name}:{tenantId}:{hash(args)}`. Aplicar só em tools de período fechado (faturamento de mês anterior, plano de contas). **Tools de período corrente NÃO recebem cache.** Fallback: se Redis falha (get/set throw), tool roda normalmente sem cache.

### 7.7 Testes da onda D
- Unit: cache hit/miss/TTL/scope/fallback.
- Unit: budget hard cap.
- Unit: telemetria registra ms corretamente.
- Integração: 2 turnos com mesma pergunta → segundo é cache hit.
- Manual: painel `/agente/consumo` mostra latência.

### 7.8 Definition of Done — Onda D
```bash
pnpm tsc --noEmit
pnpm jest src/lib/agent
# Manual: 5 turnos repetidos → 4 cache hits visíveis em log
# Visual: painel mostra p50/p95
```

## 8. Onda E — WhatsApp adaptativo

### 8.1 `formatForChannel` resolvendo conflito de syntax
Markdown padrão: `*x*` = italic. WhatsApp: `*x*` = bold. Conversão precisa preservar significado.

```ts
export function formatForChannel(content: string, channel: "bubble" | "whatsapp"): string {
  if (channel === "bubble") return content;

  // 1. Proteger bold (**x**) com placeholder
  const BOLD_TOKEN = "BOLD";
  let r = content.replace(/\*\*([^*\n]+?)\*\*/g, (_, t) => `${BOLD_TOKEN}${t}${BOLD_TOKEN}`);

  // 2. Converter italic (*x*) para _x_
  r = r.replace(/\*([^*\n]+?)\*/g, "_$1_");

  // 3. Restaurar bold como *x* (WhatsApp syntax)
  r = r.split(BOLD_TOKEN).map((p, i) => i % 2 === 1 ? `*${p}*` : p).join("");

  // 4. Strikethrough ~~x~~ → ~x~
  r = r.replace(/~~([^~\n]+?)~~/g, "~$1~");

  // 5. Tabelas → listas hifenizadas
  r = convertTablesToList(r);

  // 6. Links em formato "texto: url"
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2");

  return r;
}
```
Tests cobrem casos com bold dentro de italic, italic dentro de bold, listas, tabelas.

### 8.2 Heartbeat textual
No `inbound/route.ts`, após 3s sem completar o `runAgent`, envia mensagem curta tipo "🔎 Buscando...". Variantes rotacionadas (🧮 Calculando, 📊 Organizando, 💬 Quase lá). Hard limit 1 heartbeat por turno; debounce 5s entre tentativas.

Implementação: timer com `setTimeout` armado no início do turno; cancelado se `runAgent` completar antes.

### 8.3 Sugestões textuais numeradas
Resposta final WhatsApp tem rodapé:
```
Você também pode perguntar:
1. <sugestão 1>
2. <sugestão 2>
3. <sugestão 3>
```
Parser de input no `inbound/route.ts`: se mensagem do usuário match `/^[1-3](\.|\))?\s*$/` ou `/^opção\s+[1-3]$/i`, recupera sugestão correspondente da última resposta (gravada em `WhatsAppContact.lastSuggestions` jsonb). Trata como atalho: envia a sugestão como prompt.

### 8.4 Compose source dispatch real
Em `compose.ts`, quando `source === "whatsapp"`, append:
```
## Canal WhatsApp
Resposta vai para WhatsApp.
- Use a sintaxe markdown do WhatsApp: *bold*, _italic_, ~strike~, ```code```.
- Sem tabelas. Sem cabeçalhos. Sem listas aninhadas.
- Frases ainda mais curtas que o normal.
- Termine sempre com "Você também pode perguntar:" seguido de 3 opções numeradas (1, 2, 3).
```

### 8.5 Roteamento e logging
`inbound/route.ts`:
- Extrai `from`; busca `WhatsAppContact` → `userId`. Se não vinculado, responde "Número não autorizado. Fale com o admin."
- Monta `AgentRunContext` com `channel: "whatsapp"`, `source: "whatsapp"`.
- Dispara `runAgent`.
- Acumula tokens internamente (SSE consumido server-side).
- Envia: heartbeat (se aplicável) + resposta final formatada.
- Loga `WhatsAppMessageLog` e `AgentTurn` (mesma tabela; campo `channel`).

### 8.6 Sessão por canal (decisão)
Bubble e WhatsApp usam `conversationId` distintos. Documentar em `/agente/configuracao` ajuda contextual.

### 8.7 Testes da onda E
- Unit: `formatForChannel` com 8 cenários (bold dentro italic, italic dentro bold, tabela 3x3, link, strike, mistos).
- Unit: parser numérico de atalho.
- E2E: mock webhook → runAgent → resposta enviada.
- Manual: enviar 5 mensagens reais; validar formatação no app.

### 8.8 Definition of Done — Onda E
```bash
pnpm tsc --noEmit
pnpm jest src/lib/agent/format src/app/api/integrations/whatsapp
# Manual: 5 mensagens com formatação variada
```

## 9. Contratos entre ondas

| Upstream | Provê para downstream | Como |
|---|---|---|
| A | Texto limpo no DB | Sanitizer + ESLint + substituição one-shot |
| A | Welcome decentes | `WELCOME_SUGGESTIONS` em arquivo dedicado |
| B | `fuzzySearch<T>` universal | Whitelist tipada + função pública |
| B | Campo `ambiguidade` em tools | Schema opcional padronizado |
| C | `steps` por bolha do assistant | Campo no `UiMessage`; absorção no `done` |
| C | `<AgentMarkdown>` seguro | Componente reusable |
| D | `withRedisCache` | Wrapper com fallback |
| D | Telemetria `MetricLog` | API client + painel |
| E | `formatForChannel` | Função pura |
| E | Compose source `whatsapp` ativo | Bloco condicional |

## 10. Métricas de sucesso
- **Travessões na árvore:** zero. `grep -rn '—' src/ mcp/ docs/superpowers/specs/2026-05-24-*`.
- **Welcome → tool call sem clarificação:** 100% das 4 sugestões.
- **Variantes de "mola espiral em aço":** 6 grafias retornam conjunto consistente.
- **Gap visual após resposta:** zero.
- **Latência percebida (p95):** `userEnteredAt → firstStatusAt` < 200ms.
- **WhatsApp:** sessão de 5 turnos sem usuário pedir esclarecimento sobre estado.

## 11. Riscos e mitigações
| Risco | Mitigação |
|---|---|
| Sanitizer afeta texto técnico | Sanitizer só em campos de prompt, não código |
| Migração jsonb falha em guardrails nulos | `WHERE jsonb_typeof = 'array'` + `coalesce` |
| Trilha absorvida quebra testes E2E existentes | Atualizar fixtures; feature flag opt-out |
| Payload de trilha grande | Cap 10 steps × 60 chars |
| WhatsApp heartbeat spam | 1/turno + debounce 5s |
| Cache vaza entre tenants | Chave inclui `tenantId` |
| `react-markdown` pesado | Gate de 50kb gzip; alternativa micromark |
| ESLint custom rule lenta | Visitor restrito a Literal + TemplateElement |
| `formatForChannel` corrompe bold em italic | Placeholder + ordem explícita |
| Redis fora derruba tool | Fallback try/catch em wrapper |
| pg_trgm não existe em ambiente dev novo | `CREATE EXTENSION IF NOT EXISTS` na migration |

## 12. Fora do escopo
- Reescrita do streaming SSE.
- Migração de provider LLM.
- Novas tools MCP.
- Voice in/out.
- RAG profundo.
- i18n.
- Playground (decisão: legacy, herda só se reusa ChatPanel).

## 13. Plano de rollout
Cada onda em branch separada (`feat/nex-renaissance-A`, `B`, `C`, `D`, `E`). PR → merge em `feat/f4-leitura-expansao`. Conjunto vai para `main` quando todas estiverem prontas. Cada onda revertível por commit.

## 14. Próximo passo
Esta v3 é a versão definitiva da spec. Próximo: **PLAN v1 do Segmento A**, com tasks bite-sized e zero ambiguidade.

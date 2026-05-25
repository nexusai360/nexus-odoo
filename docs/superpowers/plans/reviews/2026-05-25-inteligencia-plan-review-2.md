# Review #2 — PLAN v2 do Agente Nex Inteligência

> Auditoria mais profunda. Foco: integração, testabilidade, completude residual.

---

## Integração

### Q1 — [B] Como `quality-judge` e `contextual-suggester` instanciam o LLM client?

Plan v2 fala "usa Haiku 4.5", "usa Gemini 2.5 Pro thinking" sem dizer COMO. O projeto tem
`src/lib/agent/llm/{providers,...}` com adapters padronizados pelo
`claude-nex-llm-adapters-modernization`. Não usar essa camada cria duplicação.

**Fix v3**:
- `quality-judge` chama `runChat({ provider, model, messages, reasoningEffort })` usando o
  cliente já registrado em `src/lib/agent/llm/run-chat.ts` (ou função equivalente que existe;
  T2.3a descobre o nome exato via `grep -rn "function run.*Chat\|export.*runChat" src/lib/agent/llm/`).
- Idem `topic-extractor` e `contextual-suggester`.
- Não criar novo client low-level. Apenas wrappers de prompt + parsing.

### Q2 — [M] `extractTopics` retorna `{topic, domain, keywords}` mas `topicTags` é `string[]`

Plan T1.8 não converte. Spec §7.2 diz `topicTags TEXT[]` — formato livre, exemplos
`["estoque", "produto:mola_espiral"]`. Conversão precisa ser canônica.

**Fix v3**: na T1.13 (job tagging):
- Adiciona `topic` primeiro: `["${topic}"]`.
- Adiciona keywords prefixadas: `["${topic}", "keyword:${k1}", "keyword:${k2}"...]`.
- Cap em 5 total.
- Domain entra como prefixo do topic se distinto: `"${domain}:${topic}"`.

### Q3 — [B] `chat-panel.tsx` callback `onMessageDone` não está confirmado

Plan T4.12 fala em "callback `onMessageDone`". Existe hoje? Precisa criar?

**Fix v3**: T4.11.5 — descoberta:
- `grep -n "onMessageDone\|onAssistantComplete\|streaming.*done" src/components/agent/chat-panel.tsx`.
- Se existe: usar.
- Se não existe: criar como prop/callback no componente, disparada quando `streaming` vai de
  `true` → `false` E `currentMessageRole === "assistant"`. `useEffect` com deps `[streaming, currentMessage]`.

### Q4 — [M] Override "tools-differ" no dedup sem heurística

Plan T4.3 diz "override: se duas chips usariam tools diferentes, NÃO dedup". Mas como o
dedup sabe qual tool a chip usaria sem rodar o agente?

**Fix v3**: heurística por **palavra-chave** mapeada para tool:
- `src/lib/agent/intelligence/tool-keyword-map.ts` — `Record<keyword, toolName>`.
  Ex.: `"saldo|estoque" → "querySaldoProduto"; "faturamento|venda" → "queryFaturamento"`.
- Para cada chip, extrai keywords matching; se 2 chips matcham tools distintas → override
  vence (mantém ambas).
- Mapa cresce empiricamente. Onda 4 entrega 8-10 mapeamentos cobrindo as tools mais
  usadas; resto cai no dedup normal (aceitável: false-positive raro).

---

## Testabilidade

### Q5 — [M] T2.9 "renderiza com seed" sem fonte do seed

Não há instrução de como semear `conversation_quality_evaluations` para teste.

**Fix v3**: T2.9b — `prisma/seed-intelligence.ts` (separado de `prisma/seed.ts` para não
poluir seed global). Cria:
- 50 ConversationQualityEvaluation com rubricas variadas.
- 10 PromptRecommendation em status `pending`.
- 200 SuggestionInteraction com mix de chipSource/action.
- Rodável via `pnpm tsx prisma/seed-intelligence.ts`.

### Q6 — [M] Fixtures path convention

Plan T1.6 fala `__fixtures__/tool-calls/*.json`. Projeto usa esse padrão? Conferir.

**Fix v3**: T1.6 nota: usar `src/lib/agent/intelligence/__fixtures__/tool-calls/*.json`
(co-localizado com o test). Se projeto usa outro padrão (`test/fixtures/`?), seguir o
padrão existente — `grep -rn "__fixtures__\|/fixtures/" src/` na execução.

### Q7 — [M] T4.11 route.test.ts pattern Next.js 16

Testes de Next.js App Router têm padrão específico (manual mock de `Request`, etc).

**Fix v3**: T4.11 nota: ver outros route tests no projeto via
`find src/app/api -name "route.test.ts" -o -name "*.route.test.ts"` para copiar pattern.
Se nenhum existe, padrão proposto: import `POST` da route, instanciar `Request`
manualmente, chamar handler, assertar response.

---

## Robustez

### Q8 — [B] T3.6 backfill enfileira 6k jobs de uma vez

Worker pode soltar fumaça. BullMQ aceita mas rate limit a concorrência.

**Fix v3**: T3.6:
- Lê `User` em batch de 100.
- Entre batches: `await sleep(2000)` (2 s).
- Adiciona `--rate-limit-per-minute 100` CLI flag (default 100).
- BullMQ worker para `agent-profile-build` configurado com `concurrency: 5` (paralelismo
  controlado).

### Q9 — [M] Retry/rate-limit no `analyze-conversations.ts`

Anthropic / Gemini retornam 429 sob carga. Sem retry, script aborta.

**Fix v3**: T2.6:
- Retry exponencial: 3 tentativas, backoff `[2s, 8s, 30s]`.
- Em 429: aguarda `Retry-After` se presente.
- Após 3 falhas consecutivas: pula o turno, registra em `analyze.log`, prossegue.
- No fim do script: reporta turnos pulados.

### Q10 — [N] Embeddings da Onda 2 sem cap

500 avaliações × 1 embedding = 500 chamadas. Barato mas plan deveria mencionar.

**Fix v3**: T2.5 nota: 500 embeds ≈ $0.05. Negligível.

### Q11 — [M] Sidebar entry — pattern server vs client component

Plan T2.10 não diz se é server ou client component.

**Fix v3**: ver `src/components/layout/sidebar.tsx`:
- Se server component → adiciona condicional render direto no JSX.
- Se client component → recebe `userRole` via prop (do layout server).
- Decisão na execução (T2.10a).

### Q12 — [N] Onda 4 keep-alive ping (Haiku 5min)

Plan §5.2 spec fala mas plan tasks não materializa.

**Fix v3**: T4.1.5 — `src/worker/jobs/agent-intelligence/llm-keepalive.ts`:
- Cron `*/5 * * * *`.
- Chamada trivial (1-token completion) ao Haiku 4.5 para manter conexão warm.
- Apenas em produção (gated by env `NODE_ENV === "production"`).
- Registrado em `src/worker/index.ts`.

---

## Completude residual

### Q13 — [M] Plan não define onde mora o "tool keyword map" inicial

Q4 introduz `tool-keyword-map.ts`. Plan precisa task explícita.

**Fix v3**: T4.2.5 — criar `src/lib/agent/intelligence/tool-keyword-map.ts` com 10
mapeamentos iniciais cobrindo as tools mais usadas (basear em
`SELECT tool_names FROM llm_usage GROUP BY tool_names ORDER BY COUNT(*) DESC LIMIT 10`).

### Q14 — [N] Resumo de custo total da entrega

Plan não soma os custos.

**Fix v3**: §"Orçamento da entrega":
- Onda 1: 0 (sem LLM em tagging síncrono; jobs assíncronos só rodam pós-deploy).
- Onda 2: ~$8 análise (sample 5 % = 530 turnos × Gemini 2.5 Pro thinking).
- Onda 3: ~$1 backfill perfis + tagging incremental (centavos/dia em regime).
- Onda 4: ~$5/mês contextual + dedup (estimativa baseado em 50 conversas/dia × $0.001/sessão).
- **Total inicial**: ≤ $15. Operacional: < $10/mês.

### Q15 — [N] Plan não verifica se prisma seeds existentes precisam ajuste

`prisma/seed.ts` pode quebrar com novas tabelas/colunas.

**Fix v3**: P0.5.5 — `pnpm tsx prisma/seed.ts --dry` para confirmar que seed funciona com
schema novo. Ajustar se quebrar (provavelmente não, novas colunas têm default).

---

## Resumo

15 achados:
- **B**: Q1, Q3, Q8 — 3.
- **M**: Q2, Q4, Q5, Q6, Q7, Q9, Q11, Q13 — 8.
- **N**: Q10, Q12, Q14, Q15 — 4.

Próximo passo: aplicar B+M → PLAN v3.

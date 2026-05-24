# Spec — Welcome personalizado por usuario (sub-segmento A2)

> Spec mini, v1+v2 inline (double-check aplicado direto)
> Master spec: `2026-05-24-agente-nex-renaissance-master.md` v3
> Data: 2026-05-24

## Problema
As sugestoes iniciais da bubble sao um catalogo fixo de 4 perguntas. Para
um usuario novo sao ok; para um usuario fluente da operacao sao ruido. O
usuario pediu: tornar as sugestoes iniciais um sinal de aprendizado do
comportamento do proprio usuario logado.

## Regra de negocio
Quando o usuario abre a bubble, mostrar **N sugestoes personalizadas**
(onde N = `maxSuggestions` configurado em /agente/comportamento, default
3, cap 5). Distribuicao:

- **Slot 1:** pergunta que reflete a tool que o usuario mais consultou em
  TODA a historia da sua conta.
- **Slots 2..N:** perguntas que refletem as tools mais consultadas nos
  ultimos 28 dias, em ordem decrescente. Dedup contra o slot 1.

Se o usuario nao tem historico (novo, primeira sessao), cai no catalogo
fixo `WELCOME_SUGGESTIONS` ja existente.

## Design tecnico

### Fonte de dados
Tabela `Message` ja registra `toolCalls: Json?` para mensagens role
"assistant". Cada `toolCalls` e um array de chamadas com `name` (tool id).
Atraves de `conversationId -> Conversation.userId` chego ao dono.

### Pipeline
1. `aggregateToolUsage(userId, windowDays?)` retorna `Array<{toolName, count}>`
   ordenado decrescente, lendo `messages.tool_calls` via `$queryRaw`:
   ```sql
   SELECT tc->>'name' AS tool_name, COUNT(*)::int AS count
   FROM messages m
   JOIN conversations c ON c.id = m.conversation_id
   CROSS JOIN LATERAL jsonb_array_elements(m.tool_calls) AS tc
   WHERE c.user_id = $1
     AND m.tool_calls IS NOT NULL
     AND ($2::int IS NULL OR m.created_at >= now() - ($2 || ' days')::interval)
   GROUP BY tool_name
   ORDER BY count DESC
   LIMIT 20
   ```
2. `pickPersonalized(allTime, recent, max)`:
   - candidatos = [topRecent[0..1], topAllTime[0]].
   - Mapear cada `toolName` para `TOOL_TO_QUESTION[toolName]`.
   - Filtrar undefined (tool sem template).
   - Dedup mantendo a primeira ocorrencia.
   - Slice ao max.
3. Server Action `getPersonalizedWelcomeSuggestions(maxSuggestions)`
   retorna `string[]`. Em erro, devolve fallback.

### Templates
`src/lib/agent/personalized-suggestions/templates.ts` mapeia tool ID para
pergunta template fechada (sem placeholder na v1). Cobre os 20+ tools mais
usados (faturamento, saldo de estoque, contas a pagar/receber, pedidos
por etapa, etc).

### Wiring de UI
- `getPublicAgentFlags` segue retornando `maxSuggestions`.
- Layout protegido faz `getPersonalizedWelcomeSuggestionsForCurrentUser(maxSuggestions)`
  em paralelo com os outros awaits.
- Passa `welcomeSuggestions: string[]` via prop ate ChatPanel.
- ChatPanel usa essa prop em vez de fatiar a constante curada. Se for
  vazia (fallback), chat-panel usa `WELCOME_SUGGESTIONS.slice(0, max)`.

### Performance
- Query agregada O(N) com N = mensagens do usuario com tool_calls.
- Index existente: `messages(conversation_id, created_at)` e
  `conversations(user_id, updated_at)`.
- TTL Redis 5 min: chave `nex:welcome-suggestions:{userId}:v1`. Invalidar
  ao fim de cada turno do agente (insert de novo message com tool_calls).
  Fallback gracioso se Redis off.

## Double-check (review #1 inline)
1. **Privacidade:** query usa userId fechado; nao expoe dados cruzados.
2. **Usuario com 1 conversa:** top all-time = top recent = mesma tool. Dedup
   sobra 1; preenchimento completa com fallback.
3. **Tool sem template no map:** filtrar; nao causa string vazia.
4. **Channel:** filtra por canal? V1 nao, agrega todos os canais (bubble +
   whatsapp). Decisao consciente: comportamento e do usuario, nao do canal.
5. **Performance em prod com 10k usuarios:** query unica, parametrizada,
   roda em milissegundos. Cache Redis cobre rajada. OK.
6. **Sanitizacao:** tool_name vem do proprio sistema (ids do catalogo),
   nao do usuario; nao precisa sanitize. Templates sao constantes.

## Double-check (review #2 inline)
1. **Stale cache vs new turn:** invalidar Redis na hora de inserir mensagem
   com tool_calls (worker do agente). TTL 5min como safety net.
2. **Layout fetches no carregamento; usuario abre bubble 1h depois:**
   stale ok; bubble nao re-fetcha. Aceito na v1; v2 pode adicionar lazy
   fetch no openComplete.
3. **Erro silencioso na Server Action:** layout passa array vazio se a
   action falhar; chat-panel cai no fallback curado. Sem tela quebrada.

## Definition of Done
- `pnpm tsc --noEmit && pnpm jest src/lib/agent/personalized-suggestions` verde.
- Login novo (sem historico): bubble mostra catalogo curado.
- Login com >= 10 turnos: bubble mostra pelo menos 1 sugestao reflectindo
  a tool mais usada.
- Manual: abrir bubble, conferir que sugestoes mudam apos uma nova rodada
  (com TTL Redis ou refresh da pagina).

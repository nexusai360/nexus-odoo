# Agente Nex Inteligência — Design

> Data: 2026-05-25. Autor: claude-agente-nex-inteligencia. Branch: `feat/agente-nex-inteligencia`.
> **Status: v3** (pós Review #2 — `reviews/2026-05-25-inteligencia-review-2.md`).
> Esta é a versão canônica que entra para o PLAN.

## Versionamento

- **v1**: rascunho inicial. 24 achados na review #1.
- **v2**: aplicou F1–F24 da review #1. 26 achados na review #2.
- **v3** (este): aplica G1–G26. Resumo total no §Apêndice B.

## 1. Sumário executivo

A plataforma já tem ≥ 6.000 conversas e ≥ 10.600 chamadas LLM acumuladas no Agente Nex. Esse
acervo é matéria-prima rica que hoje não está sendo aproveitada para aperfeiçoar o agente. Esta
entrega transforma o acervo em ciclo de melhoria contínua e, ao mesmo tempo, eleva a qualidade
da experiência de chat em três dimensões observáveis pelo usuário.

Quatro frentes integradas. Cada uma entrega valor independente; todas compartilham a mesma
fundação de dados.

| Frente | Entrega visível | Entrega interna |
|---|---|---|
| A. Análise retrospectiva | Painel `/agente/inteligencia` com relatórios | Dataset rotulado + recomendações de prompt |
| B. Welcome personalizado | Chips iniciais refletem perfil do usuário | `UserAgentProfile` mantido por cron BullMQ |
| C. Continuidade contextual | Chips pós-resposta entendem últimos 5 pares | `ContextualSuggester` com dedup semântico |
| D. Bullets → chips | Perguntas da IA nunca aparecem no corpo; só nas chips (até 7) | Consolidação do extrator existente |

A entrega é faseada em **quatro ondas** (§10). Onda 1 monta fundação de dados; ondas 2 a 4
entregam as frentes A, B, C+D respectivamente.

## 2. Contexto e motivação

### 2.1 Estado atual do Agente Nex

- **Welcome (chips iniciais)**: `src/lib/agent/welcome-suggestions.ts`, lista estática derivada
  do perfil do agente (não do usuário). Igual para todos.
- **Chips pós-resposta**: `src/lib/agent/suggestions-extractor.ts` + `enhance-chips.ts`.
  Promove bullets-pergunta para chips (cap 7) mas:
  - A regra cap-3-vs-cap-7 não é canônica; é coincidência do que o extrator devolve.
  - Não considera histórico (não evita caminhos já trilhados).
  - Sugestões podem não fazer sentido no contexto.
- **Qualidade das respostas**: não medida sistematicamente. 6 k conversas no banco, não revisitadas.
- **Personalização**: nenhuma.

### 2.2 Pergunta de negócio

> Como tornar o Agente Nex mais inteligente, mais preciso e mais útil para cada usuário,
> usando o que já existe no banco?

Duas direções: **retroativa** (aprende com as 6 k conversas) e **prospectiva** (adapta a
experiência ao histórico do usuário e ao contexto da conversa atual).

## 3. Frente A — Análise retrospectiva de qualidade

### 3.1 Objetivo

Para cada turno do agente (ou amostragem dele), produzir uma avaliação automática rotulada
que responde:

1. A resposta atendeu o que o usuário perguntou?
2. As tools usadas eram as adequadas?
3. Há padrões de falha?

A saída alimenta recomendações concretas de melhoria do prompt-mestre (`identity-base.ts` +
`compose.ts`), revisadas por humano antes de virarem mudança.

### 3.2 Dados de entrada

Origem: `Conversation`, `Message`, `LlmUsage` (já no schema; `LlmUsage.toolCallsCount`
+ `toolNames[]` em 2026-05-25 19:48 por `claude-consumo-nex-polish`).

**Inspeção de `Message.toolCalls`** (Onda 1, task de descoberta): hoje é `Json?` sem schema
declarado. Antes da Onda 2, a equipe valida o que está gravado:

- Se contém `result`: ótimo.
- Se só `name + args`: adiciona coluna `Message.toolResults Json?` na Onda 1 e instrumenta
  `run-agent.ts` para gravar resultados a partir daí.
- Conversas anteriores ao instrument: nulo. Juiz marca `original_result_missing` e avalia
  3 das 4 dimensões.

**Normalização cross-provider** (Onda 1): os 4 adapters serializam tool history em formatos
diferentes (OpenAI Responses items, OpenAI ChatCompletions, Anthropic content blocks, Gemini
parts, OpenRouter mix). O módulo `src/lib/agent/intelligence/normalize-tool-history.ts`
recebe o `Message.toolCalls` raw e devolve formato canônico:

```ts
type NormalizedToolCall = { name: string; args: Record<string, unknown>; result?: unknown };
type NormalizedToolHistory = NormalizedToolCall[];
```

Cobertura de testes unitários: 1 fixture por formato (5 fixtures, 5 testes).

### 3.2.1 Gate temporal entre Onda 1 e Onda 2

Como `toolResults` só é gravado a partir da Onda 1 deployada, a Onda 2 precisa esperar
acumular ≥ **100 turnos pós-instrumentação** antes de rodar. O script
`analyze-conversations.ts` verifica essa contagem na primeira chamada e aborta com erro
amigável se ainda não tiver. Reportado em `/agente/inteligencia` como banner durante
o período de acumulação.

### 3.2.2 Amostragem estratificada por data + tópico + modelo

```
[Conversation set]
     │
     ▼
[Particiona em buckets (topicTag_primário, modelo, era)]
   era: "pre_instrument" (sem toolResults) vs "post_instrument" (com)
     │
     ▼
[Sample por bucket]
   bucket_sample = clamp(ceil(bucket_size * ratio), 1, 200)
   ratio: --sample CLI (default 0.05)
     │
     ▼
[Mistura 50/50 entre eras]
   Garante representatividade de ambas, mesmo se pre >> post.
```

Implementação no `analyze-conversations.ts`. Reportar no UI a cobertura por era:
"Avaliações com `correcaoFactual`: 52 % · sem (pré-instrumentação): 48 %".

### 3.3 Pipeline

```
[Conversation set]
     │
     ▼
[Stratified sample] ── (onda 2: 5 %; expansão futura: 25 %, 100 %)
     │
     ▼
[Replay loader] ── lê Message + LlmUsage + toolResults
     │
     ▼
[Tool re-executor]  ── REPRODUZ tools de leitura sob service account com
     │                  privilégio elevado (NÃO encarna usuário; resultado nunca
     │                  vai ao front; audit log com actor=system:quality-judge)
     │                  Output: { divergence: 0..1 } — informativo, não pontua a IA
     ▼
[LLM Judge] ── Gemini 2.5 Pro thinking (default) ou Opus 4.7 (configurável)
     │         entrada: pergunta, resposta, tool calls + resultados (originais e atuais)
     │         saída: rubrica 1-5 em 4 dims + razões + recomendação
     ▼
[Persist] ── ConversationQualityEvaluation (1 row por assistant message)
     │
     ▼
[Aggregations] ── relatórios por tópico, tool, modelo, usuário
     │
     ▼
[UI /agente/inteligencia] ── admin/super_admin
```

### 3.4 Rubrica do juiz

Quatro dimensões, escala 1-5 (1 = ruim, 5 = excelente):

| Dimensão | O que mede | Origem |
|---|---|---|
| `aderencia` | A resposta atende o que foi perguntado (sem desvio)? | LLM judge |
| `correcaoFactual` | A resposta é coerente com o **resultado original** da tool registrado no turno (não com a re-execução de hoje) | LLM judge. `n/a` quando `original_result_missing`. |
| `escolhaDeTools` | A IA escolheu a tool certa? Usou tools demais/de menos? | LLM judge |
| `clareza` | Resposta clara, sem jargão desnecessário, bem estruturada? | LLM judge |

Campo livre `recomendacaoPrompt`: o juiz sugere mudança específica no prompt-mestre quando
identifica padrão. Recomendações são agregadas para revisão humana (§3.8).

Campo informativo separado `toolsReexecuted` (JSON): re-execução de hoje × resultado original.
Divergência > 0 sinaliza migração de dado ou bug de tool — **não pontua a IA**.

### 3.5 Re-execução de tools — autenticação e callsite

Decisão: o `tool-replayer` roda como **service account com privilégio elevado** (bypass de
`UserDomainAccess`). Justificativa: o juiz precisa ver o dado para avaliar; o resultado nunca
vai ao usuário final.

**Callsite**: o replayer importa as funções diretas em `src/lib/reports/queries/**`
(NÃO chama o HTTP do servidor MCP). Razões: evita dependência de o container MCP estar
rodando; remove overhead HTTP; deixa o pipeline rodável standalone.

**Audit log**: cada replay grava em `audit_logs` com `action="QUALITY_JUDGE_TOOL_REPLAY"`,
`actorType="system"`, `actorId="quality-judge"`. Reaproveita tabela existente.

Apenas tools `read:*` são reproduzíveis. Tools `write:*` são puladas no replay (não existem
chamadas write registradas fora da F4 Onda 2 — verificado).

### 3.5.1 Cap por execução (custo controlado)

O script `analyze-conversations.ts` aceita `--max-cost-usd <N>` (default **$50**). Antes
de cada call ao juiz, estima `tokens × preço` e acumula. Quando passar do cap, pausa e
pede confirmação CLI:

```
Cost cap reached ($50.00). Continue? [y/N/raise]
```

Resposta `raise` permite informar novo cap interativamente. Sem cap, o script aborta no
primeiro estouro.

### 3.6 Custo realista

10.600 turnos no banco. Amostragem Onda 2: **5 % = 530 turnos**.

- Entrada por turno: ~4 k tokens (msg user + msg assistant + tool calls + resultados + rubrica).
- Saída por turno: ~400 tokens.

| Modelo | Input $/Mtok | Output $/Mtok | Custo/turno | Custo Onda 2 (530 turnos) |
|---|---|---|---|---|
| Opus 4.7 | $15 | $75 | $0.09 | ~$48 |
| Gemini 2.5 Pro thinking | $2.50 | $15 | $0.016 | **~$8** |

**Decisão**: usar Gemini 2.5 Pro thinking por padrão (`AgentSettings.qualityJudgeModel = "gemini-2.5-pro-thinking"`).
Configurável para Opus 4.7 quando admin quiser revisão mais profunda.

Pré-filtro com modelo barato (Haiku 4.5) é **follow-up** — não entra na onda 2; só se Gemini
mostrar limitação de qualidade.

### 3.7 UI `/agente/inteligencia`

Acesso: `admin` e `super_admin` (RBAC via NextAuth + check no `layout.tsx` da rota nova).

Navegação:
- Sidebar (`src/components/layout/sidebar.tsx`): nova entry "Inteligência" sob "Agente Nex",
  visível só para `admin`/`super_admin`.
- Breadcrumb: `Agente Nex > Inteligência` (segue padrão de `/agente/consumo`).

Conteúdo (definição visual passa por `ui-ux-pro-max` antes do PLAN — exigência do projeto):

- **KPIs**: médias por dimensão, distribuição 1-5, total avaliado, **cobertura por era**
  ("com `correcaoFactual`: X% · sem: Y%").
- **Top 10 padrões de falha** (clusterizados por embedding da `recomendacaoPrompt`).
- **Conversas com pior aderência** (drill-down em conversa específica).
- **Recomendações pendentes**: tabela com aceitar/rejeitar/needs_more_review.
- **Filtros**: período, tópico, modelo, usuário.

### 3.7.1 Scope de visibilidade

O painel mostra apenas avaliações cujas conversas pertencem a usuários dentro do
**domínio do admin logado** (via `UserDomainAccess`). Super-admin vê tudo. Admin de domínio
A não vê conversas de usuários de domínio B — protege trechos de mensagem que possam vir
no `razoes`/`recomendacaoPrompt`.

Implementação: query do painel faz `JOIN` com `users` + `user_domain_access` e filtra.

### 3.8 Fluxo de recomendações → mudança de prompt

1. Juiz grava `recomendacaoPrompt` em cada `ConversationQualityEvaluation`.
2. UI agrupa recomendações similares (cosine > 0.85 do embedding do texto da recomendação).
3. Cada cluster mostra: contagem, exemplos, sugestão consolidada.
4. Admin clica `[Aceitar]` → registro em tabela `PromptRecommendation` com status `accepted`.
5. **O PR real no `identity-base.ts` é manual** (escrito por humano ou em sessão Claude futura).
   Automação fica para follow-up.

Outras ações: `[Rejeitar]` (marca rejected, não aparece mais), `[Precisa mais review]` (mantém
pendente). Nenhuma ação muda o prompt automaticamente.

## 4. Frente B — Welcome personalizado

### 4.1 Objetivo

Chips iniciais deixam de ser estáticas e passam a refletir o que o usuário de fato pergunta.

### 4.2 `UserAgentProfile`

Tabela nova. Um registro por usuário, atualizado por cron BullMQ.

| Campo | Tipo | Descrição |
|---|---|---|
| `userId` | `String @id @db.Uuid` | FK para `User`. |
| `topTopics` | `Json` | `[{topic, score, lastSeenAt}]` ordenada por score (recência × freq). |
| `topKeywords` | `Json` | `[{keyword, score}]`. |
| `preferredDomains` | `String[]` | Domínios de negócio mais consultados. |
| `messageCount` | `Int @default(0)` | Total de mensagens do usuário. |
| `lastInteractionAt` | `DateTime?` | Última atividade. |
| `profileBuiltAt` | `DateTime?` | Quando recalculado. |
| `version` | `Int @default(1)` | Versão do algoritmo. |

### 4.3 Pipeline (assíncrono, off-critical-path)

- **Trigger A**: cron BullMQ `agent-profile-build` diário às **04:30** (entre snapshot 30min
  e reconcile 24h; sem colisão).
- **Trigger B**: a cada 10 novas mensagens do usuário, enfileira job ad-hoc.
- **Deduplicação concorrente**: BullMQ `jobId = "profile-build:${userId}"` único — jobs
  redundantes são absorvidos. Garante que o cron e o on-demand nunca rodem em paralelo
  para o mesmo usuário (race em UPDATE evitada).

```
[Trigger]
     │
     ▼
[Read messages userId (últimos 90 dias, cap 500)]
     │
     ▼
[Topic extractor] ── Haiku 4.5 (default) ou config em AgentSettings.intelligenceModel
     │                 classifica (topic, domain, keywords) por mensagem
     ▼
[Aggregate] ── soma; decaimento exponencial por idade (half-life 30 dias)
     │
     ▼
[Persist UserAgentProfile]
```

Custo: ~200 input tokens × Haiku $0.80/Mtok = **fração de centavo por mensagem nova**.

### 4.4 Geração das chips de welcome

`welcome-suggestions.ts` passa a:

1. Ler `UserAgentProfile` do usuário (cache local 10 min).
2. Se existir e `messageCount >= 5`: gera chips via template + `topTopics`.
3. Se não existir (usuário novo): fallback à lista estática atual.
4. **Mistura anti-filter-bubble**:
   - `N = maxSuggestions`.
   - Se `N == 1`: 1 do perfil, 0 descoberta.
   - Se `N >= 2`: `descoberta = max(1, floor(N/3))`; `perfil = N - descoberta`.
   - Exemplos: `N=3 → 2 perfil + 1 descoberta`; `N=6 → 4 perfil + 2 descoberta`; `N=2 → 1 + 1`.
5. Sempre respeita `AgentSettings.suggestionsCheckpoint` (OFF → nenhuma chip) **e**
   `AgentSettings.intelligenceCheckpoint` (OFF → fallback estático mesmo se perfil existir).

### 4.5 Telemetria

Cada chip gerada grava `SuggestionInteraction { action: "impressed", chipSource: "welcome" }`.
Clique grava `action: "clicked"`. **Dismissal não é gravado direto** (detectar sessão expirada
via beforeunload é frágil). Computa-se derivado em relatório:
`dismissed = impressed - clicked`.

Enum final de `action`: `impressed | clicked | dedup_dropped | fallback_timeout`.

## 5. Frente C — Sugestões de continuidade contextuais

### 5.1 Objetivo

Após cada resposta, gerar 3 chips de continuidade que (a) façam sentido como próximo passo,
(b) não repitam caminhos já trilhados nos últimos 5 turnos, (c) sugiram aprofundamento,
comparação, agregação ou pivô.

### 5.2 Pipeline

```
[Resposta entregue, evento "message_done"]
     │
     ▼
[Frente D primeiro] ── bullets-pergunta extraídos do corpo?
     │                  SIM: viram chips (cap até 7), pular gerador LLM.
     │                  NÃO: prossegue para ContextualSuggester.
     ▼
[ContextualSuggester]
     │  - entrada: últimos 5 pares + UserAgentProfile + agentSettings
     │  - LLM barato (Haiku 4.5), reasoningEffort = undefined
     │  - prompt embutido pede 3 sugestões distintas
     │  - timeout ADAPTATIVO: 2 s 1ª chamada da sessão; 4 s se anterior > 1.5 s
     │  - keep-alive ping ao provider a cada 5 min (worker) para reduzir cold start
     ▼
[Semantic dedup]
     │  - embedding text-embedding-3-small (1536 dim) — provider OpenAI/já usado em F5 RAG
     │  - threshold cosine 0.88 (mais conservador que 0.85)
     │  - override: se duas chips usariam tools diferentes, NÃO dedup
     │  - chip descartada gera SuggestionInteraction { action: "dedup_dropped" } para calibrar
     ▼
[Degradação graceful]
     │  - se timeout 2 s estourar: devolve as chips do suggestions-extractor (existente)
     │  - se LLM erro: idem
     ▼
[SuggestionsBar UI]
```

### 5.3 Storage de embeddings

NÃO persiste embedding por chip (volume alto, custo de storage). Computa on-the-fly por
sessão. Cache em memória no servidor pelo ciclo de vida da requisição.

Custo por geração: ≤ 8 embeddings × 50 tok × $0.02/Mtok ≈ **fração de centavo**.

### 5.4 Callsite e segurança da API contextual

`chat-panel.tsx` invoca via fetch `/api/agent/suggest-continuation` no callback `onMessageDone`.
Endpoint novo em `src/app/api/agent/suggest-continuation/route.ts`.

**Proteções obrigatórias** (todas implementadas no `route.ts`):

| Risco | Mitigação |
|---|---|
| Atacante chama loop infinito | Rate limit 30 req/min por usuário (`src/lib/security/rate-limit.ts`, já existe F5) |
| Pede continuação de conversa alheia | `conversation.userId === session.userId` ou 403 |
| Sem auth | NextAuth obrigatório; 401 sem sessão |
| LLM grátis para abusos | Soft cap por usuário por dia: 500 chamadas (`SuggestionInteraction count`) |

### 5.5 Definição canônica de "par"

`conversation.ts:getLastNPairs(conversationId, n=5)`:

- Um **par** é `{userMessage, finalAssistantMessage}`.
- `finalAssistantMessage` é a última `Message` com `role = 'assistant'` cujo `toolCalls`
  é `null` OU `[]` (resposta de fato, não turno intermediário de tool call).
- Mensagens com role `tool` ou `assistant` intermediárias (tool call não vazio) **não contam**
  como par; são contexto interno.
- Retorno: array em ordem cronológica DESC, até `n` pares.

## 6. Frente D — Bullets-pergunta → chips (consolidação)

### 6.1 Estado atual

Já existe (commits `0c2e7f1`, `a69f6df`, `782bc24`; HISTORY 2026-05-25 04:30). Extrator
em `suggestions-extractor.ts` promove bullets-pergunta para chips (cap 7).

### 6.2 Lacunas a fechar

1. **Regra do cap dinâmico (canônica)**:
   ```
   N = AgentSettings.maxSuggestions             # default 3
   B = qtde de bullets-pergunta extraídas
   C = qtde de sugestões contextuais geradas (após dedup)
   slots_finais = min(7, max(N, B))
   chips = bullets[0..B] + contextuais[0..(slots_finais - B)]
   ```
   - `B == 0`: só contextuais, até `N`.
   - `0 < B < N`: completa com contextuais para chegar a `N`.
   - `B >= N`: cresce até `min(B, 7)`. Sem dedup entre bullets e contextuais (bullets vencem).
2. **Bullets-pergunta ainda aparecem no corpo em alguns formatos**. Regra canônica:
   se a IA precisa perguntar, escreve as perguntas como bullets `- pergunta?` no fim da
   resposta — e o servidor as **remove do corpo** ao mesmo tempo que as promove para chips.
3. **Diretiva precisa estar em `compose.ts`, não só `identity-base.ts`**. O `identityBase`
   do banco sobrescreve o default (lição 2026-05-25 07:10 — commit `ed32e2e`). A onda 4
   appendará a diretiva diretamente em `compose.ts` após a seção "## Comportamento",
   garantindo execução mesmo com `identity_base` populado no banco.
4. **Respeito a `suggestionsCheckpoint`**: quando OFF, NÃO promove bullets para chips —
   mantém no corpo (assumindo que admin desligou sugestões a propósito).

## 7. Modelo de dados (Prisma) — corrigido

### 7.1 Novos models

> Notas: PKs UUID seguem padrão de `User`/`Conversation`. FKs com `onDelete: Cascade` para
> garantir limpeza em delete de usuário (LGPD).

```prisma
model UserAgentProfile {
  userId              String   @id @db.Uuid
  topTopics           Json     @default("[]")  // [{topic, score, lastSeenAt}]
  topKeywords         Json     @default("[]")
  preferredDomains    String[] @default([])
  messageCount        Int      @default(0)
  lastInteractionAt   DateTime?
  profileBuiltAt      DateTime?
  version             Int      @default(1)

  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([lastInteractionAt])
  @@map("user_agent_profiles")
}

model ConversationQualityEvaluation {
  id                  String   @id @default(uuid()) @db.Uuid
  conversationId      String   @db.Uuid
  assistantMessageId  String   @unique @db.Uuid
  judgeModel          String
  judgeVersion        String
  aderencia           Int?     // 1-5, null se n/a
  correcaoFactual     Int?     // 1-5, null se original_result_missing
  escolhaDeTools      Int?     // 1-5
  clareza             Int?     // 1-5
  razoes              String   @db.Text
  recomendacaoPrompt  String?  @db.Text
  recomendacaoEmbedding Unsupported("vector(1536)")?  // para clustering — SQL raw na migration
  toolsReexecuted     Json?    // {tools: [{name, originalArgs, originalResult, newResult, divergence}]}
  flags               String[] @default([])  // ["original_result_missing", "tool_diverged", ...]
  reviewedByHumanAt   DateTime?
  reviewedBy          String?  @db.Uuid
  reviewerDecision    String?  // accepted | rejected | needs_more_review
  createdAt           DateTime @default(now())

  conversation        Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([aderencia])
  @@index([reviewerDecision])
  @@map("conversation_quality_evaluations")
}

model PromptRecommendation {
  id              String   @id @default(uuid()) @db.Uuid
  clusterKey      String   @unique  // hash do conteúdo consolidado para idempotência
  consolidatedText String  @db.Text
  occurrences     Int      @default(1)
  status          String   @default("pending")  // pending | accepted | rejected | needs_more_review
  decidedAt       DateTime?
  decidedBy       String?  @db.Uuid
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([status])
  @@map("prompt_recommendations")
}

model SuggestionInteraction {
  id              String   @id @default(uuid()) @db.Uuid
  userId          String   @db.Uuid
  conversationId  String?  @db.Uuid
  chipText        String   @db.Text
  chipSource      String   // welcome | contextual | bullet_extracted
  action          String   // impressed | clicked | dedup_dropped | fallback_timeout
  createdAt       DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([chipSource, createdAt])
  @@map("suggestion_interactions")
}
```

### 7.2 Mudanças em models existentes

```prisma
model Conversation {
  // ... campos existentes ...
  topicTags           String[] @default([])  // ex: ["estoque", "produto:mola_espiral"]; cap 5
  topicTagsVersion    Int      @default(0) @map("topic_tags_version")  // versão do algoritmo; força re-tag quando incrementar
  topicTagsAt         DateTime? @map("topic_tags_at")  // quando foi tagueado
  // ...
}

model Message {
  // ... campos existentes ...
  toolResults         Json?    @map("tool_results")  // se o ínstrument já gravar resultados; null em mensagens antigas
  // ...
}

model AgentSettings {
  // ... campos existentes ...
  intelligenceModel        String?  @map("intelligence_model")        // tópico/perfil; null = Haiku 4.5
  qualityJudgeModel        String?  @map("quality_judge_model")       // null = Gemini 2.5 Pro thinking
  intelligenceCheckpoint   FeatureCheckpoint @default(OFF) @map("intelligence_checkpoint")
}
```

`intelligenceCheckpoint` controla as três frentes "ativas" (B, C, D — welcome personalizado,
contextuais, bullets→chips). Frente A é admin only e respeita `super_admin` + `admin`
sem checkpoint próprio (sempre disponível para roles autorizadas, mas execução do batch
é manual via script CLI).

### 7.3 Migration

`prisma/migrations/20260525210000_agente_nex_inteligencia/migration.sql`:

- `CREATE TABLE user_agent_profiles ...` (`IF NOT EXISTS`).
- `CREATE TABLE conversation_quality_evaluations ...`.
- `CREATE TABLE prompt_recommendations ...`.
- `CREATE TABLE suggestion_interactions ...`.
- `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS topic_tags TEXT[] DEFAULT '{}'::text[]`.
- `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS topic_tags_version INTEGER NOT NULL DEFAULT 0`.
- `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS topic_tags_at TIMESTAMP`.
- `ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_results JSONB`.
- `ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS intelligence_model TEXT`.
- `ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS quality_judge_model TEXT`.
- `ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS intelligence_checkpoint feature_checkpoint NOT NULL DEFAULT 'OFF'`.
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN IF NOT EXISTS recomendacao_embedding vector(1536)`.
- **GRANT SELECT** para `nexus_mcp` e `nexus_mcp_bi` em todas as 4 tabelas novas
  (regra de raiz aprendida em `fato_produto_canonica`, HISTORY 2026-05-25 17:15).
- `DO $$ ... $$` para roles eventualmente inexistentes (dev sem RBAC).

## 8. Arquitetura — onde mora o quê

```
src/lib/agent/intelligence/                  (NOVO)
├── profile-builder.ts
├── topic-extractor.ts
├── quality-judge.ts
├── tool-replayer.ts
├── normalize-tool-history.ts                  // canoniza Message.toolCalls dos 4 adapters
├── contextual-suggester.ts
├── semantic-dedup.ts
├── recommendation-clusterer.ts                // usa prisma.$queryRaw para vetor pgvector
├── reasoning-effort-policy.ts                 // política por caller: extractor/judge/suggester
└── index.ts

src/lib/agent/welcome-suggestions.ts         (EDITADO: consome UserAgentProfile)
src/lib/agent/suggestions-extractor.ts       (PRESERVADO; cap dinâmico cabeado no consumidor)
src/lib/agent/enhance-chips.ts               (EDITADO: cap dinâmico 3 vs 7)
src/lib/agent/run-agent.ts                   (EDITADO: enfileira job de tagging assíncrono;
                                                       grava toolResults; NÃO altera fluxo
                                                       de reasoningHistory/LlmUsage)
src/lib/agent/conversation.ts                (EDITADO: helper getLastNPairs)
src/lib/agent/llm/identity-base.ts           (EDITADO: diretiva bullet-pergunta no default)
src/lib/agent/llm/compose.ts                 (EDITADO: APPEND da diretiva após "## Comportamento",
                                                       robusto a identityBase do banco)

src/worker/jobs/agent-intelligence/          (NOVO; sem ":" nos nomes de queue)
├── topic-tagging.ts                          // queue: agent-topic-tagging
├── profile-build.ts                          // queue: agent-profile-build
├── intelligence-cleanup.ts                   // queue: agent-intelligence-cleanup (TTL 90d)
└── index.ts
src/worker/index.ts                          (EDITADO: registra as 3 queues)

scripts/
├── analyze-conversations.ts                 (NOVO: pnpm analyze:conversations [--sample 0.05])
├── backfill-topic-tags.ts                   (NOVO: pnpm intelligence:backfill-tags)
└── build-user-profiles.ts                   (NOVO: pnpm intelligence:build-profiles)

src/app/(protected)/agente/inteligencia/     (NOVA tela)
├── layout.tsx                                // guard RBAC admin/super_admin
├── page.tsx
├── kpis.tsx
├── failure-patterns.tsx
├── recommendations-table.tsx
└── conversation-drilldown.tsx
src/app/api/agent/suggest-continuation/route.ts  (NOVA rota)

src/components/agent/
├── suggestions-bar.tsx                      (EDITADO: cap dinâmico + telemetria impressed/click)
└── chat-panel.tsx                           (EDITADO: cabeia /suggest-continuation no onMessageDone)
src/components/layout/sidebar.tsx            (EDITADO: entry "Inteligência" para admin/super_admin)
```

## 9. Checkpoints, RBAC, privacidade

### 9.1 Respeito a checkpoints existentes

- `suggestionsCheckpoint = OFF` → nem welcome, nem contextual, nem bullets→chips.
- `suggestionsCheckpoint = PLAYGROUND` → só nas sessões de playground; produção continua sem.
- `intelligenceCheckpoint` (novo) controla as **frentes B/C/D ativas**. Frente A é
  admin-driven via script CLI; não tem checkpoint runtime.

### 9.2 RBAC

- `/agente/inteligencia` — guard `layout.tsx` checa role ∈ {admin, super_admin}.
- `tool-replayer` — service account com privilégio elevado; audit log `actor=system:quality-judge`.
- API `/api/agent/suggest-continuation` — protegida pela sessão NextAuth do usuário.

### 9.3 Privacidade / LGPD

- `UserAgentProfile` guarda derivados (tópicos, keywords). Nenhuma frase do usuário em texto bruto.
- `SuggestionInteraction.chipText` é o texto da chip (gerada pelo sistema), não a mensagem do usuário.
- `ConversationQualityEvaluation` guarda razões do juiz + recomendação — eventualmente pode
  conter trechos de mensagens do usuário em texto. Documentado no §LGPD do projeto. Exclusão
  em cascade quando `Conversation` é deletada.
- Pipeline de exclusão de usuário (já existente) deleta `UserAgentProfile` em cascade.

### 9.4 TTL

- `SuggestionInteraction`: TTL 90 dias. Cron `agent-intelligence-cleanup` semanal.
- `ConversationQualityEvaluation`: sem TTL (matéria histórica de auditoria).
- `PromptRecommendation`: sem TTL.

## 9.5 Política de reasoningEffort por chamada interna

As chamadas LLM internas desta entrega **não** usam `AgentSettings.reasoningEffort` (esse
controla o agente principal de chat, não as chamadas backend de intelligence).

| Caller | Modelo padrão | `reasoningEffort` | Justificativa |
|---|---|---|---|
| `topic-extractor` | Haiku 4.5 | `undefined` | Haiku não suporta reasoning; tarefa simples |
| `contextual-suggester` | Haiku 4.5 | `undefined` | Idem |
| `quality-judge` | Gemini 2.5 Pro thinking | `"high"` | Ponto da feature: julgar com profundidade |

Centralizado em `reasoning-effort-policy.ts` para evitar deriva.

## 10. Decomposição em ondas

### Dependências entre ondas

- **Onda 1 bloqueia 2, 3 e 4** (schema é pré-requisito de tudo).
- Ondas 2, 3 e 4 são **logicamente paralelas** após a 1. Onda 2 tem gate adicional: ≥ 100
  turnos pós-instrumentação acumulados.
- Recomendação prática: **serial 1 → 2 → 3 → 4** para reduzir conflito multi-agente. PLAN
  documenta a possibilidade de paralelizar 2/3/4 se necessário.

### Onda 1 — Fundação (schema + telemetria + tagging assíncrono)

Sem mudança visível ao usuário. Banco e fluxo backend preparados.

Tasks:
1. Migration `20260525210000` (4 tabelas + colunas + GRANTs). **Antes**: listar
   `prisma/migrations/` para confirmar que o timestamp não colide; ajustar se preciso.
2. Schema Prisma regenerado.
3. Inspeção de `Message.toolCalls` (script de descoberta) — confirma o que está gravado em
   cada um dos 4 formatos de adapter.
4. `normalize-tool-history.ts` + 5 testes (1 por formato: OpenAI Responses, OpenAI ChatComp,
   Anthropic blocks, Gemini parts, OpenRouter).
5. Instrumentação em `run-agent.ts`: grava `toolResults` em `Message`. **Não toca**
   `reasoningHistory`, `LlmUsage`, nem o formato existente de `toolCalls`.
6. `topic-extractor.ts` (Haiku 4.5; cap 5 tags por mensagem).
7. Job `agent-topic-tagging` (BullMQ, sem `:` no nome): consome `{ conversationId }`;
   roda na 1ª mensagem **e re-roda a cada 10 mensagens novas** (`Conversation.messageCountAtLastTag`
   sentinel — calculado a partir de `messages` joined). Append-mescla tags, dedup, cap 5.
   `topicTagsVersion = 1` gravado.
8. `run-agent.ts` enfileira o job **após** terminar o turno (não no caminho crítico).
9. `conversation.ts: getLastNPairs(conversationId, n=5)` com definição canônica de "par"
   (§5.5).
10. `reasoning-effort-policy.ts` com a tabela do §9.5.
11. Testes: topic-extractor (mock LLM), getLastNPairs (fixtures cobrindo conversa com tool
    calls intermediários), job idempotente.
12. Rebuild de containers: schema mudou → **app + mcp + worker** (CLAUDE.md §2.1).

Critério de done: migration aplicada; conversas novas/retomadas ganham `topicTags` em
background dentro de 30 s; re-tag funciona a cada 10 msgs; `normalize-tool-history` cobre
os 5 formatos; testes verdes; containers rebuildados.

### Onda 2 — Análise retrospectiva

Entrega visível: tela `/agente/inteligencia` com KPIs reais sobre amostra de 5 %.

**Gate**: só inicia quando ≥ 100 mensagens com `toolResults != null` acumuladas (verificável
via `SELECT COUNT(*) FROM messages WHERE tool_results IS NOT NULL`).

Tasks:
0. **ui-ux-pro-max** primeiro — mockups da tela ficam em
   `docs/superpowers/specs/2026-05-25-inteligencia-ui-mockups.md`; PLAN aponta para ele.
1. `tool-replayer.ts` — import direto de `src/lib/reports/queries/**`; service account;
   pula `write:*`; grava `audit_logs { action: "QUALITY_JUDGE_TOOL_REPLAY" }`.
2. `quality-judge.ts` — default Gemini 2.5 Pro thinking, `reasoningEffort="high"`;
   configurável via `AgentSettings.qualityJudgeModel`.
3. `recommendation-clusterer.ts` — `prisma.$queryRaw` com pgvector KNN; reusa helpers de
   embed do RAG F5 se viáveis.
4. Script `analyze-conversations.ts` (CLI):
   - `--sample 0.05` (default).
   - `--max-cost-usd 50` (default; pausa para confirmação ao atingir).
   - Amostragem estratificada (§3.2.2): buckets `(topicTag, modelo, era)`, mistura 50/50
     pre/post instrument, cap 200 por bucket.
   - Reporta cobertura por era no fim.
5. Script `backfill-topic-tags.ts` — idempotente, processa as 6 k conversas via fila
   BullMQ.
6. Tela `/agente/inteligencia/*` — layout com RBAC guard, page, KPIs (incluindo cobertura
   por era), failure-patterns, recommendations-table, conversation-drilldown.
7. Sidebar entry sob "Agente Nex > Inteligência", visível só admin/super_admin.
8. **Scope da query do painel**: filtra por `users.platformRole` + `UserDomainAccess` do
   admin logado (§3.7.1).
9. Testes: tool-replayer (mock tool, mock import), quality-judge (mock LLM), clusterer
   (mock vector), página renderiza com seed; smoke test com `intelligenceCheckpoint=OFF`
   confirmando que tela ainda renderiza (a frente A é admin-only, não passa pelo checkpoint).
10. Verificação E2E real: gate de 100 turnos passou; `pnpm analyze:conversations --sample
    0.02 --max-cost-usd 5` em DB local; conferir avaliações geradas; abrir tela; revisar
    5 recomendações manualmente; auditar `audit_logs` ter `QUALITY_JUDGE_TOOL_REPLAY`.

Critério de done: ≥ 300 avaliações no banco local; UI mostra KPIs reais com cobertura por
era; ≥ 1 recomendação revisada e marcada; audit log presente.

### Onda 3 — Welcome personalizado

Entrega visível: chips iniciais refletem perfil.

Tasks:
1. `profile-builder.ts` (decaimento exp half-life 30 dias).
2. Script `build-user-profiles.ts` (backfill 1x).
3. Job `agent-profile-build` (cron 04:30 + on-demand a cada 10 msgs). `jobId` único
   por `userId` para dedup concorrente.
4. `welcome-suggestions.ts` lê `UserAgentProfile` com fallback estático; aplica mistura
   anti-bubble (§4.4 regra completa).
5. Telemetria: `SuggestionInteraction { chipSource: "welcome", action: "impressed"|"clicked" }`.
6. Respeito a `suggestionsCheckpoint` + `intelligenceCheckpoint`.
7. Testes: profile-builder (fixtures), welcome-suggestions com/sem perfil, anti-bubble
   mix com N=1,2,3,6; checkpoint OFF retorna fallback estático.
8. Verificação E2E: meu usuário admin tem perfil; chips refletem meus tópicos; usuário
   novo segue fallback estático; telemetria gravando.

Critério de done: 100 % das chips welcome carregadas vêm do perfil para usuários com
≥ 5 mensagens; backfill rodou; tabela `suggestion_interactions` gravando.

### Onda 4 — Continuidade contextual + bullets→chips consolidado

Entrega visível: chips pós-resposta entendem contexto; perguntas da IA nunca no corpo.

Tasks:
1. `contextual-suggester.ts` (LLM Haiku 4.5; timeout adaptativo 2/4 s; keep-alive ping
   no worker; degradação graceful via `suggestions-extractor` legado).
2. `semantic-dedup.ts` — embed `text-embedding-3-small` (reusa credencial F5 RAG);
   cosine 0.88; override "tools-differ → não dedup"; log dedup descartado via
   `SuggestionInteraction { action: "dedup_dropped" }`.
3. `enhance-chips.ts` — regra de cap dinâmico canônica (§6.2).
4. `identity-base.ts` — nova diretiva no default ("perguntas vão para chips").
5. `compose.ts` — APPEND da diretiva após "## Comportamento". Resistente a
   `AgentSettings.identityBase` populado no banco.
6. `chat-panel.tsx` — invoca `/api/agent/suggest-continuation` no `onMessageDone`.
7. Rota `src/app/api/agent/suggest-continuation/route.ts` — NextAuth, scope `userId`,
   rate limit 30/min, soft cap diário 500.
8. `suggestions-bar.tsx` — respeita cap dinâmico; grava `impressed`/`clicked`.
9. **2 testes** para "perguntas não vazam no corpo":
   - Unit: extractor recebe string com bullets-pergunta trailing; retorna `{cleanedBody, bullets}`.
   - Integration: run-agent simulado; `Message.content` gravado sem bullets E
     `/api/agent/suggest-continuation` retorna chips com eles.
10. Smoke tests:
    - `intelligenceCheckpoint=OFF` → endpoint retorna chips do extractor legado.
    - `suggestionsCheckpoint=OFF` → endpoint retorna `[]`.
11. Verificação E2E real: 10 conversas; bullets-pergunta nunca no corpo; chips contextuais
    ≤ 2 s (adaptativo); 1+ dedup descartado; logs gravados.

Critério de done: testes verdes (unit + integration + smoke); verificação E2E aprovada.

## 11. Verificação por onda

Toda onda passa por:

1. `pnpm tsc --noEmit` limpo.
2. `pnpm eslint src/ --max-warnings 0` (ou paridade com baseline atual).
3. `pnpm jest` na área tocada.
4. **Teste E2E contra dado real** (regra de raiz 2026-05-18): subir app + worker, fazer
   conversa real no `/agente`, conferir números/chips fazem sentido.
5. Rebuild dos containers afetados pelo mapa de impacto (CLAUDE.md §2.1).
6. `/gsd-code-review` antes de PR.
7. `/gsd-ui-review` quando a onda tocou UI (Ondas 2, 3, 4).

## 12. Compatibilidade com trabalho recente

Sessão `claude-nex-llm-adapters-modernization` (encerrada) modernizou run-agent com
`reasoningHistory`, `reasoningEffort`, checkpoint matrix, refactor dos 4 adapters.

Checklist obrigatório para esta entrega:

- [ ] **Não alterar** fluxo de `loadConversationReasoningHistory`/`saveConversationReasoningHistory`.
- [ ] **Não alterar** formato de `Message.toolCalls`. `toolResults` é coluna nova separada.
- [ ] **Não alterar** `LlmUsage` (já estendida por `claude-consumo-nex-polish`).
- [ ] Telemetria/instrumentação do tagging acontece **após** o turno terminar — fora do
      caminho síncrono crítico.
- [ ] Nada na onda 1 sobe ao MCP semântico (frentes B/C/D são UI/data-layer; F4 do MCP intacta).

## 13. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Custo do LLM judge mais alto que o esperado | Pré-filtro Haiku 4.5 como follow-up; cap por execução do script |
| Tool re-executor falha (tool mudou) | `divergence` é dado informativo; flag `tool_diverged` no eval |
| Perfil cria filter bubble | Mistura ⅔ perfil + ⅓ descoberta nas chips welcome |
| Dedup semântico descarta sugestão válida | Threshold 0.88 (conservador) + override tool-differs + log para calibrar |
| Conflito de schema com outros agentes | Migration nova + idempotente; HISTORY antes do commit |
| Privacidade do perfil | Apenas derivados; LGPD coberta no §9 |
| Latência: tagging assíncrono atrasa atualização do perfil | Job consome em segundos; UI mostra "perfil em construção" se faltar |
| `identityBase` do banco mascara a diretiva nova | Diretiva também appendada em `compose.ts` (não só no default) |
| `intelligence_checkpoint` default OFF deixa Onda 3+4 invisíveis | Documentar passo "ligar checkpoint" na verificação manual |

## 14. Não-objetivos

- Não é F5 reformatada (F5 WhatsApp/RAG intacta).
- Não toca F4 Onda 2 (escrita MCP).
- Não substitui `/agente/consumo` (foco em custo); `/agente/inteligencia` é foco em qualidade.
- Não automatiza mudanças de prompt (recomendações vão para revisão humana).
- Não persiste embeddings de chip individual (volume; computa on-the-fly).

---

## Apêndice A — Glossário

- **Bullets-pergunta**: perguntas escritas pela IA no fim da resposta, normalmente em markdown.
- **Caminho já trilhado**: nos últimos 5 turnos, a chip levaria à mesma resposta conceitual já vista.
- **LLM Judge**: modelo forte (default Gemini 2.5 Pro thinking) que avalia qualidade.
- **Tool replay**: re-executa tool call com os mesmos args, para validar/comparar.
- **UserAgentProfile**: perfil derivado por usuário; alimenta personalização.
- **Filter bubble**: usuário só vê o que já gosta; mitigado por mistura ⅔/⅓.

## Apêndice B — Diferenças v1 → v2 → v3 (achados aplicados)

### v2 → v3 (review #2, 26 achados)

- G1: amostragem estratificada por **era** + gate de 100 turnos pós-instrument + cobertura
  no UI.
- G2: §"Dependências entre ondas" documenta paralelização permitida.
- G3: definição canônica de "par" em `getLastNPairs` (§5.5).
- G4: tagging re-roda a cada 10 mensagens novas; append-mescla; cap 5 tags.
- G5: `normalize-tool-history.ts` na Onda 1 com 5 testes (1 por formato).
- G6: `recommendation-clusterer.ts` usa `$queryRaw` com pgvector; reusa helpers F5 RAG.
- G7: §5.4 segurança do endpoint (NextAuth + scope userId + rate limit + soft cap).
- G8: replay grava em `audit_logs` com `action=QUALITY_JUDGE_TOOL_REPLAY`.
- G9: BullMQ `jobId = "profile-build:${userId}"` único.
- G10: Onda 1 task 1 verifica colisão de timestamp antes de criar migration.
- G11: `--max-cost-usd 50` default; pausa interativa.
- G12: timeout adaptativo + keep-alive ping ao Haiku.
- G13: cache stale aceito como benigno; nota.
- G14: regra completa de slots_finais (§6.2).
- G15: anti-bubble com fórmula explícita (§4.4).
- G16: nota de QA sobre multi-tab; sem ação.
- G17: `topic_tags_version` + `topic_tags_at` em `Conversation`.
- G18: scope do painel por `UserDomainAccess` (§3.7.1).
- G19: doc LGPD sobre `chipText`.
- G20: 2 níveis de teste explicitados (unit + integration) na Onda 4.
- G21: smoke test com `intelligenceCheckpoint=OFF` em cada onda de UI.
- G22: `tool-replayer` importa funções diretas, não chama `/api/mcp`.
- G23: FK cascade em `SuggestionInteraction.userId`.
- G24: removida action `dismissed`; computa derivado.
- G25: `reasoning-effort-policy.ts` centralizado (§9.5).
- G26: algoritmo de amostragem (§3.2.2) com buckets + cap.

### v1 → v2 (review #1, 24 achados)

- F1: removido `tenantId` das 3 tabelas; scope por `userId`.
- F2: PK types corrigidos para UUID (compatível com `User`/`Conversation`/`Message`).
- F3: `maxSuggestions` (campo real do `AgentSettings`); regra de cap dinâmico explicitada.
- F4: §9.1 trata `suggestionsCheckpoint`; novo `intelligenceCheckpoint` para frentes B/C/D.
- F5: Onda 1 inspeciona `Message.toolCalls`; nova coluna `toolResults`; flag `original_result_missing`.
- F6: service account com privilégio elevado para tool replay; audit `system:quality-judge`.
- F7: `correcaoFactual` compara com resultado **original**, não re-executado; `n/a` quando ausente.
- F8: topic-tagging **assíncrono** via BullMQ, fora do caminho crítico.
- F9: Haiku 4.5 default; configurável via `AgentSettings.intelligenceModel`.
- F10: cálculo de custo; default Gemini 2.5 Pro thinking; configurável.
- F11: embedding text-embedding-3-small (já usado em F5 RAG); on-the-fly; sem storage por chip.
- F12: threshold cosine 0.88; override tool-differs; log dedup descartado.
- F13: mistura ⅔ perfil + ⅓ descoberta anti-bubble.
- F14: callsite explícito — `chat-panel.tsx` → `/api/agent/suggest-continuation` no `onMessageDone`.
- F15: task de backfill (`backfill-topic-tags.ts`) na Onda 2.
- F16: diretiva appendada em `compose.ts`, não só em `identity-base.ts`.
- F17: queue names sem `:`.
- F18: TTL 90 d em `SuggestionInteraction` via cron `agent-intelligence-cleanup`.
- F19: cron `04:30` em vez de `03:00`.
- F20: §7.7 navigation + sidebar entry com RBAC guard.
- F21: degradação graceful no contextual suggester (timeout 2 s → fallback).
- F22: ui-ux-pro-max é task 0 da Onda 2.
- F23: fluxo de recomendação explicado; tabela `PromptRecommendation`.
- F24: §12 checklist de compatibilidade com modernização recente.

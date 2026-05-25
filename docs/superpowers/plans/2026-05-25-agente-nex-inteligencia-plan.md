# Agente Nex Inteligência — Plano de execução (v1)

> Spec canônica: `docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md` (v3).
> Branch: `feat/agente-nex-inteligencia`. Workflow: modo autônomo (CLAUDE.md §6).
> **Status: v1** — entra para 2 reviews adversariais.

## 0. Pré-flight

Antes de tocar código:

- **P0.1** — `git fetch origin && git status` e confirmar branch `feat/agente-nex-inteligencia`,
  working tree limpa.
- **P0.2** — Confirmar `pnpm` + `docker compose` + container `db` rodando localmente.
- **P0.3** — `ls prisma/migrations/` para validar que `20260525210000_agente_nex_inteligencia`
  não colide com nenhum timestamp já existente; ajustar se preciso.
- **P0.4** — Conferir credencial Anthropic (Haiku 4.5) ativa no banco
  (`LlmCredential` com `provider='anthropic'`). Idem Gemini se for usar judge.
- **P0.5** — Confirmar agentes ativos via `ls docs/agents/active/`. Coordenar antes de
  tocar `prisma/schema.prisma`, `chat-panel.tsx`, `run-agent.ts`.

Critério de saída do pré-flight: tudo verde. Caso contrário, registrar bloqueio no active
file e parar.

---

## Onda 1 — Fundação

**Objetivo**: schema + telemetria + tagging assíncrono. Sem mudança visível ao usuário.

### Tasks

**T1.1 — Verificar timestamp de migration** *(file: shell)*

- Listar `prisma/migrations/` e confirmar que `20260525210000` está livre.
- Se colidir, ajustar para o minuto seguinte disponível.
- **Done**: timestamp escolhido documentado no `docs/agents/active/...md`.

**T1.2 — Migration SQL** *(file: `prisma/migrations/20260525210000_agente_nex_inteligencia/migration.sql`)*

- `CREATE TABLE IF NOT EXISTS user_agent_profiles` (campos do §7.1 da spec).
- `CREATE TABLE IF NOT EXISTS conversation_quality_evaluations`.
- `CREATE TABLE IF NOT EXISTS prompt_recommendations`.
- `CREATE TABLE IF NOT EXISTS suggestion_interactions` (com FK userId → users, cascade).
- `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS topic_tags TEXT[] DEFAULT '{}'::text[]`.
- `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS topic_tags_version INTEGER NOT NULL DEFAULT 0`.
- `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS topic_tags_at TIMESTAMP`.
- `ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_results JSONB`.
- `ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS intelligence_model TEXT`.
- `ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS quality_judge_model TEXT`.
- `ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS intelligence_checkpoint feature_checkpoint NOT NULL DEFAULT 'OFF'`.
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN IF NOT EXISTS recomendacao_embedding vector(1536)` (raw, pgvector).
- `DO $$ ... GRANT SELECT ON ... TO nexus_mcp, nexus_mcp_bi ... $$` (idempotente, pula se roles inexistentes).
- **Verificação**: `pnpm prisma migrate dev --name agente_nex_inteligencia` aplica sem erro;
  `\dt` no psql mostra as 4 tabelas; `\d+ conversation_quality_evaluations` mostra coluna
  vector.
- **Done**: migration aplicada, banco refletindo schema.

**T1.3 — Schema Prisma** *(file: `prisma/schema.prisma`)*

- Adicionar models: `UserAgentProfile`, `ConversationQualityEvaluation`, `PromptRecommendation`,
  `SuggestionInteraction` (exatamente conforme §7.1 da spec, com `Unsupported("vector(1536)")`).
- Adicionar campos a `Conversation`, `Message`, `AgentSettings`.
- Adicionar relação `User -> UserAgentProfile` (back-relation).
- Adicionar relação `User -> SuggestionInteraction[]` (back-relation).
- **Verificação**: `pnpm prisma generate` sem erro; `pnpm tsc --noEmit` verde.
- **Done**: client regenerado, types disponíveis.

**T1.4 — Script de inspeção de `Message.toolCalls`** *(file: `scripts/inspect-tool-calls-format.ts`)*

- Lê amostra de 50 mensagens de cada provider (OpenAI Responses, OpenAI ChatCompletions,
  Anthropic, Gemini, OpenRouter).
- Reporta estrutura: existe `result`? key names? shape?
- **Verificação**: `pnpm tsx scripts/inspect-tool-calls-format.ts` imprime relatório legível.
- **Done**: documento `docs/handoffs/2026-05-25-tool-calls-formats.md` com resumo.

**T1.5 — `normalize-tool-history.ts`** *(file: `src/lib/agent/intelligence/normalize-tool-history.ts`)*

- Função `normalizeToolHistory(raw: unknown, provider: string): NormalizedToolHistory`.
- Branch por provider; tratamento defensivo (json null, formatos parciais).
- **Verificação**: testes T1.6.
- **Done**: módulo exporta tipos e função.

**T1.6 — Testes do normalizer** *(file: `src/lib/agent/intelligence/normalize-tool-history.test.ts`)*

- 5 fixtures (1 por formato) em `__fixtures__/tool-calls/*.json`.
- 5 testes — cada um normaliza e confere shape.
- 1 teste de borda: input null → array vazio.
- **Verificação**: `pnpm jest normalize-tool-history` verde.
- **Done**: 6 testes passando.

**T1.7 — Instrumentar `run-agent.ts` para gravar `toolResults`** *(file: `src/lib/agent/run-agent.ts`)*

- Localizar onde `Message` assistant é persistida.
- Quando há tool result em memória (após o loop de tool calls), gravar como JSON em
  `Message.toolResults`. **Não alterar** `toolCalls` nem outros campos.
- **Compatibilidade obrigatória** (spec §12): não tocar `reasoningHistory`, `LlmUsage`,
  `loadConversationReasoningHistory`, formato de `toolCalls`.
- **Verificação**: enviar 1 mensagem com tool call no `/agente`, confirmar
  `tool_results IS NOT NULL` na nova message.
- **Done**: dado persistindo.

**T1.8 — `topic-extractor.ts`** *(file: `src/lib/agent/intelligence/topic-extractor.ts`)*

- Função `extractTopics(messages: string[], opts?): Promise<{topic: string; domain: string; keywords: string[]}>`.
- Usa Haiku 4.5 (ou `AgentSettings.intelligenceModel` se setado).
- Prompt embutido em arquivo; pede formato JSON; cap 5 keywords + 1 domain + 1 topic.
- Sem `reasoningEffort` (Haiku não suporta).
- **Verificação**: testes T1.9.
- **Done**: módulo pronto.

**T1.9 — Testes do topic-extractor** *(file: `src/lib/agent/intelligence/topic-extractor.test.ts`)*

- Mock do client LLM para devolver resposta canned.
- 3 testes: resposta normal, resposta com JSON inválido (deve fallback para `{topic:"outros"}`),
  resposta vazia.
- **Verificação**: `pnpm jest topic-extractor` verde.
- **Done**: 3 testes passando.

**T1.10 — `reasoning-effort-policy.ts`** *(file: `src/lib/agent/intelligence/reasoning-effort-policy.ts`)*

- Tabela centralizada §9.5 da spec.
- Export `getReasoningEffortForCaller(caller: "topic-extractor" | "contextual-suggester" | "quality-judge")`.
- **Verificação**: 1 unit test simples.
- **Done**: política exportada.

**T1.11 — Helper `getLastNPairs`** *(file: `src/lib/agent/conversation.ts`)*

- Adicionar `getLastNPairs(conversationId: string, n: number = 5): Promise<Pair[]>`.
- Definição canônica do §5.5 da spec.
- **Verificação**: testes T1.12.
- **Done**: função exportada.

**T1.12 — Testes do helper** *(file: `src/lib/agent/conversation.test.ts`)*

- 4 fixtures:
  - Conversa simples (user → assistant final, sem tools).
  - Conversa com tool calls intermediários (user → assistant_with_tool → tool → assistant_final).
  - Conversa pré-instrumentação (sem toolResults).
  - Conversa com menos de N pares (deve devolver os disponíveis).
- **Verificação**: `pnpm jest conversation` verde nos novos testes.
- **Done**: 4 testes passando.

**T1.13 — Job BullMQ `agent-topic-tagging`** *(file: `src/worker/jobs/agent-intelligence/topic-tagging.ts`)*

- Worker BullMQ consome `{ conversationId: string }`.
- Lê primeira mensagem do user da conversa.
- Chama `extractTopics`.
- Lê `topicTags` existente, faz append-mescla com dedup, cap 5 tags.
- Atualiza `Conversation { topicTags, topicTagsVersion: 1, topicTagsAt: now() }`.
- Idempotente: se já chamou na mesma `messageCount` (calculável), pula.
- **Verificação**: T1.15.
- **Done**: job exportado.

**T1.14 — Registrar queue no worker** *(file: `src/worker/index.ts` e `src/worker/jobs/agent-intelligence/index.ts`)*

- Adicionar queue `agent-topic-tagging` (sem `:`).
- Conectar Worker BullMQ; registrar no startup.
- **Verificação**: `docker compose logs worker | grep agent-topic-tagging` mostra fila pronta.
- **Done**: queue ativa.

**T1.15 — Teste do job** *(file: `src/worker/jobs/agent-intelligence/topic-tagging.test.ts`)*

- Mock do `extractTopics`.
- Caso 1: conversa nova → grava tags.
- Caso 2: re-roda na mesma conversa após 10 msgs → mescla.
- Caso 3: idempotente (re-roda sem novas msgs → no-op).
- **Verificação**: `pnpm jest topic-tagging` verde.
- **Done**: 3 testes passando.

**T1.16 — Enfileirar tagging em `run-agent.ts`** *(file: `src/lib/agent/run-agent.ts`)*

- **Após** persistir a mensagem (não no caminho síncrono), enfileira job
  `agent-topic-tagging` com `{ conversationId }`.
- BullMQ `jobId = "topic-tag:${conversationId}:${messageCount}"` para idempotência.
- **Verificação**: enviar mensagem no `/agente`; em 30 s, conferir `topicTags` populado.
- **Done**: tagging acontecendo automático.

**T1.17 — Rebuild containers** *(file: shell)*

- Schema mudou → `docker compose up -d --build app mcp worker` (CLAUDE.md §2.1).
- **Verificação**: `docker inspect <container> --format '{{.State.StartedAt}}'` > último commit.
- **Done**: containers reiniciados.

**T1.18 — Commit Onda 1**

- `git add` apenas arquivos da Onda 1 (lista explícita; nunca `-A`).
- Mensagem: `feat(intelligence): onda 1 - schema + telemetria + tagging assincrono`.
- Append em `docs/agents/HISTORY.md` (scope=feat+infra).
- **Verificação**: `git log -1` mostra commit; tsc/eslint/jest verdes.
- **Done**: branch atualizada.

### Critério de done da Onda 1

- Migration aplicada local; 4 tabelas + colunas novas presentes.
- Schema Prisma regenerado, types funcionando.
- `normalize-tool-history` cobre 5 formatos (testes verdes).
- `getLastNPairs` cobre conversa com tool calls intermediários (testes verdes).
- Conversa nova/retomada ganha `topicTags` em ≤ 30 s automaticamente.
- `tool_results` persistindo em mensagens novas.
- Containers rebuildados.
- `tsc + eslint + jest` verdes.

---

## Onda 2 — Análise retrospectiva

**Gate de entrada**: `SELECT COUNT(*) FROM messages WHERE tool_results IS NOT NULL` ≥ 100.

### Tasks

**T2.0 — UI mockups via `ui-ux-pro-max`** *(file: `docs/superpowers/specs/2026-05-25-inteligencia-ui-mockups.md`)*

- Acionar `ui-ux-pro-max` para produzir wireframes da tela `/agente/inteligencia`:
  KPIs, failure-patterns, recommendations-table, drilldown.
- Documento serve de input para T2.6+.
- **Done**: arquivo committed.

**T2.1 — `tool-replayer.ts`** *(file: `src/lib/agent/intelligence/tool-replayer.ts`)*

- Função `replayToolCalls(history: NormalizedToolHistory, opts): Promise<ReplayResult>`.
- Loop sobre tool calls; importa funções de `src/lib/reports/queries/**` (NÃO chama
  `/api/mcp`); pula `write:*`.
- Grava `audit_logs { action: "QUALITY_JUDGE_TOOL_REPLAY", actorId: "quality-judge" }`.
- Devolve `{ tools: [{name, originalArgs, originalResult, newResult, divergence}] }`.
- Cálculo de `divergence`: hash do JSON resultado (Levenshtein distância normalizada).
- **Verificação**: T2.2.
- **Done**: módulo pronto.

**T2.2 — Testes do replayer** *(file: `src/lib/agent/intelligence/tool-replayer.test.ts`)*

- Mock das funções de queries.
- 3 testes: tool simples (sem divergência), tool com divergência alta, tool `write:*` (pulada).
- **Done**: 3 testes passando.

**T2.3 — `quality-judge.ts`** *(file: `src/lib/agent/intelligence/quality-judge.ts`)*

- Função `judgeAnswer(input: JudgeInput): Promise<JudgeOutput>`.
- Default `gemini-2.5-pro-thinking`, `reasoningEffort = "high"`.
- Configurável via `AgentSettings.qualityJudgeModel`.
- Prompt embutido com rubrica do §3.4 da spec.
- Parser de saída JSON com tolerância a malformed.
- Quando `originalResultMissing`: nullify `correcaoFactual` e passa flag para o juiz.
- **Verificação**: T2.4.
- **Done**: módulo pronto.

**T2.4 — Testes do judge** *(file: `src/lib/agent/intelligence/quality-judge.test.ts`)*

- Mock do LLM.
- 3 testes: resposta JSON válida → struct correta; JSON inválido → erro; `originalResultMissing`
  → `correcaoFactual: null`.
- **Done**: 3 testes passando.

**T2.5 — `recommendation-clusterer.ts`** *(file: `src/lib/agent/intelligence/recommendation-clusterer.ts`)*

- Função `clusterRecommendations(): Promise<Cluster[]>`.
- Para cada `ConversationQualityEvaluation` com `recomendacaoPrompt != null`:
  - Gera embedding via `text-embedding-3-small`.
  - `INSERT INTO ... (recomendacao_embedding) VALUES ($1::vector)` via $queryRaw.
- KNN groupping: `SELECT id, recomendacao_prompt FROM ... ORDER BY recomendacao_embedding <=> $1 LIMIT 50`.
- Threshold cosine para mesmo cluster: 0.85.
- Persiste em `PromptRecommendation` com `clusterKey = hash(consolidatedText)`.
- **Verificação**: T2.5b (unit) + verificação E2E na T2.11.
- **Done**: módulo pronto.

**T2.5b — Testes do clusterer** *(file: `src/lib/agent/intelligence/recommendation-clusterer.test.ts`)*

- Mock de embed + mock de $queryRaw.
- 2 testes: cluster simples (2 recomendações similares → 1 cluster), cluster vazio
  (sem recomendações → no-op).
- **Done**: 2 testes passando.

**T2.6 — Script `analyze-conversations.ts`** *(file: `scripts/analyze-conversations.ts`)*

- CLI `pnpm analyze:conversations [--sample 0.05] [--max-cost-usd 50]`.
- Amostragem estratificada §3.2.2 da spec.
- Loop por turno: chama replayer + judge; persiste eval; acumula custo.
- Pausa interativa ao bater max-cost.
- Ao final: chama `clusterRecommendations()`.
- Reporta cobertura por era no stdout.
- **Verificação**: T2.11.
- **Done**: script funcional.

**T2.7 — Script `backfill-topic-tags.ts`** *(file: `scripts/backfill-topic-tags.ts`)*

- Itera todas conversas sem `topicTags`, enfileira `agent-topic-tagging`.
- Cap por execução (`--batch 100`).
- Idempotente.
- **Verificação**: rodar local; após 5 min conferir que tags apareceram.
- **Done**: script funcional.

**T2.8 — RBAC guard na rota** *(file: `src/app/(protected)/agente/inteligencia/layout.tsx`)*

- Server component que checa `session.user.platformRole ∈ {admin, super_admin}`.
- 403 ou redirect caso contrário.
- **Verificação**: smoke test acessando como viewer (deve barrar).
- **Done**: guard ativo.

**T2.9 — Tela principal + componentes** *(files: `src/app/(protected)/agente/inteligencia/{page,kpis,failure-patterns,recommendations-table,conversation-drilldown}.tsx`)*

- Conforme wireframe T2.0.
- KPIs incluem cobertura por era ("com `correcaoFactual`: X% · sem: Y%").
- Scope da query: `JOIN users + user_domain_access` para escopar por admin (§3.7.1).
- Cada commit visual obrigatoriamente revisado pelo `ui-ux-pro-max`.
- **Verificação**: smoke render + T2.11.
- **Done**: tela renderiza com dado seed.

**T2.10 — Sidebar entry** *(file: `src/components/layout/sidebar.tsx`)*

- Adicionar entry "Inteligência" sob "Agente Nex"; condicional `admin`/`super_admin`.
- **Coordenar antes**: `sidebar.tsx` é arquivo compartilhado; ler `git log -3 --oneline -- src/components/layout/sidebar.tsx`. Se commit < 30 min, pausar.
- **Verificação**: sidebar mostra entry para admin; não mostra para viewer.
- **Done**: navegação ativa.

**T2.11 — Verificação E2E real**

- Gate de 100 turnos pós-instrumentação passou.
- Rodar `pnpm analyze:conversations --sample 0.02 --max-cost-usd 5` em DB local.
- Conferir ≥ 100 avaliações geradas em `conversation_quality_evaluations`.
- Conferir `audit_logs` ter ao menos 1 `QUALITY_JUDGE_TOOL_REPLAY`.
- Abrir `/agente/inteligencia`; revisar 5 recomendações; aceitar/rejeitar 1.
- Rodar com `intelligenceCheckpoint=OFF` para confirmar que tela ainda renderiza
  (frente A é admin-only, sem checkpoint runtime).
- **Done**: verificação aprovada manualmente.

**T2.12 — Rebuild + commit**

- Rebuild `app` + `worker` (Onda 2 não toca mcp).
- Commit `feat(intelligence): onda 2 - analise retrospectiva`.
- HISTORY entry.

### Critério de done da Onda 2

- ≥ 300 avaliações em `conversation_quality_evaluations`.
- UI `/agente/inteligencia` mostra KPIs reais com cobertura por era.
- ≥ 1 recomendação revisada por humano.
- `audit_logs` registrando replays.
- Tela respeita scope por `UserDomainAccess`.
- `tsc + eslint + jest` verdes; verificação E2E aprovada.

---

## Onda 3 — Welcome personalizado

### Tasks

**T3.1 — `profile-builder.ts`** *(file: `src/lib/agent/intelligence/profile-builder.ts`)*

- Função `buildProfile(userId): Promise<UserAgentProfile>`.
- Lê últimas 500 mensagens do user (90d cap).
- Aggrega tópicos com decaimento exp (half-life 30d).
- Persiste em `user_agent_profiles` via upsert.
- **Verificação**: T3.2.
- **Done**: módulo pronto.

**T3.2 — Testes do profile-builder** *(file: `src/lib/agent/intelligence/profile-builder.test.ts`)*

- Mock de Message.findMany.
- 3 testes: usuário com 50 msgs (perfil rico), usuário com 2 msgs (perfil vazio), decaimento
  funcionando (msgs antigas pesam menos).
- **Done**: 3 testes passando.

**T3.3 — Job BullMQ `agent-profile-build`** *(file: `src/worker/jobs/agent-intelligence/profile-build.ts`)*

- Consome `{ userId }`. Chama `buildProfile`.
- `jobId = "profile-build:${userId}"` (BullMQ dedup).
- **Verificação**: T3.4.
- **Done**: job exportado.

**T3.4 — Teste do job** *(file: `.../profile-build.test.ts`)*

- Caso 1: job dispara, perfil é construído.
- Caso 2: 2 jobs concorrentes para mesmo userId → BullMQ deduplica (executa 1).
- **Done**: 2 testes passando.

**T3.5 — Cron 04:30 + listener N+10 msgs** *(file: `src/worker/jobs/agent-intelligence/profile-build.ts` + `src/worker/index.ts`)*

- Cron BullMQ `agent-profile-build` agendado para `30 4 * * *`.
- Listener no `run-agent.ts`: a cada mensagem do user, conta msgs novas desde
  `profileBuiltAt`; se ≥ 10 → enfileira.
- **Verificação**: testes manuais (alterar horário do cron para teste; mandar 10 msgs).
- **Done**: triggers ativos.

**T3.6 — Script `build-user-profiles.ts`** *(file: `scripts/build-user-profiles.ts`)*

- Backfill 1x: lista todos `User`, enfileira job para cada.
- Rate limit para não floodar (cap N concorrentes).
- **Done**: script funcional.

**T3.7 — `welcome-suggestions.ts` consome perfil** *(file: `src/lib/agent/welcome-suggestions.ts`)*

- Tenta `prisma.userAgentProfile.findUnique`.
- Se existe e `messageCount >= 5`: gera chips via template + topTopics.
- Senão: fallback à lista estática atual (preservada).
- Mistura anti-bubble (§4.4 spec): perfil + descoberta.
- Respeita `suggestionsCheckpoint` + `intelligenceCheckpoint`.
- **Verificação**: T3.8.
- **Done**: função atualizada.

**T3.8 — Testes do welcome** *(file: `src/lib/agent/welcome-suggestions.test.ts`)*

- Caso 1: usuário sem perfil → fallback estático.
- Caso 2: usuário com perfil + checkpoint PRODUCTION → chips do perfil.
- Caso 3: checkpoint OFF → fallback estático mesmo com perfil.
- Caso 4: anti-bubble com N=3 → 2 perfil + 1 descoberta.
- Caso 5: anti-bubble com N=1 → 1 perfil + 0 descoberta.
- **Done**: 5 testes passando.

**T3.9 — Telemetria de welcome chips** *(file: `src/components/agent/suggestions-bar.tsx` ou novo helper)*

- Quando chip welcome é renderizada: insert `SuggestionInteraction { chipSource: "welcome", action: "impressed" }`.
- Quando clicada: insert `action: "clicked"`.
- **Coordenar**: arquivo compartilhado com `claude-nex-bubble-storytelling` (mas
  storytelling não está mexendo em suggestions-bar). Conferir antes.
- **Verificação**: smoke test manual.
- **Done**: telemetria ativa.

**T3.10 — Verificação E2E real**

- Rodar backfill local.
- Confirmar `user_agent_profiles` populada para meu usuário.
- Abrir `/agente`; chips welcome refletem meus tópicos consultados.
- Logout/login como usuário "novo" → fallback estático.
- Conferir `suggestion_interactions` gravando.
- **Done**: verificação aprovada.

**T3.11 — Rebuild + commit**

- Rebuild `app` + `worker`.
- Commit `feat(intelligence): onda 3 - welcome personalizado`.
- HISTORY entry.

### Critério de done da Onda 3

- Backfill rodou; perfis populados.
- 100 % das chips welcome de usuários ≥ 5 msgs vêm do perfil.
- Usuário novo continua vendo fallback estático.
- Telemetria gravando.
- Testes verdes; verificação E2E aprovada.

---

## Onda 4 — Contextuais + bullets→chips consolidado

### Tasks

**T4.1 — `contextual-suggester.ts`** *(file: `src/lib/agent/intelligence/contextual-suggester.ts`)*

- Função `suggestContinuation(input: SuggestInput): Promise<{chips: string[]}>`.
- Entrada: `lastPairs`, `profile`, `agentSettings`.
- LLM Haiku 4.5, sem reasoning.
- Timeout adaptativo (2 s 1ª chamada da sessão; 4 s se anterior > 1.5 s).
- **Verificação**: T4.2.
- **Done**: módulo pronto.

**T4.2 — Testes do suggester** *(file: `.../contextual-suggester.test.ts`)*

- Mock LLM.
- 3 testes: resposta normal, timeout (degradação para fallback), LLM erro.
- **Done**: 3 testes passando.

**T4.3 — `semantic-dedup.ts`** *(file: `src/lib/agent/intelligence/semantic-dedup.ts`)*

- Função `dedupSuggestions(candidates: string[], recent: string[]): Promise<{kept, dropped}>`.
- Embeddings via `text-embedding-3-small` (reusa credencial F5).
- Threshold 0.88.
- Override "tools-differ" — se duas chips usariam tools diferentes (heurística por keyword
  match), NÃO dedup.
- Log dedup via `SuggestionInteraction { action: "dedup_dropped" }`.
- **Verificação**: T4.4.
- **Done**: módulo pronto.

**T4.4 — Testes do dedup** *(file: `.../semantic-dedup.test.ts`)*

- Mock embeddings.
- 3 testes: similar (cosine 0.92 → drop), distinta (cosine 0.6 → keep), tool-differs
  override (cosine 0.95 mas tools distintas → keep).
- **Done**: 3 testes passando.

**T4.5 — Atualizar `enhance-chips.ts`** *(file: `src/lib/agent/enhance-chips.ts`)*

- Aplicar regra de cap dinâmico §6.2 da spec.
- Reaproveita output de `suggestions-extractor.ts`.
- **Coordenar antes**: arquivo possivelmente compartilhado; verificar HISTORY.
- **Verificação**: T4.6.
- **Done**: regra canônica implementada.

**T4.6 — Testes do enhance-chips** *(file: `src/lib/agent/enhance-chips.test.ts`)*

- 6 fixtures: B=0/N=3, B=2/N=3, B=5/N=3, B=8/N=3 (cap 7), B=10/N=10 (cap 7), B=0/contextual=3.
- **Done**: 6 testes passando.

**T4.7 — Diretiva em `identity-base.ts`** *(file: `src/lib/agent/llm/identity-base.ts`)*

- Adicionar bloco no default: "Quando você precisar fazer perguntas ao usuário, escreva-as
  como bullets `- pergunta?` no fim da resposta — elas serão exibidas como chips de sugestão
  e removidas do corpo automaticamente. **Não repita perguntas no corpo do texto.**"
- **Coordenar**: arquivo compartilhado; verificar HISTORY.
- **Done**: default atualizado.

**T4.8 — Append da diretiva em `compose.ts`** *(file: `src/lib/agent/llm/compose.ts`)*

- Append da mesma diretiva após o bloco "## Comportamento", **independente** de
  `identityBase` do banco.
- Garante que a regra chega ao agente mesmo com `identity_base` populado.
- **Verificação**: T4.9.
- **Done**: regra robusta.

**T4.9 — Testes do compose** *(file: `src/lib/agent/llm/compose.test.ts`)*

- Caso 1: `identityBase = null` → default + diretiva.
- Caso 2: `identityBase = "custom"` → custom + diretiva (não perde).
- **Done**: 2 testes passando.

**T4.10 — Rota `/api/agent/suggest-continuation`** *(file: `src/app/api/agent/suggest-continuation/route.ts`)*

- POST handler.
- NextAuth obrigatório.
- Body: `{ conversationId, messageId }`.
- Confere `conversation.userId === session.userId` (403 senão).
- Rate limit 30/min (helper F5).
- Soft cap diário 500 (query em `suggestion_interactions count where userId AND createdAt > today`).
- Chama `getLastNPairs` + `contextual-suggester` + `semantic-dedup`.
- Devolve `{ chips: [], dynamicCap: number }`.
- Respeita `suggestionsCheckpoint` + `intelligenceCheckpoint`.
- **Verificação**: T4.11 + smoke test.
- **Done**: rota ativa.

**T4.11 — Testes do route** *(file: `src/app/api/agent/suggest-continuation/route.test.ts`)*

- 5 testes: sem auth (401), conversa alheia (403), rate limited (429), checkpoint OFF
  (fallback), feliz (200 com chips).
- **Done**: 5 testes passando.

**T4.12 — Atualizar `chat-panel.tsx`** *(file: `src/components/agent/chat-panel.tsx`)*

- No callback `onMessageDone` (quando assistant termina): fetch `/api/agent/suggest-continuation`.
- Atualiza state local de chips com `dynamicCap`.
- Fallback (timeout/erro): mantém chips do extractor legado.
- **Coordenar antes**: arquivo compartilhado com `claude-nex-bubble-storytelling` (auto-scroll v3
  está nele). Pausar se HISTORY indicar trabalho concorrente.
- **Done**: cabeamento ativo.

**T4.13 — Atualizar `suggestions-bar.tsx`** *(file: `src/components/agent/suggestions-bar.tsx`)*

- Renderiza até `dynamicCap` chips.
- Grava `impressed` em mount; `clicked` no onClick.
- **Done**: componente atualizado.

**T4.14 — Testes unit + integration de "perguntas não no corpo"**

- Unit (file: `src/lib/agent/suggestions-extractor.test.ts`):
  - Input: response com bullets-pergunta trailing → output `{cleanedBody (sem bullets), bullets}`.
- Integration (file: `src/lib/agent/run-agent.integration.test.ts`):
  - Simula `ChatResult` com bullets no fim → confere que `Message.content` gravado é
    cleanedBody E `/api/agent/suggest-continuation` devolve bullets.
- **Done**: 2 testes passando.

**T4.15 — Verificação E2E real**

- 10 conversas reais; bullets-pergunta nunca no corpo (visual + grep no banco).
- Chips contextuais geradas em ≤ 2 s (visualmente).
- 1+ dedup descartado (conferir `suggestion_interactions` com `action: "dedup_dropped"`).
- Smoke `intelligenceCheckpoint=OFF` → chips do extractor legado (sem LLM).
- Smoke `suggestionsCheckpoint=OFF` → nenhuma chip.
- **Done**: verificação aprovada.

**T4.16 — Rebuild + commit**

- Rebuild `app` + `worker`.
- Commit `feat(intelligence): onda 4 - contextuais + bullets canonicos`.
- HISTORY entry.

### Critério de done da Onda 4

- Bullets-pergunta nunca aparecem no corpo em 10 conversas teste.
- Chips contextuais em ≤ 2 s (com adaptativo).
- Dedup descartando repetições.
- Telemetria gravando todas as actions.
- Testes verdes; verificação E2E aprovada.

---

## Fase de fechamento

**T5.1 — `/gsd-code-review`** sobre toda a branch.
**T5.2 — `/gsd-ui-review`** sobre Ondas 2, 3, 4 (UI).
**T5.3 — Aplicar fixes do code review** em commits separados.
**T5.4 — Atualizar `STATUS.md`** com novo bloco F4.5 (Inteligência) ou similar.
**T5.5 — Apagar `docs/agents/active/claude-agente-nex-inteligencia.md`** (fim da sessão).
**T5.6 — Append final em `HISTORY.md`** com sumário do trabalho.
**T5.7 — Abrir PR** da branch para `feat/f4-leitura-expansao` (ou `main` se outras branches
já mergearam).

---

## Resumo de arquivos novos / editados

### Novos
- `src/lib/agent/intelligence/{profile-builder,topic-extractor,quality-judge,tool-replayer,normalize-tool-history,contextual-suggester,semantic-dedup,recommendation-clusterer,reasoning-effort-policy,index}.ts`
- `src/lib/agent/intelligence/*.test.ts` (idem)
- `src/worker/jobs/agent-intelligence/{topic-tagging,profile-build,intelligence-cleanup,index}.ts` + testes
- `src/app/(protected)/agente/inteligencia/{layout,page,kpis,failure-patterns,recommendations-table,conversation-drilldown}.tsx`
- `src/app/api/agent/suggest-continuation/route.ts` + teste
- `scripts/{inspect-tool-calls-format,analyze-conversations,backfill-topic-tags,build-user-profiles}.ts`
- `prisma/migrations/20260525210000_agente_nex_inteligencia/migration.sql`
- `docs/superpowers/specs/2026-05-25-inteligencia-ui-mockups.md` (T2.0)

### Editados (com coordenação multi-agente)
- `prisma/schema.prisma` (compartilhado)
- `src/lib/agent/run-agent.ts` (compartilhado; só append na cauda do turno)
- `src/lib/agent/conversation.ts` (acrescenta helper)
- `src/lib/agent/welcome-suggestions.ts`
- `src/lib/agent/enhance-chips.ts`
- `src/lib/agent/llm/{identity-base,compose}.ts`
- `src/components/agent/{chat-panel,suggestions-bar}.tsx` (compartilhado)
- `src/components/layout/sidebar.tsx` (compartilhado)
- `src/worker/index.ts` (compartilhado)

---

## Riscos operacionais

| Risco | Mitigação |
|---|---|
| Conflito com outros agentes em `chat-panel.tsx`, `run-agent.ts`, `prisma/schema.prisma` | Coordenar antes (HISTORY + git log < 30 min); pausar/pivot se choque |
| Migration timestamp colide | T1.1 verifica e ajusta |
| Custo do judge estoura | `--max-cost-usd` com pausa interativa |
| Dev sem credencial Gemini para judge | Fallback configurável: `--judge-model claude-opus-4-7` (mais caro mas funcional) |
| Tagging assíncrono atrasa primeiros perfis | Onda 3 só usa perfil quando `messageCount >= 5` |
| pgvector + Unsupported quebra Prisma client | `recommendation-clusterer` usa `$queryRaw` (já documentado) |

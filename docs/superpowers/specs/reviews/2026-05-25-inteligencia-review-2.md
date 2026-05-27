# Review #2 — SPEC v2 do Agente Nex Inteligência

> Auditoria adversarial **mais profunda** sobre v2. Caça o que a #1 deixou passar:
> integração entre frentes, sutilezas de dados, segurança, casos de borda.
>
> Severidade: **B** bloqueante, **M** material, **N** nota.
>
> Após aplicar B+M, a SPEC vira v3 — versão que vai para o PLAN.

---

## Integração entre Ondas

### G1 — [B] Onda 2 vai medir mundo onde 100 % das mensagens são pré-instrumentação

A v2 adiciona `Message.toolResults` na Onda 1 — só para mensagens **novas**, sem backfill.
Resultado: na Onda 2, as 10.6 k mensagens existentes são todas `original_result_missing`.
O `correcaoFactual` será sempre `n/a`. O painel KPI vira meio cego.

**Fix v3**:
- Sample da Onda 2 **estratifica por data**: 50 % turnos antigos (sem `toolResults`,
  aceita avaliação 3/4 dimensões) + 50 % turnos pós-instrumentação (4/4 dimensões).
- Para garantir 50 % do "pós-instrumentação", Onda 2 só começa quando há ≥ N turnos
  pós-instrumentação (alvo N = 100). Tempo mínimo entre Onda 1 e Onda 2: documentar
  como gate explícito.
- Reportar no UI da `/agente/inteligencia` a **cobertura por tipo** ("X% com `correcaoFactual`,
  Y% sem"). Sem isso, leitor do KPI tira conclusão errada.

### G2 — [M] Dependências entre ondas não declaradas

A v2 lista 4 ondas em sequência. Mas Ondas 2, 3 e 4 são logicamente paralelas após Onda 1.
A SPEC não diz isso.

**Fix v3**: §"Dependências": Onda 1 bloqueia 2/3/4; Ondas 2-3-4 são paralelas. Recomendação
prática: serial (2 → 3 → 4) para reduzir conflito multi-agente, mas plano declara que
podem ser paralelas se ambiente permitir.

---

## Sutilezas de dados

### G3 — [B] `getLastNPairs` não está definida — o que é um "par"?

A v2 define em uma linha "helper getLastNPairs". Numa conversa real, mensagens podem ter
role `user`, `assistant` (com toolCalls), `tool` (resultado), `assistant` (final). O conceito
de "par" não é trivial.

**Fix v3**: definição canônica:
- Um **par** é `{userMessage, finalAssistantMessage}`.
- "Final assistant message" é a última message com role `assistant` cujo `toolCalls` é null
  OU vazio (i.e., resposta de fato, não um turno de tool call).
- Mensagens com role `tool` ou `assistant` intermediárias (com toolCalls não-vazio) NÃO
  contam.
- Retorno: array em ordem cronológica DESC, até `n` pares.

### G4 — [M] Topic tagging re-roda quando?

A v2 diz "idempotente: não regrava se já tem tags". Mas conversas longas mudam de assunto.
Se eu tagueio na 1ª mensagem e a conversa pivota no 20º turno, o `topicTags` fica
desatualizado.

**Fix v3**:
- Tagging roda **na primeira mensagem** da conversa (cria tags iniciais).
- A cada **10 mensagens novas** do usuário, re-roda e **mescla** tags (append, dedup);
  preserva tags antigas (a conversa pode ser multi-tópico).
- Cap: até 5 tags por conversa (`topicTags TEXT[]` com cap aplicado no extrator).

### G5 — [M] `Message.toolCalls` schema implícito quebra com formato dos adapters

A SPEC fala em ler `toolCalls.args` e `toolCalls.result`. Mas o adapter da OpenAI Responses
serializa em formato diferente (function_call items) do que Gemini/Anthropic (content blocks).
A task "inspecionar o que está gravado" precisa enumerar os 4 formatos e o `tool-replayer`
+ `quality-judge` precisam normalizar antes de usar.

**Fix v3**: criar `src/lib/agent/intelligence/normalize-tool-history.ts` na Onda 1, com
unit tests para cada um dos 4 formatos (OpenAI Responses, OpenAI ChatCompletions, Anthropic
content blocks, Gemini parts, OpenRouter). Recebe a entrada `Message.toolCalls` raw e devolve
`Array<{name: string, args: object, result?: unknown}>` canônico.

### G6 — [B] `recomendacao_embedding vector(1536)` — Prisma client incompatível

`Unsupported("vector(1536)")` não é selecionável via Prisma client. A SPEC menciona
clusterizar via embedding mas não diz onde mora a query. Sem isso, o
`recommendation-clusterer.ts` não funciona como descrito.

**Fix v3**: explicitar que `recommendation-clusterer.ts` usa `prisma.$queryRaw` para:
- `INSERT`: embedding gerado off-prisma (via service de embed), salva via `INSERT ... VALUES ($vector)::vector`.
- `KNN`: `SELECT id FROM conversation_quality_evaluations ORDER BY recomendacao_embedding <=> $1 LIMIT 50`.

Padrão idêntico ao já usado em `kb_documents` (F5 RAG). Reusar helpers existentes em
`src/lib/agent/rag/` se viáveis.

---

## Segurança / produção

### G7 — [B] `/api/agent/suggest-continuation` sem rate limit e sem autorização

Endpoint chamado pelo client após cada resposta. Sem proteção:
- Atacante pode hammer-loop infinito de pedidos.
- Pode pedir continuação de `conversationId` que não é dele (vazamento + LLM grátis).

**Fix v3**: §"Segurança da API contextual":
- NextAuth session obrigatória.
- Verificação `conversation.userId === session.userId` antes de processar.
- Rate limit: 30 req/min por usuário via `src/lib/security/rate-limit.ts` (já existe na F5).
- Resposta 403 quando conversation não pertence; 429 quando rate-limit.

### G8 — [M] `tool-replayer` com privilégio elevado precisa audit log dedicado

A v2 menciona `actor=system:quality-judge` mas não define onde grava. `McpAuditLog`?
`AuditLog`? Tabela nova? Hoje `audit` mora em ambos `audit_logs` e `mcp_audit_logs`.

**Fix v3**: gravar em `audit_logs` (genérico) com `action="QUALITY_JUDGE_TOOL_REPLAY"`,
`actorType="system"`, `actorId="quality-judge"`. Reutilizar tabela existente.

### G9 — [M] Profile-builder concorrente: dois jobs simultâneos para o mesmo `userId`

Cron 04:30 e on-demand-após-10-msgs podem disparar ao mesmo tempo. Race em `UPDATE` da
`UserAgentProfile`.

**Fix v3**: BullMQ `jobId = "profile-build:${userId}"` único — BullMQ deduplica jobs com
mesmo `jobId`. Bloqueio durável.

### G10 — [N] Migration timestamp 20260525210000 pode colidir

Outro agente pode criar migration no mesmo timestamp. Coordenação via HISTORY mas
operacional.

**Fix v3**: antes de aplicar, listar `prisma/migrations/` e ajustar timestamp se preciso.
Documentar no plan task.

---

## Performance / custo

### G11 — [M] LLM judge sem cap por execução

`pnpm analyze:conversations --sample 0.05` pode estourar orçamento se rodar em produção
com 100 % do dataset. Sem cap.

**Fix v3**: script aceita `--max-cost-usd 50` (default $50). Cada call estima tokens antes
de mandar; quando acumulado passar do cap, pausa e pede confirmação CLI.

### G12 — [M] `ContextualSuggester` timeout 2 s não cobre cold start

LLM pode estar com cold start de 3-5 s em horário de baixa atividade. Fallback ativa
**sempre** nesse cenário. Quebra a feature.

**Fix v3**:
- Timeout adaptativo: 2 s para 1ª chamada; 4 s se a anterior demorou > 1.5 s.
- Pré-aquecimento: keep-alive ping ao provider Haiku 4.5 a cada 5 min (worker).
- Métrica: `SuggestionInteraction { chipSource: "fallback_timeout" }`.

### G13 — [N] Cache do UserAgentProfile 10 min pode ficar stale após build

Cron 04:30 grava novo profile às 04:31; cache em memória do app continua servindo o velho
até 04:40+. Stale benigno (chips welcome refletem perfil de ontem por 10 min).

**Fix v3**: aceitar; documentar. Invalidação por evento entre worker e app é over-engineering
para o ganho.

---

## Comportamento / UX

### G14 — [B] Cap dinâmico com bullets-pergunta < `maxSuggestions`

A v2 §6.2 diz: `min(7, qtde_bullets_pergunta)`. E se a IA fizer 1 pergunta? Mostro 1 chip
e descarto contextuais? Estranho — temos espaço para 3.

**Fix v3**: regra completa:
```
N = maxSuggestions (cap inferior)
B = qtde de bullets-pergunta extraídas
C = qtde de sugestões contextuais geradas

slots_finais = min(7, max(N, B))
chips = bullets[0..B] + contextuais[0..(slots_finais - B)] (após dedup)
```
Quando `B == 0`, ficam só contextuais até `N`. Quando `B >= N`, podem chegar até 7.

### G15 — [M] Anti-bubble com `maxSuggestions = 1`

A v2 diz ⅔ perfil + ⅓ descoberta. Para `N = 1`: `Math.ceil(1 * 2/3) = 1` perfil, `0` descoberta.
Faz sentido. Mas para `N = 2`: `Math.ceil(2 * 2/3) = 2` perfil, `0` descoberta — nunca
descobre.

**Fix v3**: regra: `descoberta = max(1, floor(N/3))` para `N >= 2`, `0` para `N = 1`.
Garante pelo menos 1 descoberta sempre que `N >= 2`.

### G16 — [M] Welcome cache + sessão multi-tab

Usuário abre 2 abas. Job de profile build roda. Cache do app servirá perfil novo em uma
aba e velho na outra. Inofensivo, mas confuso para QA.

**Fix v3**: aceitar; nota de QA.

### G17 — [N] Re-classificar mensagens antigas no backfill

A v2 task 5 da Onda 2 backfilla `topic_tags`. Mas com qual extrator? Mesmo de hoje (que
pode evoluir). Versionamento:

**Fix v3**: `Conversation.topicTags` ganha coluna `topic_tags_version Int @default(0)`. Quando
o algoritmo muda, força re-tag. Onda 1 grava `version=1`. Mudança futura: incrementa, dispara
re-backfill.

---

## Privacidade / governança

### G18 — [M] `recomendacaoPrompt` pode conter trechos de mensagem do usuário

A v2 §9.3 reconhece o risco mas não age. Admin de outro tenant pode ler trechos do usuário X
no painel.

**Fix v3**: scope. O painel só mostra recomendações cuja `Conversation.userId` pertence ao
tenant do admin (via `UserDomainAccess` ou `User.platformRole`). Admin não vê conversas de
fora do seu domínio.

Implementação: query em `/agente/inteligencia` faz join com `UserDomainAccess` para filtrar.

### G19 — [N] LGPD: documentar coluna `chipText` em SuggestionInteraction

`chipText` é texto da chip (gerada pelo sistema, não pelo usuário). Não é dado pessoal em
si, mas pode espelhar tópicos sensíveis ao usuário. Documentar.

**Fix v3**: §9.3 acrescentar nota.

---

## Testes / verificação

### G20 — [M] "Teste automático para não vazar bullets no corpo" precisa 2 níveis

A v2 task 9 da Onda 4 fala "fixture com resposta que tem bullets-pergunta". Falta detalhar:
- **Unit test** do extractor: input string → output `{cleanedBody, bullets}`.
- **Integration test** do orquestrador: simular ChatResult → confirmar `Message.content`
  gravado sem bullets E `chips` retornadas com eles.

**Fix v3**: explicitar 2 testes na task 9.

### G21 — [N] Verificação E2E precisa cobrir `intelligenceCheckpoint = OFF`

Sem teste para o caso "checkpoint desligado" — feature pode quebrar quando ligada.

**Fix v3**: cada onda de UI inclui smoke test com `intelligenceCheckpoint = PRODUCTION` e
um com `OFF`.

---

## Outros

### G22 — [M] Endpoint `tool-replayer` chama `/api/mcp` ou função direta?

A SPEC v2 não esclarece. Implicação grande para custo, latência e dependência:

**Fix v3**: chama **funções diretas** em `src/lib/reports/queries/**` (import).
- Não passa pelo HTTP do servidor MCP.
- Evita dependência de o container MCP estar rodando.
- O `mcp/index.ts` é só wrapper sobre essas funções; podemos importá-las direto.
- Em `quality-judge`, a entrada inclui {toolName, args, originalResult, newResult, divergence}.

### G23 — [M] `SuggestionInteraction.userId` sem FK + cascade

A v2 não declarou relação Prisma. Quando `User` é deletado, registros órfãos.

**Fix v3**: adicionar `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`
no model.

### G24 — [N] `dismissed` é difícil de gravar

Sessão expirar requer hook beforeunload + visibilitychange + timeout — frágil.

**Fix v3**: remover `dismissed` da enumeração. Computar dismissal **derivado** no relatório:
`dismissed = impressed - clicked`. Tabela só guarda `impressed` e `clicked`.

### G25 — [M] Chamadas internas usam `reasoningEffort`?

Topic-extractor, judge, contextual-suggester chamam LLMs. A v2 não fala. Confusão potencial
com o `reasoningCheckpoint` global do agente.

**Fix v3**:
- topic-extractor (Haiku 4.5) — sem reasoning (Haiku não suporta).
- contextual-suggester (Haiku 4.5) — sem reasoning.
- quality-judge (Gemini 2.5 Pro thinking) — **com** `reasoningEffort = "high"`. É o ponto da
  feature: pensar bem para julgar.

Configuração: cada caller passa `reasoningEffort` explícito. Não usa `AgentSettings.reasoningEffort`
nem `reasoningCheckpoint` (são para o agente principal de chat, não para chamadas internas).

### G26 — [N] Amostragem estratificada precisa algoritmo

A v2 fala "estratificada por tópico + por usuário" sem fórmula.

**Fix v3**: `analyze-conversations.ts`:
- Particiona conversas em buckets `(topicTag_primário, modelo)`.
- Para cada bucket: `Math.ceil(bucket_size * sampleRatio)` turnos.
- Mínimo: 1 turno por bucket (cobertura).
- Máximo: cap por bucket de `200` turnos (evita um bucket dominar custo).

---

## Resumo

**26 achados**:
- **Bloqueantes (B)**: G1, G3, G6, G7, G14 — 5.
- **Materiais (M)**: G2, G4, G5, G8, G9, G11, G12, G15, G18, G20, G22, G23, G25 — 13.
- **Notas (N)**: G10, G13, G16, G17, G19, G21, G24, G26 — 8.

Conjunto coerente — não há contradição interna. Próximo passo: aplicar todos → SPEC v3.

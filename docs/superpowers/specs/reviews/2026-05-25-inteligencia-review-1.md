# Review #1 — SPEC v1 do Agente Nex Inteligência

> Auditoria adversarial. Cada achado é classificado:
> - **B** (bloqueante): impede começar a planejar / ataca premissa central
> - **M** (material): precisa ser resolvido antes de virar plano
> - **N** (nota): refinamento de qualidade
>
> Após aplicar todos os B+M, a SPEC vira v2.

---

## Achados de schema (confronto com `prisma/schema.prisma` lido na revisão)

### F1 — [B] `tenantId` em `UserAgentProfile` não existe no modelo do projeto

A SPEC v1 §7.1 introduz `tenantId` nas três tabelas novas. **O projeto não tem `tenantId`
em `User` nem em `Conversation`**. O scope multi-tenant é por `platformRole` + `UserDomainAccess`,
não por coluna tenant. Adicionar `tenantId` sem fonte é desenhar para uma realidade que
não existe.

**Fix v2**: remover `tenantId` das três tabelas novas. Scope-por-usuário herda do `userId`.
Onde for relevante para o painel de admin, filtrar via join com `UserDomainAccess`.

### F2 — [B] Tipos de PK errados

- `UserAgentProfile.userId` deve ser `String @db.Uuid` (não cuid). `User.id` é UUID v4.
- `Conversation.id`, `Message.id` são UUID — `ConversationQualityEvaluation.conversationId`
  e `assistantMessageId` devem ser UUID.
- `SuggestionInteraction.userId/conversationId` também UUID.

**Fix v2**: corrigir todos os tipos no bloco Prisma da SPEC.

### F3 — [B] Nome do cap errado

A SPEC v1 fala em `agentSettings.maxInBubbleSuggestions` e `maxInitialSuggestions`.
**O campo real é `AgentSettings.maxSuggestions`** (default 3), único, global. Não há campo
separado para "iniciais" vs "in-bubble".

**Fix v2**: substituir referências por `maxSuggestions`. Decisão necessária: o cap dinâmico
3 vs 7 da frente D **estoura** o campo configurado pelo admin? Resposta: sim, mas só quando
há bullets-pergunta extraídos do corpo. Explicitar como exceção documentada no `compose.ts`
(o prompt diz à IA "máx 3 chips" — a regra de extração no servidor é que decide promover
até 7 bullets quando aparecerem).

### F4 — [M] `AgentSettings.suggestionsCheckpoint` ignorado

A SPEC esquece que sugestões têm checkpoint `OFF/PLAYGROUND/PRODUCTION`. A nova UI
contextual + welcome personalizado precisa **respeitar o checkpoint atual**. Quando
`OFF`, nenhuma chip é gerada (nem por LLM nem estática). Quando `PLAYGROUND`, só roda
para usuários no contexto de playground.

**Fix v2**: adicionar §"Checkpoints e flags" cobrindo: respeito a `suggestionsCheckpoint`
em welcome + contextual; eventual flag nova `intelligenceCheckpoint` (a decidir) para
gatear a Frente A.

---

## Achados de pipeline / inteligência

### F5 — [B] Pressuposto sobre `Message.toolCalls` não validado

A SPEC §3.5 diz "compara resultado original (se armazenado) com resultado atual". Mas
**`Message.toolCalls` é `Json?` sem estrutura documentada**. Não há garantia de que o
**resultado** da tool foi serializado lá; provavelmente só os `call.name + args` (padrão
da maioria das implementações que vi nessa codebase).

**Fix v2**: especificar:
1. Onda 1 inclui uma checagem do que está hoje em `Message.toolCalls`. Se faltar `result`,
   adicionar coluna `Message.toolResults Json?` ou usar `LlmUsage` como fonte.
2. Para conversas antigas onde o resultado original não existe, o pipeline marca a avaliação
   como `original_result_missing` e o juiz avalia só `aderencia + clareza + escolha_de_tools`.

### F6 — [M] Re-execução de tool com auth por usuário não está resolvida

A SPEC §3.5 diz "re-executar as tools de leitura". As tools de leitura do MCP semântico
filtram por `UserDomainAccess` (RBAC 7 camadas, decisão canônica #6). O script de análise
roda em background — como ele encarna o usuário original?

Opções:
- **A**. Service account com bypass de RBAC: re-executa como super_admin, ignorando
  domain access. **Risco**: re-execução pode retornar dados que o usuário original não
  veria. Para fins de juiz, tudo bem (juiz não mostra resultado ao usuário). Mas precisa
  documentar.
- **B**. Encarna o `userId` original (cria sessão fake). Honra RBAC; mais fiel.

**Fix v2**: escolher A (mais simples; juiz vê tudo, decide se a IA escolheu a tool certa).
Documentar que o `tool_replayer` roda com privilégio elevado e nunca expõe resultado ao
front. Em audit log fica registrado como `actor=system:quality-judge`.

### F7 — [B] "Correção factual" ambígua: dados mudam no tempo

A rubrica §3.4 inclui "correção factual" que compara resposta da IA com tool re-executada
hoje. Mas se o estoque do produto X era 100 em fev/2026 e é 0 hoje, a resposta "saldo é 100"
estava correta no tempo. Punir o agente por isso é métrica errada.

**Fix v2**:
- A rubrica `correcaoFactual` mede coerência entre a **resposta** e o **resultado da tool
  registrado no turno** (não a re-execução de hoje).
- A re-execução de hoje vai para um campo separado `toolsReexecuted.divergence` (informativo,
  não pontua a IA, sinaliza migração de dado / bug de tool).
- Se o resultado original não está disponível (F5), `correcaoFactual` retorna `n/a` e a
  avaliação só pontua nas outras 3 dimensões.

### F8 — [M] Onda 1 tagging por mensagem custa caro e bloqueia o run-agent

A SPEC §10 Onda 1 diz: "ao receber a primeira mensagem de uma conversa, chamar
topic-extractor". Implícito é síncrono no `run-agent.ts`. Isso adiciona latência ao chat
real do usuário (LLM call extra). Inaceitável.

**Fix v2**: o topic-extractor roda **async**, fora do caminho crítico:
- Job BullMQ `topic-tagging` enfileira após gravar a mensagem.
- Worker consome, classifica, `UPDATE conversations SET topic_tags = ...`.
- Latência do chat não muda.
- O job é idempotente (já tem tags? não regrava).

### F9 — [M] Topic-extractor: modelo, prompt, custo não especificados

"Modelo barato (Haiku 4.5 / Gemini Flash)" — quem decide? Como é configurado? Custo?

**Fix v2**: especificar:
- Default: Haiku 4.5 (já está no catálogo, AnthropicCredential já cadastrado).
- Configurável via `AgentSettings.intelligenceModel` (novo campo, opcional, default null
  → usa Haiku 4.5).
- Prompt fixo embutido em `topic-extractor.ts` (não vai para identity-base).
- Custo: 6 k conversas × 1 chamada × ~200 input tokens × $0.80/Mtok = **≈ $1**.
  Tagging incremental: ~3 mensagens/dia × 200 tok = centavos/dia.

### F10 — [B] LLM judge custo realista não calculado

A SPEC §3.6 fala em "amostragem estratificada 5/25/100 %" sem números. Decisão precisa
de orçamento.

**Fix v2** — cálculo rápido:
- 10.600 turnos no banco.
- 5 % = 530 turnos.
- Cada turno no juiz: input ≈ 4k tokens (msg user + msg assistant + tool calls + results
  + rubrica). Output ≈ 400 tokens.
- Opus 4.7 input $15/Mtok, output $75/Mtok → ~$0.09/turno → **≈ $48 onda 2**.
- Gemini 2.5 Pro thinking input $2.50/Mtok, output $15/Mtok → ~$0.016/turno → **≈ $8**.

**Decisão v2**: usar Gemini 2.5 Pro thinking por padrão. Opus 4.7 fica como opção
configurável (`AgentSettings.qualityJudgeModel`) para casos críticos.

### F11 — [M] Embeddings da Frente C: provider, dimensionalidade, storage

A SPEC §5.2 fala "embedding de cada sugestão candidata". Sem provider, sem dimensão, sem
onde guardar.

**Fix v2**:
- pgvector já existe (confirmado: `prisma/migrations/20260519054910_f5_pgvector`).
- Usar `text-embedding-3-small` da OpenAI (1536 dim) — já é o modelo do KB embedding F5.
  Reaproveita credencial e infra.
- Storage: NÃO persistir embedding de chip individual (volume muito alto). Computar
  on-the-fly por sessão (cache em memória pelo tempo de vida da sessão chat-panel).
- Embeddings das mensagens user dos últimos 5 turnos: também on-the-fly. ≤ 5 chamadas
  embed por geração de chips.
- Custo: 8 embeddings × 50 tok × $0.02/Mtok = **fração de centavo por geração**.

### F12 — [M] Dedup semântico tem risco de descartar chip válida

Threshold cosine > 0.85 é arbitrário. Se a chip "Qual o saldo de mola espiral?" tem cosine
0.86 com a pergunta anterior "Quanto tenho de mola espiral?" — são a mesma coisa, descartar
está certo. Mas "Qual a margem do produto X?" pode ter cosine alto com "Qual o preço do
produto X?" e são perguntas distintas.

**Fix v2**:
- Threshold inicial 0.88 (não 0.85). Mais conservador.
- Logar em `SuggestionInteraction` (action="dedup_dropped") as chips descartadas pelo
  dedup para revisão posterior. Permite calibrar.
- Override: se as duas chips usariam tools diferentes, **não dedup** mesmo com cosine alto.

### F13 — [M] Personalização causa filter bubble

Se o usuário só vê chips dos seus tópicos preferidos, nunca descobre features novas.

**Fix v2**: regra de mistura. Das `maxSuggestions` chips iniciais:
- ⅔ vêm do perfil (top topics).
- ⅓ vêm de uma lista "descoberta" (tópicos populares no tenant em que ele tem acesso,
  excluindo seus top topics).
- Para `maxSuggestions = 3`: 2 do perfil + 1 de descoberta.

### F14 — [N] Onda 3 não cita `chat-panel.tsx`

O ContextualSuggester precisa ser invocado pelo `chat-panel.tsx`. A onda 4 (lista de
arquivos a tocar) tem `chat-panel.tsx` mas não detalha o ponto de cabeamento.

**Fix v2**: especificar o callsite — `chat-panel.tsx`, no callback `onMessageDone` (ou
equivalente), com fetch `/api/agent/suggest-continuation` (rota nova).

---

## Achados de operação

### F15 — [M] Backfill de `topic_tags` para 6 k conversas antigas

A SPEC menciona backfill mas não define a ordem das ondas. Se a Onda 2 (análise) precisa
das tags para agregar por tópico, e o backfill só roda na Onda 2, então a Onda 1 termina
sem tags antigas — e isso é OK, mas precisa estar claro.

**Fix v2**: Onda 1 entrega tagging **on-write** (conversas novas + retomadas). Onda 2
inclui task `task 2.0: backfill tagging das 6 k conversas` antes de qualquer análise.
Custo do backfill: ~$1 (Haiku 4.5 × 6 k mensagens iniciais).

### F16 — [M] Diretiva "perguntas vão para chips" pode ser sobrescrita

O `identity_base` é salvo no banco (`AgentSettings.identityBase`) e sobrescreve o default
do código. Foi a lição aprendida pelo storytelling no 2026-05-25 07:10 (commit ed32e2e).
Se a SPEC só altera o default em `identity-base.ts`, em produção continua o `identity_base`
do banco e a regra nunca chega ao agente.

**Fix v2**: a Onda 4 inclui:
1. Alterar default em `identity-base.ts`.
2. Append da diretiva diretamente em `compose.ts` (após a seção "## Comportamento"),
   garantindo que ela aparece **mesmo que o `identity_base` do banco esteja preenchido**.
3. Script `pnpm intelligence:reset-identity-default --apply` (opcional) para admins que
   queiram realinhar.

### F17 — [N] BullMQ queue name precisa evitar `:`

A SPEC §10 Onda 1 menciona "job BullMQ topic-tagging". Lembrar: nomes de queue não podem
ter `:` (lição 2026-05-25 15:45). Documentar nomes propostos: `agent-topic-tagging`,
`agent-profile-build`. Sem `:`.

### F18 — [M] `SuggestionInteraction` cresce indefinidamente

Sem TTL, a tabela vira problema operacional em 6-12 meses (milhares de impressed/click
por dia × N usuários).

**Fix v2**:
- TTL de 90 dias por padrão (cron `agent-intelligence-cleanup` semanal).
- Agregação opcional em uma tabela `SuggestionMetricsDaily` (futuro, fora desta entrega
  mas mencionar como follow-up).

### F19 — [N] Cron `03:00` fixo

"Cron diário 03:00" pode coincidir com janelas de outros jobs já existentes (snapshot
Odoo, reconcile). Verificar e propor horário sem conflito.

**Fix v2**: cron `agent-profile-build` em `04:30` (entre snapshot 30min e reconcile 24h).

---

## Achados de UI / experiência

### F20 — [M] Navegação para `/agente/inteligencia` esquecida

Não há menção a:
- Link no sidebar (para `admin` e `super_admin`).
- Breadcrumb da página.
- Permissão checada no `layout.tsx` da rota.

**Fix v2**: adicionar §UI navigation com: entry no sidebar sob "Agente Nex > Inteligência"
visível apenas para roles `admin`/`super_admin`; breadcrumb consistente com `/agente/consumo`;
guard no `layout.tsx`.

### F21 — [M] Geração de chips contextual > 2 s

LLM barato pode demorar > 2 s em horário de pico. A SPEC promete ≤ 2 s sem plano B.

**Fix v2**: degradação graceful — se `ContextualSuggester` não responder em 2 s, devolver
o que `suggestions-extractor` já extraiu (chips antigas / fallback). Race com timeout.

### F22 — [N] UI `/agente/inteligencia` carece de wireframe

Sem ui-ux-pro-max input antes do plan, a UI vira improvisação na execução.

**Fix v2**: Onda 2 começa por `ui-ux-pro-max` (regra do projeto: toda UI obrigatoriamente
passa por ele).

---

## Achados de fluxo humano / governança

### F23 — [M] Recomendações do juiz viram mudança de prompt: fluxo manual indefinido

A SPEC menciona "revisão humana" mas não desenha o fluxo: quem revisa? como aceita? como
isso vira PR no `identity-base.ts`?

**Fix v2**: fluxo explícito:
1. Juiz grava `recomendacaoPrompt` em `ConversationQualityEvaluation`.
2. UI `/agente/inteligencia` agrupa recomendações similares (cluster por embedding
   da própria recomendação) e mostra "Top 10 padrões de melhoria sugeridos".
3. Cada cluster tem botão `[Aceitar e abrir PR]` (cria branch `prompt-tweak/...`, adiciona
   diff ao `identity-base.ts`, abre PR).
4. Para v3 da spec, simplificar: botão `[Aceitar]` apenas registra em `prompt_recommendations`
   (tabela nova) e o humano (você) escreve o PR manualmente no PR seguinte. Versão automática
   fica para follow-up.

### F24 — [N] Conflict potential com encerrado claude-nex-llm-adapters-modernization

A modernização dos 4 adapters mexeu fundo no `run-agent.ts`. Toda alteração desta entrega
em `run-agent.ts` precisa preservar a estrutura de `reasoningHistory`, `LlmUsage`,
`tool_call_id` pareamento, etc.

**Fix v2**: §"Compatibilidade" com checklist:
- Não alterar fluxo de `loadConversationReasoningHistory`/`saveConversationReasoningHistory`.
- Não alterar formato de `Message.toolCalls`.
- Apenas adicionar telemetria/instrumentação **após** o turno terminar (não no caminho síncrono).

---

## Resumo

- **Bloqueantes (B)**: F1, F2, F3, F5, F7, F10 — fix obrigatório antes da v2.
- **Materiais (M)**: F4, F6, F8, F9, F11, F12, F13, F15, F16, F18, F20, F21, F23 — fix
  antes da v2.
- **Notas (N)**: F14, F17, F19, F22, F24 — incorporar como melhoria.

24 achados; nenhum performativo. Próximo passo: aplicar todos -> SPEC v2.

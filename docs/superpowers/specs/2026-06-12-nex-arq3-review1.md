# REVIEW ADVERSARIAL #1 , SPEC Nex Arquitetura 3.0 (2026-06-12)

> Revisor: arquiteto sênior (review 1 de 2). Base: a spec v1, os 4 research docs
> de 2026-06-12 e o código real da branch `feat/nex-reconstrucao` (run-agent.ts,
> conversation.ts, montar-conversa.ts, compose.ts, context-window.ts,
> prisma/schema.prisma, llm/catalog.ts, llm/providers/openai.ts, evals/golden-*).
> Convenção: BLOCKER = a spec como escrita produz plano errado ou quebra produção;
> MAJOR = lacuna/premissa que precisa entrar na v2; MINOR = ajuste de texto/critério.

## Sumário: 3 BLOCKER, 9 MAJOR, 6 MINOR

O diagnóstico do problema (§1) está correto e foi conferido contra o código: o
`take: 12` acontece antes do `sanitizeHistoryPairs` (`src/lib/agent/conversation.ts:177-187`
+ `src/lib/agent/run-agent.ts:716-727`), mensagens `role=tool` de fato nunca são
persistidas (run-agent persiste user, assistant+toolCalls e assistant final; os
results vão para `Message.toolResults`, que `loadHistory` não seleciona), e
`montarConversa` é replay puro (`src/lib/agent/prompt/montar-conversa.ts:24-38`).
O problema da spec não é o diagnóstico, é (a) premissas sobre o estado do
transporte LLM e dos nomes de schema que o código contradiz, (b) critérios de
aceite ancorados numa infraestrutura de eval que não existe, e (c) silêncio sobre
os pontos exatos do código que vão quebrar (sanitização multi-provider, cap de 2
tools no prompt, seleção de modelo por tier).

---

## BLOCKERS

### B1. O.1 "migração Responses API" parte de premissa falsa: o gpt-5.4-mini JÁ roda na Responses API

- **Evidência:** `src/lib/agent/llm/catalog.ts:376` , `"gpt-5.4-mini": { ..., openaiEndpoint: "responses", ... }`
  (idem TODA a família gpt-5.x, linhas 373-390). `src/lib/agent/llm/providers/openai.ts:233-234`
  ("Modelo com cap.openaiEndpoint === 'responses' vai para /v1/responses; caso contrario,
  cai para /v1/chat/completions") e `openai.ts:432` ("/v1/responses canonica (Onda 3 da
  modernizacao). Aplicado para todos os..."). Chat completions é só fallback para modelos
  legados (gpt-4.x). O run-agent já passa `reasoningHistory` e `promptCacheKey` por
  iteração (`run-agent.ts:812-820`) e o comentário em `run-agent.ts:753-758` registra
  "OpenAI segue stateless via Responses API".
- **O que de fato falta:** `previous_response_id` não é usado em lugar nenhum
  (grep no repo: zero ocorrências). Hoje cada iteração do loop reenvia a conversa
  inteira; o encadeamento de raciocínio entre passos é o delta real.
- **Por que é BLOCKER:** a onda O.1 como escrita ("migrar o loop de tool calling para a
  Responses API", flag de rollback "manter o caminho atual") planeja uma migração que já
  aconteceu e definiria rollback para um caminho (chat completions) que o modelo ativo
  nem usa. O plano derivado dessa task seria trabalho fantasma e o teste de rollback
  seria inválido.
- **Correção proposta:** reescrever O.1 como "adotar `previous_response_id` no
  encadeamento INTRA-turno (entre iterações do loop de tool calling) no adapter
  OpenAI", com flag e fallback = comportamento atual (replay intra-turno). Deixar
  explícito o limite: cross-turno continua self-managed (o próprio research de memória
  §2 conclui que `previous_response_id` cross-turno é replay cobrado integral + TTL 30d
  + lock-in, e recomenda estado self-managed). A spec deve citar essa fronteira para o
  plano não "migrar" o histórico da conversa para a OpenAI por engano.

### B2. M1/M2/O1 são medidos por baterias golden multi-turno que a infraestrutura atual NÃO consegue rodar, e a construção do harness não está em nenhuma onda

- **Evidência:** o harness golden principal (`src/lib/agent/evals/golden-nex.e2e.ts`)
  **não chama `runAgent`**: ele executa o handler da tool diretamente
  (`tool.handler(parsed, ctx)`, linha ~49) e mede NUMERO/ALUCINACAO/DESAMBIGUACAO
  contra o cache. Não há LLM, não há histórico, não há conversa. O único eval que roda
  `runAgent` é `golden-under-active.e2e.ts`, e ele só verifica não-regressão do CONJUNTO
  DE TOOLS CHAMADAS (shadow vs active) em N=16 casos , não avalia conteúdo de resposta,
  muito menos memória entre turnos. O grep por "followup/history/turno" em
  golden-nex.e2e.ts retorna vazio.
- **Por que é BLOCKER:** os critérios de aceite do projeto (M1 "bateria
  `memoria-30-turnos`", M2 "≥95% dos casos golden de follow-up", O1 "golden `composta-*`
  ≥10 casos") pressupõem um harness conversacional multi-turno com asserções sobre a
  RESPOSTA do agente. Isso é um deliverable de engenharia significativo (driver de
  conversa via runAgent + MCP full-stack + asserções determinísticas ou juiz calibrado +
  custo de tokens por run + política de flakiness/gate) que não existe e não aparece em
  M.1-M.7, O.1-O.4 nem P.1-P.5. Sem ele, o objetivo nº 1 do projeto não tem mecanismo
  de medição: a spec está, na prática, sem critério de aceite verificável.
- **Correção proposta:** adicionar task explícita (sugiro M.0 ou E.1) "harness de eval
  conversacional multi-turno sobre runAgent", definindo: como asserta (valor numérico
  esperado por turno, derivado de tool handler ouro, no estilo kpiOuro), em que canal
  roda (já existe `AgentChannel.backtest` criado exatamente para replay sem poluir
  monitoramento, `prisma/schema.prisma:57-65`), custo estimado por run e onde se
  encaixa no CI (provavelmente E2E manual, não PR gate). `scripts/ab-cerebro.ts` já
  demonstra o padrão (createConversation + runAgent encadeado com turno `prev`,
  linhas 128-148) e pode ser a semente.

### B3. M.2 ("não descartar assistant-com-toolCalls") quebra os adapters multi-provider se não especificar a síntese dos tool results no replay

- **Evidência:** `sanitizeHistoryPairs` existe porque "A API Anthropic exige que toda
  mensagem assistant com toolCalls tenha a correspondente mensagem tool logo após. Se o
  budget cortar no meio de um par, a API retorna 400" (`src/lib/agent/conversation.ts:47-52`).
  O mesmo vale para o replay na Responses API da OpenAI (item `function_call` sem o
  `function_call_output` correspondente é request inválido , o adapter converte o
  histórico em items em `openai.ts:658`). Como `role=tool` NUNCA é persistido, todo
  assistant-com-toolCalls carregado é estruturalmente órfão: mantê-lo no replay sem
  par sintetizado = 400 em produção. E o caminho multi-provider é vivo: o playground
  aceita `llmOverride` com Anthropic/Gemini/OpenRouter
  (`src/app/api/agent/playground/stream/route.ts`, `run-agent.ts:363-364`), e o
  `ab-cerebro.ts` roda candidatos de outros providers pelo mesmo loadHistory.
- **Por que é BLOCKER:** a task M.2, como escrita ("consertar sanitizeHistoryPairs/take"),
  permite uma implementação literal (parar de descartar) que derruba o turno com erro
  de API. O conserto correto NÃO é remover a sanitização, é mudar o que se persiste/replaya.
- **Correção proposta:** especificar o mecanismo: ao montar o histórico, cada
  assistant-com-toolCalls é acompanhado de tool results sintetizados a partir do
  `toolDigest` (M.1), no formato de cada provider (mensagem `role=tool` por callId, ou
  item `function_call_output` na Responses API); OU alternativa mais simples: strip dos
  `toolCalls` e injeção do digest como texto no content do assistant. A spec precisa
  escolher (a primeira preserva a semântica de tool use; a segunda é provider-agnóstica
  e mais barata). Em ambos, `sanitizeHistoryPairs` continua existindo como rede de
  segurança.

---

## MAJORS

### MJ1. Nomes de modelos Prisma errados: `AgentMessage` e `AgentConversation` não existem

- **Evidência:** os modelos reais são `Conversation` (`prisma/schema.prisma:2551`,
  tabela `conversations`) e `Message` (`schema.prisma:2587`, tabela `messages`).
  A spec §3.1 escreve "`AgentMessage.toolDigest`", "`AgentConversation.resumoProgressivo/
  resumoAteMensagemId/focoAtual`" e "FTS portuguese em AgentMessage". O research de
  memória avisou que os nomes eram "ilustrativos" (§3.2), mas a spec os promoveu a
  contrato sem conferir.
- **Correção:** trocar para `Message.toolDigest`, `Conversation.resumoProgressivo`/
  `resumoAteMensagemId`/`focoAtual` e índice FTS em `messages(content)`. Em projeto com
  plano gerado a partir da spec, nome errado de modelo propaga para migration, código e
  testes.

### MJ2. `AgentUserMemory` ignora o `UserAgentProfile` que já existe e se sobrepõe a ele

- **Evidência:** `UserAgentProfile` (`schema.prisma:3184-3201`) já guarda, por usuário:
  `topTopics`, `topKeywords`, `preferredDomains`, contadores e versão de rebuild ,
  exatamente "perfil do usuário" (L1). A spec propõe `AgentUserMemory`
  (tipo/chave/valor: preferencia|fato|alias) sem mencionar o modelo existente.
- **Correção:** a spec deve decidir e registrar: (a) `AgentUserMemory` é complementar
  (aliases/fatos explícitos, determinísticos) e `UserAgentProfile` segue como ranking
  estatístico; ou (b) estender `UserAgentProfile`. Sem isso nascem dois subsistemas de
  memória de usuário concorrentes, com duas rotinas de build e duas injeções no prompt.

### MJ3. Tiers (T2/T3 com "modelo forte") não definem ONDE vive a seleção de modelo, e o sistema atual só tem UM modelo ativo

- **Evidência:** o run-agent resolve o LLM por `getActiveLlmConfig()` (config única
  ativa, `llm_configs.is_active`) ou `llmOverride` (playground/ab-cerebro)
  (`run-agent.ts:363-366`). Não existe mecanismo de "modelo por papel/tier". A spec §3.2
  diz "modelo forte (gpt-5.4) só no plano e na síntese" sem dizer: onde configura
  (AgentSettings? LlmConfig com papel?), qual credencial usa, o que acontece se o admin
  trocar o modelo ativo para Anthropic/Gemini (o T2/T3 força OpenAI? a cascata respeita
  o provider ativo?), e como o playground (que força um modelo via override) interage
  com tiers.
- **Correção:** especificar o modelo de configuração dos tiers (sugestão: campos em
  `AgentSettings`, ex. `tierStrongModel`/`tierStrongProvider` + fallback documentado
  quando o provider ativo não for OpenAI) e o comportamento com `llmOverride` (override
  vence tudo? só o T1?). Nota de custo: gpt-5.4 com reasoning PRODUCTION mediu **89,8s**
  por chamada no loop (diagnóstico §5); a spec deve fixar `reasoning_effort` baixo/médio
  para o T2/T3 explicitamente, senão C1 (latência) é inalcançável.

### MJ4. O prompt vivo CONTRADIZ o T2: "LIMITE RIGIDO DE TOOLS: maximo 2 chamadas" + MAX_ITERATIONS=3, e nenhuma task remove/condiciona isso

- **Evidência:** `src/lib/agent/prompt/compose.ts:216` ("LIMITE RIGIDO DE TOOLS: maximo
  2 chamadas de ferramenta por resposta... Apos a 2a chamada, RESPONDA com o que tiver")
  e `run-agent.ts:87` (`MAX_ITERATIONS = 3`, reduzido de 5 por loop de tools do mini).
  O1 exige "2-3 sub-consultas completas"; um plano T2 com 3 tools paralelas + síntese
  viola a diretriz do system prompt e pode estourar as iterações.
- **Correção:** adicionar à onda O uma task explícita: diretriz de tool budget
  PARAMETRIZADA por tier (T1 mantém 2; T2/T3 recebem budget maior no prompt) e
  `MAX_ITERATIONS` por tier. Importante registrar o porquê do limite atual (loop do
  mini) para não reintroduzir a regressão no T1.

### MJ5. Cascata T1→T2 acontece DEPOIS do streaming: o usuário já viu a resposta errada, e re-executar tools repete efeitos colaterais

- **Evidência:** os validadores rodam após a resposta já ter sido streamada token a
  token (`run-agent.ts:785-788` streama sempre; AutoValidator em l.1118-1247 roda antes
  do `done` mas depois dos tokens), e o diagnóstico já lista como limitação #12 "a
  resposta persistida pode divergir da streamada". A cascata re-executa a pergunta
  inteira em T2/T3: (a) o usuário vê a resposta do T1 sendo "trocada" sem explicação de
  UX definida; (b) tools com efeito (ex.: `registrar_lacuna`, que grava em
  `feature_requests`) rodam de novo , gap duplicado; (c) o cache de sessão por
  (tool,args) tem TTL 60s, então parte das tools re-roda de verdade.
- **Correção:** a spec precisa definir o contrato de UX/eventos da cascata (ex.: evento
  `revising` na bolha; ou validar ANTES de liberar o flush do streaming para T1 quando o
  turno for de risco) e exigir idempotência/supressão de tools com efeito colateral na
  re-execução.

### MJ6. Mudar a janela de "mensagens" para "turnos" reinterpreta silenciosamente um setting vivo de admin (`context_window_size`) com clamp 10..50

- **Evidência:** `src/lib/agent/context-window.ts:15-16,42-45` trava `size` em [10,50]
  MENSAGENS; o valor vivo é 12 e há checkpoint (OFF/PLAYGROUND/PRODUCTION) e
  `includeSystem` configuráveis na UI de `/agente`. "8-12 turnos" = até ~48 linhas (um
  turno grava 3-4 mensagens), no teto do clamp. A spec não diz o que acontece com o
  setting existente, a UI, o checkpoint e o modo `includeSystem=false` (que hoje tem um
  caminho próprio de strip em `conversation.ts:196-209`).
- **Correção:** especificar a migração do setting (novo campo `context_window_turns` com
  default, deprecação do antigo, ou conversão automática) + atualização da UI + o
  comportamento dos 3 checkpoints e do includeSystem no mundo por-turnos.

### MJ7. Premissa "L0 estático, cacheável" é falsa hoje: a KB entra no system prompt POR PERGUNTA, e L1 por usuário quebra o prefixo compartilhado

- **Evidência:** `searchKb(userMessage, 5)` injeta top-5 snippets da KB no system
  prompt a cada turno (`run-agent.ts:440-463`; bloco `[BASE DE CONHECIMENTO]` em
  `compose.ts:148-180`), ou seja, o "L0" atual VARIA com a pergunta. Além disso, inserir
  L1 (perfil do usuário) logo após L0 torna o prefixo único por usuário. O C1
  (custo ≤2x) depende da tese de caching da §3.1.
- **Correção:** a spec deve mandar mover a injeção de KB para fora do prefixo (junto do
  item de data, antes da pergunta , mesmo padrão já usado para a data em
  `montar-conversa.ts`) ou declarar explicitamente que aceita o miss e recalcular a
  conta de custo. Sem isso, a ordem L0→L1→L2→L3→L4 não entrega o caching prometido.

### MJ8. Resolução de anáfora não define ONDE o resultado é injetado , hoje a reformulação existe e é descartada para a resposta

- **Evidência:** a reformulação contextual atual serve só ao roteamento; "a resposta do
  agente continua usando args.userMessage" (`run-agent.ts:529-531`, diagnóstico §2 e
  §6.7). A spec §3.1 diz que a heurística resolve contra focoAtual/ConversationEntity,
  mas não diz o mecanismo de entrega: reescreve a mensagem vista pelo LLM (divergindo da
  mensagem persistida)? injeta os slots resolvidos como bloco de contexto L4 ("período
  em foco: 2026-05")? alimenta só o router? Os argumentos de tool são gerados pelo LLM,
  então "entra nos argumentos da tool" (research §3.5.3) não é diretamente
  implementável.
- **Correção:** definir: a mensagem do usuário permanece intocada no banco e no replay;
  a resolução entra como (a) reescrita anexada ao item de input do turno ("[Contexto]
  pergunta interpretada: ...") E (b) sinal para o router. Critério M2 depende disso.

### MJ9. Flywheel em `feature_requests` colide com o Caminho 3a: o modelo não tem campos para triagem e a fila poluiria a lista de gaps

- **Evidência:** `FeatureRequest` (`schema.prisma:2523-2531`) tem só
  userId/perguntaResumo/dominio/criadoEm , é o log de LACUNA DE CATÁLOGO (decisão
  canônica #5, Caminho 3a), exposto em UI de gaps. Falha de validador/feedback negativo
  é outra natureza (a tool existe, a resposta saiu errada) e precisa de
  conversationId/messageId/veredito/status de triagem.
- **Correção:** tabela própria (ex.: `GoldenCandidate`) ou reuso de
  `ConversationQualityEvaluation`/`MessageFeedback` como fonte da fila , a spec deve
  escolher. Não sobrecarregar `feature_requests`.

---

## MINORS

### MN1. Colisão de nomes de onda: "Onda M ... M.6 pode ficar p/ onda M2"
"Onda M2" não existe na lista de ondas (M, O, P). Renomear (ex.: "fase 2 da onda M" ou
mover M.6 para uma onda M' explícita) para o plano não criar uma onda fantasma.

### MN2. M2 "≥95% em ≥15 casos" é matematicamente ambíguo
Com n=15, 95% = 14,25 → na prática exige 15/15 (ou aceita 14/15=93,3%?). Definir
inteiros: "no mínimo 14 de 15" ou "todos menos 1".

### MN3. FTS só em `content` não acha os números do toolDigest
O L5 indexa `to_tsvector('portuguese', content)`, mas "qual era aquele valor" vive no
digest (coluna nova), não na prosa de 132 chars. Incluir `toolDigest` no índice/na
expressão do FTS (ou concatenar no tsvector).

### MN4. Streaming do plano T2 vaza para o usuário
O loop streama sempre e o consumidor decide visualmente pelo stop_reason
(`run-agent.ts:785-788`). Um turno de PLANO streamaria texto de plano na bolha. Definir
o contrato de eventos (suprimir tokens da fase de plano, ou emitir como `thinking`).

### MN5. Riscos operacionais não listados: worker container + janela WhatsApp 24h
(a) O job de resumo (M.5) roda no worker BullMQ; em dev o worker NÃO tem build próprio
(rebuild via `docker compose build app`, armadilha documentada no CLAUDE.md §2.1) ,
colocar no checklist da onda M. (b) Conversa WhatsApp rota a cada 24h
(`conversation.ts:16`), então L2/L4 zeram diariamente nesse canal; a continuidade
cross-conversa depende de M.6, que está adiado , registrar a consequência.

### MN6. C1 sem baseline definido
"Custo médio por turno ≤ 2x o atual": fixar a janela de baseline (ex.: os 14d do
diagnóstico: US$12,01/4.374 chamadas) e o que entra na conta (embeddings? enhance?
guardrail/validator?), senão a medição vira discussão.

---

## Verificações que PASSARAM (registro do que foi conferido e está correto)

- `take:12` antes da sanitização, descarte de assistant-com-toolCalls, 0 mensagens
  `role=tool`: confirmados no código (`conversation.ts:53-86,177-187`; `run-agent.ts:724-727`).
- `montarConversa` replay puro com data fora do prefixo: confirmado (`montar-conversa.ts`).
- BullMQ acessível do lado app: confirmado (`src/lib/agent/intelligence/enqueue.ts`).
- Canal `backtest` existe para replays sem poluir monitoramento (`schema.prisma:57-65`).
- Export de conversa (`src/lib/actions/agent-conversation-export.ts`) lê role tool e
  toolCalls de forma resiliente , toolDigest novo não quebra o export.
- Não-objetivos coerentes com as decisões canônicas (#3 catálogo semântico mantido,
  #4 sem DuckFly, #5 Caminho 3 preservado); sem travessão no texto.
- Ordem M → O → P está certa na essência (memória primeiro é a dor declarada; O.2
  cascata consome o sinal dos validadores que já existem V1-V8; P refina). Única emenda:
  O.2 deve declarar o comportamento interino da cascata antes de P.1 existir (reprova
  crua dispara cascata sem crítica direcionada , aceitável, mas dizer).

## Veredito

A spec v1 NÃO está pronta para virar plano. Os 3 BLOCKERs (premissa falsa da migração
Responses API; critérios de aceite sem harness que os meça; M.2 quebrando o contrato
multi-provider do replay) precisam ser resolvidos na v2, junto com a correção dos nomes
de schema (MJ1) e a definição de configuração de tiers (MJ3), que são os dois MAJORs
com maior poder de contaminar o plano.

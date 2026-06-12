# REVIEW ADVERSARIAL #2 , SPEC Nex Arquitetura 3.0 (2026-06-12)

> Revisor: arquiteto sênior (review 2 de 2), mandato: caçar o que a review 1 não pegou.
> Base: spec v1, review 1, os 4 research docs de 2026-06-12 e o código vivo da branch
> (run-agent.ts, conversation.ts, auto-validator.ts, openai.ts, compose.ts,
> montar-conversa.ts, golden-schema.ts, golden-nex.e2e.ts, cost-regression.e2e.ts,
> scripts/ab-cerebro.ts, prisma/schema.prisma).
> Convenção: BLOCKER = a spec (mesmo com as correções da review 1 aplicadas) produz
> plano errado ou quebra produção; MAJOR = precisa entrar na v3; MINOR = ajuste.

## Sumário: 2 BLOCKER, 8 MAJOR, 6 MINOR

A review 1 acertou o que conferiu (B2/B3, MJ1, MJ4, MJ6, MJ7 estão corretos e foram
re-verificados). O que ela NÃO fez: (a) checar se as próprias correções dela criam
problema novo (duas criam); (b) cruzar a Onda M com a Onda P, o conflito central da
spec inteira está aí e ninguém viu; (c) perguntar quanto custa e quanto vale cada
peça para um time de 1 dev + Claude.

---

## BLOCKERS

### B2-1. A Onda M colide de frente com os validadores vivos: V2/guardrail/repair loop REPROVAM sistematicamente a resposta de memória, exatamente o cenário do critério M1

- **Evidência (cadeia completa):**
  1. `ValidationContext` recebe apenas `question`, `llmResponse` e `toolResults`
     **do turno atual** (`src/lib/agent/validation/auto-validator.ts:66-70`);
     `run-agent.ts:1159-1164` passa `allTurnEnvelopes`, acumulado só dentro do loop
     do turno corrente (`run-agent.ts:767-779`). Nenhum validador enxerga histórico,
     digest, resumo ou focoAtual.
  2. `validateV2` (auto-validator.ts:281-306) marca como inventado TODO número da
     resposta que não está literal/derivável dos toolResults do turno. Roda mesmo
     com `toolResults = []` (só `extrairNumeros` da resposta precisa achar algo).
  3. O cenário-bandeira do M1 ("qual era aquele valor do turno 3?") é, por
     construção da Onda M, respondido **da memória, sem tool call no turno**:
     toolResults vazio, número citado vem do toolDigest/resumo/focoAtual,
     V2 dispara.
  4. O repair loop (P.1) então piora: o hint do retry manda "REESCREVA usando
     apenas o que esta nos toolResults deste turno" (`run-agent.ts:1192-1195`) e o
     hint do V2 manda "Use apenas valores presentes nos toolResults"
     (auto-validator.ts:302), ou seja, a correção **apaga o número correto de
     memória**. Com a cascata (O.2), o caso ainda re-executa em T2 com os MESMOS
     validadores, reprova de novo e termina em "resposta honesta de falha".
  5. O guardrail factual tem guarda parcial (`allTurnToolResults.length > 0`,
     run-agent.ts:1031-1033), então respostas de memória pura escapam DELE, mas
     não do V2; e respostas mistas (1 tool nova + 1 número relembrado) caem nos dois.
- **Por que é BLOCKER:** a spec entrega a Onda M (memória) e a Onda P (precisão)
  como frentes independentes, e a review 1 validou a ordem M → O → P sem notar que
  **a stack de precisão existente já é incompatível com o objetivo nº 1 do projeto**.
  Sem correção, o sistema responde certo da memória, o V2 reprova, o retry destrói
  a resposta e o golden `memoria-30-turnos` falha não por falta de memória, mas por
  excesso de validação cega. Nenhuma task de M.1-M.7 ou P.1-P.5 cobre isso.
- **Correção proposta:** adicionar à Onda M uma task explícita (sugiro M.2b,
  obrigatória ANTES de ligar a janela nova em produção): estender o
  `ValidationContext` com as fontes legítimas de memória do turno (toolDigests
  injetados no replay, resumoProgressivo, focoAtual.ultimoResultado) e ensinar
  `apareceLiteralEmEnvelope`/guardrail a aceitá-las como proveniência válida.
  Regra de desempate: número de memória é válido se aparece num digest/resumo
  injetado NESTE prompt; número que não aparece em lugar nenhum continua sendo
  invenção. Os hints de retry passam a citar a fonte de memória ("o valor correto
  está no digest do turno 3"). Casos golden novos: "responde da memória sem tool"
  com gabarito de NÃO reprovação.

### B2-2. A correção B1 da review 1 (adotar `previous_response_id` intra-turno) troca migração fantasma por no-op com custo de governança: exige `store: true` e o encadeamento intra-turno JÁ existe

- **Evidência:**
  1. O adapter manda **`store: false` hardcoded** com comentário deliberado
     ("stateless", `src/lib/agent/llm/providers/openai.ts:440,461`).
     `previous_response_id` só funciona com o response anterior **armazenado**
     pela OpenAI (`store: true`), ou seja, a correção da review 1 implica
     silenciosamente reter 30 dias de dados financeiros da Matrix na OpenAI,
     uma decisão de governança de dados que ninguém tomou.
  2. O ganho que `previous_response_id` daria (raciocínio preservado entre
     iterações do loop) **já está implementado manualmente**: o run-agent acumula
     `result.reasoningContext` a cada iteração e repassa o array na chamada
     seguinte (`run-agent.ts:824-827` dentro do `for` de MAX_ITERATIONS), e o
     adapter injeta os reasoning items após a última mensagem user
     (`openai.ts:451-456` + `collectHistoryItems`, openai.ts:595-633). Os
     defensivos desse mecanismo existem PORQUE `store:false` (strip de `id`,
     filtro de function_call, openai.ts:597-606); adotar `previous_response_id`
     obriga a desmontar e reescrever essa camada inteira.
  3. Delta real restante: deduplicação de tokens de replay intra-turno. Com 60,5%
     de cache hit medido (diagnóstico §5) e 1,6 iterações médias por turno, o
     ganho é marginal.
- **Por que é BLOCKER:** se a v2 da spec incorporar a correção B1 da review 1 como
  escrita, o plano gera uma task que entrega quase nada e flipa `store` em produção
  sem decisão explícita. É o mesmo erro do B1 original (task baseada em premissa
  não conferida), agora na direção oposta.
- **Correção proposta:** **cortar O.1 inteira da spec.** Registrar em não-objetivos:
  "encadeamento intra-turno já coberto por reasoningHistory; `previous_response_id`
  só reentra se telemetria mostrar que o replay intra-turno é custo relevante E
  com decisão explícita de governança sobre `store: true`". A Onda O passa a ser
  O.2 (tiers) + O.3 (T2) + O.4 (T3), todas independentes de transporte.

---

## MAJORS

### MJ2-1. A premissa de M.1 ("o dado passa a EXISTIR no histórico") é meio-falsa: `Message.toolResults` JÁ persiste os resultados íntegros desde a Onda 1 da Inteligência, e isso muda a natureza (e o tamanho) da task

- **Evidência:** `prisma/schema.prisma` model `Message`: coluna `toolResults Json?`
  ("Resultados das tool calls deste turno, em formato canonico cross-provider
  Array<{name, args, result}>"), gravada por `updateMessageToolResults`
  (`conversation.ts:349-367`, chamada em run-agent.ts:1523). O dado JÁ existe no
  banco; o que não existe é (a) o `loadHistory` selecioná-lo (conversation.ts:181-187)
  e (b) uma forma compacta dele caber na janela.
- **Implicação que a spec/review 1 perderam:** M.1 não é "passar a persistir", é
  "derivar digest + carregar". Duas consequências práticas: (1) o digest pode ser
  **computado no load** a partir de `toolResults` existente (zero write novo) ou
  materializado em coluna com **backfill barato das conversas antigas**, dando
  memória retroativa de graça; (2) o "worker de digest síncrono" da spec é menor
  do que parece. A v3 deve escolher: coluna materializada + backfill (preferível,
  load barato) ou derivação on-read, e dizer que a fonte é `toolResults`.

### MJ2-2. O harness multi-turno que a review 1 mandou construir (B2/M.0) JÁ existe em 80%: `scripts/ab-cerebro.ts` roda `turnosAntes` via runAgent encadeado com kpi/alucinação/custo, e o golden-nex.e2e simplesmente IGNORA `turnosAntes`

- **Evidência:** `golden-schema.ts:35` define `turnosAntes`; o único consumidor é
  `scripts/ab-cerebro.ts:127-148` (cria conversa `backtest`, roda cada turno
  anterior via `runAgent` com `llmOverride`, avalia só o turno final com
  toolsCalled/kpiOuro/halucNums/esperaNaResposta/custoUsd). O harness do CI
  (`golden-nex.e2e.ts`) não referencia `turnosAntes` em lugar nenhum, então os
  4 casos de follow-up citados em M2 **só são exercidos no A/B manual**, nunca
  no gate. Há ainda `cost-regression.e2e.ts` com o padrão completo de runner E2E
  pago (guard E2E=1, snapshot scorecard, knob `COST_N`, teto de custo documentado
  "~$0,4/run").
- **Por que importa:** a correção da review 1 ("adicionar task M.0, ab-cerebro
  pode ser a semente") subestima o que existe e abre porta para o plano construir
  um segundo harness paralelo. O deliverable certo é **promover/generalizar o
  ab-cerebro** (extrair o driver de conversa de `scripts/` para
  `src/lib/agent/evals/`, adicionar asserções POR TURNO intermediário, que é o
  único pedaço que falta para `memoria-30-turnos`) e registrar que M2 hoje não é
  medido por nenhum gate.

### MJ2-3. M.4 (heurística de anáfora + focoAtual) cria um SEGUNDO subsistema de reformulação ao lado do R2-ctx vivo, e a spec não diz se substitui, alimenta ou conflita

- **Evidência:** o roteamento contextual de 3 camadas existe e está em PRODUCTION
  (`run-agent.ts:527-558`: `reformulateQuestion` com últimos 5 pares, só em
  fallback da camada 1; testado por `run-agent.contextual.test.ts`). A spec §3.1
  propõe heurística determinística contra focoAtual/ConversationEntity + fallback
  CQR, que é funcionalmente o mesmo papel (resolver a pergunta dependente de
  contexto) com outra mecânica e outro gatilho. Risco concreto: o router roteia
  pela reformulação A (LLM nano sobre 5 pares) enquanto a resposta usa a resolução
  B (heurística sobre focoAtual), e as duas interpretam "e do mês passado?"
  diferente, dando tool certa com período errado ou vice-versa.
- **Correção:** a v3 deve declarar a unificação: a resolução de anáfora da M.4
  passa a ser a ÚNICA fonte de pergunta-resolvida, alimentando (a) o router
  (substitui `reformulateQuestion` quando a heurística fecha; o CQR vira o
  fallback que hoje é a camada 2) e (b) o bloco de contexto do turno (decisão do
  MJ8 da review 1). `router/contextualize.ts` não é deletado, é rebaixado a
  fallback, e os testes contextuais existentes são atualizados na MESMA task.

### MJ2-4. P.4 (consistência entre turnos) como especificado é gerador de reprovação flaky: o cache incremental muda a cada 3 minutos e "explicou o porquê" não é detectável por regex

- **Evidência:** decisão canônica #2 (CLAUDE.md §5): sync incremental de 3min.
  Duas perguntas idênticas com 10 minutos de distância podem legitimamente diferir.
  A spec manda reprovar "responder com número diferente sem explicar o porquê",
  mas o veredito "explicou" é semântico, e toda a stack de validação é regex
  determinística (auto-validator.ts, 100% sem LLM). Um P.4 regex vai ou deixar
  passar tudo, ou reprovar atualizações legítimas, e cada reprovação alimenta a
  cascata O.2 (custo + latência + UX de resposta trocada) num caso que estava
  CERTO.
- **Correção:** P.4 nasce em **shadow** (a infra de shadow já existe:
  `runShadowChecks`, run-agent.ts:1145-1158) com comparação freshness-aware
  (só compara números do mesmo recorte quando a `syncVersion`/timestamp de
  frescor da tool é a mesma; o envelope já carrega frescor). Promoção a active
  só com taxa de falso positivo medida < 5% em telemetria. O critério P1 da spec
  deve refletir isso (consistência medida em shadow na onda P, não gate).

### MJ2-5. RBAC: as camadas de memória re-servem dados de domínio REVOGADO; o fast-path de recusa só bloqueia tool call nova, não replay

- **Evidência:** o gate RBAC vivo atua em duas portas: recusa fast-path por
  domínio roteado (run-agent.ts:655-677) e gate por tool call (run-agent.ts:1377-1401).
  Nenhuma porta filtra o HISTÓRICO. Hoje a exposição residual é pequena (prosa de
  132 chars por ~4 turnos). A spec multiplica essa superfície: toolDigest com
  números estruturados re-injetado por 8-12 turnos, resumoProgressivo cobrindo a
  conversa inteira, focoAtual com `ultimoResultado.valorChave`, e L5/FTS capaz de
  ressuscitar QUALQUER trecho antigo sob demanda. Cenário: usuário tinha
  `financeiro`, perguntou aging, admin revoga o domínio; na mesma conversa (ou
  via L5 em conversa nova de WhatsApp reaproveitada) o agente segue citando os
  números de aging da memória.
  Sobre vazamento ENTRE usuários: não encontrado, `ConversationEntity` é escopado
  por `conversationId` (ownership garantido por `assertConversationOwned`,
  conversation.ts:135-160) e `AgentUserMemory` por `userId`; o desenho está certo
  nesse eixo.
- **Correção:** (a) o toolDigest DEVE carregar o campo `dominio` (derivável do
  prefixo da tool, mesma regex do RBAC, auto-validator.ts:108); (b) a injeção de
  L3-digests, L4 e os resultados de L5 filtram por `userAllowedDomains` correntes
  do turno; (c) resumoProgressivo é o caso difícil (texto corrido): documentar
  como exposição residual aceita OU regenerar o resumo quando o conjunto de
  domínios do usuário mudar (campo `resumoDomains` para detectar). A spec precisa
  escolher e escrever.

### MJ2-6. O critério P1 ("zero regressão no golden 171") é vácuo para ESTE projeto: o golden 171 não exercita nada do que a spec muda

- **Evidência:** `golden-nex.e2e.ts:46-51` chama `tool.handler(parsed, ctx)`
  direto, sem runAgent, sem LLM, sem histórico, sem prompt. As Ondas M e O mudam
  janela, prompt, validadores e orquestração, nenhum desses caminhos passa pelo
  harness do golden 171. P1 vai ficar verde mesmo com a memória quebrando tudo.
- **Correção:** reescrever P1 nomeando os gates que DE FATO cobrem a mudança:
  golden 171 (invariante de tools, continua), `golden-under-active.e2e.ts`
  (conjunto de tools sob router), `cost-regression.e2e.ts` (custo por consulta) e
  o harness conversacional do MJ2-2 (novo). "Zero regressão" só tem sentido
  declarado sobre esse conjunto.

### MJ2-7. A tese de caching do C1 está furada por um fator maior que a KB (MJ7 da review 1): o `tools[]` varia POR PERGUNTA com o router ativo, e tools são parte do prefixo cacheado

- **Evidência:** com retrieval `active`, `filterCatalog` entrega em média 54 tools
  diferentes POR PERGUNTA (diagnóstico §3, decisão por turno), e os schemas de
  tool são a maior fatia dos ~24k tokens de input. No prompt caching da OpenAI o
  array de tools faz parte do prefixo; mudou a seleção entre turnos da mesma
  conversa, o prefixo inteiro (system incluso) deixa de bater. Os 60,5% de cache
  hit medidos sobrevivem porque follow-ups tendem a cair no mesmo domínio, mas a
  spec promete "L0 estático, cacheável" como fundamento do C1, e a correção do
  MJ7 (tirar a KB do prefixo) não basta para entregar isso.
- **Correção:** (a) C1 deve ser medido pela telemetria existente
  (`tokensCachedInput` por origem em `llm_usage`), antes/depois, sem teses;
  (b) a Onda O deve considerar "catálogo sticky por conversa" (a seleção de
  domínios da conversa persiste entre turnos, só recalcula quando a heurística de
  anáfora detecta troca de assunto), que estabiliza o prefixo E é coerente com
  focoAtual; registrar como task opcional da Onda O com decisão por telemetria.

### MJ2-8. A correção do MJ5 da review 1 ("validar ANTES de liberar o flush do streaming") cria problema novo: mata o TTFT, e a spec fica sem contrato de latência para a cascata

- **Evidência:** o streaming token a token é hoje o que segura a latência
  percebida (loop médio 6,6s, diagnóstico §5); validar-antes-de-flush converte
  TODA resposta "de risco" em espera de resposta completa + validação + possível
  re-execução. A review 1 ofereceu as duas opções (evento `revising` vs flush
  retido) sem precificá-las nem escolher.
- **Correção:** a v3 decide por tier: T1 mantém streaming imediato e a cascata
  vira evento `revising` na bolha (UX de "refinando a resposta", contrato de
  eventos novo); T2/T3 podem reter flush (o usuário já espera mais de uma
  pergunta composta). Idempotência de tools com efeito (`registrar_lacuna`) na
  re-execução vira requisito escrito da O.2 (a review 1 já apontou; falta a spec
  incorporar mecanismo: passar `skipSideEffects` ou dedupe por conversationId+
  pergunta no próprio handler).

---

## CORTES RECOMENDADOS (over-engineering para 1 dev + Claude)

Avaliação valor/esforço peça a peça. Aplicando os 4 cortes, o plano encolhe
~35-40% sem tocar nos critérios M1/M2/O1/P1.

1. **O.1: CORTAR** (já fundamentado no B2-2). Esforço alto (reescrever defensivos
   do adapter + decisão de governança), valor ~zero.
2. **M.7 (FTS L5): ADIAR para depois do golden de memória rodar.** Com L2 (resumo)
   + L3 (8-12 turnos com digest) + L4 (focoAtual), uma conversa de dezenas de
   turnos está coberta; o L5 só paga em conversas muito longas ou referência a
   conversa de dias atrás (que no WhatsApp nem existe, a conversa rota em 24h,
   conversation.ts:16). Implementar índice FTS + gatilho de retrieval + injeção é
   onda inteira de trabalho para um caso que os goldens ainda nem demonstraram.
   Critério de reentrada: caso golden de memória que L2-L4 comprovadamente não
   resolve.
3. **M.6 (AgentUserMemory): CORTAR desta spec** (não só "pode ficar p/ onda M2").
   A review 1 já mostrou a colisão com `UserAgentProfile` (MJ2); resolver essa
   arquitetura de memória de usuário é projeto próprio. O ganho do projeto atual
   (lembrar DENTRO da conversa) não depende disso. Vira não-objetivo explícito.
4. **O.3 (planner-executor T2 com modelo forte): COMEÇAR com T2-lite.** O único
   dado real de gpt-5.4 no loop é 89,8s/chamada (diagnóstico §5), e a spec não
   fixa alvo de latência para T2. A escada da Anthropic (research arquitetura
   §1.1) manda subir degrau só quando o eval falha no degrau de baixo. O degrau
   de baixo nem foi tentado: perguntas compostas falham hoje primariamente porque
   o prompt trava em 2 tools e MAX_ITERATIONS=3 (MJ4 da review 1). T2-lite =
   mini com tool budget 4-6 + tool calls paralelas + sem turno de plano separado.
   Só se o golden `composta-*` reprovar o T2-lite é que o plano+síntese com
   modelo forte (com `reasoning_effort` low e alvo p95 < 30s ESCRITO) entra.
5. **P.5 (flywheel automático): ADIAR a automação.** Volume real: 149 retries de
   validador em 14 dias (~10/dia). A triagem manual via `/agente/qualidade` +
   `MessageFeedback` (ambos existem) cobre isso; e o passo humano é obrigatório
   de qualquer jeito porque caso golden exige `kpiOuro` verificado por SELECT
   (golden-schema.ts:13-15), que nenhuma automação produz sozinha. Entregar só:
   query/aba de "candidatos a golden" sobre as tabelas existentes. A tabela
   `GoldenCandidate` própria (correção MJ9 da review 1, correta) pode esperar.

---

## TESTABILIDADE DOS CRITÉRIOS DE ACEITE (a pergunta que a review 1 não fez: quanto custa rodar?)

Custo real, ancorado na telemetria do diagnóstico §5 e no precedente do
`cost-regression.e2e.ts` (cabeçalho documenta "~$0,4/run" para 24 casos
single-turn de runAgent real):

- **Conversa de 30 turnos**: ~1,6 iterações/turno x ~24k tokens in (60% cached) +
  enhance + embeddings ≈ US$0,01-0,02/turno → **US$0,3-0,6 por execução completa**
  e **6-10 min de wall time serial**. Ou seja: o custo em dólar NÃO é o problema
  (não chega perto de US$5); o problema é tempo + flakiness de LLM num gate.
- **Estrutura proposta (incorporar como critério na v3):**
  1. **PR gate determinístico, zero LLM:** a montagem do prompt é função pura
     (`montarConversa` + camadas novas). Unit tests assertam que o digest do
     turno 3, o resumo e o focoAtual ESTÃO no prompt do turno 30, com fixtures.
     Cobre 80% do M1 de graça. Idem para a heurística de anáfora (M2): é
     determinística por design, testa-se o resolver direto.
  2. **E2E pago, manual/nightly:** bateria `memoria-30-turnos` no padrão
     cost-regression (guard E2E=1, knob `MEM_N`, scorecard snapshot, teto de
     custo declarado no cabeçalho), via ab-cerebro generalizado (MJ2-2).
     Matching numérico usa o que o schema já tem (`match: faixa/centavos` +
     `fonteOuroSql` ao vivo) para domar flakiness.
  3. **M2 ≥95%** passa a medir a SAÍDA DO RESOLVER (pergunta resolvida correta:
     entidade+período), não a resposta final do LLM; o fim-a-fim fica por
     amostragem no E2E pago. Com n=15, escrever o inteiro: "no máximo 1 falha
     em 15" (resolve o MN2 da review 1).
  4. **C1**: custo via `tokensCachedInput`/custo por origem (llm_usage) e
     latência via `durationMs` por origem, janela de 14d antes/depois, mesmo
     cenário do snapshot. Sem isso o "≤2x" é indecidível (estende o MN6).

---

## MINORS

### MN2-1. M.5: contrato de staleness do resumo assíncrono
Turnos rápidos consecutivos chegam antes do job BullMQ atualizar o resumo. O
ponteiro `resumoAteMensagemId` já resolve (injeta resumo velho + janela verbatim
cobre o gap), mas a spec precisa DIZER isso e mandar o teste cobrir o caso
"resumo atrasado 3 turnos".

### MN2-2. Higiene de schema dos modelos novos
`ConversationEntity` e `AgentUserMemory` (research §3.2) sem relation/FK/cascade
e com `userId String` sem `@db.Uuid`, fora do padrão de TODO o schema vivo
(Conversation/Message usam uuid + onDelete: Cascade + @@map snake_case). Plano
gerado disso produz migration inconsistente. Alinhar na v3 junto com o MJ1 da
review 1.

### MN2-3. Flywheel/golden: dado real de produção indo parar no git
`golden-nex.json` vive no repositório. Casos auto-gerados de falhas de produção
carregam perguntas reais de usuários e números financeiros reais da Matrix.
O fluxo de promoção a golden precisa de passo de anonimização/curadoria humana
escrito na spec (mais um motivo para o corte 5 acima).

### MN2-4. Escolher a opção (b) do B3 da review 1, e dizer por quê
Das duas sínteses propostas para o replay (tool results sintetizados vs strip de
toolCalls + digest como texto no content), a (b) é a certa para ESTE sistema:
é provider-agnóstica (o playground aceita Anthropic/Gemini/OpenRouter), não
reintroduz items function_call no replay (que o próprio código documenta que o
mini imita como texto, run-agent.ts:979) e não conflita com o filtro de
function_call do `collectHistoryItems` (openai.ts:618-621). A (a) só seria
necessária se o modelo precisasse "ver" a semântica de tool use antiga, e não
precisa: precisa dos números.

### MN2-5. V-claims/P.4 devem herdar o bypass de contestação
`CONTESTACAO_RE` pula V3/V5/V9 em perguntas de contestação (auto-validator.ts:
639,785,800). "Tá errado, confere de novo" é exatamente um turno de contestação
que P.4 (consistência) tende a flagrar. Os validadores novos precisam declarar
sua relação com a regra 5b, senão contestação vira loop de reprovação.

### MN2-6. Nomear o comportamento do checkpoint/playground nos tiers
Complemento ao MJ3 da review 1: além de onde configura o modelo forte, dizer o
que `llmOverride` (playground/ab-cerebro) faz com a classificação de tier
(proposta: override força T1-fluxo com o modelo dado, e o classificador só loga,
senão todo A/B futuro fica incomparável com produção).

---

## O que foi re-verificado da review 1 e está CORRETO (sem achado novo)

- B2 (critérios sem harness no CI): correto na essência, mas ver MJ2-2 (o gap é
  menor e o risco agora é duplicar o ab-cerebro).
- B3 (replay órfão = 400 multi-provider): correto; decisão na MN2-4.
- MJ1 (nomes Prisma), MJ4 (limite de 2 tools + MAX_ITERATIONS=3, confirmado em
  compose.ts:216 e run-agent.ts), MJ6 (clamp 10..50 do context_window_size),
  MJ7 (KB no system prompt por pergunta, confirmado em compose.ts:148-180),
  MJ9 (FeatureRequest magro demais, confirmado no schema): todos corretos.
- MN5 (worker sem build próprio; conversa WhatsApp rota em 24h, confirmado
  conversation.ts:16): correto, e o item 24h reforça o corte do M.7/L5.

## Veredito

A spec v1 + correções da review 1 ainda NÃO está pronta para virar plano. Os dois
BLOCKERs desta review são de naturezas opostas e igualmente fatais: B2-1 é uma
interação entre ondas que faria o projeto falhar no seu próprio critério M1 mesmo
com tudo implementado "certo"; B2-2 é a correção da review 1 instalando um no-op
com efeito colateral de governança. A v3 precisa: integrar memória aos validadores
(M.2b), cortar O.1, aplicar os 4 cortes de escopo, redefinir P1/M2/C1 em termos
mensuráveis com a infra que já existe (ab-cerebro + cost-regression + unit tests
determinísticos de prompt), e escrever o contrato RBAC das camadas de memória.

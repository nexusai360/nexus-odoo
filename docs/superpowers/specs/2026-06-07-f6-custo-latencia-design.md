# F6 , Custo / Latencia (alvo 1-2 centavos USD por consulta, rapido)

> Reconstrucao do Nex, Fase 6 (ultima). Fonte: `docs/superpowers/research/2026-06-06-dossie-MASTER.md` secao 6.
> Fases 1-5 em producao (PRs #58/#59/#60/#63/#64).
> **SPEC v3** , consolidada apos 2 reviews adversariais (workflow wvjb6yoau) + verificacao
> exaustiva contra o codigo real (relatorio de verificacao 2026-06-07). Esta e a versao que
> vai para o plano.

## Historico de revisao

- **v1** (commit d6831ed): 5 levers do dossie (telemetria, model tiering, cache, short-circuit,
  gate de regressao de custo). Supos que a F6 construiria a telemetria do zero.
- **v2** (commit 1ef7639, bloco CORRECOES [R]): 2 reviews adversariais acharam que **grande parte
  da F6 ja existe**. Telemetria (`LlmUsage` + `logUsage` + `calculateCost` + tabela de precos),
  `MAX_ITERATIONS=3` e slots de modelo por papel ja estao no codigo. Re-escopo: reusar, nao reconstruir.
- **v3** (este documento): verificacao item a item contra o codigo confirmou/corrigiu cada alegacao
  da v2, fez a **conta de custo de referencia** (criterio #8 das reviews) e fixou o escopo final.
  Achado decisivo: **o alvo de 1-2 centavos ja e o patamar atual** (~2c/consulta), e caching
  (entregue na spec 06-03) + retrieval ativo levam a ~0,96c. **Model-tiering nao e necessario para
  a meta**, entao a onda com migration sai do escopo executavel.

## 1. Objetivo

Bater o alvo do dono (1-2 centavos USD por consulta, baixa latencia) **sem perder a precisao** ja
provada pela F5 (golden verde). F6 e **otimizacao + telemetria**, nao reconstrucao: completa a
medicao de custo por consulta (hoje incompleta), corta gasto evitavel ativando o retrieval (que
hoje so calcula e nao corta), e **trava regressao de custo** (nenhuma mudanca encarece a consulta
sem o gate avisar). O golden da F5 e a rede que garante que a otimizacao nao baixa a qualidade.

## 2. Estado verificado contra o codigo (fundacao da v3)

Cada item abaixo foi confirmado em arquivo:linha. O que **ja existe** nao se reconstroi.

### 2.1 Telemetria de custo , JA EXISTE (nao recriar)

- **`LlmUsage`** (`prisma/schema.prisma:2676`): modelo completo com `conversationId`, `provider`,
  `model`, `tokensInput`, `tokensOutput`, `tokensCachedInput` (default 0), `reasoningTokens`,
  `costUsd` (Decimal 18,10), `costKnown` (default true), `costBrl`, `durationMs`, `toolCallsCount`,
  `toolNames[]`, `userId`, `credentialId`, `requestKind`, `origin` (nullable), `createdAt`.
- **`calculateCost(modelId, tokensInput, tokensOutput, extras?)`** (`src/lib/agent/llm/catalog.ts:677`):
  retorna `{costUsd, costKnown}`. Tabela `MODELS` (`catalog.ts:119+`) com precos por modelo, **inclusive
  input cacheado** (`inputCachedPerMTok?`, fallback `inputPerMTok * 0.1`). gpt-5.4-mini = $0,25 / $2,0
  por 1M; gpt-5.4-nano = $0,05 / $0,4.
- **`usage-stats.ts`** agrega por conversa/modelo/dia; UI **`/agente/consumo`** existe (super_admin).
- **`costKnown=false`** somente quando o modelo nao tem pricing (`pricing===null`), nao por tokens=0.

### 2.2 O GAP REAL da telemetria (nucleo da Onda 1)

`logUsage()` so e chamado no **loop principal** do agente (`run-agent.ts:803`, por iteracao, com
`origin` NULL). **Tres chamadas LLM reais do turno nao logam uso**, todas no mesmo `client`
(gpt-5.4-mini):

| Chamada LLM | Local | Loga hoje? |
|---|---|---|
| Loop principal (raciocinio + tools) | `run-agent.ts:786` -> `:803` | SIM (por iteracao, origin NULL) |
| enhance / two-pass (chips) | `enhance-chips.ts:151` | **NAO** |
| guardrail factual (correcao) | `run-agent.ts:1046` | **NAO** |
| autoValidator retry (active) | `run-agent.ts:1140` | **NAO** |
| embeds + reformulacao (router) | `run-agent.ts:486/518/549`, `contextualize.ts:97` | SIM (origin `router*`) |

Consequencia: somar `LlmUsage` por `conversationId` **subconta** o custo da consulta (faltam enhance,
guardrail-correction e autoValidator-retry). `classifyIntent` e funcao pura (sem LLM, sem custo).

### 2.3 Router / retrieval , em SHADOW (nucleo da Onda 2)

- Defaults (`prisma/schema.prisma` + migrations de prod): `routerEnabled=false` (:2815),
  `routerToolRetrieval="shadow"` (:2831, valores shadow/active), `routerThreshold=0.30`,
  `routerTopK=3`. Producao roda em shadow.
- Em **shadow**: `pickTools` calcula top-K e loga em `AgentRouterDecision`, mas `filterCatalog`
  **nao recebe `toolRetrieval`** (`filter-catalog.ts:90`), entao o **catalogo INTEIRO vai ao prompt**.
  O retrieval mede o ganho mas nao corta nada.
- Em **active**: `filter-catalog.ts:91` filtra para nucleo/floor + top-K (corta o catalogo de verdade).
  `routerEnabled` (dominio/RBAC, camadas A-B) e `routerToolRetrieval` (corte por tool, camada C) sao
  **gates independentes**.
- Harness de recall@K existe: `src/lib/agent/router/__tests__/e2e/retrieval.e2e.ts`, **gate >= 98%**
  (nao 100%) sobre as 30 perguntas "prosseguir" congeladas do golden F5.

### 2.4 Caches existentes

- **`session-cache.ts`**: cacheia o **resultado de tool** (numero), chave `tool+args`, escopo por
  `conversationId`, **TTL 60s**, in-memory. Existe e e intencional (loops de raciocinio). Isso
  **relativiza** a regra v1 "nunca cachear numero": ja existe um cache curto de resultado, por design.
- **`embed-question.ts`**: LRU de 200 embeddings por pergunta normalizada.
- **Nao existe** cache de decisao de roteamento nem de entidade resolvida; **nao existe** invalidacao
  por versao de sync.

### 2.5 Step limit / short-circuit

- `MAX_ITERATIONS=3` (`run-agent.ts:86`) ja existe. Na ultima iteracao com tool calls pendentes,
  grava `errorMessage:"max_iterations_exceeded"`.
- `classifyIntent` (`router/classify-intent.ts`) e pura, retorna `pontual|exaustiva|ranking|amostragem`
  (default `pontual`).
- Resolucao de entidade (`src/lib/entities/`) retorna `status: unica | ambigua | nenhuma`. A
  pre-condicao "args resolvidos sem ambiguidade" = todos `status:"unica"`. Nao ha hoje orquestrador
  de short-circuit 1-tool; a infra de status existe, o gate nao.

### 2.6 Model tiering

- Slots ja existem em `AgentSettings`: `intelligenceModel`, `qualityJudgeModel`, `routerReform*`
  (Provider/Model/CredentialId). `resolveReformLlm` (`get-reform-config.ts:23`) com fallback para
  `getActiveLlmConfig` (`get-active-config.ts:39`, **nao mexer**, e o LLM de producao).
- **`claude-judge-runner`** (`quality/claude-judge-runner.ts`) NAO e um juiz de redacao por API por
  turno: e o **CLI `claude` Opus local** (`spawn`), para pericia offline de backtest. **Nao serve
  como gate textual inline** e nao loga uso.

## 3. Conta de custo de referencia (criterio #8 , feita ANTES do plano)

Base: gpt-5.4-mini $0,25/1M in, $2,0/1M out (catalog.ts:123); 06-03 mediu input 18-22k, output ~800,
2-4 reqs/pergunta.

- Custo atual por consulta (sem cache, sem retrieval-active = estado de prod): **~2 centavos**
  (3 reqs @20k in/800 out = 1,98c; faixa 1,2c a 2,8c conforme 2 a 4 reqs).
- **+ Caching** (ja entregue na spec 06-03, reqs 2-3 com ~85% input cacheado): ~1,22c (corta ~38%).
- **+ Retrieval active** (input 20k -> ~13k cortando catalogo): ~1,46c (corta ~26%).
- **Caching + retrieval juntos:** ~**0,96c** (corta ~52%).
- + Model-tiering para nano: ~0,29c.

**Conclusao (decisiva para o escopo):** o alvo de **1-2 centavos ja e o patamar atual**. Caching
(entregue) + retrieval ativo levam a ~0,96c, **abaixo do alvo, com folga**. **Model-tiering nao e
necessario para a meta** (so serviria para descer abaixo de ~0,5c) e, alem disso, nao tem gate de
qualidade textual inline (o golden nao protege redacao e o judge e offline). Logo a F6 executavel
nao mexe em modelo nem precisa de migration.

## 4. Escopo final da F6

### 4.1 Onda 1 , Custo por consulta + gate de regressao (SEM migration)

Fecha o gap de medicao e cria a trava de regressao. Zero schema.

- **Completar `logUsage`** nas 3 chamadas hoje silenciosas (`enhance-chips.ts:151`,
  `run-agent.ts:1046` guardrail, `run-agent.ts:1140` autoValidator), cada uma com um `origin`
  distinto (`enhance`, `guardrail`, `auto_validator`). Adicionar `origin` tambem ao log do loop
  principal (hoje NULL) com valor `loop_principal`. Reusar o mesmo padrao de `logUsage` ja existente
  (mesma assinatura, `calculateCost`).
- **Agregacao "custo por consulta"** em `usage-stats.ts`: funcao que soma `LlmUsage` por
  `conversationId` (e por turno quando houver marcador de turno) devolvendo `{custoUsdTotal,
  tokensInput, tokensOutput, latenciaMsTotal, nReqs, breakdownPorOrigin, costKnownTotal}`. Pura,
  testavel, sem tocar UI nesta onda.
- **`estimarCustoUsd`** = wrapper fino sobre `calculateCost` (nao reimplementar a tabela de precos).
- **Harness de regressao de custo** (estilo F5, deterministico onde possivel): roda um conjunto
  representativo de perguntas (reusa o golden F5 como conjunto, qualidade + custo medidos juntos),
  soma custo/latencia por consulta e **falha** se a media exceder o alvo (1-2c) OU regredir vs o
  snapshot anterior do **mesmo cenario**.
- **costKnown no harness** (criterio #9): se uma fracao das reqs vier `costKnown=false` ou tokens=0,
  o harness marca `indisponivel`/falha; **nunca soma 0 em silencio**.
- **Snapshot com cenario fixo** (criterio #10): grava `modelo`, `routerToolRetrieval`, `routerEnabled`,
  `autoValidatorMode` e flags no snapshot; so compara custo entre execucoes do MESMO cenario (mudar
  flag = nova baseline).

### 4.2 Onda 2 , Ativar o retrieval sob gate (SEM migration)

O maior ganho de custo + latencia que falta. Nao e codigo novo: e promover `routerToolRetrieval` de
`shadow` para `active` (e `routerEnabled` para true), o que faz `filterCatalog` cortar o catalogo.

- **Gate duplo, obrigatorio antes de promover:** (a) `retrieval.e2e.ts` com **recall@K >= 98%** sobre
  as 30 congeladas; (b) **golden F5 verde** (numero/selecao/alucinacao/desambiguacao) rodando **com a
  flag em active**, provando que cortar o catalogo nao derruba acerto.
- **Como promover** (decidir no plano, com aval do usuario para o merge): a flag e config de
  `AgentSettings` (banco). Opcoes: (i) atualizar o default do codigo + alinhar producao via UI/seed;
  (ii) mudar so o valor de producao. Preferir nao alterar o default do schema (evita migration);
  promover via configuracao + documentar o procedimento.
- **Medir o ganho real** com o harness da Onda 1 (cenario shadow vs active), confirmando a queda de
  tokens/custo e a estabilidade do acerto.
- **DEPENDENCIA DE COORDENACAO:** existe a worktree `feat/router-ativacao-r2` (trabalho de UI do
  drill-down do Router, handoff de 2026-06-03). A ativacao do flag deve ser alinhada com o usuario
  quanto a **ordem de merge** para nao colidir. Esta branch prepara a ativacao; o usuario decide a
  ordem.

### 4.3 Fora do escopo executavel da F6 (declarado, com justificativa)

- **Model-tiering (modelo por papel):** NAO entra. A conta de custo (secao 3) prova que a meta e
  atingida sem ele; e ele nao tem gate de qualidade textual inline (golden nao cobre redacao;
  `claude-judge-runner` e offline). Reabrir exigiria migration + judge novo, sem ganho necessario.
  Os slots ja existem se um dia for preciso.
- **Short-circuit 1-tool:** NAO entra agora. `MAX_ITERATIONS=3` ja limita o gasto; o ganho marginal
  e pequeno (a maioria das consultas pontuais ja resolve em poucas iteracoes) frente ao risco de virar
  chute em caso ambiguo. Fica registrado como otimizacao futura, condicionada a retrieval active +
  `classifyIntent==='pontual'` + top-1 acima do limiar + todas as entidades `status:"unica"`.
- **Cache de roteamento/entidade + invalidacao por sync:** NAO entra. Sem necessidade para a meta;
  invalidacao por versao de sync nao existe e seria trabalho novo de risco. O `session-cache` (60s)
  e o LRU de embeddings ja capturam a repeticao barata.
- **Reconciliacao com a spec 06-03** (criterio #2): aquela spec (v3, revisada 2x) ja entregou prompt
  caching, janela de historico e paginacao das tools de lista, e **descartou explicitamente**
  modelo-barato-na-1a-chamada e reasoning-effort. A F6 **nao reabre** nenhuma dessas decisoes; apenas
  se beneficia do caching ja entregue (que aparece na conta da secao 3).
- Re-arquitetar o agente, trocar provider, fine-tuning, otimizar worker/sync, UI de billing nova.

## 5. Decisoes canonicas (fixadas na v3)

1. **Qualidade nunca regride por custo.** Toda otimizacao roda o golden F5; se baixar acerto, reverte.
   O numero sempre vem de codigo.
2. **Telemetria sem migration.** Reusa `LlmUsage`/`calculateCost`; a Onda 1 e so completar `logUsage`
   + agregar + gate. Nenhum `prisma migrate`.
3. **Alvo ja atingido; foco em medir e travar.** O valor da F6 nao e "chegar a 1-2c" (ja estamos la),
   e **provar e travar** com telemetria completa + gate de regressao, e **colher o ganho de folga**
   ativando o retrieval.
4. **Retrieval ativa so sob gate duplo** (recall@K >= 98% E golden verde com a flag active).
5. **Cache de decisao fica como esta.** `session-cache` (60s, resultado) e LRU de embeddings sao
   suficientes; nada de cache de roteamento/entidade nesta fase.
6. **Sem model-tiering** (secao 4.3): desnecessario para a meta e sem gate textual inline.

## 6. Criterios de aceite

- Toda chamada LLM do turno (loop, enhance, guardrail, autoValidator) gera linha em `LlmUsage` com
  `origin` distinto; a agregacao por `conversationId` soma o custo REAL da consulta.
- `estimarCustoUsd` (wrapper de `calculateCost`) testada; agregacao por consulta testada.
- Harness de regressao roda sobre o golden, reporta custo/latencia media por consulta, compara com o
  snapshot do mesmo cenario, e **falha** em regressao ou em `costKnown` insuficiente.
- Retrieval promovido a active **somente** com recall@K >= 98% E golden F5 verde sob a flag active;
  ganho de custo/latencia medido (shadow vs active) e documentado.
- Golden F5 continua verde apos as otimizacoes (qualidade preservada).
- Alvo 1-2c documentado e medido (a conta da secao 3 mostra ~2c hoje, ~0,96c com retrieval active).
- `tsc` raiz+mcp + `jest` verdes; **nenhuma migration**; E2E contra dado real conferido.

## 7. Riscos

- **Subcontagem persistir** (logUsage incompleto) -> Onda 1 fecha as 3 chamadas; o harness valida que
  a soma por consulta cobre todas as reqs (via `costKnown`/nReqs).
- **Retrieval active baixar acerto** -> gate duplo (recall@K + golden com a flag active); so promove se
  ambos verdes; reverte a flag se regredir.
- **Colisao com `feat/router-ativacao-r2`** -> alinhar ordem de merge com o usuario antes de promover.
- **Custo do proprio harness** (rodar golden chama LLM) -> roda na verificacao de onda, nao em loop;
  custo estimado e registrado.
- **costKnown=false somando 0** -> harness marca indisponivel/falha (criterio #9).
- **Comparar custo entre cenarios diferentes** -> snapshot carrega o cenario; baseline por cenario
  (criterio #10).

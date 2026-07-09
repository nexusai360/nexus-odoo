# F6 Construtor com metodologia , Implementation Plan (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> (execução INLINE na sessão principal, Opus , UI nunca delegada). Steps usam
> checkbox (`- [ ]`). **v3 incorpora 2 reviews adversariais do plano** (ver §Apêndice).

**Goal:** Brainstorm leve com roteiro de perguntas ancorado em dimensões reais
(Gerar escondido até elegível por evidência objetiva), e motor orquestrado de 4
fases que roda só no clique do Gerar, nos bastidores, com barra de % real e frases.

**Architecture:** O brainstorm captura **intenção estruturada** validada por
viabilidade real no catálogo (`obterContrato` + `checarCompatibilidade`). No Gerar,
`pipelineGeracao` roda blueprint(LLM médio) → revisão adversarial(LLM alto, 4
dimensões) → build(determinístico via dispatcher) → validação, emitindo progresso
real. Estado vive no `JourneyState` (Json, sem migration). O pipeline reusa as
deps do `runBuilder` (cliente LLM, `logUsage`, `verificarQuota`).

**Tech Stack:** Next.js 16, TypeScript, Zod, Prisma, Jest, framer-motion, Tailwind.

## Global Constraints

- **F6 SÓ LOCAL.** Nunca merge/deploy/migration em produção.
- **Sem travessão (—)** em qualquer texto. Escrita humanizada.
- **Sem migration:** estado novo aditivo no Json `journeyState`.
- **Cada commit deixa `tsc` + testes VERDES** (nenhuma task pode deixar o repo sem
  compilar , crítico para a remoção da fase `resumo`, ver Task 17).
- **ui-ux-pro-max** obrigatório nas tasks de UI; registrar a orientação no commit.
- **Modelo sempre Opus**; UI inline.
- **TDD:** teste falhando → mínimo → verde → commit atômico.

Tipos/funções reais já existentes (confirmados no código):
- `obterContrato(fato: string)` , **1 argumento** (`source-registry.ts:345`).
  Retorna `SourceContract | undefined` (tem `.shapes`).
- `checarCompatibilidade(secao)` , gate real de viabilidade (template↔shape↔fonte),
  usado em `mutators.ts`/`validarFicha`.
- `criarClienteConstrutorPadrao()`, `logUsage`, `verificarQuota`, `obterReasoning`
  , deps do `runBuilder` (`run-builder.ts`).
- `cliente.chat({ messages, tools?, temperature?, reasoningEffort?, stream?,
  onToken? })` (`llm/types.ts`); `onToken` é **opcional** por adapter.
- `despachar(tc, ficha, journeyState)` , dispatcher (`tool-bridge.ts`).
- `construirToolDefs()` , hoje **sem parâmetro** (`tool-bridge.ts:13`,
  `run-builder.ts:205`).
- `BuilderReportEntry`/`Secao` (com `id`, `template`, `fato`, `shapeDerivado`,
  `filtros`, `config` , `id` e `filtros` são **obrigatórios**).
- `Dimensao` (7 valores), `JourneyState` , `journey/state.ts`.

---

## Task 0: helper de viabilidade `journey/viabilidade.ts`

Resolve o achado bloqueante: `obterContrato` é 1-arg e não cobre shape↔template.

**Files:** Create `src/lib/reports/builder/journey/viabilidade.ts` + test.

**Interfaces:** `seccaoViavel(args: { fato; shapeDerivado?; template }): { ok: true }
| { ok: false; motivo: string }`. Reusa `obterContrato(fato)` (existe a fonte?) +
`checarCompatibilidade` (o template/shape casa com a fonte?).

- [ ] **Step 1:** Failing test , fato no catálogo + template compatível = ok; fato
  inexistente = motivo "sem_fonte"; template incompatível com o shape = motivo
  "incompativel".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar reusando `obterContrato` + `checarCompatibilidade`
  (ler a assinatura real de `checarCompatibilidade` e adaptar; se ele exigir uma
  `Secao` completa, montar um stub mínimo com `id`/`filtros:[]`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): helper seccaoViavel (fonte+compatibilidade)`.

---

## Task 1: `journey/intencao.ts` , intenção estruturada

**Files:** Create `journey/intencao.ts` + test.

**Interfaces:** `SeccaoPretendida { fato; shapeDerivado?; template; recorte?;
rotulo? }`, `IntencaoColeta { secoes; semKpiDeclarado? }`, `intencaoInicial()`,
`registrarSeccaoPretendida(intencao, seccao): { intencao } | { erro: string }`
(usa `seccaoViavel` da Task 0), `removerSeccao`, `declararSemKpi`.

- [ ] **Step 1:** Failing test , aceita seção viável; descarta inviável com `erro`
  (mock de `./viabilidade`); `declararSemKpi`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar (delegando a validação para `seccaoViavel`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): intencao estruturada do brainstorm`.

---

## Task 2: `journey/roteiro.ts` , roteiro derivado das dimensões

**Files:** Create `journey/roteiro.ts` + test.

**Interfaces:** `RoteiroPerguntas { total; respondidas; etapas }`, `NUCLEO:
Dimensao[]` (`objetivo,dados,visualizacao,indicadores`), `dimensaoCoberta(s, d)`,
`roteiroDerivado(s)`.

- [ ] **Step 1:** Failing tests , total = relevantes; respondidas = cobertas
  (núcleo por evidência via `seccaoViavel`/intenção); teto 7; opcional marcada
  entra no total; **turno sem captura nova NÃO aumenta respondidas** (cobre o
  achado "gera logo não avança").
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar `dimensaoCoberta` (objetivo: entendimento>=20 &&
  turnosUsuario>=2; dados/visualizacao/indicadores: via `intencao.secoes` +
  `seccaoViavel`; opcionais: `dimensoesTocadas`). `roteiroDerivado` clampa a 7.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): roteiro derivado das dimensoes`.

---

## Task 3: `state.ts` , novos campos + gate por intenção (SEM remover resumo ainda)

> A remoção de `resumo` fica na **Task 17** (commit verde único). Aqui só ADICIONA,
> mantendo o repo compilando.

**Files:** Modify `journey/state.ts`; `state.test.ts`.

**Interfaces:** `JourneyState` ganha `intencao: IntencaoColeta`,
`dimensoesRelevantes: Dimensao[]`, `ultimoBlueprint?: Blueprint` (tipo de
`geracao/blueprint-types.ts`, Task 5). `entendimentoElegivel(s)` por evidência
(núcleo coberto + `roteiroDerivado` cumprido). `marcarDimensaoRelevante(s, d)`.
`defaultParaConversa` faz **backfill** dos campos novos mesmo quando já existe
`journeyState` (corrige o early-return).

- [ ] **Step 1:** Failing tests , não elegível sem seção viável; elegível com
  núcleo coberto + roteiro cumprido; **legado com journeyState faltando `intencao`
  recebe backfill** (`defaultParaConversa({journeyState:{...sem intencao}})` →
  `intencao={secoes:[]}`, `dimensoesRelevantes=[NUCLEO]`); congela ao elegível.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar: adicionar campos; `journeyStateInicial` inicializa;
  `entendimentoElegivel` usa `dimensaoCoberta` (núcleo) + `respondidas>=total`;
  `marcarDimensaoRelevante` (idempotente, ≤7, não marca após elegível);
  `defaultParaConversa` faz merge de defaults. Manter `resumo`/`montarResumo` etc.
  intactos por ora.
- [ ] **Step 4:** PASS (todo `state.test.ts` verde).
- [ ] **Step 5:** Commit , `feat(f6): gate por intencao/roteiro + backfill legado`.

---

## Task 4a: tools de brainstorm + handlers + labels

**Files:** Modify tool catalog/defs (`agent/tools/index.ts` ou `BUILDER_TOOLS`),
`tool-bridge.ts` (`executarTool`/`despachar`), `agent/builder-progress-labels.ts`;
testes correspondentes.

**Interfaces (tools):** `registrar_seccao_pretendida({ fato, shapeDerivado?,
template, recorte?, rotulo? })`, `marcar_dimensao_relevante({ dimensao, motivo })`,
`declarar_sem_kpi({})`. Handlers mutam `journeyState` (retornam `{tipo:"jornada"}`).

- [ ] **Step 1:** Failing tests , dispatcher de `registrar_seccao_pretendida`
  atualiza `journeyState.intencao`; inviável retorna erro; **`builderProgressLabel`
  das 3 tools novas NÃO cai no fallback** (corrige regressão de labels) , add em
  `builder-progress-labels.test.ts`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar defs (Zod→JSON schema, rótulos com acento), handlers
  no `executarTool`/`despachar`, e LABELS/LABELS_PLURAL: ex.
  `registrar_seccao_pretendida:"Anotando o que você quer ver"`,
  `marcar_dimensao_relevante:"Percebendo mais um recorte"`,
  `declarar_sem_kpi:"Anotando que não precisa de indicador"`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): tools de brainstorm + handlers + labels`.

---

## Task 4b: `construirToolDefs(modo)` + guard de reparo no run-builder

**Files:** Modify `tool-bridge.ts` (`construirToolDefs(modo)` + tag de modo nas
tools), `run-builder.ts` (call site `construirToolDefs(modo)`; guardar o loop de
reparo/`fichaUtilizavel` e o contexto de ficha por `modo !== "jornada"`);
`tool-bridge.test.ts`.

- [ ] **Step 1:** Failing tests , `construirToolDefs("jornada")` contém as 3 tools
  novas e NÃO contém `criar_relatorio`/`adicionar_secao`/`definir_*`;
  `construirToolDefs("refino")` o inverso.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar: campo `modos?` em cada tool meta (default ambos);
  filtrar por modo; ajustar `run-builder.ts:205` para `construirToolDefs(modo)`;
  envolver o bloco de reparo (`run-builder.ts:~321-335`) e o contexto de ficha
  (`~234-242`) em `if (modo !== "jornada")`.
- [ ] **Step 4:** PASS (run-builder.test verde).
- [ ] **Step 5:** Commit , `feat(f6): catalogo de tools por modo + guard de reparo`.

---

## Task 4c: SSE `roteiro` + persistência dos campos novos

**Files:** Modify `app/api/builder/stream/route.ts`; `route.test.ts`. Front:
`SseEvent` (Task 10c formaliza o tipo; aqui emitir do backend).

- [ ] **Step 1:** Failing test , turno de brainstorm emite `{type:"roteiro",total,
  respondidas,etapas}` derivado de `roteiroDerivado(journeyState)`; o `journeyState`
  persistido carrega `intencao`/`dimensoesRelevantes` (round-trip do Json).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar: após o turno, `emit` do `roteiro`; garantir que o
  `journeyState` salvo inclui os campos novos (já é Json, conferir serialização).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): SSE roteiro + persistencia da intencao`.

---

## Task 5: contratos de tipo da geração

Resolve a ordem/ciclo de dependência (`Blueprint` antes de quem consome).

**Files:** Create `agent/geracao/blueprint-types.ts` (tipos PUROS, sem import de
journey), `agent/geracao/types.ts` (importa journey + blueprint-types). Test:
smoke de tipo opcional (ou nenhum , só tipos).

**Interfaces:**
- `blueprint-types.ts`: `BlueprintSecao { template; fato; shapeDerivado; config;
  justificativa }`, `Blueprint { titulo; objetivo; secoes; filtros? }`.
- `types.ts`: `FaseGeracao`, `ProgressoGeracao { fase; pct; frase }`,
  `EntradaGeracao { entendimento; intencao: IntencaoColeta; historico; user }`,
  `SaidaGeracao { ficha: BuilderReportEntry; omitidos: string[] }`,
  `GeracaoDeps { criarCliente; logUsage; verificarQuota; obterReasoning }`.

- [ ] **Step 1:** Criar os dois arquivos de tipo. (`journey/state.ts` da Task 3
  importa `Blueprint` daqui , sem ciclo, pois blueprint-types não importa journey.)
- [ ] **Step 2:** `tsc` verde.
- [ ] **Step 3:** Commit , `feat(f6): contratos de tipo da geracao`.

---

## Task 6: `agent/geracao/blueprint.ts`

**Files:** Create `geracao/blueprint.ts` + test.

**Interfaces:** `schemaBlueprint` (Zod), `promptBlueprint(entrada):
ChatMessage[]`, `parseBlueprint(raw): { blueprint: Blueprint; omitidos: string[] }`.

- [ ] **Step 1:** Failing test , `parseBlueprint` valida Zod, manda seção inviável
  (mock `seccaoViavel`) para `omitidos`, mantém as viáveis; `promptBlueprint`
  retorna mensagens contendo o catálogo (`capabilityComoTextoPrompt()`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar (cada seção do blueprint passa por `seccaoViavel`;
  inviáveis → `omitidos` com motivo; prompt pede JSON estrito + config aplicável).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): fase blueprint + omitidos por viabilidade`.

---

## Task 7: `agent/geracao/revisar.ts`

**Files:** Create `geracao/revisar.ts` + test.

**Interfaces:** `promptRevisao(blueprint): ChatMessage[]`, `parseRevisao(raw,
blueprintAnterior): { blueprint; semReparos; notas: string[] }`.

- [ ] **Step 1:** Failing test , corrigido válido; "sem reparos" sem `notas` por
  dimensão = inválido → mantém o anterior; smoke: prompt nomeia as 4 dimensões.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar (revalida via schema do blueprint; adversarial).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): fase revisao adversarial (4 dimensoes)`.

---

## Task 8a: `geracao/ordenar-narrativa.ts` (pura)

**Files:** Create + test. `ordenarNarrativa(secoes): BlueprintSecao[]`.

- [ ] **Step 1:** Failing test , KPIRow primeiro (panorama), comparativos
  (Bar/Pie/Line) no meio, DataTable por último.
- [ ] **Step 2:** FAIL. → **Step 3:** Implementar (ordem por papel do template). →
  **Step 4:** PASS. → **Step 5:** Commit , `feat(f6): ordenacao narrativa`.

---

## Task 8b: `geracao/build.ts` (via dispatcher)

**Files:** Create + test. `buildFicha(blueprint): { ficha; omitidos }`.

**Decisão (resolve ambiguidade):** monta **via dispatcher** , sintetiza
`ToolCall`s (`criar_relatorio` + `adicionar_secao` por seção, encadeando a `ficha`
retornada). Seção cujo `despachar` retorna `{tipo:"erro"}` vai para `omitidos`
(não descarta em silêncio).

- [ ] **Step 1:** Failing test , build de 2 seções viáveis produz ficha com 2
  seções (`id`/`filtros` preenchidos pelo handler); seção que o dispatcher rejeita
  entra em `omitidos`.
- [ ] **Step 2:** FAIL. → **Step 3:** Implementar (síntese de ToolCalls + chamada a
  `despachar` + ordenação via `ordenarNarrativa`). → **Step 4:** PASS. →
  **Step 5:** Commit , `feat(f6): build deterministico via dispatcher`.

---

## Task 8c: `geracao/validar.ts`

**Files:** Create + test. `validarFicha(ficha): { ficha; problemas: string[] }`.

- [ ] **Step 1:** Failing test , aponta seção sem fato; ficha sem visualização;
  KPIs ausentes quando pedidos. Escopo honesto: só completude/visual estrutural.
- [ ] **Step 2:** FAIL. → **Step 3:** Implementar (reusa `checarCompatibilidade`).
  → **Step 4:** PASS. → **Step 5:** Commit , `feat(f6): validacao final da ficha`.

---

## Task 9: `agent/geracao/pipeline.ts` (orquestrador + heartbeat)

**Files:** Create `geracao/pipeline.ts` + test. `pipelineGeracao(entrada,
onProgresso, deps?)`.

**Heartbeat:** dentro de cada fase LLM, avanço por `onToken` (se o adapter emitir)
**OU fallback por timer** que avança dentro da faixa até a fase concluir. Reasoning
explícito: `medium` no blueprint, `high` na revisão (passado no `cliente.chat`).
Cada chamada LLM passa por `logUsage`; a route faz `verificarQuota` antes (Task 10a).

- [ ] **Step 1:** Failing tests , com **mock de streaming**
  (`chat: async (req)=>{ req.onToken?.("a"); req.onToken?.("b"); return resp; }`):
  (1) encadeia blueprint→revisao→build→validacao; (2) `onProgresso` emite pcts
  **monotônicos** incluindo intermediários dentro das faixas blueprint/revisao;
  (3) **degrade**: quando a revisão lança, a ficha final == derivada do blueprint
  da fase 1, as faixas build/validacao ainda são emitidas, e nenhuma frase de
  revisão é anunciada; (4) blueprint lança → erro limpo; (5) `omitidos` propaga;
  (6) `cliente.chat` foi chamado com `reasoningEffort:"medium"` no blueprint.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar orquestração + heartbeat (onToken/timer) + try/catch
  na revisão + `logUsage` por chamada.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): pipeline orquestrado (4 fases + heartbeat)`.

---

## Task 9b: `agent/geracao/progresso.ts` (faixas + frases)

> Consumido pela Task 9 e pela UI; criado junto para a Task 9 importar.

**Files:** Create `geracao/progresso.ts` + test.

- [ ] **Step 1:** Failing test , faixas monotônicas (blueprint 5-55, revisao 55-92,
  build 92-97, validacao 97-100); frases por fase não vazias e específicas.
- [ ] **Step 2:** FAIL. → **Step 3:** Implementar. → **Step 4:** PASS. →
  **Step 5:** Commit , `feat(f6): faixas e frases de progresso`.

> (Ordem: implementar 9b ANTES de 9; a Task 9 importa as faixas/frases daqui.)

---

## Task 10a: route `acao:"gerar"` → pipeline + progress + quota/billing

**Files:** Modify `route.ts`; `route.test.ts`.

- [ ] **Step 1:** Failing test , `acao:"gerar"` elegível: `verificarQuota`
  chamado; emite `status → progress* → done(savedId, omitidos)`; NÃO usa o
  runBuilder one-shot; sem elegibilidade → turno normal (runBuilder).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar: montar `EntradaGeracao` do `journeyState`; deps =
  `{ criarCliente: criarClienteConstrutorPadrao, logUsage, verificarQuota,
  obterReasoning }`; rodar `pipelineGeracao` com `onProgresso→emit(progress)`;
  promover ficha a SavedReport (fluxo atual); salvar `ultimoBlueprint`; `done` com
  `omitidos` + `journeyState(fase=refino)`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit , `feat(f6): geracao no SSE (pipeline+progress+quota)`.

---

## Task 10b: route `acao:"regenerar"`

**Files:** Modify `route.ts`; `route.test.ts`.

- [ ] **Step 1:** Failing test , `acao:"regenerar"` reusa `ultimoBlueprint`
  (roda blueprint(ajuste)+build, sem nova entrevista), emite progress + done.
- [ ] **Step 2:** FAIL. → **Step 3:** Implementar. → **Step 4:** PASS. →
  **Step 5:** Commit , `feat(f6): regenerar reusando ultimo blueprint`.

---

## Task 10c: tipos de front + `maxDuration`

**Files:** Modify `route.ts` (`export const maxDuration = 120`);
`builder-chat-panel.tsx` (`SseEvent` ganha `progress`/`roteiro`;
`BuilderDonePayload` ganha `omitidos`).

- [ ] **Step 1:** Adicionar os tipos + `maxDuration`. `tsc` verde.
- [ ] **Step 2:** Commit , `feat(f6): tipos de front (progress/roteiro/omitidos) + maxDuration`.

---

## Task 11: UI , indicador de roteiro + Gerar escondido

**Files:** Create `components/reports/builder/journey/roteiro-indicador.tsx`;
Modify `builder-chat-panel.tsx` (parser `roteiro`, estado, prop), `builder-workspace.tsx`
(botão Gerar gated por `podeOferecerGeracao`). Test: `roteiro-indicador.test.tsx`.

- [ ] **Step 1:** Consultar **ui-ux-pro-max** (pílula/segmentos + micro-rótulo);
  registrar orientação no commit.
- [ ] **Step 2:** Failing test , "Pergunta 3 de 7" + segmentos = respondidas.
- [ ] **Step 3:** FAIL → Implementar componente + parse `roteiro` no panel
  (estado), render no topo da coluna; botão Gerar só com `podeOferecerGeracao`,
  micro-animação, sem retração.
- [ ] **Step 4:** PASS + checagem visual no dev.
- [ ] **Step 5:** Commit , `feat(f6): indicador de roteiro + Gerar escondido`.

---

## Task 12: UI , overlay de geração + canal progress + reveal + regenerar

**Files:** Create `journey/geracao-overlay.tsx`; Modify `builder-chat-panel.tsx`
(novo callback `onProgress(p)` em props; no modo gerar, **suprimir a bubble de
raciocínio** , só overlay), `builder-workspace.tsx` (estado `progresso` +
`gerando`; máquina de saída: segura `fase=refino` até a overlay terminar a
animação de 100%; honestidade `omitidos`; campo regenerar). Test:
`geracao-overlay.test.tsx` com **fake timers**.

- [ ] **Step 1:** Consultar **ui-ux-pro-max** (barra+frases, gradiente violeta,
  crossfade, reduced-motion); registrar no commit.
- [ ] **Step 2:** Failing test (fake timers) , overlay reflete pct dos eventos;
  `advanceTimersByTime(2500)` troca a **frase textual** (não testa animação);
  reduced-motion sem giro; frase de `omitidos` aparece.
- [ ] **Step 3:** FAIL → Implementar: `onProgress` panel→workspace; overlay
  alimentada por `progresso`; máquina de saída (dwell no 100% antes de `fase=
  refino`); supressão da bubble no modo gerar; campo "ajustar e regenerar" →
  `acao:"regenerar"`. Remover a animação antiga de geração.
- [ ] **Step 4:** PASS + checagem visual no dev.
- [ ] **Step 5:** Commit , `feat(f6): overlay de geracao + reveal + regenerar`.

---

## Task 13: Prompts , jornada + blueprint/revisão (estrutural + afinação)

**Files:** Modify `agent/prompt-jornada.ts`; afinação dos prompts das Tasks 6/7.

- [ ] **Step 1:** Atualizar `prompt-jornada.ts`: IA registra intenção via
  `registrar_seccao_pretendida` (não monta ficha), marca dimensão opcional como
  relevante (com motivo) ao crescer a complexidade, NÃO titubeia contra "gera logo"
  (explica a dimensão pendente), perguntas curtas/cards (mantido).
- [ ] **Step 2:** Teste ESTRUTURAL (determinístico): `construirToolDefs("jornada")`
  não tem tools de ficha (já na 4b) , reconfirmar; smoke de `promptBlueprint`/
  `promptRevisao` (catálogo + 4 dimensões presentes). A firmeza é garantida pelo
  gate (estrutural), não pelo texto.
- [ ] **Step 3:** `tsc` + testes verdes.
- [ ] **Step 4:** Commit , `feat(f6): prompts da jornada e da geracao afinados`.

---

## Task 14: Verificação E2E (determinístico + observacional) + latência

**Files:** Create `scripts/e2e-f6-metodologia.ts`.

- [ ] **Step 1:** `npm run dev:fresh`; rebuild `app` se necessário.
- [ ] **Step 2:** E2E **determinístico**: semeia `journeyState.intencao` (seções
  viáveis), confere `podeOferecerGeracao=true`, dispara `acao:"gerar"` (pipeline
  com LLM real), **mede latência em N=3 execuções (p50/p95)**, confere ficha
  montada (seções coerentes, ordem narrativa) e `omitidos`.
- [ ] **Step 3:** Observacional (brainstorm na UI `/relatorios-2/construtor`):
  roteiro X de N, Gerar só no fim, overlay barra+frases, reveal, regenerar.
- [ ] **Step 4:** Se p95 > ~22s, rebaixar revisão (`high`→`medium`) ou cortar; medir
  de novo e ajustar a promessa na spec.
- [ ] **Step 5:** Commit , `test(f6): E2E da metodologia + latencia (p50/p95)`.

---

## Task 15: regenerar fim-a-fim (fios pós-reveal)

> Garante que o campo regenerar da Task 12 conecta na route 10b e atualiza a view.

**Files:** Modify `builder-workspace.tsx`/`builder-chat-panel.tsx` se faltar fio.

- [ ] **Step 1:** Verificar (teste ou manual) que "ajustar e regenerar" no refino
  dispara `acao:"regenerar"`, mostra a overlay curta e atualiza a ficha salva.
- [ ] **Step 2:** Ajustar fios faltantes; `tsc` verde.
- [ ] **Step 3:** Commit , `feat(f6): fios do regenerar pos-reveal`.

---

## Task 16: STATUS/HISTORY + medição documentada

- [ ] Atualizar `STATUS.md` (topo) e `docs/agents/HISTORY.md` com a entrega.
  Commit , `docs(f6): STATUS/HISTORY da metodologia`.

---

## Task 17: limpeza da fase `resumo` (commit VERDE único)

> Última task estrutural: remove `resumo` de TODOS os consumidores num só commit,
> garantindo `tsc`/testes verdes (achado E1 das reviews).

**Files (todos juntos):** `journey/state.ts` (remove `"resumo"` de `FaseJornada`,
`ResumoJornada`, `montarResumo`, `irParaResumo`, `voltarParaEntrevista`, campo
`resumo`, `oferecerGeracao`/`oferecer_geracao`), `tools/index.ts` (tool
`montar_resumo`/`oferecer_geracao` + handlers + import), `agent/builder-progress-labels.ts`
(labels `montar_resumo`/`oferecer_geracao`), `route.ts` (ramos `fase==="resumo"`),
`builder-workspace.tsx` (import + ramo `JourneySummary`), delete
`journey/journey-summary.tsx` + `.test.tsx`. Ajustar todos os testes que tocavam
`resumo`.

- [ ] **Step 1:** Remover tudo; rodar `tsc` , verde.
- [ ] **Step 2:** Rodar a suíte `src/lib/reports/builder` + `src/components/reports/builder`
  + `route.test` , verde.
- [ ] **Step 3:** Checagem visual no dev (nada quebrado no fluxo entrevista→refino).
- [ ] **Step 4:** Commit , `refactor(f6): remove fase resumo (fluxo direto Gerar->refino)`.

---

## Apêndice , correções das 2 reviews do plano (v1→v3)

- **Task 0** nova: `seccaoViavel` (obterContrato 1-arg + `checarCompatibilidade`),
  porque `obterContrato(fato, shape)` 2-arg não existe e compat é o gate real.
  [#1.1, #1.2, #2.T1]
- **Quota/billing**: `GeracaoDeps` inclui `logUsage`/`verificarQuota`; deps default
  reusam `criarClienteConstrutorPadrao`/`obterReasoning`. [#1.3, #1.4, #2.F3]
- **Heartbeat**: mock de streaming + fallback por timer; reasoning por fase fiado e
  testado. [#2.A1, #1.5, #2.F3]
- **Repo sempre verde**: remoção de `resumo` virou a **Task 17** (commit único com
  todos os consumidores). [#1.6, #2.E1, #1.7, #2.E2]
- **run-builder repair guard** por `modo!=="jornada"`. [#1.8]
- **Ciclo de tipos**: `blueprint-types.ts` (puro) + `types.ts` (Task 5) antes de
  quem consome; `ultimoBlueprint: Blueprint`. [#1.9, #1.10]
- **Task 8 quebrada** em 8a/8b/8c; build **via dispatcher** (decisão). [#1.11, #2.E4]
- **Task 4 quebrada** em 4a/4b/4c; `construirToolDefs(modo)` toca run-builder + teste
  do bridge. [#1.12, #2.E3, #2.E5]
- **Task 10 quebrada** em 10a/10b/10c; `maxDuration=120`. [#1.13, #2.D3]
- **Labels das 3 tools novas** (corrige regressão de acentos/fallback). [#2.F1]
- **UI**: canal `onProgress` panel→workspace; máquina de saída da overlay; supressão
  da bubble no modo gerar; fake timers no teste de frases. [#2.B1, #2.B2, #2.B3, #2.B5]
- **E2E**: determinístico (semeia intenção, mede p50/p95) + observacional;
  reconhece que prompt é fé (teste estrutural). [#2.C1, #2.D1, #2.D2]
- **Backfill de legado** no `defaultParaConversa` testado. [#2.A4]
- **`oferecer_geracao` removida** (gate é estrutural). [#1.16] (Task 17)

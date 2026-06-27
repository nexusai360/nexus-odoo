# F6 Jornada Guiada de Construção , Implementation Plan (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (INLINE). UI tasks
> executadas inline (Opus + ui-ux-pro-max), nunca delegadas. Steps em checkbox (`- [ ]`).
> Histórico: v1 -> 2 reviews adversariais (integração/código + TDD/UI) -> **v3** (este). A
> seção final lista o que as reviews mudaram.

**Goal:** Construtor vira jornada guiada: a IA entrevista de forma adaptativa até entender o
suficiente (gate por EVIDÊNCIA da ficha, não auto-relato), reflete o entendimento em
linguagem natural, e leva a um resumo contestável + "Gerar" + animação + 2-pane.

**Architecture:** Opção A (blueprint incremental) reusando ficha `BuilderReportEntry` e tools
de mutação, somando: capability map curado, journeyState com gate por evidência, tools de
jornada (threaded por tool-bridge + loop), histórico no runBuilder, UI por fase.

**Tech Stack:** Next.js 16, TS, Prisma/Postgres, framer-motion, jest/jsdom, componentes do Consumo.

## Global Constraints

- F6 SÓ LOCAL: nunca mergear/deploy; migration só dev (Postgres compartilhado; `agente schema-changed`).
- **APENAS ASCII em prosa/strings**: proibido travessão (—), en-dash (–), reticências unicode (…),
  aspas tipográficas. Usar "-", "...", aspas retas. O pre-commit bloqueia e trava o commit.
- Opus em qualquer subagente; UI inline + ui-ux-pro-max.
- Reuso: mesma ficha, mesmas tools de mutação, mesmos componentes do Consumo.
- TDD nas unidades puras; E2E real obrigatório. tsc raiz limpo; jest builder verde; eslint limpo.

## File Structure

**Novos backend:** `builder/capabilities.ts` (+test), `builder/journey/state.ts` (+test),
`builder/journey/metrics.ts` (+test), `builder/agent/prompt-jornada.ts`,
`builder/tools/journey-tools.test.ts`.
**Modificados backend:** `builder/tools/mutators.ts`, `builder/tools/index.ts`,
`builder/agent/tool-bridge.ts`, `builder/agent/run-builder.ts`, `app/api/builder/stream/route.ts`,
`prisma/schema.prisma` (+migration manual).
**Novos UI:** `journey/understanding-summary.tsx`, `journey/option-cards.tsx`,
`journey/option-thumbs.tsx`, `journey/journey-summary.tsx` (todos +test).
**Modificados UI:** `builder-chat-panel.tsx` (+test), `builder-workspace.tsx` (+test).

---

## Task 1: Capability map curado

**Files:** Create `src/lib/reports/builder/capabilities.ts` (+ `capabilities.test.ts`).
**Interfaces produced:** `montarCapabilityMap(): CapabilityMap`, `capabilityComoTextoPrompt(): string`,
tipos `CapabilityFonte`, `NaoSuportado`, `CapabilityMap` (ver spec §9). `fontes` derivado de
`listarFontes()` + curadoria literal por fato.

- [ ] **Step 1 (test, FALHA):** asserções (ver bloco abaixo).
```ts
import { montarCapabilityMap, capabilityComoTextoPrompt } from "./capabilities";
it("escopo cita estoque; naoSuportado cita vendas/faturamento/pedido", () => {
  const c = montarCapabilityMap();
  expect(c.escopoAtual.toLowerCase()).toContain("estoque");
  expect(c.naoSuportado.some((n) => /venda|faturamento|pedido/i.test(n.pedido))).toBe(true);
});
it("cada fonte tem rotulo, KPIs curados e visualizacao recomendada", () => {
  const c = montarCapabilityMap();
  expect(c.fontes.length).toBeGreaterThanOrEqual(8);
  for (const f of c.fontes) { expect(f.rotulo).toBeTruthy(); expect(f.kpisSugeridos.length).toBeGreaterThan(0); expect(f.visualizacaoRecomendada.length).toBeGreaterThan(0); }
  expect(c.fontes.find((f) => f.fato === "fato_estoque_parados")?.kpisSugeridos).toEqual(expect.arrayContaining([expect.stringMatching(/imobilizado/i)]));
});
it("naoSuportado usa 'ainda', nunca 'impossivel/nao da'", () => {
  for (const n of montarCapabilityMap().naoSuportado) { expect(n.frase.toLowerCase()).toContain("ainda"); expect(n.frase.toLowerCase()).not.toMatch(/imposs|n[aã]o d[aá]/); }
});
it("texto do prompt inclui escopo e um fato", () => { const t = capabilityComoTextoPrompt(); expect(t).toContain("estoque"); expect(t).toContain("fato_estoque_saldo"); });
```
- [ ] **Step 2:** `npx jest .../capabilities.test.ts` -> FAIL.
- [ ] **Step 3:** Implementar. `CURADORIA: Record<string,{rotulo,exemplos,kpisSugeridos,visualizacaoRecomendada}>`
  com 1 entrada por fato (saldo, armazem, local_produto, marca, familia, movimento, parados,
  top_movimentados). `naoSuportado` literal (vendas, faturamento, pedidos, 3D, exportar PDF),
  frase "Isso ainda nao e possivel..." + caminhoProximo. `capabilityComoTextoPrompt` em markdown ASCII.
- [ ] **Step 4:** jest PASS + `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(f6): capability map curado`.

---

## Task 2: journeyState + gate por evidência + transições (puro)

**Files:** Create `src/lib/reports/builder/journey/state.ts` (+ `state.test.ts`).
**Interfaces produced:** `FaseJornada`, `Dimensao`, `JourneyState`, `ResumoJornada`,
`journeyStateInicial()`, `defaultParaConversa({temSavedReport,journeyState?})`,
`entendimentoElegivel(s): {ok; falta?}`, `podeOferecerGeracao(s)`, transições
`irParaResumo(s)`, `voltarParaEntrevista(s)`, `irParaRefino(s)`, `const TETO_TURNOS = 8`.

**Gate corrigido (anti-tautologia + anti-KPIRow-duplo):**
- `dados` = ≥1 seção cujo `fato` existe (`obterContrato(fato)` definido).
- `visualizacao` = ≥1 seção com template **renderável NÃO-KPI** (BarChart|PieChart|LineChart|DataTable).
- `indicadores` = ≥1 `KPIRow` OU `s.semKpiDeclarado === true`.
- `objetivo` = `turnosUsuario >= 2` OU (`s.entendimento` com texto >= 20 chars). [floor binding:
  ficha completa em 1 turno SEM reflexão de entendimento NÃO é elegível.]
- `ok = dados && visualizacao && indicadores && objetivo`; `falta` = 1a condição falsa, em texto
  para a IA ("ainda preciso entender qual dado/como visualizar/...").

- [ ] **Step 1 (test, FALHA):**
```ts
import { journeyStateInicial, defaultParaConversa, entendimentoElegivel, irParaResumo, voltarParaEntrevista } from "./state";
const ficha = (secoes:any[]) => ({ id:"r",titulo:"t",dominio:"estoque",schemaVersion:1,tipo:"tela_cheia",parametros:[],
  secoes: secoes.map((s,i)=>({id:`s${i}`,template:"DataTable",fato:"fato_estoque_saldo",shapeDerivado:"tabela",config:{},filtros:[],...s})) } as any);
it("vazio nao elegivel", () => expect(entendimentoElegivel(journeyStateInicial()).ok).toBe(false));
it("completo + 2 turnos elegivel", () => { const s=journeyStateInicial(); s.turnosUsuario=2;
  s.fichaRascunho=ficha([{template:"KPIRow",shapeDerivado:"kpis"},{template:"BarChart",fato:"fato_estoque_marca",shapeDerivado:"agregacaoCategorica"}]);
  expect(entendimentoElegivel(s).ok).toBe(true); });
it("completo em 1 turno SEM entendimento NAO elegivel (floor binding)", () => { const s=journeyStateInicial(); s.turnosUsuario=1;
  s.fichaRascunho=ficha([{template:"KPIRow",shapeDerivado:"kpis"},{template:"BarChart",fato:"fato_estoque_marca",shapeDerivado:"agregacaoCategorica"}]);
  expect(entendimentoElegivel(s).ok).toBe(false); });
it("1 turno COM entendimento reflexivo -> elegivel (atalho)", () => { const s=journeyStateInicial(); s.turnosUsuario=1;
  s.entendimento="voce quer o estoque parado por marca com valor imobilizado";
  s.fichaRascunho=ficha([{template:"KPIRow",shapeDerivado:"kpis"},{template:"DataTable",shapeDerivado:"tabela"}]);
  expect(entendimentoElegivel(s).ok).toBe(true); });
it("so KPIRow nao satisfaz visualizacao", () => { const s=journeyStateInicial(); s.turnosUsuario=3;
  s.fichaRascunho=ficha([{template:"KPIRow",shapeDerivado:"kpis"}]); expect(entendimentoElegivel(s).ok).toBe(false); });
it("semKpiDeclarado dispensa KPIRow", () => { const s=journeyStateInicial(); s.turnosUsuario=2; s.semKpiDeclarado=true;
  s.fichaRascunho=ficha([{template:"DataTable",shapeDerivado:"tabela"}]); expect(entendimentoElegivel(s).ok).toBe(true); });
it("fato inexistente nao conta como dados", () => { const s=journeyStateInicial(); s.turnosUsuario=3;
  s.fichaRascunho=ficha([{fato:"fato_x",template:"DataTable",shapeDerivado:"tabela"}]); expect(entendimentoElegivel(s).ok).toBe(false); });
it("legado com savedReport -> refino; nova -> entrevista", () => { expect(defaultParaConversa({temSavedReport:true}).fase).toBe("refino"); expect(defaultParaConversa({temSavedReport:false}).fase).toBe("entrevista"); });
it("irParaResumo so com elegivel; voltarParaEntrevista reverte", () => { const s=journeyStateInicial(); s.turnosUsuario=2; s.entendimento="x".repeat(20);
  s.fichaRascunho=ficha([{template:"KPIRow",shapeDerivado:"kpis"},{template:"DataTable",shapeDerivado:"tabela"}]);
  const r=irParaResumo(s); expect("erro" in r).toBe(false); if(!("erro" in r)){ expect(r.fase).toBe("resumo"); expect(voltarParaEntrevista(r).fase).toBe("entrevista"); } });
```
- [ ] **Step 2:** jest -> FAIL.
- [ ] **Step 3:** Implementar `state.ts` conforme o gate acima. `irParaResumo` retorna `{erro}` se
  não elegível; senão `{...s, fase:"resumo"}`. `voltarParaEntrevista`/`irParaRefino` puros.
  `defaultParaConversa`: journeyState dado -> ele; senão temSavedReport -> {...inicial,fase:"refino"}; senão inicial.
- [ ] **Step 4:** jest PASS + tsc.
- [ ] **Step 5:** Commit `feat(f6): journeyState + gate por evidencia + transicoes de fase`.

---

## Task 3: Tools de jornada + ToolExec + tool-bridge + serialização

**Files:** Modify `tools/mutators.ts`, `tools/index.ts`, `agent/tool-bridge.ts`,
`agent/run-builder.ts` (só `serializarResultadoTool`). Create `tools/journey-tools.test.ts`.
**Interfaces:** mutators `atualizarEntendimento`, `oferecerOpcoes`, `oferecerGeracao`,
`montarResumo` (ver spec §8). `ToolExec` ganha `| {tipo:"jornada"; journeyState}` e
`| {tipo:"opcoes"; titulo; opcoes}`. `executarTool(name,args,ficha,journeyState)`.
`despachar(toolCall, ficha, journeyState)` repassa e retorna as variantes novas.
`serializarResultadoTool` serializa `jornada`->JSON do estado relevante e `opcoes`->confirmação.

- [ ] **Step 1 (test, FALHA):** `oferecerGeracao` com state inelegível -> `{erro:"ainda_sem_evidencia", falta}`;
  com elegível -> `{journeyState.fase:"resumo"}`. `atualizarEntendimento` grava `entendimento` +
  marca `dimensoesTocadas`. `oferecerOpcoes` descarta opção com `tipoVisual` fora dos templates.
  `montarResumo` só com elegível, monta itens com `dimensao`. `despachar` repassa journeyState e
  devolve `{tipo:"jornada"}` quando a tool é de jornada (teste com toolCall fake).
- [ ] **Step 2:** jest -> FAIL.
- [ ] **Step 3:** Implementar mutators + estender `ToolExec`/`executarTool`/`BUILDER_TOOLS` (Zod) +
  `despachar(toolCall,ficha,journeyState)` + `serializarResultadoTool` para as variantes. Atualizar
  `tools/index.test.ts` (length de BUILDER_TOOLS passa para o novo total; nomes incluem as 4).
- [ ] **Step 4:** jest PASS (incl. index.test) + tsc.
- [ ] **Step 5:** Commit `feat(f6): tools de jornada + ToolExec/tool-bridge/serializacao`.

---

## Task 4: runBuilder com histórico + journeyState + temperature por modo

**Files:** Modify `agent/run-builder.ts`. Create `agent/prompt-jornada.ts`,
`agent/run-builder-jornada.test.ts`.
**Interfaces:** `runBuilder` aceita `historico?: {role,content}[]`, `journeyState?: JourneyState`,
`modo?: "jornada"|"refino"`. `RunBuilderResult` ganha `journeyState`. `SYSTEM_JORNADA`.
**Sincronização (correção crítica):** a cada iteração, ANTES de despachar tools de jornada, o loop
espelha a ficha de trabalho em `journeyState.fichaRascunho`. Após despachar, recupera journeyState
atualizado das variantes `{tipo:"jornada"}`.

- [ ] **Step 1 (test, FALHA):** cliente fake que CAPTURA `req.messages` (spy). Casos:
  (a) `historico` de 2 turnos aparece em `req.messages` na ordem; (b) fake chama
  `adicionar_secao` + `oferecer_geracao` no mesmo turno com ficha que satura o gate ->
  `result.journeyState.fase === "resumo"` (prova o espelhamento ficha->fichaRascunho);
  (c) sem evidência -> segue `"entrevista"`. Fornecer TODAS as deps fake
  (`criarCliente`, `verificarQuota`, `logUsage`, `obterReasoning`) p/ não bater no Prisma.
- [ ] **Step 2:** jest -> FAIL.
- [ ] **Step 3:** Implementar: `messages = [system(modo), ...historico, fichaCompacta?, prompt]`
  (modo "jornada" usa `SYSTEM_JORNADA`+capability; "refino" usa o atual). `temperature` =
  modo==="jornada" ? 0.5 : 0.2. Espelhar ficha em fichaRascunho; aplicar retornos jornada;
  coletar `{tipo:"opcoes"}` e emitir `onEvent({type:"choices",...})`; devolver journeyState.
  **Ficha compacta** (mitigação §14): enviar resumo curto da ficha (titulo + lista de
  secoes `template/fato`) em vez do JSON inteiro, no modo jornada. `SYSTEM_JORNADA` com
  few-shots ASCII (abertura+escopo, reflexao+aprofundamento, "ainda nao e possivel"+caminho,
  reflexao de entendimento final, caso rapido). `SEM_FONTE` terminal só p/ pedido inteiramente
  fora do catalogo.
- [ ] **Step 4:** jest PASS + tsc.
- [ ] **Step 5:** Commit `feat(f6): runBuilder historico+journeyState+temperature por modo + prompt jornada`.

---

## Task 5a: Migration journeyState

**Files:** Modify `prisma/schema.prisma`; Create migration manual.
- [ ] **Step 1:** Add `journeyState Json?` em `BuilderConversation`. `npx prisma generate`.
- [ ] **Step 2:** Migration SQL aditiva: `ALTER TABLE "builder_conversations" ADD COLUMN "journeyState" JSONB;`
  + backfill: conversas com `savedReportId IS NOT NULL` recebem `'{"fase":"refino"}'::jsonb`.
  Aplicar MANUAL (sem `migrate dev`/reset). `agente schema-changed`.
- [ ] **Step 3:** `npx tsc --noEmit` (cliente Prisma regenerado).
- [ ] **Step 4:** Commit `feat(f6): migration journeyState (aditiva) + backfill refino p/ legado`.

---

## Task 5b: Stream , histórico, journeyState, fichaRascunho, choices, sinal Gerar

**Files:** Modify `app/api/builder/stream/route.ts`.
**Contrato novo do body:** `{conversationId, message, isAudio, acao?: "gerar"}`.
- [ ] **Step 1:** Carregar `journeyState` da conversa (ou `defaultParaConversa({temSavedReport})`).
  Carregar `historico` de `builder_messages` ANTES de persistir a mensagem atual (evita duplicar o
  turno corrente). `fichaAtual` vem de `journeyState.fichaRascunho` (não mais só do SavedReport na
  entrevista).
- [ ] **Step 2:** Passar `historico`, `journeyState`, `modo` (refino se fase==="refino", senão
  jornada) ao runBuilder. Persistir `journeyState` (com `fichaRascunho` atualizada) de volta na conversa.
- [ ] **Step 3:** Emitir evento SSE `choices` quando runBuilder reportar opções. Incluir
  `journeyState`/`fase` no `done`.
- [ ] **Step 4 (sinal Gerar):** se `acao === "gerar"` E `journeyState` elegível: `irParaRefino`,
  **promover** a ficha a `SavedReport` (upsert + etag, como hoje) e linkar na conversa; só AQUI cria
  SavedReport. Em entrevista/resumo NÃO cria SavedReport (a ficha vive no fichaRascunho).
- [ ] **Step 5:** Rebuild (`docker compose build app` + recreate; `npm run dev:fresh` em dev).
  Verificação manual: entrevista não cria SavedReport; `acao:"gerar"` cria; done traz fase.
- [ ] **Step 6:** Commit `feat(f6): stream com historico/journeyState/choices/sinal gerar (SavedReport so no Gerar)`.

---

## Task 6: Fiação de tipos do front (SseEvent + BuilderDonePayload)

**Files:** Modify `builder-chat-panel.tsx` (tipos + parser), `builder-workspace.tsx` (onDone).
- [ ] **Step 1 (test, FALHA):** estender `builder-chat-panel.test.tsx` (mock de stream existente)
  para emitir `done` com `journeyState:{fase:"resumo"}` e assertar que `onDone` recebe `journeyState`.
- [ ] **Step 2:** jest -> FAIL.
- [ ] **Step 3:** Estender union `SseEvent`: variante `done` ganha `journeyState?: JourneyState`;
  nova variante `{type:"choices"; titulo; opcoes}`. `BuilderDonePayload` ganha `journeyState?`.
  Parser repassa. Definir `fase` inicial do workspace: `initialSavedId != null` -> "refino", senão "entrevista".
- [ ] **Step 4:** jest PASS + tsc.
- [ ] **Step 5:** Commit `feat(f6): tipos SseEvent/BuilderDonePayload com journeyState+choices`.

---

## Task 7: UI , reflexo de entendimento + casca centralizada (inline)

**Files:** Create `journey/understanding-summary.tsx` (+test). Modify `builder-workspace.tsx`
(+ atualizar `builder-workspace.test.tsx`).
- [ ] **Step 1 (test, FALHA):** `UnderstandingSummary({texto})` renderiza o texto; sem texto não
  renderiza nada e NÃO há rótulos técnicos ("Objetivo"/"recorte"/"temporalidade"). Atualizar o
  `builder-workspace.test.tsx`: workspace sem `initialSavedId` agora abre em fase "entrevista"
  (casca centralizada); com `initialSavedId` abre "refino" (2-pane com preview).
- [ ] **Step 2:** jest -> FAIL.
- [ ] **Step 3:** Implementar `UnderstandingSummary` (bloco discreto, tokens do Consumo). Workspace:
  `fase==="entrevista"` -> chat centralizado (max-w, UnderstandingSummary acima); `fase` muda via `onDone`.
- [ ] **Step 4:** jest PASS + tsc + dev compila.
- [ ] **Step 5:** Commit `feat(f6): reflexo de entendimento + casca centralizada`.

---

## Task 8: UI , cards de opção (choices) (inline)

**Files:** Create `journey/option-cards.tsx`, `journey/option-thumbs.tsx` (+ `option-cards.test.tsx`).
Modify `builder-chat-panel.tsx` (+ teste de integração no `builder-chat-panel.test.tsx`).
- [ ] **Step 1 (test, FALHA):** `OptionCards({titulo,opcoes,onSelecionar})` renderiza 1 card por opção
  e chama `onSelecionar(id)` no clique. Integração: stream fake emite `choices` -> painel renderiza
  cards após a bolha -> clique reenvia a seleção como turno.
- [ ] **Step 2:** jest -> FAIL.
- [ ] **Step 3:** Implementar cards + thumbnails (ícones dos templates). Painel: tratar
  `evt.type==="choices"`, guardar, renderizar, e ao clicar enviar "Prefiro: <rotulo>" como turno.
- [ ] **Step 4:** jest PASS + tsc + dev.
- [ ] **Step 5:** Commit `feat(f6): cards de opcao (choices)`.

---

## Task 9: UI , resumo contestável + Gerar + animação determinística (inline)

**Files:** Create `journey/journey-summary.tsx` (+test). Modify `builder-workspace.tsx`.
- [ ] **Step 1 (test, FALHA):** `JourneySummary({resumo,onAjustar,onGerar})` lista itens; cada item
  tem "ajustar" -> `onAjustar(dimensao)`; botão "Gerar relatorio" -> `onGerar`. Botão só existe com resumo.
- [ ] **Step 2:** jest -> FAIL.
- [ ] **Step 3:** Implementar `JourneySummary` (cartão, tokens do Consumo). Workspace: `fase==="resumo"`
  -> render do resumo; "ajustar" envia turno (volta a entrevista); "Gerar" -> POST com `acao:"gerar"`,
  toca animação (framer-motion) e **gateia a troca para "refino" em `onAnimationComplete`**
  (determinístico, não timer). Refino = 2-pane atual com a ficha.
- [ ] **Step 4:** jest PASS + tsc + dev.
- [ ] **Step 5:** Commit `feat(f6): resumo contestavel + Gerar + animacao + transicao 2-pane`.

---

## Task 10: Métricas de jornada (concreto)

**Files:** Create `journey/metrics.ts` (+test). Modify `stream/route.ts` (gravar).
Migration: tabela `journey_metrics` (id, conversationId, turnosAteElegivel Int?, chegouRefino Bool,
geracaoRecusadaCount Int, criadoEm). (Métrica "sem edição corretiva" fica para onda futura, anotada.)
- [ ] **Step 1 (test, FALHA):** helper puro `resumoMetrica(eventos)` calcula turnosAteElegivel,
  chegouRefino, geracaoRecusadaCount a partir de uma lista de eventos.
- [ ] **Step 2:** jest -> FAIL.
- [ ] **Step 3:** Implementar helper + persistência leve no route (upsert por conversa). Migration aditiva manual.
- [ ] **Step 4:** jest PASS + tsc.
- [ ] **Step 5:** Commit `feat(f6): metricas de jornada (captura leve)`.

---

## Task 11: Verificação E2E real

**Files:** Create `scripts/e2e-f6-jornada.ts`.
- [ ] **Step 1:** Script chamando `runBuilder` (e o route quando preciso) contra LLM real + cache real.
  Asserções ROBUSTAS a não-determinismo (checar invariantes, não texto exato):
  (a) abertura menciona estoque/escopo; (b) pedido raso -> `journeyState.fase` segue "entrevista" e
  NÃO houve promoção a SavedReport (gate); (c) pedido claro + reflexão -> `oferecer_geracao` aceito
  (fase "resumo"); (d) "quero vendas" no meio -> resposta contém "ainda" e a jornada NÃO encerra
  (sem recusa terminal); (e) `acao:"gerar"` -> SavedReport criado e ficha renderiza (resolve seções);
  (f) reabrir relatório legado (savedReport sem journeyState) -> `defaultParaConversa` dá "refino".
- [ ] **Step 2:** `npx tsx --env-file=.env.local scripts/e2e-f6-jornada.ts`. Corrigir inline o que falhar.
- [ ] **Step 3:** Atualizar STATUS.md + HISTORY.md com evidências.
- [ ] **Step 4:** Commit `test(f6): E2E real da jornada`.

---

## O que as reviews mudaram (v1 -> v3)

- tool-bridge.ts/`despachar`/`serializarResultadoTool` adicionados (Task 3) , o loop não chama
  executarTool direto. [crítico, ambas]
- Gate corrigido: `objetivo` agora binding (turnos>=2 OU entendimento>=20 chars); `visualizacao`
  exclui KPIRow; teste "completo em 1 turno sem reflexao NAO elegivel" (Task 2). [crítico, ambas]
- Espelhamento ficha->`fichaRascunho` no loop antes de avaliar o gate (Task 4). [crítico, ambas]
- Transição resumo->refino + sinal `acao:"gerar"` no body, promoção do SavedReport só no Gerar
  (Tasks 2,5b). [crítico, ambas]
- Task 5 dividida em 5a (migration) e 5b (route). [alto, review #1]
- Histórico carregado ANTES de persistir o turno (evita duplicar) (Task 5b). [alto, review #1]
- `fichaAtual` lê de `fichaRascunho` na entrevista (Task 5b). [alto, review #1]
- Tipos de front (SseEvent done+choices, BuilderDonePayload) numa task própria ANTES da UI (Task 6).
  [alto, ambas]
- Fase inicial do workspace definida (entrevista vs refino) + testes existentes atualizados
  (Tasks 6,7). [médio, review #2]
- §14: ficha compacta implementada (Task 4); caching de prefixo anotado como nota do provedor.
- temperature por modo (Task 4). [médio, review #1]
- Métricas concretas: tabela `journey_metrics` (Task 10). [médio, review #1]
- Integração choices testada no chat-panel (Task 8); teste de histórico com spy de req.messages
  (Task 4). [médio, review #2]
- Animação gateada em `onAnimationComplete` (determinístico) (Task 9). [médio, review #2]
- ASCII-only (sem travessão/reticências) reforçado nas Global Constraints. [médio, review #2]
- E2E com asserções robustas a não-determinismo (Task 11). [médio, review #2]

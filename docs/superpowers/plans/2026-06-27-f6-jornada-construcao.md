# F6 Jornada Guiada de Construção , Implementation Plan (v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to
> implement this plan task-by-task. UI tasks são executadas INLINE na sessão principal
> (Opus) com ui-ux-pro-max, NUNCA delegadas a subagente (regra do projeto). Steps usam
> checkbox (`- [ ]`).

**Goal:** Transformar o construtor de relatórios numa jornada guiada: a IA entrevista o
usuário de forma adaptativa até entender o suficiente (gate por evidência da ficha),
reflete o entendimento em linguagem natural, e só então leva a uma tela de resumo
contestável + "Gerar" + animação + layout 2-pane.

**Architecture:** Opção A (blueprint incremental). A jornada reusa a ficha
`BuilderReportEntry` e as tools de mutação existentes, acrescentando: capability map
curado, estado de jornada (`journeyState`) com gate por evidência, tools de jornada,
histórico threaded no `runBuilder`, e uma casca de UI por fase (entrevista centralizada
-> resumo -> refino 2-pane).

**Tech Stack:** Next.js 16, TypeScript, Prisma/Postgres, framer-motion, jest + jsdom,
componentes do "Consumo do Agente Nex".

## Global Constraints

- F6 SÓ LOCAL: nunca mergear/deploy; migrations só em dev (Postgres compartilhado).
- Proibido o caractere travessão (em-dash/en-dash) em qualquer arquivo (lint bloqueia).
- Modelo sempre Opus em qualquer subagente; UI nunca delegada (inline + ui-ux-pro-max).
- Reuso total: mesma ficha, mesmas tools de mutação, mesmos componentes do Consumo.
- TDD nas unidades puras; E2E real obrigatório antes de declarar pronto.
- tsc raiz limpo; jest builder verde; eslint limpo a cada commit.

## File Structure (decomposição)

**Novos (lógica pura / backend):**
- `src/lib/reports/builder/capabilities.ts` , capability map curado + helpers.
- `src/lib/reports/builder/journey/state.ts` , tipos de journeyState, `entendimentoElegivel`,
  transições puras de fase, default condicional do legado.
- `src/lib/reports/builder/journey/state.test.ts`, `capabilities.test.ts`.
- `src/lib/reports/builder/agent/prompt-jornada.ts` , system prompt entrevistador + few-shots.

**Modificados (backend):**
- `src/lib/reports/builder/tools/mutators.ts` , 4 funções novas de jornada.
- `src/lib/reports/builder/tools/index.ts` , registra tools + dispatch + `ToolExec` variante.
- `src/lib/reports/builder/agent/run-builder.ts` , histórico + journeyState no loop.
- `src/app/api/builder/stream/route.ts` , histórico, journeyState no done, evento `choices`,
  fichaRascunho (não promove SavedReport antes do Gerar).
- `prisma/schema.prisma` + migration manual aditiva , `journeyState` em BuilderConversation.

**Novos (UI, inline):**
- `src/components/reports/builder/journey/understanding-summary.tsx`
- `src/components/reports/builder/journey/option-cards.tsx`
- `src/components/reports/builder/journey/journey-summary.tsx`
- modificações em `builder-workspace.tsx`, `builder-chat-panel.tsx`.

---

## Task 1: Capability map curado

**Files:**
- Create: `src/lib/reports/builder/capabilities.ts`
- Test: `src/lib/reports/builder/capabilities.test.ts`

**Interfaces:**
- Consumes: `listarFontes()` de `source-registry.ts`, `CORES_SELECIONAVEIS` de
  `components/charts/colors.ts`, `TEMPLATES_ONDA1` de `builder/types.ts`.
- Produces:
  - `interface CapabilityFonte { fato: string; rotulo: string; exemplos: string[]; kpisSugeridos: string[]; visualizacaoRecomendada: ReportTemplate[] }`
  - `interface NaoSuportado { pedido: string; frase: string; caminhoProximo: string }`
  - `interface CapabilityMap { escopoAtual: string; fontes: CapabilityFonte[]; visualizacoes: {template: ReportTemplate; quandoUsar: string; shape: string}[]; filtros: {tipo: string; quando: string}[]; cores: string[]; naoSuportado: NaoSuportado[] }`
  - `function montarCapabilityMap(): CapabilityMap`
  - `function capabilityComoTextoPrompt(): string` (serializa para o system prompt)

- [ ] **Step 1: Write failing test** , `capabilities.test.ts`:
```ts
import { montarCapabilityMap, capabilityComoTextoPrompt } from "./capabilities";
describe("capability map", () => {
  it("escopo atual menciona estoque e que vendas/financeiro ainda nao", () => {
    const c = montarCapabilityMap();
    expect(c.escopoAtual.toLowerCase()).toContain("estoque");
    expect(c.naoSuportado.some((n) => /venda|faturamento|pedido/i.test(n.pedido))).toBe(true);
  });
  it("toda fonte do registry vira CapabilityFonte com KPIs curados e visualizacao", () => {
    const c = montarCapabilityMap();
    expect(c.fontes.length).toBeGreaterThanOrEqual(8);
    for (const f of c.fontes) {
      expect(f.rotulo.length).toBeGreaterThan(0);
      expect(f.kpisSugeridos.length).toBeGreaterThan(0);
      expect(f.visualizacaoRecomendada.length).toBeGreaterThan(0);
    }
    expect(c.fontes.find((f) => f.fato === "fato_estoque_parados")?.kpisSugeridos)
      .toEqual(expect.arrayContaining([expect.stringMatching(/imobilizado/i)]));
  });
  it("naoSuportado usa 'ainda' e nunca 'nao da/impossivel'", () => {
    for (const n of montarCapabilityMap().naoSuportado) {
      expect(n.frase.toLowerCase()).toContain("ainda");
      expect(n.frase.toLowerCase()).not.toMatch(/imposs|n[aã]o d[aá]/);
    }
  });
  it("texto do prompt inclui o escopo e as fontes", () => {
    const t = capabilityComoTextoPrompt();
    expect(t).toContain("estoque");
    expect(t).toContain("fato_estoque_saldo");
  });
});
```
- [ ] **Step 2:** Run `npx jest src/lib/reports/builder/capabilities.test.ts` , espera FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `capabilities.ts`. `montarCapabilityMap` deriva `fontes` de
  `listarFontes()` e enriquece com um mapa CURADO por fato (rótulo, exemplos, kpisSugeridos,
  visualizacaoRecomendada) , objeto literal `CURADORIA: Record<string, {...}>` no arquivo,
  uma entrada por fato de estoque. `naoSuportado` é lista literal (vendas, faturamento,
  pedidos, 3D, exportar PDF), cada uma com frase começando "Isso ainda nao e possivel..."
  + caminho próximo. `capabilityComoTextoPrompt` serializa em markdown enxuto.
- [ ] **Step 4:** Run o teste , espera PASS. Rodar `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(f6): capability map curado (fontes + KPIs sugeridos + nao-suportado)`.

---

## Task 2: Estado de jornada + gate por evidência (puro)

**Files:**
- Create: `src/lib/reports/builder/journey/state.ts`
- Test: `src/lib/reports/builder/journey/state.test.ts`

**Interfaces:**
- Consumes: `BuilderReportEntry`, `BuilderSection` de `builder/types.ts`; `obterContrato` de
  `source-registry.ts`.
- Produces:
  - `type FaseJornada = "entrevista" | "resumo" | "refino"`
  - `type Dimensao = "objetivo" | "dados" | "indicadores" | "visualizacao" | "filtros" | "layout" | "periodo"`
  - `interface JourneyState { fase: FaseJornada; fichaRascunho?: BuilderReportEntry; entendimento?: string; dimensoesTocadas: Record<Dimensao, boolean>; resumo?: ResumoJornada; turnosUsuario: number; semKpiDeclarado?: boolean }`
  - `interface ResumoJornada { itens: { dimensao: Dimensao; texto: string }[] }`
  - `function journeyStateInicial(): JourneyState`
  - `function defaultParaConversa(args: { temSavedReport: boolean; journeyState?: JourneyState | null }): JourneyState` (legado -> refino)
  - `function entendimentoElegivel(s: JourneyState): { ok: boolean; falta?: string }`
  - `function podeOferecerGeracao(s: JourneyState): boolean`
  - `const TETO_TURNOS = 8`

- [ ] **Step 1: Write failing test** , `state.test.ts`:
```ts
import { journeyStateInicial, defaultParaConversa, entendimentoElegivel, TETO_TURNOS } from "./state";
import type { BuilderReportEntry } from "../types";
function fichaCom(secoes: Partial<BuilderReportEntry["secoes"][number]>[]): BuilderReportEntry {
  return { id: "r", titulo: "t", dominio: "estoque", schemaVersion: 1, tipo: "tela_cheia",
    parametros: [], secoes: secoes.map((s, i) => ({ id: `s${i}`, template: "DataTable",
    fato: "fato_estoque_saldo", shapeDerivado: "tabela", config: {}, filtros: [], ...s })) as any };
}
describe("entendimentoElegivel", () => {
  it("nao elegivel sem fonte/visualizacao", () => {
    const s = journeyStateInicial();
    expect(entendimentoElegivel(s).ok).toBe(false);
  });
  it("elegivel: fonte real + KPIRow + visualizacao + 2 turnos", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 2;
    s.fichaRascunho = fichaCom([
      { template: "KPIRow", shapeDerivado: "kpis" },
      { template: "BarChart", fato: "fato_estoque_marca", shapeDerivado: "agregacaoCategorica" },
    ]);
    expect(entendimentoElegivel(s).ok).toBe(true);
  });
  it("atalho: 1o pedido satura nucleo mesmo com 1 turno", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 1;
    s.fichaRascunho = fichaCom([
      { template: "KPIRow", shapeDerivado: "kpis" },
      { template: "DataTable", shapeDerivado: "tabela" },
    ]);
    // satura dados+visualizacao+indicadores no 1o pedido -> elegivel
    expect(entendimentoElegivel(s).ok).toBe(true);
  });
  it("semKpiDeclarado dispensa o KPIRow", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 2; s.semKpiDeclarado = true;
    s.fichaRascunho = fichaCom([{ template: "DataTable", shapeDerivado: "tabela" }]);
    expect(entendimentoElegivel(s).ok).toBe(true);
  });
  it("fato inexistente nao conta como dados", () => {
    const s = journeyStateInicial(); s.turnosUsuario = 3;
    s.fichaRascunho = fichaCom([{ fato: "fato_inexistente", template: "DataTable", shapeDerivado: "tabela" }]);
    expect(entendimentoElegivel(s).ok).toBe(false);
  });
});
describe("defaultParaConversa", () => {
  it("legado com savedReport e sem journeyState cai em refino", () => {
    expect(defaultParaConversa({ temSavedReport: true }).fase).toBe("refino");
  });
  it("conversa nova comeca em entrevista", () => {
    expect(defaultParaConversa({ temSavedReport: false }).fase).toBe("entrevista");
  });
  it("journeyState existente e respeitado", () => {
    const s = journeyStateInicial(); s.fase = "resumo";
    expect(defaultParaConversa({ temSavedReport: true, journeyState: s }).fase).toBe("resumo");
  });
});
```
- [ ] **Step 2:** Run jest , FAIL.
- [ ] **Step 3:** Implementar `state.ts`. `entendimentoElegivel`:
  - `dados` = ficha tem ≥1 seção cujo `fato` existe (`obterContrato(fato)` != undefined).
  - `visualizacao` = ≥1 seção com template em TEMPLATES_ONDA1.
  - `indicadores` = ≥1 seção KPIRow OU `semKpiDeclarado`.
  - `objetivo` = `turnosUsuario >= 2` OU (atalho) dados+visualizacao+indicadores todos true.
  - ok = dados && visualizacao && indicadores && objetivo; `falta` descreve a 1a condição
    que faltou (texto pra IA: "ainda preciso entender qual dado/visualizacao...").
  - `podeOferecerGeracao` = `entendimentoElegivel(s).ok`.
  - `defaultParaConversa`: se journeyState dado, retorna ele; senão se temSavedReport -> {...inicial, fase:"refino"}; senão inicial.
- [ ] **Step 4:** jest PASS + tsc.
- [ ] **Step 5:** Commit `feat(f6): journeyState + gate de entendimento por evidencia da ficha`.

---

## Task 3: Tools de jornada + ToolExec variante "jornada"

**Files:**
- Modify: `src/lib/reports/builder/tools/mutators.ts`
- Modify: `src/lib/reports/builder/tools/index.ts`
- Test: `src/lib/reports/builder/tools/journey-tools.test.ts` (novo)

**Interfaces:**
- Consumes: `JourneyState`, `entendimentoElegivel` (Task 2); capability map (Task 1).
- Produces (mutators):
  - `atualizarEntendimento(s: JourneyState, args: { texto: string; dimensoes?: Dimensao[] }): { journeyState: JourneyState } | { erro: string }`
  - `oferecerOpcoes(args: { titulo: string; opcoes: {id,rotulo,descricao,tipoVisual?}[] }): { opcoesValidas: ... } | { erro }` (valida contra capability map)
  - `oferecerGeracao(s, args:{motivo:string}): { journeyState } | { erro: "ainda_sem_evidencia"; falta }`
  - `montarResumo(s, ficha): { journeyState } | { erro }`
- Produces (index): `ToolExec` ganha `| { tipo: "jornada"; journeyState: JourneyState }` e
  `| { tipo: "opcoes"; titulo; opcoes }`. `executarTool` ganha param `journeyState`.

- [ ] **Step 1: Write failing test** (`journey-tools.test.ts`): testa que `oferecerGeracao`
  com state inelegível retorna `{ erro: "ainda_sem_evidencia" }`; com elegível muda fase para
  "resumo"; `atualizarEntendimento` grava `entendimento` + marca dimensões; `oferecerOpcoes`
  descarta opção com `tipoVisual` fora dos templates válidos; `montarResumo` só com elegível.
- [ ] **Step 2:** jest FAIL.
- [ ] **Step 3:** Implementar mutators + estender `ToolExec`/`executarTool(name,args,ficha,journeyState)`.
  Adicionar ao `BUILDER_TOOLS` as 4 tools (inputSchema Zod). No dispatch, casos novos retornam
  `{tipo:"jornada",...}` ou `{tipo:"opcoes",...}`.
- [ ] **Step 4:** jest PASS + tsc. Atualizar `tools/index.test.ts` (contagem de tools) se existir asserção de length.
- [ ] **Step 5:** Commit `feat(f6): tools de jornada (entendimento/opcoes/oferecer_geracao/resumo) + ToolExec jornada`.

---

## Task 4: runBuilder com histórico + journeyState

**Files:**
- Modify: `src/lib/reports/builder/agent/run-builder.ts`
- Create: `src/lib/reports/builder/agent/prompt-jornada.ts`
- Test: `src/lib/reports/builder/agent/run-builder-jornada.test.ts` (novo, com cliente fake)

**Interfaces:**
- Consumes: tools (Task 3), capability map (Task 1), journeyState (Task 2).
- Produces: `runBuilder` aceita `historico?: {role:"user"|"assistant"; content:string}[]` e
  `journeyState?: JourneyState`, e `RunBuilderResult` ganha `journeyState: JourneyState`.
  Novo `SYSTEM_JORNADA` em `prompt-jornada.ts`.

- [ ] **Step 1: Write failing test** com cliente LLM fake (já há padrão de deps injetáveis em
  run-builder): dado um historico de 2 turnos e um journeyState, o fake chama
  `oferecer_geracao`; o resultado devolve `journeyState.fase === "resumo"` quando elegível e
  segue "entrevista" quando não. Verifica que `messages` enviados ao cliente incluem o histórico.
- [ ] **Step 2:** jest FAIL.
- [ ] **Step 3:** Implementar: `messages = [system(jornada+capability), ...historico, ficha?, prompt]`;
  loop carrega `journeyState`, aplica retornos `{tipo:"jornada"}` atualizando-o, coleta
  `{tipo:"opcoes"}` para emitir via onEvent (`type:"choices"`), devolve `journeyState`. Escrever
  `SYSTEM_JORNADA` com as regras + few-shots (abertura com escopo, reflexão, "ainda nao",
  reflexão de entendimento final, caso rápido). Manter `SEM_FONTE` terminal só para pedido
  inteiramente fora do catálogo.
- [ ] **Step 4:** jest PASS + tsc.
- [ ] **Step 5:** Commit `feat(f6): runBuilder com historico + journeyState + prompt da jornada`.

---

## Task 5: Migration journeyState + persistência no stream

**Files:**
- Modify: `prisma/schema.prisma` (campo `journeyState Json?` em BuilderConversation)
- Create: `prisma/migrations/<ts>_f6_journey_state/migration.sql` (manual, aditivo)
- Modify: `src/app/api/builder/stream/route.ts`

**Interfaces:**
- Consumes: `defaultParaConversa`, journeyState, runBuilder (Tasks 2,4).
- Produces: SSE `done` inclui `journeyState`; novo evento SSE `choices`; ficha vira
  `fichaRascunho` no journeyState e só promove a `SavedReport` quando `fase` chega a "refino".

- [ ] **Step 1:** Add campo no schema; `npx prisma generate`. Escrever migration SQL aditiva
  (`ALTER TABLE "builder_conversations" ADD COLUMN "journeyState" JSONB;`). Aplicar MANUAL
  (sem migrate dev, sem reset; protocolo de schema). Rodar `agente schema-changed`.
- [ ] **Step 2:** Modificar o route: carregar journeyState (ou `defaultParaConversa` com
  temSavedReport), passar `historico` (de builder_messages) + journeyState ao runBuilder,
  persistir journeyState de volta, emitir `choices`, e só fazer o upsert de `SavedReport`
  quando `journeyState.fase === "refino"` (no Gerar). Antes disso, guardar a ficha em
  `journeyState.fichaRascunho`.
- [ ] **Step 3:** Rebuild dos containers afetados (`docker compose build app` + recreate
  worker/mcp se schema mudou , ver CLAUDE.md). Em dev local, `npm run dev:fresh`.
- [ ] **Step 4:** Verificação manual: turno de entrevista NÃO cria SavedReport; done traz journeyState.
- [ ] **Step 5:** Commit `feat(f6): migration journeyState + stream persiste rascunho/fase (sem SavedReport ate Gerar)`.

---

## Task 6: UI , reflexo de entendimento + casca centralizada (inline, ui-ux-pro-max)

**Files:**
- Create: `src/components/reports/builder/journey/understanding-summary.tsx`
- Modify: `src/components/reports/builder/builder-workspace.tsx` (fase entrevista = chat
  centralizado; fase refino = 2-pane atual)
- Test: `understanding-summary.test.tsx`

- [ ] **Step 1:** Teste jsdom: `UnderstandingSummary({ texto })` renderiza o texto natural;
  sem texto, não renderiza caixas/rótulos técnicos (assert que NÃO há "Objetivo"/"recorte").
- [ ] **Step 2:** jest FAIL.
- [ ] **Step 3:** Implementar `UnderstandingSummary` (bloco discreto, tom do Consumo). No
  workspace, ler `fase` do journeyState (vinda do done): `entrevista` -> layout centralizado
  (chat no centro, max-w, com o UnderstandingSummary acima/ao lado); `refino` -> 2-pane atual.
- [ ] **Step 4:** jest PASS + tsc + dev compila.
- [ ] **Step 5:** Commit `feat(f6): reflexo de entendimento + casca centralizada da entrevista`.

---

## Task 7: UI , cards de opção (choices) (inline)

**Files:**
- Create: `src/components/reports/builder/journey/option-cards.tsx`
- Create: `src/components/reports/builder/journey/option-thumbs.tsx` (thumbnails ilustrativos)
- Modify: `builder-chat-panel.tsx` (consumir evento SSE `choices`, renderizar cards, devolver seleção)
- Test: `option-cards.test.tsx`

- [ ] **Step 1:** Teste: `OptionCards({ titulo, opcoes, onSelecionar })` renderiza um card por
  opção (ícone do tipoVisual + rótulo + descrição) e dispara `onSelecionar(id)` no clique.
- [ ] **Step 2:** jest FAIL.
- [ ] **Step 3:** Implementar cards + thumbnails (ícones dos templates). No painel: tratar
  `event.type === "choices"` guardando as opções; renderizá-las após a mensagem; ao clicar,
  enviar a seleção como novo turno (texto curto, ex.: "Prefiro: <rotulo>").
- [ ] **Step 4:** jest PASS + tsc + dev.
- [ ] **Step 5:** Commit `feat(f6): cards de opcao (choices) na jornada`.

---

## Task 8: UI , tela de resumo contestável + Gerar + animação (inline)

**Files:**
- Create: `src/components/reports/builder/journey/journey-summary.tsx`
- Modify: `builder-workspace.tsx` (fase `resumo` mostra o resumo; botão Gerar; animação;
  transição para `refino`)
- Test: `journey-summary.test.tsx`

- [ ] **Step 1:** Teste: `JourneySummary({ resumo, onAjustar, onGerar })` lista os itens do
  resumo; cada item tem "ajustar" que chama `onAjustar(dimensao)`; botão "Gerar relatorio"
  chama `onGerar`. O botão Gerar só existe quando há resumo (fase resumo).
- [ ] **Step 2:** jest FAIL.
- [ ] **Step 3:** Implementar `JourneySummary` (cartão com itens, tom do Consumo). No
  workspace: fase `resumo` -> render do resumo; "ajustar" envia turno que volta à entrevista;
  "Gerar" -> chama a action de geração (promove SavedReport via stream com sinal de gerar),
  toca animação (framer-motion), e ao concluir troca para `refino` (2-pane atual com a ficha).
- [ ] **Step 4:** jest PASS + tsc + dev.
- [ ] **Step 5:** Commit `feat(f6): tela de resumo contestavel + Gerar + animacao + transicao 2-pane`.

---

## Task 9: Métricas de sucesso (instrumentação leve)

**Files:**
- Modify: `src/app/api/builder/stream/route.ts` (emitir eventos de métrica) ou
  `src/lib/reports/builder/journey/metrics.ts` (novo helper)
- Test: `metrics.test.ts`

- [ ] **Step 1:** Teste do helper puro `registrarMetricaJornada(evento)` (turnos até
  elegibilidade, "gera logo" recusado, chegada ao refino). Apenas estrutura + persistência
  leve (reusar tabela de auditoria/usage existente ou um log).
- [ ] **Step 2:** jest FAIL.
- [ ] **Step 3:** Implementar o registro mínimo (sinal primário: chegou ao refino; turnos;
  recusas). Sem dashboard nesta onda (só captura).
- [ ] **Step 4:** jest PASS + tsc.
- [ ] **Step 5:** Commit `feat(f6): metricas de jornada (captura leve)`.

---

## Task 10: Verificação E2E real

**Files:**
- Create: `scripts/e2e-f6-jornada.ts`

- [ ] **Step 1:** Script que roda a jornada contra o LLM real + cache de estoque real:
  (a) abertura declara escopo; (b) pedido claro -> reflexão + oferta de gerar (atalho);
  (c) pedido raso -> NÃO oferece gerar (gate por evidência); (d) "quero vendas" -> "ainda
  nao e possivel" conversacional, jornada continua; (e) resumo coerente; (f) "Gerar" promove
  SavedReport e a ficha renderiza com os componentes reais; (g) reabrir relatório legado cai
  no refino.
- [ ] **Step 2:** Rodar `npx tsx --env-file=.env.local scripts/e2e-f6-jornada.ts`. Conferir
  cada asserção contra dado real. Corrigir o que falhar (prompt/gate/UI) inline.
- [ ] **Step 3:** Atualizar STATUS.md + HISTORY.md com evidências.
- [ ] **Step 4:** Commit `test(f6): E2E real da jornada (gate, honestidade, resumo, geracao)`.

---

## Self-Review (cobertura da spec)

- Spec §6 (gate evidência) -> Task 2. §7 (reflexo natural) -> Task 6. §8 (tools) -> Task 3.
- §4/§12 (histórico, fichaRascunho, sem SavedReport até Gerar, default legado) -> Tasks 4,5.
- §9/§10 (capability map curado + prompt few-shots) -> Tasks 1,4. §11 (thumbnails) -> Task 7.
- §5 (fases + resumo contestável) -> Tasks 6,8. §13 (honestidade conversacional) -> Task 4.
- §14 (custo) -> Task 4 (ficha compacta/caching nota). §15 (métricas) -> Task 9. §16 (testes) -> todas + Task 10.
- Sem placeholders de implementação nas tasks de lógica pura (código nos steps). UI tasks
  têm contrato + teste; implementação inline com ui-ux-pro-max.

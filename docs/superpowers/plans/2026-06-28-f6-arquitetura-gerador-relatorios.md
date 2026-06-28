# F6 , Reforma estrutural do gerador de relatórios , Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execução
> inline na sessão principal, Opus, conforme CLAUDE.md do projeto). Steps usam
> checkbox (`- [ ]`). UI nunca delegada: `ui-ux-pro-max` inline em toda task de UI.

**Goal:** Trocar o cérebro do construtor (que gera Frankenstein) por um gerador
coerente-por-construção: catálogo de métricas derivado do registry, gramática de
blocos com invariantes duras, compositor + crítico semântico (LLM) e revisor
determinístico que resolve valores, renderizado com filtros ao vivo no nível possível
para o dado.

**Architecture:** Pipeline `intenção → compositor(LLM) → amostra leve → crítico
semântico(LLM) → revisor determinístico(código) → build → render interativo`. Coerência
garantida por invariantes em código (revisor), não pelo gosto do LLM. Estoque é quase
todo snapshot: filtros de recorte ao vivo; período só no bloco de movimento (mensal).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma v7, Zod, Vitest/Jest
(suíte atual), Recharts (componentes do Consumo), Tailwind v4, dark theme violet.

## Global Constraints

- **F6 SÓ LOCAL.** Nunca mergear para `main`, nunca deploy, nunca migration em prod.
- **Proibido o caractere travessão** (em dash) em UI, código, doc, commit, chat.
- **Modelo sempre Opus** em qualquer subagente/workflow.
- **TDD:** cada task fecha com `tsc` limpo + testes verdes; commit atômico por task.
- **Cada commit deixa a suíte verde.** Rodar `npx tsc --noEmit` e o subset de testes da
  task antes do commit.
- **ui-ux-pro-max obrigatório** e inline (sessão principal) em toda task de UI.
- **Tokens reais do Consumo** (violet #8b5cf6, `components/charts/colors.ts`); reusar os
  componentes reais, não recriar.
- **Verdade contra o dado real:** a fase F exige E2E contra o cache real antes de pronto.
- Spec de referência: `docs/superpowers/specs/2026-06-28-f6-arquitetura-gerador-relatorios-design.md`.

## Mapa de arquivos (decomposição)

Núcleo novo (puro, testável) em `src/lib/reports/builder/agent/geracao/`:
- `metric-catalog.ts` , catálogo de métricas derivado do registry (A1).
- `plano-types.ts` , tipos + Zod schema do `Plano` e dos blocos da gramática (A2).
- `amostra.ts` , resolvedor de amostra leve para o crítico/revisor (A4).
- `revisor.ts` , revisor determinístico por invariante (A3, A5).
- `compositor.ts` , reescreve `blueprint.ts` (prompt + parse → Plano) (B1).
- `critico.ts` , crítico semântico (B2).
- `template-padrao.ts` , template determinístico por domínio para "gerar já" (B3).
- `pipeline.ts` , reescrito para a nova ordem (B4).
- `build-plano.ts` , Plano → `BuilderReportEntry` (adapta `build.ts`) (C1).

Build/render/mutators (existentes, a adaptar):
- `tools/mutators.ts`, `tool-bridge.ts`, `types.ts` (seção composta) (C1).
- `components/reports/builder/report-renderer.tsx` (seção composta, subtítulo) (C2, C3).
- `components/reports/builder/report-data-table.tsx` (drilldown) (D5).

Dados/filtros (existentes, a estender):
- `source-registry.ts`, `resolve-source.ts`, `shape-adapters.ts` (período + freshness) (C4, D2).
- `lib/actions/relatorio-filtros.ts`, `carregar-relatorio-dinamico.ts`, preview action (D1).
- `components/reports/period-pills.tsx` (variante mensal) (D3, D4).

Jornada/preview (existentes, a ajustar):
- `agent/prompt-jornada.ts`, `journey/intencao.ts`, gate (E1).
- `components/reports/builder/builder-workspace.tsx`, `builder-preview.tsx`,
  `builder-chat-panel.tsx` (canvas) (E2).

---

## FASE A , Vocabulário, gramática e revisor (o cérebro puro)

### Task A1: Catálogo de métricas derivado do registry

**Files:**
- Create: `src/lib/reports/builder/agent/geracao/metric-catalog.ts`
- Test: `src/lib/reports/builder/agent/geracao/__tests__/metric-catalog.test.ts`

**Interfaces:**
- Consumes: `listarFontes()`, `obterContrato(fato)` de `source-registry.ts`; o
  `SourceContract` (campos `dominio`, `shapes`, `campos`, `dimensoes`).
- Produces:
  ```ts
  export interface Metrica {
    id: string;                 // ex.: "estoque.valor_total"
    dominio: string;            // do contrato
    fato: string; shape: string;
    rotulo: string; descricao: string; pergunta: string;
    formato: "brl" | "contagem" | "percentual" | "dias";
    dimensoes: string[];        // derivado do contrato
    temSerieTemporal: boolean;  // DERIVADO: o fato oferece shape "serieTemporal"
    chartPreferido: "KPIRow" | "BarChart" | "PieChart" | "LineChart" | "DataTable";
    chartsValidos: string[];
  }
  export function listarMetricas(opts: { dominios: string[]; papel: string }): Metrica[];
  ```
- `temSerieTemporal` NUNCA é declarado à mão: vem de o fato ter shape `serieTemporal`.
  O curado-humano (rotulo/descricao/pergunta/formato/chartPreferido) fica num mapa
  `CURADORIA_METRICAS` por `id`, mas shape/dimensoes/série derivam do contrato.

- [ ] **Step 1: Write the failing test**
```ts
import { listarMetricas } from "../metric-catalog";
test("deriva temSerieTemporal do shape do registry (movimento tem serie, saldo nao)", () => {
  const ms = listarMetricas({ dominios: ["estoque"], papel: "super_admin" });
  const movimento = ms.find((m) => m.fato === "fato_estoque_movimento");
  const saldo = ms.find((m) => m.fato === "fato_estoque_saldo");
  expect(movimento?.temSerieTemporal).toBe(true);
  expect(saldo?.temSerieTemporal).toBe(false);
});
test("filtra por dominio: pede estoque, nao volta metrica de outro dominio", () => {
  const ms = listarMetricas({ dominios: ["estoque"], papel: "super_admin" });
  expect(ms.every((m) => m.dominio === "estoque")).toBe(true);
  expect(ms.length).toBeGreaterThan(0);
});
```
- [ ] **Step 2: Run test, verify it fails** , `npx jest metric-catalog -t "deriva temSerieTemporal"` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** , `listarMetricas` itera `listarFontes()`, filtra por `dominio ∈ opts.dominios`, e para cada fato monta `Metrica` derivando `temSerieTemporal = contrato.shapes.includes("serieTemporal")`, `dimensoes = contrato.dimensoes`, e mesclando `CURADORIA_METRICAS[id]` (rotulo/descricao/pergunta/formato/chartPreferido). `papel` reservado para o filtro RBAC (Task A6).
- [ ] **Step 4: Run tests, verify pass.**
- [ ] **Step 5: Commit** , `git add ... && git commit -m "feat(f6): catalogo de metricas derivado do registry (A1)"`.

### Task A2: Tipos e schema Zod do Plano (gramática)

**Files:**
- Create: `src/lib/reports/builder/agent/geracao/plano-types.ts`
- Test: `.../__tests__/plano-types.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PapelBloco = "panorama" | "analise" | "detalhe";
  export type TipoBloco = "KpiStrip" | "TendenciaDistribuicao" | "Ranking" | "Tabela";
  export interface BlocoKpi   { tipo: "KpiStrip"; metricas: string[] }            // ids
  export interface BlocoTend  { tipo: "TendenciaDistribuicao"; metricaSerie: string; metricaComposicao: string }
  export interface BlocoRank   { tipo: "Ranking"; metrica: string; recorte: string }
  export interface BlocoTabela { tipo: "Tabela"; metrica: string }
  export type Bloco = BlocoKpi | BlocoTend | BlocoRank | BlocoTabela;
  export interface Plano {
    titulo: string; objetivo: string; dominio: string;
    blocos: Bloco[];
    filtrosIniciais: Record<string, unknown>;
  }
  export const planoSchema: z.ZodType<Plano>;
  export function papelDoBloco(b: Bloco): PapelBloco;  // KpiStrip→panorama, Tend/Rank→analise, Tabela→detalhe
  ```
- [ ] **Step 1: Failing test**
```ts
import { planoSchema, papelDoBloco } from "../plano-types";
test("schema aceita plano valido e papelDoBloco classifica", () => {
  const p = { titulo: "X", objetivo: "Y", dominio: "estoque",
    blocos: [{ tipo: "KpiStrip", metricas: ["estoque.valor_total"] }], filtrosIniciais: {} };
  expect(planoSchema.parse(p).blocos.length).toBe(1);
  expect(papelDoBloco(p.blocos[0] as any)).toBe("panorama");
});
test("schema rejeita bloco de tipo desconhecido", () => {
  expect(() => planoSchema.parse({ titulo:"X", objetivo:"Y", dominio:"estoque",
    blocos:[{ tipo:"Galaxia" }], filtrosIniciais:{} })).toThrow();
});
```
- [ ] **Step 2: Run, verify fails.**
- [ ] **Step 3: Implement** , discriminated union por `tipo`, `planoSchema` com `z.discriminatedUnion`, `papelDoBloco` por switch.
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** , `feat(f6): tipos e schema Zod do Plano (gramatica) (A2)`.

### Task A4: Resolvedor de amostra leve

**Files:**
- Create: `src/lib/reports/builder/agent/geracao/amostra.ts`
- Test: `.../__tests__/amostra.test.ts`

**Interfaces:**
- Consumes: `obterProdutor(fato, shape)` de `source-registry.ts`; `Metrica` (A1).
- Produces:
  ```ts
  export interface AmostraMetrica {
    metricaId: string;
    escalar?: number;            // p/ shape kpis (valor principal)
    cardinalidade?: number;      // n categorias (agregacaoCategorica)
    topN?: { rotulo: string; valor: number }[];
    nPontosSerie?: number;       // p/ serieTemporal
  }
  export function resolverAmostra(
    metricas: Metrica[],
    deps: { resolver: (fato: string, shape: string) => Promise<{ linhas: any[]; kpis?: any }> }
  ): Promise<AmostraMetrica[]>;
  ```
  `resolver` é injetado (em prod = wrapper de `resolveSecao`/produtor; em teste = fake).
  Para `agregacaoCategorica`: `cardinalidade = linhas.length`, `topN = top 5`. Para
  `kpis`: `escalar = primeiro valor numerico`. Para `serieTemporal`: `nPontosSerie =
  linhas.length`.
- [ ] **Step 1: Failing test** , fake `resolver` devolve 8 linhas categóricas e um kpi 49M; assert `cardinalidade===8`, `topN.length===5`, `escalar===49000000`.
- [ ] **Step 2: Run, fails.**
- [ ] **Step 3: Implement** sumarização por shape.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): resolvedor de amostra leve (A4)`.

### Task A3: Revisor determinístico , invariantes sem valor

**Files:**
- Create: `src/lib/reports/builder/agent/geracao/revisor.ts`
- Test: `.../__tests__/revisor.test.ts`

**Interfaces:**
- Consumes: `Plano`, `Bloco`, `papelDoBloco` (A2); `Metrica`+`listarMetricas` (A1);
  `AmostraMetrica` (A4).
- Produces:
  ```ts
  export interface AjusteRevisor { regra: string; acao: string }
  export interface ResultadoRevisor { plano: Plano; ajustes: AjusteRevisor[] }
  export function revisarPlano(
    plano: Plano,
    ctx: { metricas: Metrica[]; amostra: AmostraMetrica[] }
  ): ResultadoRevisor;
  ```
  Invariantes implementadas nesta task (não dependem de valor resolvido):
  - **1 KpiStrip** no máximo, movido para o topo.
  - **Título de seção derivado da métrica** (descarta qualquer título livre; o título
    vem de `metrica.rotulo`/`descricao`). (Garantido no build; aqui o revisor marca.)
  - **Teto por papel:** no máximo 1 `Ranking` e 1 `TendenciaDistribuicao` (corta o
    excedente, **ignorando recorte** , mata as 4 barras).
  - **Arco fixo:** ordena panorama → análise → detalhe.
  - **donut≤6 / série≥4:** `TendenciaDistribuicao` cuja `metricaComposicao` tem
    `cardinalidade>6` ⇒ rebaixa a `Ranking`; cuja `metricaSerie` tem `nPontosSerie<4`
    ⇒ remove a parte temporal (degrada).
  - **Teto total** de blocos (5): corta detalhe excedente.
- [ ] **Step 1: Failing tests** (um por invariante), ex.:
```ts
test("teto por papel: 4 Rankings de recortes diferentes viram 1", () => {
  const blocos = ["armazem","marca","familia","negativos"].map((r) =>
    ({ tipo:"Ranking", metrica:"estoque.valor_total", recorte:r }));
  const { plano, ajustes } = revisarPlano(
    { titulo:"x",objetivo:"y",dominio:"estoque",blocos: blocos as any, filtrosIniciais:{} },
    { metricas: [], amostra: [] });
  expect(plano.blocos.filter((b)=>b.tipo==="Ranking").length).toBe(1);
  expect(ajustes.some((a)=>a.regra==="teto_por_papel")).toBe(true);
});
test("donut>6 categorias rebaixa para Ranking", () => {
  const plano = { titulo:"x",objetivo:"y",dominio:"estoque",
    blocos:[{tipo:"TendenciaDistribuicao",metricaSerie:"estoque.movimento",metricaComposicao:"estoque.marca"}] as any,
    filtrosIniciais:{} };
  const amostra = [{ metricaId:"estoque.marca", cardinalidade: 8 },
                   { metricaId:"estoque.movimento", nPontosSerie: 6 }];
  const { plano: out } = revisarPlano(plano, { metricas: [], amostra });
  expect(out.blocos[0].tipo).toBe("Ranking");
});
```
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** as invariantes acima (funções puras pequenas, compostas).
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): revisor deterministico , invariantes estruturais (A3)`.

### Task A5: Revisor , dedup de KPI por VALOR colidente

**Files:**
- Modify: `src/lib/reports/builder/agent/geracao/revisor.ts`
- Test: `.../__tests__/revisor.test.ts` (novo caso)

**Interfaces:**
- Usa `ctx.amostra[].escalar` para comparar valores dos KPIs do `KpiStrip` e remover
  cartões com valor colidente (tolerância relativa 1e-6) ou identidade/rótulo iguais.
- [ ] **Step 1: Failing test**
```ts
test("KPIs com mesmo valor resolvido (49,4M em 3 metricas) viram 1", () => {
  const plano = { titulo:"x",objetivo:"y",dominio:"estoque",
    blocos:[{tipo:"KpiStrip",metricas:["estoque.valor_total","estoque.valor_armazem","estoque.valor_marca"]}] as any,
    filtrosIniciais:{} };
  const amostra = ["estoque.valor_total","estoque.valor_armazem","estoque.valor_marca"]
    .map((id)=>({ metricaId:id, escalar: 49447434.34 }));
  const { plano: out, ajustes } = revisarPlano(plano, { metricas: [], amostra });
  expect((out.blocos[0] as any).metricas.length).toBe(1);
  expect(ajustes.some((a)=>a.regra==="kpi_valor_colidente")).toBe(true);
});
```
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** dedup por valor + identidade no `KpiStrip`.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): revisor , dedup de KPI por valor colidente (A5)`.

### Task A6: Filtro RBAC do catálogo por papel/domínio

**Files:**
- Modify: `src/lib/reports/builder/agent/geracao/metric-catalog.ts`
- Test: `.../__tests__/metric-catalog.test.ts` (novo caso)

**Interfaces:**
- `listarMetricas({ dominios, papel })` consulta o mapa de domínios permitidos por papel
  (reusar `guardDominio`/a fonte de RBAC já usada em `resolve-source.ts`); papel sem
  acesso a um domínio não recebe métricas dele.
- [ ] **Step 1: Failing test** , papel `user` sem acesso a `estoque` ⇒ `[]`; `super_admin` ⇒ métricas.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** filtro por papel (camada 1 do RBAC).
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): catalogo filtrado por RBAC (camada 1) (A6)`.

---

## FASE B , Processo editorial (LLM) + template determinístico

### Task B3: Template determinístico por domínio ("gerar já")

> Feito antes do compositor: é o destino do atalho e um Plano de referência válido
> para testar o build/render sem LLM.

**Files:**
- Create: `src/lib/reports/builder/agent/geracao/template-padrao.ts`
- Test: `.../__tests__/template-padrao.test.ts`

**Interfaces:**
- Produces: `export function templatePadrao(dominio: string, metricas: Metrica[]): Plano;`
  Para `estoque`: KpiStrip (valor_total, produtos, negativos) + 1 Ranking (valor por
  armazém) + 1 Tabela (saldo por produto). 0 LLM. Tem que passar `revisarPlano` sem
  ajuste.
- [ ] **Step 1: Failing test** , `templatePadrao("estoque", ms)` retorna Plano que
  `planoSchema.parse` aceita e que `revisarPlano` devolve com `ajustes.length===0`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** o template fixo.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): template deterministico de estoque para gerar-ja (B3)`.

### Task B1: Compositor (reescreve blueprint.ts)

**Files:**
- Create: `src/lib/reports/builder/agent/geracao/compositor.ts`
- Modify: marca `blueprint.ts` como deprecado (reexporta o compositor onde for usado).
- Test: `.../__tests__/compositor.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function promptCompositor(entrada: EntradaGeracao, metricas: Metrica[]): ChatMessage[];
  export function parseCompositor(raw: string, metricas: Metrica[]): { plano: Plano; omitidos: string[] };
  ```
  `parseCompositor` valida com `planoSchema`, e descarta binds que referenciem métrica
  fora do catálogo (vai p/ `omitidos`, nunca silêncio).
- [ ] **Step 1: Failing test** , `parseCompositor` com JSON canônico válido → Plano; com
  métrica inexistente → entra em `omitidos`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** prompt (gramática + métricas como vocabulário) + parse Zod.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): compositor (prompt+parse para Plano) (B1)`.

### Task B2: Crítico semântico

**Files:**
- Create: `src/lib/reports/builder/agent/geracao/critico.ts`
- Test: `.../__tests__/critico.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function promptCritico(entrada: EntradaGeracao, plano: Plano, amostra: AmostraMetrica[]): ChatMessage[];
  export function parseCritico(raw: string, metricas: Metrica[]): { plano: Plano; justificativa: string };
  ```
  Prompt instrui SÓ juízo semântico (responde à intenção? métrica certa p/ a pergunta?
  narrativa? falta recorte pedido?), proibido reformatar/checar invariante. Saída =
  Plano ajustado + justificativa.
- [ ] **Step 1: Failing test** , `parseCritico` valida o Plano de saída com `planoSchema`;
  rejeita saída malformada.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): critico semantico (B2)`.

### Task B4: Pipeline reescrito

**Files:**
- Modify: `src/lib/reports/builder/agent/geracao/pipeline.ts`
- Modify: `src/lib/reports/builder/agent/geracao/progresso.ts` (faixas para as novas fases)
- Test: `.../__tests__/pipeline.test.ts`

**Interfaces:**
- Ordem: `listarMetricas` → `promptCompositor`+chamada LLM → `parseCompositor` →
  `resolverAmostra` → `promptCritico`+chamada LLM → `parseCritico` → `revisarPlano` →
  `buildFichaDoPlano` (C1) → `validarFichaGerada`. "Gerar já" usa `templatePadrao` no
  lugar das 2 chamadas LLM.
- `pipelineGeracao(entrada, onProgresso, deps)` mantém a assinatura (deps injeta
  `criarCliente`/`logUsage`/`resolver`).
- [ ] **Step 1: Failing test** , com `deps` fake (LLM canned para compositor e crítico,
  resolver fake), `pipelineGeracao` devolve `ficha` cujos KPIs não colidem e cujo nº de
  Rankings ≤1; e modo "gerar já" não chama o LLM (spy em `criarCliente` = 0).
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** a orquestração + faixas de progresso (compositor 5→55,
  amostra 55→62, crítico 62→85, revisor/build/validação 85→100).
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): pipeline reescrito (compositor+amostra+critico+revisor) (B4)`.

---

## FASE C , Build + render (seção composta, subtítulo, freshness)

### Task C1: Plano → BuilderReportEntry (seção composta)

**Files:**
- Create: `src/lib/reports/builder/agent/geracao/build-plano.ts`
- Modify: `src/lib/reports/builder/types.ts` (novo template `TendenciaDistribuicao`)
- Modify: `src/lib/reports/builder/tools/mutators.ts` (mutator da seção composta)
- Modify: `src/lib/reports/builder/agent/tool-bridge.ts` (schema do novo mutator)
- Test: `.../__tests__/build-plano.test.ts`

**Interfaces:**
- Produces: `export function buildFichaDoPlano(plano: Plano, metricas: Metrica[]): { ficha: BuilderReportEntry; omitidos: string[] };`
  Cada bloco vira `BuilderSection`. `TendenciaDistribuicao` vira UMA seção com
  `template:"TendenciaDistribuicao"` e `config:{ metricaSerie, metricaComposicao }`. O
  título de cada seção é **derivado da métrica** (`metrica.rotulo`), nunca livre.
- [ ] **Step 1: Failing test** , `buildFichaDoPlano(templatePadrao(...))` produz ficha com
  N seções, títulos = rótulos das métricas, e a seção de tendência com os 2 binds.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** dispatcher por bloco + novo mutator/template.
- [ ] **Step 4: Pass + `npx tsc --noEmit`.**
- [ ] **Step 5: Commit** , `feat(f6): build Plano->ficha com seccao composta (C1)`.

### Task C2: Renderer , branch da seção composta (área+donut)

**Files:**
- Modify: `src/components/reports/builder/report-renderer.tsx`
- Test: `src/components/reports/builder/__tests__/report-renderer.test.tsx`

**ui-ux-pro-max:** layout par lado a lado (área 2/3 + donut 1/3) no desktop, empilhado
no mobile; tooltip; cores `colors.ts`; sem travessão em rótulos.
- [ ] **Step 1: Failing test** , render de uma seção `TendenciaDistribuicao` com dados
  resolvidos mostra o `InteractiveAreaChart` e o `DonutWithCenter` (queries por testid).
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** o branch `SecaoView` para o template composto.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): render da seccao tendencia+distribuicao (C2)`.

### Task C3: Subtítulo do KPI por métrica

**Files:**
- Modify: `src/components/reports/builder/report-renderer.tsx` (KPIRow → passa `subtitle`)
- Test: ajusta o teste de KPIRow.

- [ ] **Step 1: Failing test** , KPI com `descricao` da métrica renderiza `subtitle`
  (ex.: "≈ US$ ...") e não o `hint` fixo "no período".
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** mapeamento `descricao→subtitle`.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): subtitulo do KPI por metrica (C3)`.

### Task C4: Freshness ("atualizado há Xs")

**Files:**
- Modify: produtores em `source-registry.ts` (popular `freshness` da última sync do fato)
- Modify: `report-renderer.tsx` (exibe "atualizado há Xs")
- Test: `.../__tests__/source-registry.freshness.test.ts`

**Interfaces:**
- Consumes: a fonte de timestamp de sync por fato (investigar `SyncState`/tabela de
  controle do worker; se não houver por-fato, usar o `updatedAt` máximo da tabela raw
  correspondente).
- [ ] **Step 1: Failing test** , produtor de `fato_estoque_saldo` retorna `freshness` não-nulo (Date).
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** leitura do timestamp + exibição.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): freshness por fato exibido no relatorio (C4)`.

---

## FASE D , Filtros ao vivo + temporal + drilldown

### Task D1: Re-resolução ao vivo do PREVIEW (sem savedId)

**Files:**
- Create: `src/lib/actions/previsualizar-com-filtros.ts` (ou estende `builder.ts`)
- Modify: `components/reports/builder/builder-preview.tsx` (usa o novo caminho)
- Test: `.../__tests__/previsualizar-com-filtros.test.ts`

**Interfaces:**
- Produces: `previsualizarComFiltros(entry: BuilderReportEntry, filtros: FiltrosRuntime): Promise<{ dados: Record<string, SecaoResolvida> }>`
  Resolve a partir do `entry` em memória (loop `resolveSecao`), sem `obterRascunho`.
- [ ] **Step 1: Failing test** , dado um `entry` e `filtros` (marca="MATRIX"), retorna
  `dados` por seção; muda filtro → muda dados (com resolver fake).
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** a action + gate admin.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): re-resolucao ao vivo do preview sem savedId (D1)`.

### Task D2: Plumbing de período mensal (só movimento)

**Files:**
- Modify: `source-registry.ts` (`FiltrosFonte` ganha `periodoDe?/periodoAte?`; produtor de
  `fato_estoque_movimento` repassa às queries)
- Modify: `resolve-source.ts` (`FiltrosRuntime` + `filtrosDaSecao` carregam período; corrige
  de passagem o gap `armazemId/familiaId`)
- Modify: `lib/actions/relatorio-filtros.ts` (aceita período)
- Test: `.../__tests__/resolve-source.periodo.test.ts`

**Interfaces:**
- `FiltrosFonte` e `FiltrosRuntime` ganham `periodoDe?: string; periodoAte?: string` (mês "YYYY-MM").
- [ ] **Step 1: Failing test** , resolver `fato_estoque_movimento` com `periodoDe/Ate`
  repassa os args à query (spy); fatos snapshot ignoram período.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** o encadeamento.
- [ ] **Step 4: Pass + `tsc`.**
- [ ] **Step 5: Commit** , `feat(f6): plumbing de periodo mensal no movimento (D2)`.

### Task D3: Filtros-pílula no relatório (recorte sempre; período só temporal)

**Files:**
- Create: `components/reports/builder/report-filters.tsx` (pílulas de recorte + período mensal condicional)
- Modify: `report-renderer.tsx`/`builder-preview.tsx` (monta os filtros do relatório; remove a barra fixa)
- Test: `.../__tests__/report-filters.test.tsx`

**ui-ux-pro-max:** pílulas não-fixas (rolam junto), ativo = `bg-primary`; período mensal
só aparece se o relatório tem bloco temporal; recorte por dimensões presentes.
- [ ] **Step 1: Failing test** , relatório só-snapshot NÃO mostra pílula de período;
  relatório com bloco temporal mostra; clicar recorte chama `onFiltro`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** + remover a barra de filtro fixa antiga.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): filtros-pilula do relatorio (recorte+periodo condicional) (D3)`.

### Task D4: Navegador mensal condicional (≥4 pontos)

**Files:**
- Create: `components/reports/builder/month-navigator.tsx` (seta mês, granularidade mensal)
- Modify: `report-renderer.tsx` (liga no bloco temporal; só com ≥4 pontos)
- Test: `.../__tests__/month-navigator.test.tsx`

- [ ] **Step 1: Failing test** , série com <4 pontos: navegador não aparece (degrada);
  ≥4: setas mudam o mês e disparam `onMes`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): navegador mensal condicional no bloco temporal (D4)`.

### Task D5: Drilldown inline no ReportDataTable

**Files:**
- Modify: `components/reports/builder/report-data-table.tsx` (expansão de linha)
- Modify: produtor de tabela (preservar `detalhe` por linha quando houver)
- Test: `.../__tests__/report-data-table.test.tsx`

> Se o E2E mostrar que o produtor não tem detalhe por linha viável, rebaixar onda 1
> para tabela sem drilldown (decisão registrada no STATUS).
- [ ] **Step 1: Failing test** , linha com `detalhe` expande e mostra sub-conteúdo; sem
  `detalhe`, não há chevron.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** estado `expandedRowId` no componente (padrão do Consumo).
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): drilldown inline na tabela do relatorio (D5)`.

---

## FASE E , Entrevista convergente + canvas limpo

### Task E1: Entrevista convergente + "gerar já" determinístico + reconciliar firmeza

**Files:**
- Modify: `src/lib/reports/builder/agent/prompt-jornada.ts` (mensagens curtas; ≤3
  perguntas; remove "firmeza contra pressa"; libera "gerar já")
- Modify: `journey/intencao.ts` + gate (gate: domínio detectado ⇒ Gerar liberado via
  template determinístico; entrevista vira refino)
- Modify: `api/builder/stream/route.ts` (rota "gerar já" usa `templatePadrao`, 0 LLM)
- Test: `.../__tests__/journey-gate.test.ts`

- [ ] **Step 1: Failing test** , com domínio detectado e 0 perguntas respondidas, o gate
  fica elegível (Gerar liberado); "gerar já" produz ficha via `templatePadrao` sem
  chamar o LLM.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** novo gate + prompt enxuto + rota determinística.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): entrevista convergente + gerar-ja deterministico (E1)`.

### Task E2: Limpeza do canvas/preview

**Files:**
- Modify: `components/reports/builder/builder-preview.tsx` (remove pan + animações de mão;
  mantém zoom + rolagem vertical)
- Modify: `components/reports/builder/builder-workspace.tsx` (botão ampliar = esconde a
  conversa; X volta)
- Test: `.../__tests__/builder-preview.test.tsx`

**ui-ux-pro-max:** zoom com botão/atalho; rolagem vertical natural; "ampliar" expande o
preview sobre a coluna da conversa (estado, não modal); `prefers-reduced-motion`.
- [ ] **Step 1: Failing test** , não há handlers de pan; clicar "ampliar" seta o estado
  que esconde a conversa; X reseta.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** remoção do pan/animações + toggle ampliar/esconde.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** , `feat(f6): canvas limpo (zoom+rolagem+ampliar-esconde-conversa) (E2)`.

---

## FASE F , Verificação contra o dado real

### Task F1: E2E real + latência + régua visual

**Files:**
- Create: `scripts/f6-e2e-geracao.ts` (semeia intenções, gera, valida invariantes no
  resultado, mede latência)
- Doc: atualiza `STATUS.md` + `docs/agents/HISTORY.md`

- [ ] **Step 1:** Rebuildar containers afetados (mcp/app/worker conforme o mapa do
  CLAUDE.md §2.1) e `npm run dev:fresh`.
- [ ] **Step 2:** Rodar o script E2E com várias intenções reais de estoque (panorama,
  negativos, por marca, movimento) e o "gerar já"; conferir no resultado: KPIs sem valor
  colidente, ≤1 ranking, títulos batendo com a métrica, filtros de recorte mudando os
  dados, paginação/drilldown, e nada de Frankenstein.
- [ ] **Step 3:** Passe visual lado a lado com o Consumo (na UI `/relatorios-2/construtor`):
  KPIs, ranking, tabela, e par temporal quando há série; medir latência (~≤25s).
- [ ] **Step 4:** Registrar evidências e ajustar reasoning se latência passar.
- [ ] **Step 5: Commit** , `test(f6): E2E real do gerador + evidencias (F1)`.

---

## Self-review (cobertura da spec)

- §3.1 catálogo derivado/filtrado → A1, A6. §3.2 gramática+invariantes → A2, A3, A5.
  §3.3 compositor+amostra+crítico → B1, B2, A4, B4. §3.4 revisor+refino → A3, A5 (refino
  no E1/stream). §3.5 render interativo → C2, C3, C4, D1, D3, D4, D5. §3.6 entrevista+gerar
  já → B3, E1. §3.7 canvas → E2. §6 pronto → F1. §4 net-new → C1 (composta), D2 (temporal),
  D1 (preview), D5 (drilldown). §11 todas as correções têm task.
- Pendência de design a confirmar no E2E: drilldown viável (D5) e ≥4 pontos no movimento
  (D4) , ambos com degrade especificado.
- Sem placeholders: cada task tem arquivos, interfaces e testes concretos. Tipos
  consistentes entre tasks (`Plano`, `Metrica`, `AmostraMetrica`, `FiltrosRuntime`).

> **Status:** plano v1. Próximo: 2 reviews adversariais do plano (granularidade,
> integração, testabilidade, ordem de dependência) → plano v3 → execução TDD inline.

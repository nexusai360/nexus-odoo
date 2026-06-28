# F6 , Reforma estrutural do gerador de relatórios , Plano de implementação (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execução
> inline na sessão principal, Opus). Steps usam checkbox (`- [ ]`). UI nunca delegada:
> `ui-ux-pro-max` inline em toda task de UI.
>
> **v3** = plano v1 + 2 reviews adversariais do plano aplicadas (achados de contrato e
> ordem). O §13 rastreia as correções.

**Goal:** Trocar o cérebro do construtor (que gera Frankenstein) por um gerador
coerente-por-construção: catálogo de métricas derivado do registry, gramática de
blocos com invariantes duras, compositor + crítico semântico (LLM) e revisor
determinístico que resolve valores, renderizado com filtros ao vivo no nível possível
para o dado.

**Architecture:** `intenção curada → compositor(LLM) → amostra leve → crítico
semântico(LLM) → revisor determinístico(código) → build → render interativo`. Coerência
garantida por invariantes em código. Estoque é quase todo snapshot: filtros de recorte
ao vivo; período só no bloco de movimento (mensal). A "seção composta" (tendência +
distribuição) **não é um novo template**: o build expande em **duas seções irmãs**
(LineChart + PieChart) com um `grupoId` compartilhado, e o renderer só as posiciona
lado a lado (não toca a união `ReportTemplate` do F3 nem cria dupla-resolução).

**Tech Stack:** Next.js 16, TypeScript, Prisma v7, Zod, Jest, Recharts, Tailwind v4.

## Global Constraints

- **F6 SÓ LOCAL.** Nunca mergear para `main`, nunca deploy, nunca migration em prod.
- **Proibido o caractere travessão** (em dash) em UI, código, doc, commit, chat.
- **Modelo sempre Opus** em qualquer subagente/workflow.
- **TDD + commit atômico por task.** Antes do commit: `npx tsc --noEmit` no monorepo
  (não só no subset) + os testes da task verdes. A suíte atual (3451 testes) tem que
  continuar verde.
- **ui-ux-pro-max obrigatório** e inline em toda task de UI; tokens reais do Consumo
  (`components/charts/colors.ts`, violet #8b5cf6); reusar componentes, não recriar.
- **Sem migration:** `SavedReport.entry` é JSON; seção, `grupoId`, período e subtítulos
  cabem sem schema novo. (Confirmado no plano, não criar migration.)
- **Verdade contra o dado real:** a Fase F exige E2E contra o cache real antes de pronto.
- Spec: `docs/superpowers/specs/2026-06-28-f6-arquitetura-gerador-relatorios-design.md`.

## Grafo de dependências (ordem de execução obrigatória)

```
A1 intenção curada ─┐
A2 catálogo ────────┼─▶ A3 plano-types ─▶ A4 amostra ─▶ A5 revisor(estrut.) ─▶ A6 revisor(KPI valor) ─▶ A7 catálogo RBAC
                    │
B1 build-plano (depende de A2,A3) ─▶ B2 template (A2,A3,B1,A5/6) ─▶ B3 compositor (A1,A2,A3) ─▶ B4 crítico (A3,A4) ─▶
   B5 pipeline (TUDO acima + build) ─▶ B6 limpeza (após B5)
C* render (depende de B1 p/ a forma das seções) · D* filtros (depende de C, B1, resolve-source) · E* jornada/canvas · F E2E
```
**Regra de ordem:** `B5 pipeline` só depois de `B1 build-plano` existir (a review pegou
a inversão). Render (C) depende do formato de seções que `B1` produz.

## Mapa de arquivos

Núcleo novo em `src/lib/reports/builder/agent/geracao/`: `intencao-curada.ts` (A1),
`metric-catalog.ts` (A2/A7), `plano-types.ts` (A3), `amostra.ts` (A4), `revisor.ts`
(A5/A6), `build-plano.ts` (B1), `template-padrao.ts` (B2), `compositor.ts` (B3),
`critico.ts` (B4); `pipeline.ts`/`progresso.ts`/`types.ts` reescritos (B5); remoção de
`blueprint.ts`/`build.ts`/`curar-blueprint.ts`/`ordenar-narrativa.ts` (B6).

Tocados (existentes): `source-registry.ts`, `resolve-source.ts`, `types.ts`,
`tools/mutators.ts`, `tool-bridge.ts`, `journey/{intencao,state}.ts`,
`agent/prompt-jornada.ts`, `api/builder/stream/route.ts`,
`components/reports/builder/{report-renderer,report-view-interactive,report-data-table,builder-preview,builder-workspace,builder-chat-panel}.tsx`,
`lib/actions/{builder,relatorio-filtros}.ts`, `components/reports/period-pills.tsx`.

---

## FASE A , Vocabulário, gramática e revisor (puro, testável)

### Task A1: Tipo de intenção curada

**Files:** Create `agent/geracao/intencao-curada.ts`; Test `__tests__/intencao-curada.test.ts`.

**Interfaces:**
```ts
export interface IntencaoCurada {
  dominio: string;                 // onda 1: sempre "estoque" (detector = onda futura)
  objetivo: string;
  recortes: string[];              // dimensoes pedidas: armazem|marca|familia|faixaDias
  janela?: { de?: string; ate?: string };  // mes "YYYY-MM", so faz sentido em temporal
}
export function intencaoCuradaDeColeta(c: IntencaoColeta): IntencaoCurada; // adapta o modelo velho
```
- Substitui a "pilha de seções" (`IntencaoColeta.secoes`) por intenção curada. `EntradaGeracao.intencao` passa a aceitar `IntencaoCurada` (campo novo, mantendo o antigo até B6).
- **Onda 1:** `dominio` é `"estoque"` fixo (declarado; detector futuro).

- [ ] **Step 1:** teste: `intencaoCuradaDeColeta` mapeia recortes/objetivo a partir de uma `IntencaoColeta` fixa; `dominio==="estoque"`.
- [ ] **Step 2:** rodar, falha.
- [ ] **Step 3:** implementar o tipo + adaptador.
- [ ] **Step 4:** `npx jest intencao-curada` verde + `tsc`.
- [ ] **Step 5:** commit `feat(f6): tipo de intencao curada (A1)`.

### Task A2: Catálogo de métricas derivado (expansão 1 fato → N métricas)

**Files:** Create `agent/geracao/metric-catalog.ts`; Test `__tests__/metric-catalog.test.ts`.

**Interfaces:**
```ts
export interface Metrica {
  id: string;                    // "estoque.valor_total"
  dominio: string; fato: string; shape: string;
  campoKpi?: string;             // p/ shape "kpis": chave do objeto kpis (ex.: "valorTotal")
  rotulo: string; descricao: string; pergunta: string;
  formato: "brl" | "contagem" | "percentual" | "dias";
  dimensoes: string[];           // DERIVADO das chaves de campos.agregacaoCategorica/tabela do contrato
  temSerieTemporal: boolean;     // DERIVADO: contrato.shapes inclui "serieTemporal"
  chartPreferido: "KPIRow" | "BarChart" | "PieChart" | "LineChart" | "DataTable";
  chartsValidos: string[];
}
export function listarMetricas(opts: { dominiosPermitidos: string[] }): Metrica[];
```
- **Expansão 1:N (correção crítica da review):** para `shape:"kpis"`, o catálogo gera
  UMA `Metrica` por **chave de KPI** do contrato (ex.: `fato_estoque_saldo` →
  `valor_total` (campoKpi `valorTotal`), `produtos` (`totalProdutos`), `negativos`
  (`produtosNegativos`)). Para `agregacaoCategorica`/`serieTemporal`/`tabela`, uma
  métrica por (fato,shape).
- `dimensoes` deriva das chaves de `contrato.campos.agregacaoCategorica`/`.tabela` (NÃO
  existe `contrato.dimensoes`). `temSerieTemporal = contrato.shapes.includes("serieTemporal")`.
- O curado-humano fica em `CURADORIA_METRICAS: Record<string /*id*/, {rotulo,descricao,pergunta,formato,chartPreferido}>`, chaveado por id por-medida.

- [ ] **Step 1:** testes:
```ts
test("expande fato_estoque_saldo em 3 metricas escalares distintas com campoKpi", () => {
  const ms = listarMetricas({ dominiosPermitidos: ["estoque"] });
  const saldo = ms.filter((m) => m.fato === "fato_estoque_saldo" && m.shape === "kpis");
  expect(saldo.map((m) => m.campoKpi).sort()).toEqual(["produtosNegativos","totalProdutos","valorTotal"]);
});
test("temSerieTemporal so para movimento", () => {
  const ms = listarMetricas({ dominiosPermitidos: ["estoque"] });
  expect(ms.find((m)=>m.fato==="fato_estoque_movimento")?.temSerieTemporal).toBe(true);
  expect(ms.find((m)=>m.fato==="fato_estoque_saldo")?.temSerieTemporal).toBe(false);
});
test("dimensoes nao vem vazio para um fato com recorte categorico", () => {
  const ms = listarMetricas({ dominiosPermitidos: ["estoque"] });
  expect(ms.find((m)=>m.shape==="agregacaoCategorica")?.dimensoes.length).toBeGreaterThan(0);
});
```
- [ ] **Step 2:** rodar, falha.
- [ ] **Step 3:** implementar a expansão + derivações + curadoria.
- [ ] **Step 4:** verde + `tsc`.
- [ ] **Step 5:** commit `feat(f6): catalogo de metricas derivado, expansao 1:N por kpi (A2)`.

### Task A3: Tipos e schema Zod do Plano

**Files:** Create `agent/geracao/plano-types.ts`; Test `__tests__/plano-types.test.ts`.

**Interfaces:**
```ts
export type PapelBloco = "panorama" | "analise" | "detalhe";
export interface BlocoKpi   { tipo: "KpiStrip"; metricas: string[] }
export interface BlocoTend  { tipo: "TendenciaDistribuicao"; metricaSerie: string; metricaComposicao: string }
export interface BlocoRank  { tipo: "Ranking"; metrica: string; recorte: string }
export interface BlocoTabela{ tipo: "Tabela"; metrica: string }
export type Bloco = BlocoKpi | BlocoTend | BlocoRank | BlocoTabela;
export interface Plano { titulo: string; objetivo: string; dominio: string; blocos: Bloco[]; filtrosIniciais: Record<string, unknown> }
export const planoSchema: z.ZodType<Plano>;
export function papelDoBloco(b: Bloco): PapelBloco;  // KpiStrip→panorama; Tend/Rank→analise; Tabela→detalhe
```
`TendenciaDistribuicao` é um bloco do **Plano** (gramática), não um template de render;
o build (B1) o expande em 2 seções.

- [ ] **Step 1:** teste: schema aceita plano válido; `papelDoBloco` classifica; rejeita `tipo` desconhecido. (igual ao snippet do plano v1, mantido)
- [ ] **Step 2-4:** falha → `z.discriminatedUnion("tipo", ...)` + `papelDoBloco` → verde.
- [ ] **Step 5:** commit `feat(f6): tipos e schema do Plano (A3)`.

### Task A4: Resolvedor de amostra leve

**Files:** Create `agent/geracao/amostra.ts`; Test `__tests__/amostra.test.ts`.

**Interfaces:**
```ts
export interface AmostraMetrica { metricaId: string; escalar?: number; cardinalidade?: number; topN?: {rotulo:string;valor:number}[]; nPontosSerie?: number }
export function resolverAmostra(
  metricas: Metrica[],
  deps: { resolver: (fato: string, shape: string) => Promise<{ linhas: any[]; kpis?: Record<string, number> }> }
): Promise<AmostraMetrica[]>;
```
- **Correção:** para `shape:"kpis"`, `escalar = raw.kpis[metrica.campoKpi]` (NÃO "primeiro
  valor numérico"). Para `agregacaoCategorica`: `cardinalidade=linhas.length`,
  `topN=top 5`. Para `serieTemporal`: `nPontosSerie=linhas.length`.

- [ ] **Step 1:** teste: 3 métricas do mesmo fato com `campoKpi` distintos e `kpis={valorTotal:49,totalProdutos:1894,produtosNegativos:172}` → 3 `escalar` DISTINTOS (49,1894,172); categórica de 8 linhas → `cardinalidade:8,topN.length:5`.
- [ ] **Step 2-4:** falha → implementar extração por `campoKpi`/shape → verde.
- [ ] **Step 5:** commit `feat(f6): amostra leve com escalar por campoKpi (A4)`.

### Task A5: Revisor , invariantes estruturais

**Files:** Create `agent/geracao/revisor.ts`; Test `__tests__/revisor.test.ts`.

**Interfaces:**
```ts
export interface AjusteRevisor { regra: string; acao: string }
export interface ResultadoRevisor { plano: Plano; ajustes: AjusteRevisor[] }
export function revisarPlano(plano: Plano, ctx: { metricas: Metrica[]; amostra: AmostraMetrica[] }): ResultadoRevisor;
```
Invariantes (sem valor): 1 KpiStrip no topo; **teto por PAPEL** (no máx 1 Ranking e 1
TendenciaDistribuicao, **ignorando recorte** , mata as 4 barras); arco panorama→análise→
detalhe; `donut>6` (composicao com `cardinalidade>6`) rebaixa Tend→Ranking;
`serie<4` (`nPontosSerie<4`) remove a parte temporal (degrada); teto total 5.

- [ ] **Step 1:** testes por invariante (4 Rankings de recortes distintos → 1 com
  `regra:"teto_por_papel"`; donut>6 rebaixa; série<4 degrada). (snippets do plano v1)
- [ ] **Step 2-4:** falha → implementar funções puras compostas → verde.
- [ ] **Step 5:** commit `feat(f6): revisor , invariantes estruturais (A5)`.

### Task A6: Revisor , dedup de KPI por valor resolvido

**Files:** Modify `revisor.ts`; Test `__tests__/revisor.test.ts` (novo caso).
- Usa `ctx.amostra[].escalar` (já correto por `campoKpi`) para remover KPIs com valor
  colidente (tolerância relativa 1e-6) ou id/rótulo iguais.

- [ ] **Step 1:** teste: 3 métricas com `escalar:49447434.34` → 1 KPI, `regra:"kpi_valor_colidente"`; **e** 3 métricas com valores distintos (49,1894,172) → mantém os 3 (não colapsa o panorama legítimo).
- [ ] **Step 2-4:** falha → implementar dedup por valor+identidade → verde.
- [ ] **Step 5:** commit `feat(f6): revisor , dedup de KPI por valor colidente (A6)`.

### Task A7: Filtro RBAC do catálogo (domínios já resolvidos pelo chamador)

**Files:** Modify `metric-catalog.ts`; Test (novo caso).
- **Correção:** `listarMetricas` permanece **puro/síncrono** e recebe
  `dominiosPermitidos` já resolvidos. Quem chama (pipeline/route) faz
  `await getMyDomains()` (`lib/reports/domain-access.ts`) e passa. Não existe mapa
  `papel→domínios`; a fonte real é `getMyDomains()` por usuário.

- [ ] **Step 1:** teste: `dominiosPermitidos:[]` → `[]`; `["estoque"]` → métricas de estoque.
- [ ] **Step 2-4:** falha → filtrar por `opts.dominiosPermitidos.includes(m.dominio)` → verde.
- [ ] **Step 5:** commit `feat(f6): catalogo filtrado por dominios permitidos (RBAC camada 1) (A7)`.

---

## FASE B , Build + template + editorial (ordem corrigida)

### Task B1: build-plano (Plano → BuilderReportEntry, com expansão da seção composta)

**Files:** Create `agent/geracao/build-plano.ts`; Modify `tools/mutators.ts` (config
`grupoId` e `subtitulos`), `tool-bridge.ts`; Test `__tests__/build-plano.test.ts`.

**Interfaces:**
```ts
export function buildFichaDoPlano(plano: Plano, metricas: Metrica[]): { ficha: BuilderReportEntry; omitidos: string[] };
```
- Cada bloco vira `BuilderSection`(s) via os mutators existentes (`adicionar_secao`):
  - `KpiStrip` → 1 seção `KPIRow` (fato/shape kpis); `config.subtitulos[campoKpi]=metrica.descricao`.
  - `Ranking` → 1 seção `BarChart` (agregacaoCategorica) com `config.recorte`.
  - `Tabela` → 1 seção `DataTable`.
  - **`TendenciaDistribuicao` → DUAS seções irmãs** com `config.grupoId` igual: uma
    `LineChart` (serieTemporal, `metricaSerie`) + uma `PieChart` (agregacaoCategorica,
    `metricaComposicao`). **Não cria novo `ReportTemplate`** (usa os 5 existentes), logo
    não toca `reports/types.ts`, `compat.ts`, `component-catalog.ts`, `viabilidade.ts`,
    `report-entry-schema.ts`, nem switches exaustivos do F3.
  - **Título de cada seção SEMPRE derivado da métrica** (`metrica.rotulo`), nunca livre.
  - `plano.filtrosIniciais` → `ficha.parametros` (não perder ao salvar).

- [ ] **Step 1:** teste: `buildFichaDoPlano(templatePadraoFake)` produz N seções com
  títulos = rótulos; um bloco `TendenciaDistribuicao` vira 2 seções com o mesmo
  `grupoId` (LineChart+PieChart); KPIRow carrega `config.subtitulos`. Assert que o
  dispatcher **aceita** (não manda p/ `omitidos`).
- [ ] **Step 2-4:** falha → implementar a expansão por bloco → verde + `tsc`.
- [ ] **Step 5:** commit `feat(f6): build Plano->ficha (seccao composta vira 2 irmas com grupoId) (B1)`.

### Task B2: template-padrão determinístico (estoque)

**Files:** Create `agent/geracao/template-padrao.ts`; Test `__tests__/template-padrao.test.ts`.
- `templatePadrao("estoque", metricas): Plano` → KpiStrip(valor_total,produtos,negativos)
  + Ranking(valor por armazém) + Tabela(saldo por produto). Tem que passar `revisarPlano`
  com `ajustes.length===0` e `buildFichaDoPlano` sem `omitidos`.

- [ ] **Step 1:** teste: `planoSchema.parse(templatePadrao(...))` ok; `revisarPlano` sem
  ajuste; `buildFichaDoPlano` sem omitidos.
- [ ] **Step 2-4:** falha → montar o template fixo → verde.
- [ ] **Step 5:** commit `feat(f6): template deterministico de estoque (B2)`.

### Task B3: Compositor (consome intenção curada)

**Files:** Create `agent/geracao/compositor.ts`; Test `__tests__/compositor.test.ts`.
```ts
export function promptCompositor(intencao: IntencaoCurada, metricas: Metrica[]): ChatMessage[];
export function parseCompositor(raw: string, metricas: Metrica[]): { plano: Plano; omitidos: string[] };
```
- Consome `IntencaoCurada` (A1), não a pilha de seções. `parseCompositor` valida com
  `planoSchema` e descarta binds com métrica fora do catálogo (→ `omitidos`).

- [ ] **Step 1:** teste: JSON canônico válido → Plano; métrica inexistente → `omitidos`.
- [ ] **Step 2-4:** falha → prompt (gramática+métricas) + parse Zod → verde.
- [ ] **Step 5:** commit `feat(f6): compositor sobre intencao curada (B3)`.

### Task B4: Crítico semântico

**Files:** Create `agent/geracao/critico.ts`; Test `__tests__/critico.test.ts`.
```ts
export function promptCritico(intencao: IntencaoCurada, plano: Plano, amostra: AmostraMetrica[]): ChatMessage[];
export function parseCritico(raw: string, metricas: Metrica[]): { plano: Plano; justificativa: string };
```
- Prompt: SÓ juízo semântico (responde à intenção? métrica certa p/ a pergunta?
  narrativa? falta recorte?), proibido reformatar/checar invariante.

- [ ] **Step 1:** teste: `parseCritico` valida saída com `planoSchema`; rejeita malformado.
- [ ] **Step 2-4:** falha → implementar → verde.
- [ ] **Step 5:** commit `feat(f6): critico semantico (B4)`.

### Task B5: Pipeline reescrito (+ tipos, progresso, consumidores, quota, regenerar)

**Files:** Modify `agent/geracao/pipeline.ts`, `progresso.ts`, `types.ts`
(`GeracaoDeps.resolver`, `FaseGeracao` novas fases, `SaidaGeracao.plano`),
`journey/state.ts` (`ultimoBlueprint`→`ultimoPlano: Plano`), `api/builder/stream/route.ts`
(linha ~209 `saida.blueprint`→`saida.plano`), `agent/builder-progress-labels.ts` (labels);
Test `__tests__/pipeline.test.ts`.

**Interfaces / ordem:**
`listarMetricas(dominiosPermitidos)` → `promptCompositor`+LLM → `parseCompositor` →
`resolverAmostra` → `promptCritico`+LLM → `parseCritico` → `revisarPlano` →
`buildFichaDoPlano` → `validarFichaGerada`. **Gerar já:** `templatePadrao` no lugar das
2 chamadas LLM (0 token). **Regenerar:** se há `ultimoPlano`, pula o compositor e vai
direto crítico/revisor com o `ajuste`.
- `SaidaGeracao` passa a expor `plano` (renomeado de `blueprint`); **atualizar os
  consumidores vivos** (`state.ts:ultimoBlueprint`→`ultimoPlano`, `stream/route.ts`).
- Faixas (`progresso.ts`): compositor 5→55, amostra 55→62, crítico 62→85, revisor/build/
  validação 85→100.
- **Quota/billing:** `verificarQuota` segue gateando o caminho com LLM; `logUsage`
  emitido nas 2 chamadas (compositor+crítico) e 0 no gerar-já.

- [ ] **Step 1:** teste com `deps` fake (LLM canned p/ compositor e crítico; `resolver`
  fake): `pipelineGeracao` devolve `ficha` com KPIs não colidentes e ≤1 Ranking;
  `logUsage` chamado **2x** no caminho feliz e **0x** no gerar-já (spy); `criarCliente`
  0x no gerar-já.
- [ ] **Step 2:** rodar, falha.
- [ ] **Step 3:** implementar orquestração + renomear `SaidaGeracao.plano` + atualizar
  `state.ts` e `route.ts` + faixas + regenerar.
- [ ] **Step 4:** `npx jest pipeline` verde + **`npx tsc --noEmit` no monorepo** (pega o
  route/state).
- [ ] **Step 5:** commit `feat(f6): pipeline reescrito (compositor+amostra+critico+revisor) + consumidores (B5)`.

### Task B6: Remoção segura do cérebro antigo

**Files:** Delete `blueprint.ts`, `build.ts`, `curar-blueprint.ts`,
`ordenar-narrativa.ts` (se órfão) e seus testes; ajustar imports remanescentes.
- Só depois de B5 (quando nada mais importa os antigos). Não "reexportar" (assinaturas
  divergem).

- [ ] **Step 1:** `grep -rn "blueprint\\|curar-blueprint\\|geracao/build" src` p/ achar imports vivos.
- [ ] **Step 2:** remover arquivos + testes órfãos; corrigir imports.
- [ ] **Step 3:** `npx tsc --noEmit` + suíte builder/geração verde.
- [ ] **Step 4:** commit `chore(f6): remove cerebro antigo (blueprint/build/curar) (B6)`.

---

## FASE C , Render (grupo lado-a-lado, subtítulo, título derivado, freshness)

### Task C1: Renderer , agrupar seções irmãs (área+donut) lado a lado + estados

**Files:** Modify `report-renderer.tsx` e **`report-view-interactive.tsx`** (caminho do
relatório salvo/interativo, mapeado na review); Test `report-renderer.test.tsx`.
**ui-ux-pro-max:** quando 2 seções têm o mesmo `config.grupoId`, layout par (área 2/3 +
donut 1/3) no desktop, empilhado no mobile; tooltip; cores `colors.ts`. Tratar **estado
por metade** (uma `vazio`/`erro` não quebra a outra; degrade sem buraco visual).

- [ ] **Step 1:** testes: 2 seções com mesmo `grupoId` renderizam lado a lado (testid);
  metade `vazio` mostra placeholder e a outra metade continua; sem `grupoId` cada seção
  renderiza solo como hoje.
- [ ] **Step 2-4:** falha → passo de agrupamento por `grupoId` no map de seções + estados → verde.
- [ ] **Step 5:** commit `feat(f6): render agrupado area+donut por grupoId + estados (C1)`.

### Task C2: Subtítulo do KPI por métrica (plumbing da descrição)

**Files:** Modify `report-renderer.tsx` (KPIRow lê `config.subtitulos[campoKpi]`); Test.
- A descrição viaja via `config.subtitulos` gravado no build (B1); o renderer passa
  `subtitle` ao `KpiCard` em vez do `hint` fixo "no período".

- [ ] **Step 1:** teste: KPI com `config.subtitulos` renderiza `subtitle` != "no período".
- [ ] **Step 2-4:** falha → ligar `subtitulos`→`subtitle` → verde.
- [ ] **Step 5:** commit `feat(f6): subtitulo do KPI por metrica (C2)`.

### Task C3: Título sempre derivado da métrica (fecha o backdoor do refino)

**Files:** Modify `tools/mutators.ts` (`definirTituloSecao` neutralizado/derivado;
`editarSecao` recomputa título ao trocar métrica), `report-renderer.tsx` (título da
seção vem da métrica vinculada, não de `config.titulo`; remover `onRenomear` livre);
Test `mutators.test.ts` + `report-renderer.test.tsx`.

- [ ] **Step 1:** teste: após `editarSecao` trocando a métrica, o título muda para o
  rótulo da nova métrica; refino não consegue gravar título divergente da métrica.
- [ ] **Step 2-4:** falha → derivar título sempre da métrica → verde.
- [ ] **Step 5:** commit `feat(f6): titulo de secao sempre derivado da metrica (C3)`.

### Task C4: Freshness ("atualizado há Xs")

**Files:** Modify produtores em `source-registry.ts` (popular `freshness` da última sync
do fato; fonte: `SyncState`/controle do worker, ou `MAX(updatedAt)` da tabela raw do
fato), `report-renderer.tsx` (exibe "atualizado há Xs"); Test `source-registry.freshness.test.ts`.

- [ ] **Step 1:** teste: produtor de `fato_estoque_saldo` retorna `freshness` Date não-nulo.
- [ ] **Step 2-4:** falha → ler timestamp + exibir → verde.
- [ ] **Step 5:** commit `feat(f6): freshness por fato exibido (C4)`.

---

## FASE D , Filtros ao vivo + temporal + drilldown

### Task D1: Re-resolução do PREVIEW sem savedId

**Files:** Create `lib/actions/previsualizar-com-filtros.ts`; Modify `builder-preview.tsx`
(e `report-view-interactive.tsx` se for o renderizador do preview); Test.
```ts
export async function previsualizarComFiltros(entry: BuilderReportEntry, filtros: FiltrosRuntime): Promise<{ dados: Record<string, SecaoResolvida> }>;
```
Resolve do `entry` em memória (loop `resolveSecao`), sem `obterRascunho`. Gate admin.

- [ ] **Step 1:** teste: muda filtro (marca) → muda `dados` (resolver fake).
- [ ] **Step 2-4:** falha → action + gate → verde.
- [ ] **Step 5:** commit `feat(f6): re-resolucao do preview sem savedId (D1)`.

### Task D2: Plumbing de período mensal (só movimento) + gap de recorte

**Files:** Modify `source-registry.ts` (`FiltrosFonte` ganha `periodoDe?/periodoAte?`;
produtor de `fato_estoque_movimento` repassa), `resolve-source.ts` (`FiltrosRuntime` +
`filtrosDaSecao` carregam período; **corrige o gap `armazemId/familiaId`**),
`lib/actions/relatorio-filtros.ts`; Test `resolve-source.periodo.test.ts`.
- **Semântica:** o seletor mensal manda `periodoDe = periodoAte = mes` (recorte de 1
  mês); a query filtra `mes: { gte, lte }` (já existe). Refletir em D3/D4.

- [ ] **Step 1:** teste: resolver `fato_estoque_movimento` com período repassa às queries
  (spy); fatos snapshot ignoram período; `armazemId/familiaId` chegam em `filtrosDaSecao`.
- [ ] **Step 2-4:** falha → encadear → verde + `tsc`.
- [ ] **Step 5:** commit `feat(f6): periodo mensal no movimento + gap de recorte (D2)`.

### Task D3: Filtros-pílula do relatório (recorte sempre; período condicional)

**Files:** Create `components/reports/builder/report-filters.tsx`; Modify
`report-renderer.tsx`/`report-view-interactive.tsx`/`builder-preview.tsx` (monta os
filtros; **remove a barra fixa antiga**); Test `report-filters.test.tsx`.
**ui-ux-pro-max:** pílulas não-fixas; ativo `bg-primary`; período mensal só se há bloco
temporal (LineChart presente); recorte pelas dimensões presentes.

- [ ] **Step 1:** teste: relatório só-snapshot NÃO mostra pílula de período; com bloco
  temporal mostra; clicar recorte chama `onFiltro`.
- [ ] **Step 2-4:** falha → implementar + remover barra fixa → verde.
- [ ] **Step 5:** commit `feat(f6): filtros-pilula do relatorio (D3)`.

### Task D4: Navegador mensal condicional (≥4 pontos)

**Files:** Create `components/reports/builder/month-navigator.tsx`; Modify
`report-renderer.tsx` (liga no LineChart do grupo; só com ≥4 pontos); Test.
- `<4` pontos: navegador não aparece (degrade). `periodoDe=periodoAte=mes` ao navegar.

- [ ] **Step 1:** teste: série `<4` pontos não mostra navegador; `≥4` setas disparam `onMes`.
- [ ] **Step 2-4:** falha → implementar → verde.
- [ ] **Step 5:** commit `feat(f6): navegador mensal condicional (D4)`.

### Task D5: Drilldown inline no ReportDataTable

**Files:** Modify `report-data-table.tsx` (expansão de linha, padrão `expandedRowId` do
Consumo) + produtor de tabela (preservar `detalhe` por linha quando houver); Test.
> Se o E2E (F1) mostrar produtor sem detalhe por linha viável, rebaixar onda 1 p/ tabela
> sem drilldown (registrar no STATUS).

- [ ] **Step 1:** teste: linha com `detalhe` expande; sem `detalhe`, sem chevron.
- [ ] **Step 2-4:** falha → estado de expansão → verde.
- [ ] **Step 5:** commit `feat(f6): drilldown inline na tabela (D5)`.

---

## FASE E , Entrevista convergente + canvas

### Task E1a: Prompt da jornada enxuto + remover "firmeza contra pressa"

**Files:** Modify `agent/prompt-jornada.ts`; Test `prompt-jornada.test.ts` (asserts de conteúdo).
- ≤3 perguntas de verdade; mensagens curtas; remover a seção "firmeza contra pressa"
  (`prompt-jornada.ts:34`).

- [ ] **Step 1:** teste: o system prompt NÃO contém o texto de "firmeza contra pressa" e
  instrui ≤3 perguntas.
- [ ] **Step 2-4:** falha → editar prompt → verde.
- [ ] **Step 5:** commit `feat(f6): jornada enxuta, sem firmeza-contra-pressa (E1a)`.

### Task E1b: Gate por domínio detectado (libera "gerar já")

**Files:** Modify `journey/state.ts` (`podeOferecerGeracao`: domínio detectado ⇒
elegível), `journey/intencao.ts`; **atualizar** `route.test.ts`, `journey/state.test.ts`,
`journey/roteiro.test.ts` (que asseguram o gate antigo); Test.

- [ ] **Step 1:** ajustar os 3 testes existentes para o novo gate + novo caso (domínio
  detectado, 0 perguntas → elegível).
- [ ] **Step 2-4:** falha → mudar o gate → verde (os 3 + o novo).
- [ ] **Step 5:** commit `feat(f6): gate por dominio detectado (E1b)`.

### Task E1c: Rota "gerar já" determinística

**Files:** Modify `api/builder/stream/route.ts` (ação "gerar já" usa `templatePadrao`,
0 LLM, sem `verificarQuota` de LLM); Test `route.test.ts`.

- [ ] **Step 1:** teste: "gerar já" produz ficha via `templatePadrao` sem chamar o LLM (spy 0).
- [ ] **Step 2-4:** falha → rota determinística → verde.
- [ ] **Step 5:** commit `feat(f6): rota gerar-ja deterministica (E1c)`.

### Task E2: Limpeza do canvas/preview

**Files:** Modify `builder-preview.tsx` (remove pan + animações de mão; mantém zoom +
rolagem vertical), `builder-workspace.tsx` (botão ampliar = esconde a conversa; X volta);
Test `builder-preview.test.tsx`.
**ui-ux-pro-max:** zoom por botão; rolagem vertical natural; "ampliar" expande sobre a
coluna da conversa (estado, não modal); `prefers-reduced-motion`.

- [ ] **Step 1:** teste: sem handlers de pan; "ampliar" seta o estado que esconde a
  conversa; X reseta.
- [ ] **Step 2-4:** falha → remover pan/animações + toggle → verde.
- [ ] **Step 5:** commit `feat(f6): canvas limpo (E2)`.

---

## FASE F , Verificação contra o dado real

### Task F1: E2E real (semente determinística) + latência + régua visual

**Files:** Create `scripts/f6-e2e-geracao.ts`; Doc: `STATUS.md` + `docs/agents/HISTORY.md`.
- **Semente determinística:** montar `IntencaoCurada` fixa em código (sem LLM de
  entrevista) para várias intenções de estoque (panorama, negativos, por marca,
  movimento) + o "gerar já". O caminho com 2 LLM não é determinístico; asseverar as
  **invariantes no resultado** (KPIs sem valor colidente, ≤1 ranking, título↔métrica),
  não o texto.
- **Fallback temporal:** se `fato_estoque_movimento` tiver `<4` meses, validar o
  **degrade** (sem par temporal), não o par.

- [ ] **Step 1:** rebuildar containers afetados (mapa §2.1 do CLAUDE.md) + `npm run dev:fresh`; popular fatos.
- [ ] **Step 2:** rodar o E2E com as intenções semeadas; conferir invariantes no
  resultado + filtros de recorte ao vivo + paginação/drilldown.
- [ ] **Step 3:** passe visual lado a lado com o Consumo (`/relatorios-2/construtor`);
  medir latência (~≤25s).
- [ ] **Step 4:** registrar evidências; ajustar reasoning se passar.
- [ ] **Step 5:** commit `test(f6): E2E real do gerador + evidencias (F1)`.

---

## Self-review (cobertura)

- Spec §3.1 → A2,A7. §3.2 → A3,A5,A6. §3.3 → B3,B4,A4,B5. §3.4 (revisor+refino) → A5,A6,C3.
  §3.5 → C1,C2,C4,D1,D3,D4,D5. §3.6 → A1,B2,E1a,E1b,E1c. §3.7 → E2. §6 → F1.
- Net-new corretamente classificado: seção composta dissolvida em 2 irmãs (B1) + render
  agrupado (C1); temporal (D2); preview sem savedId (D1); drilldown (D5).
- Ordem por dependência explícita (grafo no topo): build-plano (B1) antes do pipeline (B5).
- Consumidores vivos cobertos (B5: state.ts, route.ts; tsc monorepo). Limpeza (B6).
- Tipos consistentes entre tasks: `IntencaoCurada`, `Metrica`(+`campoKpi`), `Plano`,
  `AmostraMetrica`(`escalar` por `campoKpi`), `FiltrosRuntime`(+período), `grupoId`/
  `subtitulos` em `config`.

## §13 , Correções da review do plano (v1 → v3, rastreio)

- fato→métrica 1:N + `campoKpi`; A4 escalar por `campoKpi` (não "primeiro numérico"). [A-A1, A-A4]
- `dimensoes` derivada de `campos.agregacaoCategorica/tabela` (não `contrato.dimensoes`). [A-A1]
- Seção composta **dissolvida em 2 seções irmãs com `grupoId`** (sem novo ReportTemplate,
  sem dupla-resolução, sem tocar compat/component-catalog/viabilidade/F3). [A-C1, B-C1]
- Ordem corrigida: B1 build-plano antes de B5 pipeline. [B-B4]
- Rename `SaidaGeracao.blueprint`→`plano` cobre `state.ts`/`route.ts`/`types.ts`; tsc monorepo. [B-B4]
- Backdoor do título no refino vira task C3. [A-A3]
- RBAC: `listarMetricas(dominiosPermitidos)` puro; chamador resolve via `getMyDomains`. [A-A6]
- C2 subtítulo: descrição viaja via `config.subtitulos` no build. [A-C3]
- B5: `GeracaoDeps.resolver` + novas `FaseGeracao` + `builder-progress-labels`. [A-B4]
- E1 quebrado em E1a/E1b/E1c; E1b atualiza os 3 testes do gate vivo. [A-E1, B-E1]
- B3 consome `IntencaoCurada` (não pilha de seções). [A-B1]
- Domínio: onda 1 hardcoda `"estoque"` (declarado em A1). [B-GERAL]
- B6 remoção segura do cérebro antigo + testes órfãos. [B-B1]
- C1 cobre estados vazio/erro por metade da seção composta. [B-C2]
- B5 regenerar reusa `ultimoPlano`. [B-B4]
- `report-view-interactive.tsx` incluído em C1/D1/D3. [B-D3]
- `filtrosIniciais`→`parametros` no B1; "sem migration" declarado. [B-C1]
- B5 asserta `logUsage` 2x/0x + quota. [B-B4]
- F1 semente determinística + fallback `<4` pontos. [B-F1]
- Spec §9 corrigida: `top_movimentados` é snapshot/ranking, não temporal. [A-A1 baixo]
- Seletor mensal = `periodoDe=periodoAte=mes`. [A-D4 baixo]

> **Status:** plano v3 (2 reviews aplicadas). Pronto para execução TDD inline (Opus),
> começando pela Fase A. F6 não sobe sem aprovação.

# Frente D , Mapa do que já existe para a tabela avançada (B-09 e DataTable genérico)

> Pesquisa factual (só leitura) feita em 2026-07-20. Objetivo: saber o que reusar e o
> que falta para chegar num sistema de tabela avançado (filtros inteligentes,
> agrupamento aninhado, seletor/reordenação de colunas, múltiplas views).

---

## Resumo executivo

- O B-09 usa um **DataTable genérico e reutilizável** (`src/components/charts/data-table.tsx`),
  não uma tabela específica. É **tabela própria**, construída sobre as primitivas
  `ui/table` (base-ui). **Não usa TanStack Table.**
- Todos os recursos (busca, colunas, filtros, compacto, exportar, ordenação, paginação)
  são **100% client-side sobre o array em memória**, via `useState` local do componente.
  Nada vive em URL, nem em store global.
- O mesmo DataTable é reusado em **8 telas** (Diretoria Pedidos/Estoque/Vendas, composição
  de kit, e Relatórios 1.0/2.0). Uma repaginação dele afeta todas: risco de regressão real.
- Já existe um **modelo de filtro avançado recursivo** pronto (`filtro-avancado.ts` +
  `filters-dialog.tsx`) com grupos E/OU aninhados e operadores, MAS ele está ligado só aos
  **Relatórios** (grava na URL), **não** ao DataTable da Diretoria. É reusável para os
  "filtros inteligentes".
- **Não existe hoje:** agrupamento (nenhum), reordenação de colunas (só mostrar/ocultar),
  múltiplas views salvas. Tudo isso é construção nova.

---

## 1. O componente de tabela do B-09

**Arquivo:** `src/components/charts/data-table.tsx` (`export function DataTable`).
**Utils puros (testados):** `src/components/charts/data-table-utils.ts` (`sortRows`,
`filterRows`, `toggleSortStack`).
**Export CSV:** `src/components/charts/export-csv.ts` (`gerarCsv`, `downloadCsv`).

- **É genérico e reutilizável.** Assinatura `DataTable<T extends Record<string, unknown>>`
  com `ColumnDef<T>[]` declarativo. O B-09 só monta `linhas` + `colunas` e passa (ver
  `blocos-pedidos.tsx`, `TabelaEntregasParciais`, linhas 176-227).
- **Lib por trás:** tabela **própria**, montada sobre `@/components/ui/table` (que é base-ui
  `@base-ui/react`). Controles usam `ui/popover`, `ui/select`, `ui/checkbox`, `ui/input`,
  `ui/button` (todos base-ui). Ícones Lucide. **Sem TanStack Table, sem AG Grid.**
- **`ColumnDef` suporta tipos:** `texto | numero | moeda | percentual | tag | tags | data`,
  com `tagCores` (mapa valor->classe Tailwind do pill). Já tem render de pílula única (`tag`)
  e múltiplas pílulas por célula (`tags`), útil para tags de etapa.
- **Extra já pronto:** `expandDetail(row)` para linha expansível com drill-down (usado no
  relatório saldo-produto). Props: `searchable`, `compactoInicial`, `alturaFluida`,
  `exportFilename`, `estado` (ok/vazio/preparando/erro), `onRetry`.

## 2. Cada recurso atual: onde e como

Tudo vive DENTRO de `data-table.tsx`, em estado local (`useState`), operando sobre o array
`rows` recebido por prop. Pipeline: **busca -> filtro por coluna -> sort -> paginação**
(linhas 251-287), tudo `useMemo` client-side.

- **Pesquisar** (`searchable`): `Input` com debounce 250ms (linhas 173-180). Varre TODAS as
  colunas convertendo valor para string, case-insensitive (`filterRows`).
- **Colunas (mostrar/ocultar)** (linhas 189-199, 324-368): `Popover` + `Checkbox` por coluna,
  estado `visiveis: Record<string,boolean>`. Impede ocultar a última. **Só liga/desliga,
  NÃO reordena.**
- **Filtros** (o que o dono achou "feio e ruim"): linhas 204-233 e 370-479. É um `Popover`
  ("Filtros" com `ListFilter`) que lista **valores distintos** das colunas textuais/tag
  (`valoresPorColuna`, `useMemo`), agrupados por coluna, com busca interna e checkboxes
  (multi-seleção OR dentro da coluna, AND entre colunas). Só aparece para colunas com entre
  2 e 60 valores distintos. É um "facet filter" simples embutido no popover, sem operadores,
  sem E/OU, sem faixas numéricas nem datas. Estado `colFiltros: Record<string,string[]>`.
- **Compacto** (linhas 201-202, 481-492): `Button` toggle; trunca colunas de texto longas
  (`max-w-[200px] truncate`).
- **Exportar** (linhas 289-294, 494-506): CSV das colunas visíveis + linhas com busca/filtro/
  sort aplicados (`gerarCsv`). Baixa arquivo `nome-YYYY-MM-DD.csv`.
- **Ordenação** (multi-sort): `sortStack: SortEntry[]`. Clique simples cicla asc->desc->off e
  substitui a stack; Shift+clique acumula critérios (`toggleSortStack`). Indicador numérico
  na coluna. `sortRows` respeita tipo (numérico vs `localeCompare pt-BR`), estável.
- **Paginação** (linhas 236-287, 689-731): client-side, `slice` sobre o array ordenado.
  Por página 50/100/500 (`Select`), navegador de páginas (`PageJumpNavigator`), rodapé em 3
  zonas "Mostrando X a Y de Z". Volta à pág 1 quando busca/filtro/sort/dados mudam.
- **Contagem de linhas** (linhas 508-511): `sorted.length` no canto direito da barra.

## 3. Onde vive o estado da tabela

- **100% estado local do componente** (`useState` dentro de `DataTable`). Colunas visíveis,
  ordenação, busca, filtros por coluna, página e "por página" são todos efêmeros.
- **NÃO usa URL** (não há `nuqs`; o projeto nem tem `nuqs` nas deps). **NÃO usa store**
  (sem `zustand`). É `"use client"`.
- Exceção: o toggle B-08 "incluir pedidos anteriores à data de análise" (`entregas_todos`)
  vive na URL e dispara refetch no servidor (`ToggleCorteEntregas` em `blocos-pedidos.tsx`,
  linhas 118-147). Mas isso é do KPI, não do estado interno da tabela.
- **Consequência para a Frente D:** persistir "views" (colunas escolhidas, agrupamento,
  filtros salvos) exige adicionar uma camada de persistência que hoje não existe (URL,
  localStorage ou tabela no Postgres, como o layout do construtor já faz via
  `layout-repo.ts`).

## 4. Como os dados chegam / volume

- A página `diretoria/pedidos/page.tsx` é **RSC** (`export const dynamic = "force-dynamic"`).
  Roda `queryEntregasParciais` no servidor e passa o **array pronto** para o client
  (`PedidosMontavel` -> `renderBlocoPedidos` -> `TabelaEntregasParciais`).
- **A query traz TUDO, sem paginação de servidor.** `entregas-parciais.ts` faz
  `findMany` sem `take`/`skip`/`cursor` e monta `linhas: LinhaEntregaParcial[]` (uma linha
  por item de pedido em demanda aberta com saldo). O array inteiro (as ~2731 linhas)
  chega ao cliente e o DataTable pagina em memória.
- **Implicação:** filtro, agrupamento e ordenação **podem ser client-side** sem custo de
  rede, porque o dataset já está todo no browser. Na escala de milhares de linhas isso é
  confortável para JS; a paginação atual já prova o modelo. Só vale ficar de olho se o
  volume crescer para dezenas de milhares (aí agrupamento aninhado + render exigiria
  virtualização, que hoje não existe).

## 5. Reuso do DataTable (dimensão do impacto)

`<DataTable>` é usado em **8 arquivos** (uma repaginação do componente afeta todos):

1. `src/app/(protected)/relatorios/[id]/report-view.tsx` , **Relatórios 1.0 e 2.0** (case
   `"DataTable"`, colunas declarativas do catálogo, com `expandDetail` do saldo-produto).
2. `src/components/diretoria/blocos/blocos-pedidos.tsx` , B-04, B-07 e **B-09**.
3. `src/components/diretoria/blocos/blocos-estoque.tsx` , blocos de estoque.
4. `src/components/diretoria/estoque/estoque-screen.tsx`.
5. `src/components/diretoria/vendas/vendas-screen.tsx`.
6. `src/components/diretoria/pedidos/pedidos-screen.tsx`.
7. `src/components/diretoria/blocos/composicao-kit-bloco.tsx`.
8. `src/components/charts/data-table.test.tsx` (suíte de testes).

**Padrão compartilhado:** sim, o DataTable É o padrão de tabela rica da plataforma. Estratégia
recomendada para a Frente D: **evoluir por props opcionais aditivas** (feature flags tipo
`agrupavel`, `reordenavel`, `filtroAvancado`) mantendo o default idêntico, para não regredir
as 7 outras telas. Alternativa: um wrapper novo (`DataTableAvancada`) só para o B-09,
reusando os utils.

**Outras tabelas que NÃO usam o DataTable** (montam `ui/table` na mão, fora do escopo, mas
mostram que há fragmentação): `report-data-table.tsx` (construtor F6, cópia do padrão do
Consumo), `users-content.tsx`, `audits-table.tsx`, `consumo-content.tsx`,
`router-decisions-table.tsx`, `evaluations-table.tsx`, `configuracao-content.tsx`, etc. Essas
não seriam afetadas por mexer no DataTable.

### Filtro avançado que JÁ existe (reaproveitável, hoje não plugado no DataTable)

- `src/lib/reports/filtro-avancado.ts` , **modelo serializável de filtro recursivo**:
  `Condicao` (campo/operador/valor), `Grupo` (conector E|OU + itens aninhados),
  `compilarFiltro(grupo) => (row) => boolean`. Operadores: igual, diferente, contém, maior,
  menor. Foi escrito pensando na F6, sem acoplamento a relatório específico. Tem testes
  (`filtro-avancado.test.ts`).
- `src/components/reports/filters-dialog.tsx` , **UI pronta** desse filtro: `Dialog` com duas
  abas (`Tabs`), "Simples" (accordion de facetas com busca + checkboxes + selecionar todos) e
  "Avançado" (construtor recursivo E/OU). Grava na URL via `searchParams`. Usado por
  `report-filters.tsx` (Relatórios), **não** pela Diretoria.
- **Oportunidade:** o "filtro inteligente" da Frente D pode reusar o modelo `filtro-avancado`
  (lógica + testes já prontos) e o padrão visual do `filters-dialog`, em vez de reinventar. O
  gap é ligá-lo ao array client-side do DataTable (hoje `compilarFiltro` roda sobre linhas em
  memória, o que casa perfeitamente com o modelo client-side da tabela).

## 6. Design system disponível para construir a tabela avançada

**Tokens/cores (já em uso no DataTable):** primária violet via `text-primary`/`bg-primary`
(o `#7c3aed` é o token primário do tema), `bg-card`, `bg-muted`, `text-muted-foreground`,
`border-border`, `ring-ring`. Pílulas de tag usam `bg-<cor>-500/10 text-<cor>-400 ring-1
ring-inset ring-<cor>-500/20` (padrão rose/amber/emerald para status).

**Componentes `src/components/ui/**` que servem para filtros/agrupamento/tags (não reinventar):**

- **Tags/pílulas:** `badge.tsx` (base-ui + cva, variantes default/secondary/destructive/
  outline/ghost/link) e `tier-badge.tsx`, `provider-badge.tsx`. O próprio DataTable já
  renderiza pílulas de etapa via `tipo: "tag"|"tags"`.
- **Seletor tipo pílula com popover:** `badge-select.tsx` (`BadgeSelect`, opção com
  cor+ícone Lucide, popover via portal) , ótimo para escolher "agrupar por" ou etapa.
- **Overlays:** `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx` (painel lateral, bom para um
  painel de configuração de view), `popover.tsx`, `tooltip.tsx`.
- **Seleção:** `select.tsx`, `custom-select.tsx`, `searchable-select.tsx`,
  `api-key-select.tsx`, `checkbox.tsx`, `switch.tsx`, `segmented-control.tsx` (bom para
  alternar views), `tabs.tsx`.
- **Entrada/faixas:** `input.tsx`, `range-slider.tsx`, `date-field.tsx`,
  `date-picker-single.tsx`, `calendar.tsx` (para filtros de data/numérico que o filtro atual
  não cobre).
- **Apoio:** `separator.tsx`, `skeleton.tsx`, `label.tsx`, `step-indicator.tsx`,
  `sonner.tsx` (toast).

**Drag and drop (para reordenar colunas / agrupamento):** **não há `@dnd-kit` nem `react-dnd`
nas deps.** O único DnD do projeto é `react-grid-layout` (^1.5.3), usado só no construtor de
dashboard (`construtor-grid.tsx`, `draggableHandle=".bloco-grip"`), para arrastar blocos do
grid, não linhas/colunas. Reordenar colunas ou montar chips de agrupamento arrastáveis exige
ou adotar `@dnd-kit` (nova dep) ou implementar DnD nativo (HTML5 `draggable`/`dataTransfer`),
que hoje não existe em lugar nenhum.

**Outras libs relevantes nas deps:** `@base-ui/react ^1.3.0` (base dos ui/*),
`class-variance-authority`, `lucide-react`, `sonner`. **Ausentes:** TanStack Table, nuqs,
zustand, dnd-kit, react-dnd.

---

## Gaps para o "sistema de tabela avançado" (o que falta construir)

| Recurso desejado | Estado hoje | Esforço |
|---|---|---|
| Filtros inteligentes (operadores, E/OU, datas, faixas) | Modelo `filtro-avancado` + `filters-dialog` prontos, mas só nos Relatórios; DataTable só tem facet-filter por valor distinto | Médio: religar o modelo existente ao array client-side do DataTable |
| Agrupamento aninhado | **Não existe** em nenhuma tabela | Alto: novo (linhas de grupo, subtotais, colapso, possível virtualização) |
| Reordenação de colunas | Só mostrar/ocultar (checkbox) | Médio-alto: precisa DnD (nova dep dnd-kit ou HTML5 nativo) |
| Múltiplas views salvas | **Não existe**; estado é efêmero em `useState` | Médio: precisa persistência (URL/localStorage/Postgres, espelhar `layout-repo`) |
| Persistência do estado da tabela | Nenhuma (perde ao recarregar) | Base para "views" |
| Virtualização (escala) | Nenhuma; pagina em memória | Baixo agora (~2731 linhas ok), sobe se o volume crescer |

**Reuso imediato:** DataTable + `ColumnDef` (tipos, tags, expandDetail), utils testados
(`sortRows`/`filterRows`/`toggleSortStack`), `export-csv`, modelo `filtro-avancado` + UI
`filters-dialog`, e todo o kit `ui/**` (badge, badge-select, dialog, sheet, popover, select,
checkbox, tabs, segmented-control, range-slider, date-picker). **A construir do zero:**
agrupamento, DnD de colunas, camada de views persistidas.

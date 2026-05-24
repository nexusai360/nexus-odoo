# Clone do front da tela de Consumo do Agente Nex — Plano de Implementação

> **For agentic workers:** plano executado inline na sessão principal (Opus 4.7).
> Steps usam checkbox (`- [ ]`). Spec: `docs/superpowers/specs/2026-05-22-consumo-nex-clone-design.md`.

**Goal:** Substituir o front-end de `/agente/consumo` pelo clone visual da tela
equivalente do nexus-insights, preservando o back-end V2 do nexus-odoo.

**Architecture:** Portar a infra auto-contida que o front clonado precisa
(datetime-core, Sheet, charts interativos, KpiCard, PeriodPills, PeriodNavigator,
helpers), depois reescrever os componentes de consumo no padrão do insights
adaptados aos tipos `UsageSummaryV2`/`UsageDetailRow` do odoo.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind v4, recharts 3,
framer-motion, react-day-picker 9, date-fns 4, base-ui.

**Convenção de port:** arquivos "portados" são copiados do nexus-insights
(`/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`)
e têm imports reescritos conforme indicado. O arquivo-fonte é a especificação
completa do conteúdo; só as adaptações são listadas aqui.

---

## Fase 1 — Infraestrutura portada

### Task 1: Alias `getColorByIndex` em colors.ts

**Files:** Modify: `src/components/charts/colors.ts`

- [ ] Adicionar ao fim do arquivo, após `colorAt`:
  ```ts
  /** Alias de `colorAt` — compat com componentes portados do nexus-insights. */
  export const getColorByIndex = colorAt;
  ```
- [ ] `npx tsc --noEmit` — Expected: PASS.

### Task 2: Portar datetime-core

**Files:** Create: `src/lib/datetime-core.ts`

- [ ] Copiar `src/lib/datetime-core.ts` do nexus-insights verbatim. Não tem
  import de path-alias do projeto (só `date-fns`/`date-fns-tz`, presentes).
  Nenhuma adaptação necessária.
- [ ] `npx tsc --noEmit` — Expected: PASS.

### Task 3: Portar Sheet

**Files:** Create: `src/components/ui/sheet.tsx`

- [ ] Copiar `src/components/ui/sheet.tsx` do nexus-insights verbatim. Importa
  `@base-ui/react/dialog` (odoo tem `@base-ui/react@^1.3.0`), `framer-motion`,
  `lucide-react`, `@/lib/utils` — todos presentes. Nenhuma adaptação.
- [ ] Verificar que o odoo expõe `Dialog` em `@base-ui/react/dialog`:
  `node -e "require.resolve('@base-ui/react/dialog')"`. Se falhar, conferir o
  subpath correto em `src/components/ui/dialog.tsx` do odoo e alinhar o import.
- [ ] `npx tsc --noEmit` — Expected: PASS.

### Task 4: Portar charts interativos

**Files:**
- Create: `src/components/charts/interactive/chart-tooltip.tsx`
- Create: `src/components/charts/interactive/empty-chart-state.tsx`
- Create: `src/components/charts/interactive/area-chart.tsx`
- Create: `src/components/charts/interactive/bar-chart.tsx`
- Create: `src/components/charts/interactive/donut-with-center.tsx`
- Create: `src/components/charts/interactive/index.ts`

- [ ] Copiar do nexus-insights `components/charts/{chart-tooltip,empty-chart-state,
  area-chart,bar-chart,donut-with-center}.tsx` para `charts/interactive/`.
- [ ] `chart-tooltip.tsx` e `empty-chart-state.tsx`: sem mudança de import.
- [ ] `area-chart.tsx`: trocar
  `import { ChartTooltip, type ChartTooltipPayloadItem } from "@/components/charts/chart-tooltip"`
  → `from "./chart-tooltip"`; `from "@/components/charts/empty-chart-state"`
  → `from "./empty-chart-state"`; `from "@/lib/charts/colors"`
  → `from "@/components/charts/colors"`.
- [ ] `bar-chart.tsx`: mesmas trocas de import; e
  `import { PROVIDER_LABELS } from "@/lib/llm/pricing"`
  → `from "@/lib/agent/llm/provider-labels"` (criado na Task 7).
- [ ] `donut-with-center.tsx`: trocar imports de `./chart-tooltip`,
  `./empty-chart-state`, `@/components/charts/colors`; e remover o import
  `import type { PieChartData } from "@/components/charts/pie-chart"` —
  declarar localmente no topo do arquivo:
  ```ts
  export interface PieChartData {
    name: string;
    value: number;
    color?: string;
  }
  ```
- [ ] `index.ts`: re-exportar os 4 componentes públicos e seus tipos:
  ```ts
  export { ChartTooltip, type ChartTooltipPayloadItem, type ChartTooltipProps } from "./chart-tooltip";
  export { EmptyChartState, type EmptyChartStateProps } from "./empty-chart-state";
  export { InteractiveAreaChart, type AreaChartData, type AreaChartSeries, type InteractiveAreaChartProps } from "./area-chart";
  export { InteractiveBarChart, type BarChartData, type BarChartSeries, type InteractiveBarChartProps } from "./bar-chart";
  export { DonutWithCenter, DonutTooltipStacked, type DonutWithCenterProps, type PieChartData } from "./donut-with-center";
  ```
- [ ] `npx tsc --noEmit` — Expected: PASS.

### Task 5: Portar PeriodNavigator

**Files:** Create: `src/components/dashboard/period-navigator.tsx`

- [ ] Criar a pasta `src/components/dashboard/` e copiar
  `components/dashboard/period-navigator.tsx` do nexus-insights verbatim.
  Importa só `lucide-react` e `@/lib/utils` — sem adaptação.
- [ ] `npx tsc --noEmit` — Expected: PASS.

### Task 6: Portar KpiCard

**Files:** Create: `src/components/reports/kpi-card.tsx`

- [ ] Copiar `components/reports/kpi-card.tsx` do nexus-insights verbatim.
  Importa só `lucide-react` e `@/lib/utils`. O odoo não tem
  `src/components/reports/kpi-card.tsx` (tem `charts/kpi-card.tsx`, intocado).
  Sem colisão.
- [ ] `npx tsc --noEmit` — Expected: PASS.

### Task 7: Helpers — provider-labels e format

**Files:**
- Create: `src/lib/agent/llm/provider-labels.ts`
- Create: `src/lib/agent/llm/format.ts`

- [ ] `provider-labels.ts`:
  ```ts
  /** Rótulos de exibição dos providers de LLM. */
  export const PROVIDER_LABELS: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
    google: "Google",
    openrouter: "OpenRouter",
    deepseek: "DeepSeek",
  };

  /** Rótulo amigável de um provider; capitaliza a chave se desconhecida. */
  export function providerLabel(key: string): string {
    return PROVIDER_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
  }
  ```
- [ ] `format.ts` — copiar `formatBrl4`/`formatUsd4` de `lib/llm/format.ts` do
  insights e `formatDuration` de `lib/format/date.ts` do insights (a função
  `formatDuration` das linhas 14-25). Conteúdo final:
  ```ts
  export function formatBrl4(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "—";
    const rounded = Math.round(v * 1e4) / 1e4;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency", currency: "BRL",
      minimumFractionDigits: 4, maximumFractionDigits: 4,
    }).format(rounded);
  }

  export function formatUsd4(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "—";
    const rounded = Math.round(v * 1e4) / 1e4;
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD",
      minimumFractionDigits: 4, maximumFractionDigits: 4,
    }).format(rounded);
  }

  /** Duração legível com granularidade automática (ms / s / min / h). */
  export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return rs > 0 ? `${m} min ${rs} s` : `${m} min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h} h ${rm} min` : `${h} h`;
  }
  ```
- [ ] `npx tsc --noEmit` — Expected: PASS.

### Task 8: Portar PeriodPills (desacoplado)

**Files:** Create: `src/components/reports/period-pills.tsx`

- [ ] Copiar `components/reports/period-pills.tsx` do nexus-insights, com estas
  adaptações (o original é acoplado ao modelo multi-conta do insights):
  - Remover `import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/reports/period"`
    e `import { getMinReportDate } from "@/lib/actions/reports/period"`.
  - Importar `type PeriodKey` de `@/lib/datetime-core`.
  - Declarar `PERIOD_OPTIONS` localmente:
    ```ts
    const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
      { key: "hoje", label: "Hoje" },
      { key: "semana_atual", label: "Esta semana" },
      { key: "mes_atual", label: "Este mês" },
      { key: "todos", label: "Tudo" },
      { key: "custom", label: "Personalizado" },
    ];
    ```
  - Em `PeriodPillsProps`: remover `accountId?: number`, adicionar
    `minDate?: Date` (data mínima selecionável no calendário).
  - Em `PeriodPills`: remover o estado `minDate`/`setMinDate` e os dois
    `useEffect` de fetch (o que reseta por `accountId` e o lazy de
    `getMinReportDate`). Usar a prop `minDate` diretamente: passar
    `minDate={minDate}` ao `CustomRangePicker`.
  - Imports `@/components/ui/{button,popover,dialog,calendar}` e
    `react-day-picker`/`date-fns/locale` — presentes no odoo, manter.
- [ ] `npx tsc --noEmit` — Expected: PASS.
- [ ] Commit Fase 1:
  ```bash
  git add src/components/charts/colors.ts src/lib/datetime-core.ts \
    src/components/ui/sheet.tsx src/components/charts/interactive \
    src/components/dashboard src/components/reports/kpi-card.tsx \
    src/components/reports/period-pills.tsx src/lib/agent/llm/provider-labels.ts \
    src/lib/agent/llm/format.ts
  git commit -m "feat(consumo-nex): infraestrutura portada do nexus-insights"
  ```

---

## Fase 2 — Componentes de consumo

### Task 9: Reescrever ConsumoContent

**Files:** Modify (reescrita completa): `src/components/agent/consumo/consumo-content.tsx`

Base: `consumo-content.tsx` do nexus-insights (1058 linhas). Reescrever
adaptando:

- [ ] **Imports**: `KpiCard` de `@/components/reports/kpi-card`; `PeriodPills`
  de `@/components/reports/period-pills`; `PeriodNavigator` de
  `@/components/dashboard/period-navigator`; charts de
  `@/components/charts/interactive`; `CHART_COLORS`/`getColorByIndex` de
  `@/components/charts/colors`; actions de `@/lib/actions/llm-usage`;
  tipos `UsageSummaryV2`/`UsageDetailRow`/`UsageDetailsTotals` de
  `@/lib/agent/llm/usage-stats`; `formatBrl4`/`formatUsd4`/`formatDuration` de
  `@/lib/agent/llm/format`; `providerLabel`/`PROVIDER_LABELS` de
  `@/lib/agent/llm/provider-labels`; `getPeriodInTz`/`getCanonicalPeriod`/
  `PeriodKey`/`CanonicalPeriodLabel` de `@/lib/datetime-core`;
  `UsageDetailSheet` de `./usage-detail-sheet`; `UsageTableFilters` de
  `./usage-table-filters`; `CustomSelect`, `Card`, `Table*` do odoo.
- [ ] **Tipo de stats**: `UsageSummaryV2` (não `UsageSummary`). Onde o insights
  lê `stats.totalCalls` usar `stats.totalIterations`; `byDay`/`byProvider`/
  `byModel`/`byHour` expõem `costBrl` e `costUsd` (não `cost`) — plotar
  `costBrl`.
- [ ] **Actions**: o odoo usa `fetchDistinctProviders`/`fetchDistinctModels`
  (sem `InRange`) e `fetchUsageStats({start,end,provider,isPlayground})`.
  Adaptar todas as chamadas. O `fetchUsageDetails` retorna
  `{rows,total,totals}` — igual.
- [ ] **Filtro de ambiente**: estado `ambiente: "all" | "agente" | "playground"`
  (URL `?env=`, aceitar `agente`/`playground`); `isPlaygroundFilter` =
  `ambiente==="all" ? null : ambiente==="playground"`. Rótulos no select:
  "Todos os ambientes" / "Agente Nex" / "Playground".
- [ ] **KPIs — 5 cards** via `KpiCard`, grid
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`, com stagger motion:
  1. `MessageSquare` · "Conversas" · `numberFmt.format(stats.totalConversations)`
     · subtitle "threads distintos".
  2. `Activity` · "Total de chamadas" · `numberFmt.format(stats.totalIterations)`
     · subtitle "no período".
  3. `Hash` · "Tokens de entrada" · `formatTokens(stats.totalTokensInput)`.
  4. `Zap` · "Tokens de saída" · `formatTokens(stats.totalTokensOutput)`.
  5. `DollarSign` · "Custo total" · `formatBrl4(stats.totalCostBrl)` ·
     subtitle `≈ ${formatUsd4(stats.totalCostUsd)}` mais, quando
     `unknownCount > 0`, ` · ${numberFmt.format(unknownCount)} sem preço` e
     `tone="warning"`.
- [ ] **Gráficos**: manter o layout do insights — Card de área (2/3) +
  Card `DonutWithCenter` por provider (1/3); Card de barras por modelo
  full-width. `InteractiveAreaChart` com `series=[{key:"Custo",label:"Custo (R$)",
  color:CHART_COLORS.violet}]`, `yAxisCurrency="BRL"`, `formatValue=formatBrlRaw`.
  `InteractiveBarChart` layout horizontal quando `>6` modelos, `providersByModel`
  alimentado. Valor plotado: `costBrl`.
- [ ] **PeriodNavigator**: preservar a lógica do insights (`navigatorPeriod`,
  `canonicalLabel`, `effectiveChartRange`, `chartReferenceDate`, `chartStats`,
  efeito de fetch). No efeito de fetch do gráfico navegado, passar também
  `isPlayground: isPlaygroundFilter` ao `fetchUsageStats` (ajuste consciente —
  spec §6).
- [ ] **PeriodPills**: usar o portado; passar `minDate={minDate}` (Date).
  `handlePeriodChange` aceita `PeriodKey` de `datetime-core` direto (não há
  mais `LegacyPeriodKey`).
- [ ] **Tabela "Histórico de chamadas"**: clonar a estrutura do insights
  (linha TOTAL no topo, hover com chevron, paginação 3 zonas, `pageSize`
  25/50/100, fechar sheet ao paginar). Colunas: Data/hora, Origem (badge
  Playground amber / Agente Nex violet), Provider (`providerLabel`), Modelo
  (mono), **Tipo** (badge `requestKind`: texto/imagem/áudio/arquivo, cores como
  no `usage-table.tsx` atual do odoo), Tokens entrada, Tokens saída, Custo USD,
  Custo BRL. Custo USD: badge "preço desconhecido" quando `!row.costKnown`.
  Custo BRL: quando `!costKnown` mostra "—"; senão valor + nota "cotação
  desatualizada" quando `row.rateStale`. `colSpan` da linha TOTAL = 5 (cobre
  até Tipo); `colSpan` da linha vazia = 10.
- [ ] **Filtros da tabela**: `UsageTableFilters` (Task 11).
- [ ] **Drill-down**: `UsageDetailSheet` (Task 10).
- [ ] **Acessibilidade da linha** (achado do ui-ux-pro-max): a `<TableRow>` de
  dados clicável recebe `role="button"`, `tabIndex={0}`, `aria-label`
  descritivo e `onKeyDown` que abre o Sheet em Enter/Espaço (com
  `e.preventDefault()` no Espaço para não rolar a página). A linha TOTAL e a
  linha vazia não são interativas — sem esses atributos.
- [ ] Manter `ChartSkeleton`, sincronização de URL (`?provider=`, `?env=`),
  reset de página em troca de filtro.
- [ ] `npx tsc --noEmit` — Expected: erros apenas de `./usage-detail-sheet` e
  `./usage-table-filters` ainda não existirem (resolvidos nas Tasks 10-11).

### Task 10: Criar UsageDetailSheet

**Files:** Create: `src/components/agent/consumo/usage-detail-sheet.tsx`

Base: `usage-detail-sheet.tsx` do nexus-insights. Adaptar a `UsageDetailRow` V2:

- [ ] Import: `Sheet/SheetHeader/SheetBody/SheetFooter` de
  `@/components/ui/sheet`; `Button` do odoo; `formatDuration` de
  `@/lib/agent/llm/format`; `UsageDetailRow` de `@/lib/agent/llm/usage-stats`;
  `providerLabel` de `@/lib/agent/llm/provider-labels`; `toast` de `sonner`.
- [ ] Seção **Identificação**: ID, Data/hora BRT, Provider (`providerLabel`),
  Modelo, **Tipo** (`requestKind`), **Conversa** (`conversationId`, mono, "—"
  quando null), Usuário (`userId`).
- [ ] Seção **Tokens**: entrada/saída (whisper → "—"), promptChars,
  responseChars.
- [ ] Seção **Duração**: `formatDuration(durationMs)`.
- [ ] Seção **Custo**: "Custo bruto (USD)" — badge "preço desconhecido" quando
  `!costKnown`, senão `costUsd`; "Cotação aplicada (USD→BRL)" =
  `usdToBrlRate` (4 casas) ou "Cotação não armazenada"; "Spread" =
  `rateSpread` (em %, `(rateSpread*100).toFixed(2)%`) ou "—"; "Custo final
  (BRL)" = `costBrl` ou "—", com nota "cotação desatualizada" quando
  `rateStale`. Não usar `currentSpread` global.
- [ ] Seção **Erro** (condicional a `errorMessage`).
- [ ] Footer: botão "Copiar JSON" (`navigator.clipboard` + toast) e "Fechar".
- [ ] `npx tsc --noEmit` — Expected: PASS para este arquivo.

### Task 11: Reescrever UsageTableFilters

**Files:** Modify (reescrita completa):
`src/components/agent/consumo/usage-table-filters.tsx`

Base: `usage-table-filters.tsx` do nexus-insights (popovers customizados).

- [ ] Copiar a estrutura do insights: `ProviderSelect` + `ModelSelect` em
  `Popover`, botão "Limpar filtros" condicional, sufixo `(Provider)` nos
  modelos quando nenhum provider está ativo, cascade provider→modelo.
- [ ] Trocar o `PROVIDER_LABEL` inline pelo import de `providerLabel` de
  `@/lib/agent/llm/provider-labels`.
- [ ] Imports `@/components/ui/popover`, `@/lib/utils`, `lucide-react` —
  presentes.
- [ ] Manter a interface `UsageTableFiltersProps` compatível com o consumer
  (`providers`, `modelsByProvider`, `selectedProvider`, `selectedModel`,
  `onProviderChange`, `onModelChange`).
- [ ] `npx tsc --noEmit` — Expected: PASS.

### Task 12: Remover componentes antigos e ajustar a page

**Files:**
- Delete: `src/components/agent/consumo/kpi-row.tsx`
- Delete: `src/components/agent/consumo/usage-charts.tsx`
- Delete: `src/components/agent/consumo/usage-table.tsx`
- Delete: `src/components/agent/consumo/usage-detail.tsx`
- Delete: `src/components/agent/consumo/date-range-popover.tsx`
- Modify: `src/app/(protected)/agente/consumo/page.tsx`

- [ ] Confirmar via `grep -rl "consumo/\(kpi-row\|usage-charts\|usage-table\|usage-detail\|date-range-popover\)" src` que nada além do `consumo-content` antigo importava esses arquivos. Se houver outro consumer, parar e reavaliar.
- [ ] `git rm` dos 5 arquivos.
- [ ] `page.tsx`: nenhuma mudança estrutural necessária (já importa
  `ConsumoContent` e passa `minDate`); confirmar que continua compilando.
- [ ] `npx tsc --noEmit` — Expected: PASS (árvore inteira limpa).
- [ ] Commit Fase 2:
  ```bash
  git add src/components/agent/consumo src/app/'(protected)'/agente/consumo/page.tsx
  git commit -m "feat(consumo-nex): tela de consumo no padrao visual do nexus-insights"
  ```

### Task 13: Ajuste de testes existentes

**Files:** Test: `src/components/agent/consumo/` (se houver `__tests__`)

- [ ] `ls src/components/agent/consumo/__tests__ 2>/dev/null` e
  `grep -rl "consumo" src --include="*.test.tsx"`. Para cada teste que
  referencia um componente removido: se o teste cobre comportamento que migrou
  para `consumo-content`, reescrever o teste contra o novo componente; se cobre
  algo que deixou de existir, remover o teste. Sem testes órfãos.
- [ ] `npx jest src/components/agent/consumo` — Expected: PASS.
- [ ] Commit se houve mudança de teste:
  ```bash
  git add src/components/agent/consumo
  git commit -m "test(consumo-nex): alinha testes a tela reescrita"
  ```

---

## Fase 3 — Verificação

### Task 14: Verificação automatizada

- [ ] `npx tsc --noEmit` — Expected: PASS.
- [ ] `npx eslint src/` — Expected: 0 erros novos (warnings pré-existentes do
  RADAR R7 são aceitos).
- [ ] `npx jest` — Expected: verde.
- [ ] `npx next build` — Expected: verde.

### Task 15: Verificação manual contra dado real (regra de raiz, CLAUDE.md §9)

- [ ] `docker compose up -d db redis` e `npm run dev`.
- [ ] Abrir `/agente/consumo` autenticado como super_admin.
- [ ] Conferir: 5 KPIs com números coerentes; gráfico de área + navegação por
  período (setas); donut por provider; barras por modelo; filtros de período/
  provider/ambiente; tabela com linha TOTAL, coluna Tipo e badges; drill-down
  abrindo o Sheet lateral. Conferir que os números batem com o back-end (que
  não mudou).
- [ ] Registrar evidência (o que foi exercido e o resultado) antes de declarar
  pronto.

---

## Histórico de revisão

### Review do plano #1 (achados materiais)

1. **Task 4 — colisão de import de `PieChartData`**: o `donut-with-center` do
   insights importa `PieChartData` de `@/components/charts/pie-chart`, que no
   odoo é outro componente (F3.5) com tipo possivelmente diferente. v1 não
   tratava — corrigido: declarar `PieChartData` localmente no donut portado.
2. **Task 8 — `PeriodPills` é acoplado**: a v1 dizia "portar verbatim", mas o
   componente importa `getMinReportDate` (server action multi-conta) e
   `PERIOD_OPTIONS` de libs do insights. Corrigido com a lista explícita de
   desacoplamentos.
3. **Task 1 — `getColorByIndex`**: a v1 mandava reescrever o import nos charts
   portados para `colorAt`. Mais limpo e com menos edição: adicionar o alias
   `getColorByIndex` no `colors.ts` do odoo (Task 1) e manter os charts
   intactos nesse ponto.
4. **Task 12 — verificação de consumers órfãos**: a v1 deletava os 5 arquivos
   sem checar quem mais os importava. Adicionado o passo de `grep` antes do
   `git rm`.

### Review do plano #2 (achados materiais)

1. **Task 9 — `colSpan` da tabela**: o insights usa `colSpan={4}` na linha
   TOTAL e `{9}` na vazia (9 colunas). O odoo tem 9 colunas + a coluna **Tipo**
   = 10 colunas. v2 não ajustava os `colSpan`. Corrigido: TOTAL `colSpan={5}`,
   vazia `colSpan={10}`.
2. **Task 9 — spread por linha**: o `UsageDetailSheet` do insights usa um
   `currentSpread` global; o odoo modela `rateSpread` por linha. Reforçado na
   Task 10 que não há spread global — usar `rateSpread` da linha.
3. **Task 13 — testes**: a v2 não previa o tratamento dos testes dos
   componentes removidos. Adicionada a Task 13.
4. **Task 3 — subpath do base-ui**: o insights importa
   `@base-ui/react/dialog`. v2 não verificava se o odoo resolve esse subpath.
   Adicionado o passo de verificação com fallback ao subpath usado pelo
   `dialog.tsx` do odoo.
5. **Ordem Task 9 vs 10/11**: a Task 9 referencia `./usage-detail-sheet` e
   `./usage-table-filters` que só existem após 10/11. Registrado no "Expected"
   da Task 9 que o `tsc` só fecha 100% após a Task 12; as Tasks 10 e 11 podem
   ser feitas logo após a 9 antes do commit da Fase 2.
6. **Acessibilidade (ui-ux-pro-max)**: a Task 9 ganha o passo de tornar a linha
   clicável da tabela acessível por teclado (`role="button"` + `tabIndex` +
   `onKeyDown`), cumprindo a regra CRITICAL `keyboard-nav`.

# F3 — Dashboard de Relatórios — UI Review

**Auditado:** 2026-05-17
**Baseline:** spec `2026-05-16-dashboard-relatorios-design.md` §6/§7 + design system da F1
**Screenshots:** não capturados — servidor em `localhost:3000` exige login (302 → `/login`); rotas `/relatorios` são protegidas e inacessíveis sem sessão via CLI. Auditoria conduzida por revisão de código contra o design system da F1 e a spec.

---

## Nota

| Pilar | Nota | Achado-chave |
|---|---|---|
| 1. Consistência com o design system | 2/4 | Filtros usam `<select>`/`<input>` crus com `ring-foreground/10` em vez do `border-input` + componentes da F1 |
| 2. Layout e espaçamento | 3/4 | Grade e gaps fiéis à spec; card de relatório com hover não-acessível por teclado |
| 3. Tipografia e cor | 2/4 | Paleta de gráficos é hardcoded e ignora os tokens `--chart-*`; não validada no dark/light |
| 4. Acessibilidade | 2/4 | `aria-sort` presente, mas checkbox sem componente, gráficos sem texto alternativo, foco ausente em controles crus |
| 5. Estados de interação e feedback | 2/4 | Estado de erro existe mas é inalcançável (`onRetry` no-op); sem skeleton de loading real |
| 6. Responsividade | 3/4 | Grade responsiva correta; barra de filtros e tabela larga sem tratamento mobile |

**Nota global: 14/24** — Necessita ajustes antes do deploy.

---

## Top 3 Correções Prioritárias

1. **Estado de erro dos gráficos é decorativo** — `ChartError` recebe `onRetry`, mas em `report-view.tsx` nenhum template recebe a prop, e os defaults caem em `() => {}`. Além disso o estado `erro` só é produzido server-side e a página inteira renderiza por completo — o botão "Repetir" nunca aparece com ação útil. *Correção:* ou remover a promessa de retry e trocar por instrução de recarregar a página, ou tornar a leitura de seção client-side com `router.refresh()` no retry.
2. **Filtros divergem do design system da F1** — todos os 7 controles de filtro usam `<select>`/`<input>` HTML crus com `ring-1 ring-foreground/10` e `bg-card`, enquanto a F1 padroniza `border-input`, `focus-visible:ring-ring`, e o dropdown custom (`RoleDropdown` no `user-form-dialog`). Resultado: sem anel de foco visível, sem estilo de hover, aparência inconsistente com `usuarios`/`configuracao`. *Correção:* portar um `Select` do design system (ou reusar o padrão `RoleDropdown`) e usar o `Input` da F1 — já importado em `search-filter`/`product-filter`, mas não nos selects.
3. **Paleta de gráficos hardcoded, fora dos tokens** — `palette.ts` define 8 cores literais (`#3b82f6`…) sem relação com `--chart-1..5` de `globals.css`. A spec §6 exige "paleta categórica acessível testada no dark mode"; as cores não trocam entre light/dark e o roxo da marca (`--primary #6d28d9`/`#7c3aed`) não aparece. *Correção:* derivar a paleta de `var(--chart-*)` ou, no mínimo, validar contraste das 8 cores nos dois temas e documentar o teste.

---

## Achados Detalhados

### Pilar 1 — Consistência com o design system (2/4)

**BLOCKER — filtros não usam os componentes da F1.**
`warehouse-filter.tsx`, `family-filter.tsx`, `days-range-filter.tsx`, `direction-filter.tsx` e `period-filter.tsx` renderizam `<select>`/`<input type=month>` nativos com `className="h-9 ... rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"`. O design system da F1 usa `border-input` + `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50` (ver `RoleDropdown` linhas 963-967 de `user-form-dialog.tsx`). Os filtros: (a) não têm anel de foco — falha de acessibilidade e de consistência; (b) `ring-foreground/10` não é token de borda de input; (c) o select nativo herda o estilo do SO, quebrando a aparência no dark mode. `search-filter` e `product-filter` acertam ao usar o `Input` da F1, o que torna a inconsistência interna ao próprio módulo.

**WARNING — checkbox cru na etapa "Acesso".**
`access-step.tsx` usa `<input type="checkbox">` HTML puro, sem componente. A F1 tem `Switch` (`@/components/ui/switch`) e o projeto usa base-ui — não há `Checkbox` no design system, mas um input cru sem `accent-color`/foco custom destoa do restante do modal (que usa `Switch`, `RoleDropdown` estilizado). *Correção:* criar/portar um `Checkbox` do design system, ou ao menos aplicar `accent-[--primary]` e estilo de foco.

**WARNING — `DataTable` reimplementa o cabeçalho fora do padrão `audits-table`.**
`data-table.tsx` usa os primitivos `Table`/`TableHead` da F1 (correto), mas o cabeçalho ordenável usa `▲`/`▼` como texto literal concatenado (`{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}`). A F1 usa ícones `lucide-react` em todo lugar. Glifos Unicode crus não herdam cor/tamanho consistentes e não têm `aria-hidden`. *Correção:* usar `ArrowUp`/`ArrowDown` do lucide.

### Pilar 2 — Layout e espaçamento (3/4)

Positivo: `relatorios-grid.tsx` segue a spec §7 literalmente — `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, agrupamento por domínio com `<h2>` de seção, `flex flex-col gap-8`. `report-view.tsx` usa `gap-6` entre seções, `PageShell variant="narrow"` e `PageHeader` conforme F1. Card de relatório usa `Card` do design system.

**WARNING — card de relatório dentro de `<Link>` com hover não-padrão.**
`relatorios-grid.tsx` linha 47: `Card` recebe `hover:ring-foreground/20` direto. A F1 (`audits-table` e cards de `usuarios`) usa `hover:bg-muted/30`. O `Card` base já tem `ring-1 ring-foreground/10`; sobrescrever só o ring no hover é sutil demais para sinalizar interatividade — falta `cursor-pointer` explícito e transição de elevação/fundo. Card clicável inteiro deveria ter feedback mais claro.

**WARNING — breadcrumb manual em vez do `PageHeader`.**
`[id]/page.tsx` linhas 82-87 montam um `<Link>` "← Relatórios" à mão acima do `PageHeader`. A spec §7 fala em "`PageHeader` (breadcrumb para `/relatorios`)" — sugere breadcrumb integrado ao header, não um link solto. Verificar se o `PageHeader` da F1 suporta prop de breadcrumb; se sim, usá-la para consistência vertical de espaçamento.

### Pilar 3 — Tipografia e cor (2/4)

**BLOCKER — paleta de gráficos ignora os design tokens.**
`palette.ts`: `CHART_COLORS` são 8 hex literais. `globals.css` define `--chart-1..5` com valores distintos para light e dark (linhas 70-74, 106-110) — exatamente para gráficos. A paleta da F3 não os usa, então: as cores não se adaptam ao tema; a cor de marca (roxo) some; e a "validação no dark mode" exigida pela spec §6 não tem evidência. `bar-chart.tsx` usa `CHART_COLORS[0]` (`#3b82f6`, azul) como cor única — o gráfico de barras nunca aparece na cor primária do produto.

**WARNING — eixos e ticks dos gráficos sem cor de tema.**
`bar-chart`/`line-chart`/`pie-chart`: `XAxis`/`YAxis` não recebem `tick`/`stroke` — herdam o cinza-escuro default do Recharts (`#666`), invisível ou de baixo contraste no dark mode (`--background #09090b`). Só o `CartesianGrid` foi tratado (`text-foreground/10`). *Correção:* passar `tick={{ fill: "currentColor" }}` com `className="text-muted-foreground"` nos eixos.

**WARNING — tipografia consistente, mas KPI sem hierarquia com legenda.**
`kpi-card.tsx` usa `text-2xl font-semibold` para o número e `text-sm text-muted-foreground` para o rótulo — coerente com a F1. OK. Sem achado crítico aqui.

### Pilar 4 — Acessibilidade (2/4)

Positivo: `data-table` implementa `aria-sort` corretamente nos `TableHead`; stepper do modal tem `role="list"`/`aria-current`; `access-step` associa `<label htmlFor>` aos checkboxes.

**BLOCKER — gráficos sem alternativa textual.**
`BarChart`/`LineChart`/`PieChart` renderizam SVG via Recharts sem `role="img"`, sem `aria-label` e sem tabela de dados equivalente. Um leitor de tela não tem acesso a nenhum dado de R2/R3/R5/R6. *Correção:* envolver cada gráfico com `role="img"` + `aria-label` resumindo o conteúdo, ou oferecer uma `DataTable` alternativa visualmente oculta.

**WARNING — controles de filtro sem foco visível.**
Decorrência do Pilar 1: os `<select>`/`<input month>` crus não têm `focus-visible:ring`. Navegação por teclado não mostra onde o foco está.

**WARNING — botão de ordenar dentro de `TableHead` sem rótulo de ação.**
`data-table` linha 123: o `<button>` de ordenação tem só o texto da coluna; um leitor de tela anuncia "Produto, botão" sem dizer que clicar ordena. *Correção:* `aria-label={`Ordenar por ${c.header}`}`.

**WARNING — `ChartError` com `role` ausente.**
`chart-states.tsx`: `ChartError` mostra mensagem de erro num `StateBox` sem `role="alert"`. A F1 (`audits-table` linha 109) usa `role="alert"` no erro e `role="status"` no vazio. `ChartEmpty`/`ChartPreparing` também sem `role="status"`.

### Pilar 5 — Estados de interação e feedback (2/4)

**BLOCKER — estado de erro inalcançável e retry no-op.**
Os 5 templates aceitam `onRetry`, mas `report-view.tsx` (`renderSecao`) nunca passa a prop — todos caem no default `onRetry ?? (() => {})`. O botão "Repetir" do `ChartError`, se exibido, não faz nada. Pior: o estado `erro` é decidido na server action e a página é `force-dynamic` server-rendered — uma exceção na query derruba a página inteira (ou o `try/catch` da query devolve `estado: "erro"`, mas então não há caminho de recuperação client-side). O contrato da spec §3.4 ("erro com ação de repetir") não está cumprido de forma funcional.

**WARNING — sem skeleton de loading real.**
`ChartSkeleton` existe em `chart-states.tsx` mas não é referenciado por nenhum template nem pela página. Como `/relatorios/[id]` é server component `force-dynamic`, o usuário vê a navegação travada até o HTML chegar, sem `loading.tsx` na rota. *Correção:* adicionar `relatorios/[id]/loading.tsx` usando `ChartSkeleton`.

**WARNING — filtros disparam `router.push` por tecla digitada.**
`search-filter` e `product-filter` chamam `onChange` a cada caractere; em `report-filters.tsx` o `busca` cai em `setParam` → `router.push`. Cada letra digitada na busca recarrega a rota inteira (`force-dynamic`, refaz todas as queries de seção). Falta debounce. *Correção:* debounce de ~300ms antes do `router.push`, ou manter `busca` como filtro client-side (o `DataTable` já filtra localmente — a busca via URL é redundante e cara).

**WARNING — feedback do card de relatório.**
Card clicável sem `cursor-pointer` nem transição de fundo (ver Pilar 2).

### Pilar 6 — Responsividade (3/4)

Positivo: grade `sm:grid-cols-2 lg:grid-cols-3` correta; `ResponsiveContainer` em todos os gráficos; `PageShell variant="narrow"` limita largura.

**WARNING — barra de filtros sem colapso mobile.**
`report-filters.tsx` usa `flex flex-wrap items-end gap-3`. Com 4 filtros (R1) em viewport de 375px, os controles `max-w-xs` (320px) ocupam quase a largura toda e empilham, mas o `period-filter` tem dois campos lado a lado (`flex items-end gap-2`) que estouram. *Correção:* permitir que o `PeriodFilter` empilhe os campos no mobile.

**WARNING — `DataTable` larga sem scroll horizontal.**
`data-table.tsx` renderiza `<Table>` direto, sem o wrapper `overflow-x-auto` que o `audits-table` da F1 usa (linha 99: `overflow-hidden overflow-x-auto rounded-xl border`). R1 (saldo por produto: nome, local, família, quantidade, unidade, valor) estoura 375px e quebra o layout. *Correção:* envolver a `Table` em `div.overflow-x-auto`.

**WARNING — gráficos com altura fixa `h-72`.**
`h-72` (288px) é razoável no desktop, mas em mobile com legenda o `PieChart` (`outerRadius={90}`) fica apertado. Aceitável, mas observar no UAT.

---

## Observações sobre boas práticas de gráfico

- **Números pt-BR:** OK — `formatNumber` cobre inteiro/decimal/moeda via `toLocaleString("pt-BR")`; tooltips e ticks usam o formatter.
- **Tooltips:** presentes em bar/line/pie. OK.
- **Legendas:** `LineChart` e `PieChart` têm `<Legend>`; `BarChart` não tem (série única — aceitável).
- **`PieChart` "Outros":** `agruparOutros` mantém top-5 + "Outros", conforme spec §6 (≤6 fatias). OK.
- **Estados preparando/vazio/erro:** os 3 estados existem e são roteados por `estado` em todos os templates — mas o de erro não é recuperável (ver Pilar 5).
- **Cores acessíveis no dark:** **não comprovado** — paleta hardcoded, sem teste documentado (ver Pilar 3).

## Etapa "Acesso" do modal

Coerente no fluxo: `stepperItems` é computado por role (`temEtapaAcesso`), N10 (troca de role zera domínios) tratado via `handleRoleChange`, aviso de "zero domínios" presente na etapa e na confirmação. O `StepConfirm` lista os domínios concedidos. Funcionalmente fiel à spec §4.4. **Único achado visual:** o checkbox cru (Pilar 1) — o resto da etapa segue o espaçamento (`gap-3`/`gap-2`) e a tipografia (`text-sm`/`text-xs text-muted-foreground`) do modal.

---

## Arquivos Auditados

- `src/app/(protected)/relatorios/page.tsx`, `relatorios-grid.tsx`
- `src/app/(protected)/relatorios/[id]/page.tsx`, `report-view.tsx`
- `src/components/charts/`: `kpi-card`, `data-table`, `bar-chart`, `line-chart`, `pie-chart`, `chart-states`, `palette`
- `src/components/reports/report-filters.tsx` + `filter-controls/`: product, warehouse, family, period, direction, days-range, search
- `src/components/users/access-step.tsx`, `user-form-dialog.tsx`
- `src/lib/constants/nav.ts`
- Referências F1: `usuarios/page.tsx`, `audits-table.tsx`, `card.tsx`, `globals.css`

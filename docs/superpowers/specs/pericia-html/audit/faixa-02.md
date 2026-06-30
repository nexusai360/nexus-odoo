# Auditoria adversarial , Faixa 02 (linhas 2400-4800)

> Fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Faixa coberta: 2400-4800 (lida na íntegra, 2 blocos de 1200 linhas).
> Cruzamento: `00-design-system-shell.md`, `01-estoque.md`, `02-compras.md`,
> `03-demandas.md`, `04-vendas.md`, `06-permissoes-uf-odoo-extras.md`.

## Natureza da faixa

A faixa 2400-4800 é **quase 100% CSS versionado** (comentários `/* vNN ... */`),
sem JS e quase sem markup. Cobre, em ordem:

1. **Estoque (`#mod-estoque`)** , evoluções visuais dos cards A3-A8 (v80 a v99) +
   o modal `#modal-stock-ideal`.
2. **Ajustes · Odoo API (`#mod-odoo`)** , folha de estilo inteira da tela de
   configuração.
3. **Demandas (`#mod-demandas`)** , overrides v110/v112/v114/v117 (B7, B2 unitário,
   estoque negativo, tempo de cobertura A4).
4. **Vendas (`#mod-vendas`)** , início do CSS (container, C1 hero, modal de período
   v118, chip topbar v119) , fim da faixa em 4800.

Como a perícia existente é orientada a **comportamento/JS/markup/dado**, a maior
parte do conteúdo visual desta faixa está COBERTA indiretamente (a perícia cita as
mesmas classes/linhas). Os GAPS reais são **estados/variações puramente em CSS** e
**layouts legados** que a perícia não menciona por não terem contraparte em JS vivo.

---

## INVENTÁRIO (por bloco de versão)

### Estoque , A4/A5/A6 (v80-v85, 2400-2995)

| # | Item (linha) | Status |
|---|---|---|
| 1 | `.serial-model-summary` , card de resumo de seriais com acento azul `#8FB5F5` (2398-2404) | **[GAP]** variante de card não documentada |
| 2 | `.stock-free-body` + `.stock-free-placeholder`/`-title`/`-text` , card de placeholder/estado vazio "livre" (2405-2437) | **[GAP]** estado-vazio não documentado |
| 3 | A6 painel de busca de seriais: `.stock-serial-search-panel`/`-box`/`-input`/`-help` (2438-2484) | [COBERTO] 01 §A6 (`#stock-serial-search`) |
| 4 | Lead-time A5 (v80): `.stock-lead-body`/`-summary-grid`/`-card`(.main verde)/`-label`/`-value`/`-sub`/`-table` 3 colunas (2507-2625) | [COBERTO] 01/02 (lead-time marcado como resto de versão antiga) |
| 5 | Tabela de seriais , larguras de colunas e variações por versão (2626-2647, 2723-2797) | [COBERTO] 01 §A6 |
| 6 | Pizzas A5 (v81): `.stock-pie-body`/`-card`/`-title`/`-chart-wrap`/`-svg`/`-bg`/`-slice`/`-legend`/`-dot`/`-name`/`-value` (2650-2707) | [COBERTO] 01 §A5 (donut, paleta 6 cores) |
| 7 | `.stock-pie-slice:hover{filter:brightness(1.18)}` + `transform-origin:center` , micro-interação de hover na fatia (2689-2690, 2775) | **[GAP]** interação de hover do donut não citada |
| 8 | `.stock-pie-center-title`/`-center-value` , rótulo/valor central do donut (2691-2692) | **[GAP]** versão inicial com texto central (substituída por total-label/value no v82) |
| 9 | Métrica inline do serial (v81): `.stock-serial-inline-metric`/`-label`/`-sub`/`-value` (2708-2722) | [COBERTO] 01 (valor médio por serial) |
| 10 | v82 pizzas minimalistas: `.stock-pie-total-label`/`-value` (2776-2777), legenda em pílulas (2778-2781) | [COBERTO parcial] perícia cita pizzas, não o redesenho minimalista total-label/value |
| 11 | `.stock-serial-status.available` (pílula verde) / `.sold` / `.stock-serial-age` (gold3) (2793-2795) | [COBERTO parcial] `stock-serial-status` citado em 01; `.available/.sold/.age` específicos não detalhados |
| 12 | `#modal-stock-ideal` threshold global (v82): `.stock-ideal-threshold-card`/`-label`/`-input`/`-help` + `.is-high` (2734-2767) | [COBERTO] 01 §modal (marcado como legado morto, input ausente do DOM) |
| 13 | KPIs A3 idade/giro (v83): `.stock-a3-kpi-grid`/`-card`/`-label`/`-value`/`-sub` (2800-2867) | [COBERTO] 01 §10 (órfão, `display:none` no v84) |
| 14 | `#modal-stock-ideal` `.stock-ideal-threshold-note` + `.stock-ideal-over-wrap`/`-over-input`/`-over-help` (2868-2898) | [COBERTO] 01 §modal ("Máximo acima do ideal %", over-input default 30) |
| 15 | v84: KPIs movidos p/ A4, `.stock-a4-age-card`/`-turnover-card` com `::before` gradiente (2909-2945) | [COBERTO] 01 §A4 (6 cards) |
| 16 | v85: A4 enxuto, age-card `:not(.filtered){display:none}` (card só aparece com busca no A6) (2948-2995) | [COBERTO parcial] 01 cita "se há busca"; o comportamento de ocultar o card via CSS não é explicitado |

### Estoque , A7 Compras (v88-v93, 2998-3772)

| # | Item (linha) | Status |
|---|---|---|
| 17 | Layout A7 3 colunas: `.stock-purchases-body` (lista/itens/info) + grid-rows do container (2999-3031) | [COBERTO] 02 §A7 |
| 18 | Lista de pedidos: `.stock-purchase-list-item`(.active gradiente dourado)/`-top`/`-name`/`-badge`/`-meta` + hover translateY (3049-3113) | [COBERTO] 02 §A7 (clique seleciona pedido) |
| 19 | Tabela de itens: `.stock-purchase-table` thead/tbody, `.stock-purchase-item-dot`(.delivered/.pending) + linhas coloridas (3114-3198) | [COBERTO] 02 §A7 |
| 20 | Cards de info: `.stock-purchase-info-grid`/`-card`(.highlight)/`-label`/`-value`(.sm)/`-sub` (3199-3259) | [COBERTO] 02 §A7 (6 KPIs do pedido) |
| 21 | Gráficos A7: `.stock-purchase-charts-grid`/`-chart-card`/`-svg`/`-bg`/`-slice`/`-total-label`/`-value`/`-legend` (3260-3356) | [COBERTO] 02 §A7 (donut entrega + categorias) |
| 22 | v92 estado **partial**: `.stock-purchase-item-dot.partial`(âmbar) + `.item-row.partial` + 3 colunas de entrega coloridas por nth-child (3698-3733) | [COBERTO] 02 §A7 (status partial em 3698) |
| 23 | v93 reordenação financeira: `.stock-purchase-info-card.warning` (acento amarelo) (3759-3772) | [COBERTO parcial] 02 cita KPIs; a variante `.warning` específica não detalhada |

### Estoque , A8 Compras ativas (v94-v99, 3775-4575)

| # | Item (linha) | Status |
|---|---|---|
| 24 | A8 grid de KPIs + 6 acentos de cor (gold/green/yellow/red/blue/purple) `.stock-a8-kpi.X::before` (3780-3848, 4473-4474) | [COBERTO] 02 §A8 (6 KPIs, classes de cor) |
| 25 | v95 layout em blocos: `.stock-a8-layout`/`-overview-block`/`-block`/`-block-head`/`-title`/`-sub`/`-block-grid`(.values/.quantities) (3884-3991) | [COBERTO] 02 §A8 |
| 26 | v96-v99 pizzas por fornecedor: `.stock-a8-values-pies`/`-qty-pies`/`-orders-pies` + `.stock-a8-pie-card`/`-title`/`-wrap`/`-svg`/`-bg`/`-slice` (4011-4127, 4315-4575) | [COBERTO] 02 §A8 (donuts por fornecedor, marcados mortos desde v101) |
| 27 | Rótulos-folha (callout) das pizzas: `.stock-a8-pie-label-line`/`-bg`/`-supplier`/`-value`/`-pct` (4174-4207, 4363-4367, 4539-4543) | [COBERTO] 02 §A8 (callout, a8PiePath) |
| 28 | v99 terceiro bloco "orders" + KPI `.purple` `#A17BE0` (4461-4474, 4498-4500) | [COBERTO] 02 §A8 (COMPRAS ATIVAS purple, bloco orders) |

### Ajustes · Odoo API (`#mod-odoo`, 4579-4626)

| # | Item (linha) | Status |
|---|---|---|
| 29 | `.odoo-settings-hero`/`-kicker`/`-title`/`-desc`/`-status`(.ok/.warn) , hero + badge de status (4583-4592) | [COBERTO] 06 §Odoo (updateOdooStatus, estados ok/warn) |
| 30 | `.odoo-settings-grid`/`-card`(.full)/`-card-head`/`-title`/`-sub`/`-fields`/`-field`/`-label`/`-help` (4594-4605) | [COBERTO] 06 §Odoo (5 cartões de config) |
| 31 | Inputs/select/textarea + `.odoo-password-row`/`.odoo-icon-btn` (toggle de senha) (4606-4612) | [COBERTO] 06 §Odoo (toggleOdooSecret) |
| 32 | `.odoo-settings-checks`/`.odoo-check-card`/`-title`/`-sub` , 3 checkboxes de sincronização (4613-4618) | [COBERTO] 06 §Odoo (Estoque/Produtos/Seriais/Vendas/Compras/Parceiros) |
| 33 | `.odoo-settings-note` (azul) + `.odoo-settings-result`(.ok/.err) , resultado do teste de conexão (4619-4624) | [COBERTO] 06 §Odoo (testOdooSettings, #odoo-settings-result) |

### Demandas , overrides (v110/v112/v114/v117, 4629-4689)

| # | Item (linha) | Status |
|---|---|---|
| 34 | v110 B7 **layout em LISTA/CARDS**: `.demand-b7`/`.demand-stock-list`/`-row`/`-model`/`-meta`/`-qty` (4630-4652) | **[GAP]** perícia documenta o B7 só como TABELA (`demand-stock-table`, 4 colunas); a versão card-list legada não é mencionada |
| 35 | v112 A4: turnover-card vira "Tempo de cobertura" (acento dourado) (4655-4664) | [COBERTO] 01 §A4 (cobertura A3-driven, monkeypatch v113) |
| 36 | v114 B2 unitário: `.demand-order-break`/`.demand-unit-model`/`-model-main`/`.demand-unit-sub`/`.demand-reserve-muted` (4667-4682) | [COBERTO] 03 §B2 (1 máquina/linha, reserva unitária) |
| 37 | v117 estoque negativo: `.demand-stock-table tr.stock-negative`/`td.is-negative`(vermelho) (4685-4688) | [COBERTO] 03 §B7 ("available pode ficar negativo") |

### Vendas , início do CSS (v118/v119, 4692-4800)

| # | Item (linha) | Status |
|---|---|---|
| 38 | `.sales-container` (grid 4 col) + `.sales-card`/`-header`/`-title`/`-subtitle`/`-body` (4694-4700) | [COBERTO] 04 §grid |
| 39 | v118 C1 hero: `.sales-c1`(botão)/`.sales-period-hero`/`-label`/`-value`/`-sub`/`-hint` + `.sales-placeholder` (4701-4710) | [COBERTO] 04 §C1 |
| 40 | Modal de período: `.sales-period-modal`/`-head`/`-body`/`-tabs`/`-tab`(.active)/`-pane`/`-grid`/`-field` (4711-4726) | [COBERTO] 04 §C1 (abas Dias/Meses/Anos/Trimestre) |
| 41 | `.sales-period-presets`/`.sales-period-preset` (botões de atalho de data) (4727-4729) | [COBERTO] 04 §C1 ("presets EXATOS" por aba) |
| 42 | Ações do modal: `.sales-period-actions`/`-cancel`/`-apply` (4730-4736) | [COBERTO] 04 §C1 (Cancelar / Aplicar período) |
| 43 | v119 chip topbar: `.sales-topbar`(sticky)/`.sales-period-chip`(+hover)/`-chip-icon`/`-chip-kicker` (4740-4800, corte) | [COBERTO] 04 §1 + 00 (chip C1, openSalesPeriodModal) |

---

## GAPS , consolidado

1. **[GAP] `.stock-free-placeholder` (2405-2437)** , card de estado-vazio "livre" no
   Estoque (título uppercase + texto), com borda tracejada. Nenhuma menção na perícia.
2. **[GAP] B7 layout legado em cards (v110, 4630-4652)** , `.demand-stock-list`/`-row`/
   `-model`/`-meta`/`-qty` (modelo + meta + qty dourado por card). A perícia descreve B7
   **apenas como tabela de 4 colunas**; a versão lista/card anterior não é citada.
3. **[GAP] `.serial-model-summary` (2398-2404)** , variante de card de resumo de
   seriais com acento azul `#8FB5F5`, distinta dos summary-cards padrão. Não documentada.
4. **[GAP] hover/center do donut A5 (2689-2692, 2775)** , `.stock-pie-slice:hover`
   (brightness + `transform-origin:center`) e `.stock-pie-center-title/-value` (rótulo/valor
   no miolo). Micro-interação e variante de rótulo central não citadas.
5. **[GAP] `.stock-a4-age-card:not(.filtered){display:none}` (v85, 2948-2951)** ,
   comportamento puramente em CSS: o card "Idade média por produto" do A4 fica oculto até
   haver busca ativa no A6. A perícia menciona o preenchimento por busca, mas não o
   ocultamento condicional via CSS.

**Observações menores (cobertura parcial, não bloqueantes):** variantes `.warning`
(A7, 3759), `.sold`/`.stock-serial-age` (2794-2795), redesenho minimalista de pizza
v82 (`total-label/value`, 2776-2777) , todas têm a feature-pai documentada, faltando
só o detalhe do estado/variante visual.

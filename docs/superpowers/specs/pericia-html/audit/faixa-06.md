# Auditoria de cobertura adversarial — Faixa 06 (linhas 12000–14400)

> Protótipo: `index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.971 linhas).
> Faixa auditada: **12000–14400**.
> Cruzamento com perícia existente: `00-design-system-shell.md`, `01-estoque.md`,
> `02-compras.md`, `03-demandas.md`, `04-vendas.md`, `05-agenda.md`,
> `06-permissoes-uf-odoo-extras.md`.
> Marcação: **[COBERTO]** quando a perícia já descreve o item; **[GAP]** quando falta.

## Resumo da faixa

A faixa contém **dois domínios**, ambos como pilhas de "versões" sobrescritas em runtime:

1. **ESTOQUE / A8 — Compras por fornecedor** (12000–13894): blocos `v99 → v104`.
   A versão viva é a **v104** (matriz por fornecedor + alertas personalizados). As
   versões anteriores (v99 pizzas, v101/v102/v103 tabelas) são **mortas/sobrescritas**
   pelo `ensureA8SupplierMatrixMarkup` mais recente.
2. **DEMANDAS — B1..B7** (13897–14400): bloco **v105** (primeira implementação completa
   da tela de Demandas: pedidos a entregar, reservas, mapa do Brasil, detalhe, overview).
   ATENÇÃO: o HTML tem uma **segunda implementação posterior (v116)** das reservas (fora
   desta faixa, ~14881+), que é a que a perícia 03-demandas documenta como viva.

Cobertura geral da faixa: **alta**. A perícia 02-compras cobre o A8 com profundidade
(incluindo versões mortas v99); a 01-estoque cobre o `renderStockLocations` (A2); a
03-demandas cobre a tela de Demandas. Os GAPs reais são pontuais: heurísticas de dado,
o sistema de reserva v105 (chave/semântica diferente da v116 documentada) e helpers de
cor temática do mapa.

---

## 1. ESTOQUE / A8 — Compras por fornecedor (12000–13894)

### 1.1 Cauda do render de pizza + A2 (12000–12068)
- **12000–12018** — cauda de `renderA8SupplierPie` (geometria de label SVG: `path` da
  linha-guia, `rect` de fundo 88×38, três `text`: supplier/value/pct; slice via
  `a8PiePath`). Versão v98/v99. **[COBERTO]** (02-compras documenta pizzas v99 como mortas).
- **12019–12021** — `DOMContentLoaded` → `renderA8SupplierValuePies()` (setTimeout 0). **[COBERTO]**
- **12027 `renderStockLocations(query)`** (v99, A2): card principal `#stock-total-block`
  **sempre mostra o valor GERAL** (`getStockTotalValue`), não muda ao filtrar local;
  `#stock-total-label`="Valor do estoque geral"; sub dinâmico ("Filtro ativo: X. Clique
  para voltar..." / "Somatório de todos os locais..."); lista `.stock-location-row`
  ordenada por valor desc, com nome/percentual/valor; estado vazio
  `#stock-location-empty`. **[COBERTO]** (01-estoque.md §A2, linhas 76–94, cita exatamente
  o comportamento "card sempre mostra valor GERAL" e a diferença vs versão 9736).

### 1.2 Agregações A8 v99 (12070–12136)
- **12070 `getA8SupplierBreakdown()`** — agrega `getActiveStockPurchaseOrders()` por
  fornecedor: `total,paid,unpaid,qtyTotal,qtyDelivered,qtyPending,qtyLate,activeOrders,
  lateOrders,onTimeOrders`; `isLate = pendingQty>0 && purchaseDaysUntil(arrivalDate)<0`;
  ordena por total desc → activeOrders desc → nome. **[GAP]** (perícia documenta o irmão
  `getA8OrderOverview` como morto, mas NÃO nomeia `getA8SupplierBreakdown`; é a base de
  todas as pizzas v99/v100).
- **12109 `getA8OrderOverview()`** — `{activeOrders,lateOrders,onTimeOrders,every}`,
  `every = orders.length/lateOrders` ("1 a cada N atrasa"). **[COBERTO]** (02-compras,
  "versões mortas", cita `stock-a8-late-ratio` e "1 a cada {every}").
- **12120 `renderA8SupplierValuePies()`** (v99) — desenha **8 pizzas** por fornecedor
  (TOTAL, PAGO, A PAGAR, COMPRADOS, CHEGARAM, A CHEGAR, ATRASADOS, ATIVAS) + 1 pizza
  ATRASOS (late vs on-time). **[COBERTO]** (02-compras documenta pizzas v99 mortas).
- **12138 `renderStockPurchasesOverview()`** (v99) — preenche KPIs textuais antigos
  (`stock-a8-total/paid/unpaid/qty-*`, `stock-a8-active-orders`, `stock-a8-late-ratio`
  "1 a cada N"). **[COBERTO]** (morta).

### 1.3 A8 v100 — pizzas sem "R$" no dado (12176–12258)
- **12178 `a8FormatPieValue(value, valueType)`** — `qty`→"N un.", `orders`→"N compra(s)",
  default → `a8MoneyShort`. **[COBERTO]** (02-compras nomeia `a8FormatPieValue`).
- **12184 `renderA8SupplierPie(containerId,legendId,data,totalLabel,valueType)`** —
  SVG 250×250, paleta de 6 cores, fatias + labels com linha-guia; vazio → "Sem dados".
  **[COBERTO]**.
- **12236 `renderA8SupplierValuePies()` (v100)** — 8 pizzas + ATRASOS, agora com
  `valueType` 'orders' nas pizzas de pedidos. **[COBERTO]**.

### 1.4 A8 v101 — CSS da matriz (12262–12560)
- Bloco `<style>` define a identidade visual da matriz A8 viva: grid-rows do
  `.stock-container` (`auto 420px 660px 540px 760px`), `.stock-a8` 760px, `.stock-a8-matrix`
  (auto/1fr), `.stock-a8-summary-strip` (6 col), `.stock-a8-kpi` + acentos `::before` por
  cor (gold/green/yellow/red/blue/purple), `.stock-a8-analytics` (320px/1fr),
  `.stock-a8-panel`, `.stock-a8-ranking-list`, `.stock-a8-rank-card`, `.stock-a8-risk-track`/
  `-fill` por status, `.stock-a8-toolbar`/`-search`/`-filter-btn`, `.stock-a8-table`
  (sticky thead, `min-width:1040px`), `.stock-a8-delivery-cell`, `.stock-a8-status`
  (ok/attention/critical), `.stock-a8-empty`; responsivo @1250px/@760px. **[COBERTO]**
  (02-compras descreve a UI viva: 6 KPIs + ranking + tabela, cores por classe, status pills).

### 1.5 A8 v101 — JS da matriz (12562–12764)
- Estado `A8_SUPPLIER_FILTER='all'`, `A8_SUPPLIER_QUERY=''`. **[COBERTO]**
- **12567 `a8SafeHtml`**, **12570 `a8CompactMoney`** (mi/mil/R$), **12580 `a8Number`**. **[COBERTO]**
- **12583 `ensureA8SupplierMatrixMarkup`** (v101) — reescreve `.stock-a8-body`:
  strip de 6 KPIs, painel "FORNECEDORES CRÍTICOS", painel matriz com busca + 4 filtros
  (Todos/Críticos/Pendentes/Atrasados) + tabela de **11 colunas** (Fornecedor, Ativas,
  %entregue, Comprado, Recebido, Pendente, Atrasado, Total, A pagar, Lead time, Status).
  **[COBERTO]** (substituída por v104; perícia documenta a final).
- **12638 `getA8SupplierRows`** (v101): status por `qtyLate>0||deliveryPct<60||unpaidPct>70`
  → critical; `riskScore = unpaid + qtyPending*1200 + qtyLate*2500 + lateOrders*9000`.
  **[COBERTO]** (perícia documenta a v104, que muda a fórmula). v101 é morta. **[GAP parcial]**
  — a fórmula de `riskScore`/status da v101 (distinta da v104) não está detalhada.
- **12667 `a8StatusLabel`** (Crítico/Atenção/OK), **12672 `setA8SupplierFilter`**,
  **12677 `filterA8SupplierRows`** (NFD + filtro), **12688 `renderA8SupplierRanking`**
  (top 6 por riskScore, barra normalizada por maxRisk), **12706 `renderA8SupplierTable`**,
  **12733 `renderA8SupplierMatrix`**, **12742 `renderStockPurchasesOverview`** (v101). **[COBERTO]**

### 1.6 A8 v102 — % financeiro a pagar (12768–12941)
- CSS `.stock-a8-finance-cell/-pct/-track/-fill` (paid/open/high) + `.stock-a8-finance-note`. **[COBERTO]**
- **12821 `a8FinanceLevel(unpaidPct)`**: ≤0→paid, ≥70→high, senão open. **12827 `a8FinanceLabel`**
  (Pago/Alto/Em aberto). **[COBERTO]** (02-compras col 8 "% financeiro a pagar", níveis
  paid/open/high citados).
- **12832 `ensureA8SupplierMatrixMarkup`** v102 — tabela de **12 colunas** (adiciona
  "% financeiro a pagar"). **12887 ranking** + barra finance. **12908 tabela** + célula
  finance. **[COBERTO]**.

### 1.7 A8 v103 — alertas por valor a pagar atrasado (12945–13400)
- CSS: `.stock-a8-overdue-cell/-value/-track/-fill`, `.stock-a8-alert-hint`,
  `.stock-a8-alert-modal` + grid/cards/preview/actions do modal. **[COBERTO]**
- **13054 `A8_ALERT_SETTINGS_KEY='stock_a8_alertas_valor_atrasado_v1'`** (localStorage). **[COBERTO]**
- **13056 `a8DefaultAlertSettings()`** = `{healthyMax:0, criticalFrom:50000}`. **[COBERTO]**
- **13059 getA8AlertSettings / 13073 setA8AlertSettings** (normaliza criticalFrom ≥ healthyMax+1). **[COBERTO]**
- **13078 `a8StatusFromOverdueValue(lateUnpaid)`**: ≤healthyMax→ok, ≥criticalFrom→critical,
  senão attention. **13085 `a8StatusLabel`** muda OK→**"Saudável"**. **[COBERTO]**
- **13090 a8FormatFullMoney**, **13095 ensureA8AlertModal** (modal de 2 inputs +
  preview de 3 faixas), **13134 refreshA8AlertPreview**, **13146 open / 13162 close /
  13166 save / 13173 reset**. **[COBERTO]**
- **13178 `ensureA8AlertHeaderButton()`** — injeta botão 3-pontos `#stock-a8-alert-settings-btn`
  (`stock-more-btn stock-a8-alert-btn`) no header do card A8. **[COBERTO]**
- **13192 ensureA8SupplierMatrixMarkup v103** — KPI novo **"VALOR A PAGAR ATRASADO"**
  (`stock-a8-overdue-unpaid`, vermelho) + `stock-a8-alert-hint`; tabela 11 col com
  "A pagar atrasado" + "Dias atraso". **[COBERTO]** (02-compras §6 KPIs cita o KPI vermelho).
- **13249 getA8SupplierRows v103** — usa `order.paymentDueDate || arrivalDate`;
  `isPaymentLate = unpaid>0 && daysUntilDue<0` → acumula `lateUnpaid`, `lateOrders`,
  `maxPaymentDelayDays`; `riskScore = lateUnpaid + maxPaymentDelayDays*1200 + unpaid*0.08`.
  **[COBERTO]** (02-compras linhas 203/208/212).
- **13294 filter / 13305 ranking (overdue) / 13324 tabela (overdue+dias) / 13358 matrix /
  13367 renderStockPurchasesOverview** (recomputa totais a partir das rows). **[COBERTO]**

### 1.8 A8 v104 — alertas personalizados por fornecedor (13404–13894)
- CSS `.stock-a8-alert-modal.supplier-mode` + grid de fornecedores (default-grid, supplier-card,
  rows com toggle/inputs/reset, source pill `.stock-a8-alert-source`). **[COBERTO]**
- **13444–13481** — **CSS de layout das Demandas v111/v112** (reposiciona B7 entre B3 e B4;
  grid-rows/columns do `#mod-demandas .demand-container`, B1..B7, `.demand-map-only`).
  **[COBERTO parcial]** (03-demandas descreve B7 entre B3/B4; o detalhamento dos grid-template
  v111→v112 não é exaustivo, mas o efeito final está).
- **13487 a8DefaultAlertSettings v104** → `{healthyMax,criticalFrom,defaults,suppliers:{}}`. **[COBERTO]**
- **13491 a8NormalizeAlertPair**, **13500 getA8AlertSettings** (defaults + map suppliers),
  **13517 setA8AlertSettings**, **13528 `getA8SupplierAlertConfig(supplier)`** (custom||default,
  source 'custom'/'default'), **13534 `a8StatusFromOverdueValue(lateUnpaid, supplier)`**
  (agora por fornecedor), **13541 a8SupplierConfigText**. **[COBERTO]**
- **13546 ensureA8AlertModal v104** — modal com inputs de padrão geral + preview +
  **lista por fornecedor** (busca, checkbox "Personalizar", inputs saudável/crítico, reset).
  **13598 refresh / 13609 open / 13635 close / 13639 `renderA8SupplierAlertRows` /
  13698 saveA8AlertSettings / 13722 `clearA8SupplierAlertOverrides` / 13728 resetA8AlertSettings**.
  **[COBERTO]** (02-compras §alertas cita clear 13722 e reset 13728).
- **13733 getA8SupplierRows v104** (+`alertCfg`), **13779 renderA8SupplierTable** (+pill
  de origem Personalizado/Padrão), **13816 renderA8SupplierRanking** (+source),
  **13837 ensureA8SupplierMatrixMarkup v104** (subtítulo "Alertas personalizados por
  fornecedor..."). **[COBERTO]** (02-compras documenta a v104 como viva, linhas 21/55/196+).

---

## 2. DEMANDAS — B1..B7, bloco v105 (13897–14400)

### 2.1 Estado + helpers (13899–13970)
- **13900–13907** — `DEMAND_FILTER='open'`, `DEMAND_SELECTED_ID=''`,
  **`DEMAND_RESERVATIONS_KEY='ig_demand_reserved_orders_v1'`**, `DEMAND_STOCK_QUERY=''`,
  `DEMAND_RESERVED_IDS` (Set de localStorage). **[GAP]** — a perícia documenta o sistema de
  reserva **v116** (chave `ig_demand_reserved_units_v2`, por UNIDADE, 14881/14938). Esta
  faixa contém a v105 **por PEDIDO** (chave `_orders_v1`), com semântica e chave diferentes,
  não distinguida na perícia (ver §2.3).
- **13909 demandSafe / 13913 demandMoney / 13917 demandNumber / 13918 demandNormalize /
  13921 demandParseDate** (dd/mm/yyyy + ISO) **/ 13932 demandFormatDate**. **[COBERTO]**
- **13937 `demandUnitValue(model)`** — heurística de preço unitário por palavra-chave:
  t600/esteira→**42000**, e200/eliptico→**18000**, c100/climb→**26000**, bike→**14500**,
  forca/force→**22000**, default→**16000**. **[GAP]** — a perícia menciona a função (03 linha 55)
  mas NÃO lista a tabela de preços. Impacto alto: define o `total` quando o dado bruto não
  traz valor, afetando todos os KPIs financeiros da tela.
- **13946 `demandInferQty(row,idx)`** — qty heurística (t600→1+idx%2, e200→1+idx%3, senão 1).
  **[COBERTO parcial]** (perícia diz "default 1"; a heurística t600/e200 não é detalhada). **[GAP leve]**
- **13953 demandStatus** (done/cancel/draft/sale), **13960 demandIsLate** (pendingQty>0 &&
  dueDate<hoje), **13967 demandBaseRows** (window.MALL || MALL || DEMO). **[COBERTO]**

### 2.2 Pedidos e tabela B2 (13971–14131)
- **13971 `getDemandOrders()`** — mapeia base para `{id,client,model,uf,dueDate,status,qty,
  deliveredQty,pendingQty,total,pendingValue}`; `total = value||amount_total||total ||
  demandUnitValue*qty`; `pendingValue = total*(pendingQty/qty)` (0 se cancel). **[COBERTO]**
- **13994 `demandFilteredOrders()`** — filtro botão (open/late) + UF + busca textual;
  ordena por prazo asc (sem prazo → fim). **[COBERTO]**
- **14013 setDemandFilter**, **14018 demandStatusMarkup** (Entregue/Atrasado/Pré-venda/
  A entregar). **[COBERTO]**
- **14024 saveDemandReservations / 14027 isDemandReserved / 14030 toggleDemandReservation(id)**
  — reserva **por PEDIDO** (v105). **[GAP]** (a perícia documenta toggle por unidade v116).
- **14038–14055 demandStockText/Compact/Key/Matches** — normalização e match fuzzy de
  modelo↔estoque. **[COBERTO]** (03-demandas nomeia `demandStockMatches`).
- **14057 getDemandReservedOrders**, **14060 `demandFindStockKeyForOrder(order,stockRows)`**
  — match por chave exata → senão score (compacto 100, contido 45, token 8, token-com-dígito 18;
  desempate por qty). **[COBERTO parcial]** — função nomeada na perícia, mas os **pesos de
  score** (100/45/18/8) não estão descritos. **[GAP leve]**
- **14084 `getDemandReservedCountMap(stockRows)`** — "cada caixinha marcada reserva 1 unidade".
  **[COBERTO]** (03-demandas nomeia a função, vínculo B2↔B7).
- **14093 demandOrderReserveMarkup(order)** (checkbox custom + pílula "Reservado"),
  **14097 `renderDemandTable(orders)`** — colunas Cliente/Modelo/UF/Prazo/Status/Reserva/
  Pendente(R$); clique na linha → `selectDemandOrder`; subtítulo dinâmico com contagem +
  reservados. **[COBERTO]** (perícia documenta a tabela B2, com a ressalva de que descreve
  a versão por-unidade v116).

### 2.3 Mapa do Brasil B4 (14133–14271)
- **14133 DEMAND_UF_FILTER**, **14135 demandStateLabel** (`UF — Nome` via UF_FULL),
  **14138 `demandStateMap(openOrders)`** — agrega por UF (value/orders/items/late) +
  `max`. **[COBERTO]**
- **14155 `demandGetBaseTone()`** + **14159 `demandMixColor(base,target,amount)`** —
  helpers de cor: tom base muda para `palette-silver` (rgb 185,189,199) vs gold
  (200,169,110); mistura linear RGB. **[GAP]** — a perícia descreve `demandStateFill`
  como "escala sequencial de vermelho", mas os helpers de tom temático (palette-silver,
  theme-light) e a mistura não estão documentados.
- **14164 `demandStateFill(value,max)`** — neutro (theme-light vs dark) quando value≤0;
  low(88,58,58)→mid(142,54,54)→high(205,52,52) por ratio com quebra em 0.55. **[COBERTO parcial]**
  (escala vermelha citada; os stops RGB e a quebra 0.55 não). **[GAP leve]**
- **14176 setDemandUfFilter** (toggle), **14181 renderDemandMapTooltip** (segue mouse,
  clamp ao wrap), **14190 hideDemandMapTooltip**, **14196 renderDemandMapSelection**
  ("Brasil inteiro" vs UF, botão clear), **14216 renderDemandMapRanking** (botões por
  value desc, oculto na v106), **14226 `renderDemandMap(openOrders)`** — desenha paths
  GEO + labels UF (exceto DF), eventos click/keydown/mousemove; subtítulo dinâmico.
  **[COBERTO]** (03-demandas §mapa, renderDemandMap 14226, tooltip 14181, ranking 14216,
  fill, "v106 somente mapa").

### 2.4 Detalhe B5 + Overview B6 (14273–14400)
- **14273 selectDemandOrder**, **14277 demandPercent**, **14280 `demandDeadlineInfo(order)`**
  (Sem prazo / Faltam N dias / Vence hoje / Passou N dias), **14293 demandOrderStatusText**,
  **14301 demandOrderStatusClass**. **[COBERTO]** (03-demandas nomeia demandDeadlineInfo).
- **14307 `renderDemandOrderDetails(order)`** — painel B5: cliente, modelo·UF·prazo,
  pílula de status, total, qty, %entregue/%pendente (barras), card de prazo (classe late).
  **[COBERTO]**.
- **14351 demandPieSlicePath**, **14361 `renderDemandOverview(openOrders)`** — B6:
  reescopa por UF se filtrada; KPIs total ativo / contagem / média / mais caro / %atraso;
  pizza atrasados vs no prazo (#F17A7A/#6FE0B0) + legenda. **[COBERTO]** (03-demandas
  nomeia demandPieSlicePath, renderDemandOverview, demand-b6-pie).

---

## Contagem

- **Itens inventariados na faixa:** ~135 (funções, KPIs, tabelas, blocos CSS, modais,
  estado, heurísticas de dado), distribuídos em A8 v99→v104 (~80) e Demandas v105 (~55).
- **GAPs:** **8** (3 substantivos + 5 leves/parciais).

### Lista de GAPs
1. **[GAP]** `demandUnitValue` (13937) — tabela de preço por modelo (42000/18000/26000/
   14500/22000/16000) não documentada; define o `total` de fallback de toda a tela.
2. **[GAP]** Sistema de reserva **v105 por PEDIDO** (`ig_demand_reserved_orders_v1`,
   13902; `toggleDemandReservation(id)` 14030) — perícia só documenta a v116 por UNIDADE
   (`ig_demand_reserved_units_v2`); chave e semântica divergentes não distinguidas.
3. **[GAP]** `demandGetBaseTone` (14155) + `demandMixColor` (14159) — coloração do mapa
   B4 sensível a tema/paleta (palette-silver, theme-light) não documentada.
4. **[GAP]** `getA8SupplierBreakdown` (12070) — função-base das pizzas A8 v99 não nomeada
   na perícia (apenas o irmão `getA8OrderOverview`).
5. **[GAP leve]** `demandFindStockKeyForOrder` (14060) — pesos do score fuzzy (100/45/18/8)
   não descritos; `demandStateFill` (14164) — stops RGB e quebra 0.55 não descritos;
   `demandInferQty` (13946) — heurística t600/e200 não detalhada; `getA8SupplierRows` v101
   (12638) — fórmula de riskScore/status distinta da v104 não detalhada.

> Conclusão: a faixa 12000–14400 está **bem coberta** pela perícia (02-compras para o A8,
> 01-estoque para o A2, 03-demandas para Demandas). Nenhum bloco DOM/feature viva escapou;
> os GAPs são de **fidelidade de dado/versão** (heurísticas de preço/qty, cor temática do
> mapa e a coexistência das duas implementações de reserva v105/v116).

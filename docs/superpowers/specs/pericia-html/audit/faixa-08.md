# Auditoria de cobertura , Faixa 08 (linhas 16800-18971 FIM)

> Fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Faixa: 16800 ate 18971 (fim do arquivo, `</body></html>`).
> Conteudo: blocos de `<style>`+`<script>` versionados do modulo **VENDAS** (`#mod-vendas`),
> versoes v127 ate v140, cobrindo os subcards C5, C6, C7, C8, C9 e C10.
> Cruzamento: `docs/superpowers/specs/pericia-html/04-vendas.md` (principal) + 00/03/06.

## Resumo executivo

A faixa e quase toda re-renderizadores e CSS dos cards de Vendas. A pericia
`04-vendas.md` cobre **muito bem** C5, C6, C7 e C10 (incluindo a interatividade
v140 do "C7 filtra pagamentos"). O **buraco material** esta em **C8/C9
(comparativos)**: a pericia documenta apenas o IIFE **v131** como fonte ativa,
mas `window.renderSalesCompareCards` e **sobrescrito 3x** (v131 -> v132 -> v134),
e a versao que de fato roda e a **v134**, que (a) gera dados 100% ficticios
proprios (mockRows), (b) usa um conjunto de marcas DIFERENTE do v131, e (c)
**implementa a logica de delta/comparacao percentual entre os dois quadros** , a
mesma logica que a pericia afirma explicitamente **nao existir** (04-vendas.md
l.411-413: "sem logica de delta"). Essa conclusao da pericia esta materialmente
errada para o arquivo desta faixa.

---

## INVENTARIO

### Bloco v127 , C5 (modalidade) + C7 (barras de itens) [l.16800-17171]

1. **CSS C7 mini-grafico de barras** (l.16800-16982): `.sales-c7-min-gridline`
   (linha zero dourada `.zero`), `.sales-c7-min-bars` (flex, gap 18px),
   `.sales-c7-min-bar` (gradiente gold->gold2, radius 10/10/3/3), `.short`
   (valor acima da barra quando baixa), `.sales-c7-min-xlabel` (clamp 4 linhas
   `-webkit-line-clamp:4`), `.sales-c7-min-tick`, `.sales-c7-min-foot`,
   `.sales-c7-empty`. [COBERTO , 04-vendas secao 7]
2. **CSS C5 modalidade** (l.16936-16961): `.sales-c5-modality` badge pill;
   `.digital` azul #8FB5F5, `.presencial` verde #6FE0B0; larguras de coluna da
   tabela C5 (7 colunas via `nth-child`). [COBERTO , l.216, 379]
3. `sampleClosedOrders` (l.16987-16996): 8 pedidos ficticios `[cliente, uf,
   margem, total, vendedor, diasAtras, modelo, qty]` (ESTEIRA T600, ELIPTICO
   E200, BIKE SPINNING S50, etc.). [COBERTO , l.224, 401]
4. `salesClosedOrderRows()` (l.16997-17035): monta pedidos fechados do periodo.
   Cruza `demandBaseRows()`/MALL/DEMO com `getDemandOrders()`; deriva model, qty,
   total (fallback `salesModelPrice*qty`), cost, date, status, uf, client,
   seller, rawModality; calcula `margin=((total-cost)/total)*100`; aplica
   `salesC6Modality`; filtra sem-data e cancelado/draft; ordena por data desc;
   **limita a 40** (`slice(0,40)`); se vazio usa sampleClosedOrders. [COBERTO , l.222-224]
5. `salesC5RowText(row,idx)` (l.17036-17042): texto normalizado para busca
   (cliente/uf/margem/valor/vendedor/modalidade/data). [COBERTO , l.226-227]
6. `renderSalesC5()` (l.17043-17079): tabela de pedidos fechados; busca client-side
   via `#sales-c5-search`; subtitulo "{n} de {total} pedidos"; classe de margem
   `low`(<25)/`mid`(<32); coluna modalidade Digital/Presencial. [COBERTO , secao 5]
7. `c7NiceMax(value)` (l.17080-17087): arredonda o topo do eixo para escala
   "bonita" 1/2/5/10 x potencia de 10. [GAP , nao detalhado na pericia]
8. `c7AxisLabels(maxValue)` (l.17088-17095): 6 ticks (0..max em 5 passos),
   posicao% e label pt-BR. [GAP , nao detalhado]
9. `c7ShortLabel(value)` (l.17096-17100): trunca modelo em 28 chars + reticencia. [PARCIAL]
10. `salesC7Data()` (l.17101-17113): agrega itens por modelo (qty/value/orders),
    ordena por qty desc, **top 22** (`slice(0,22)`). [COBERTO , secao 7]
11. `renderSalesC7()` v127 (l.17114-17153): renderiza eixo + barras estaticas
    (`<div>`), titulo "Quantidade vendida", rodape "Itens do periodo selecionado
    no C1" / "Mesmo padrao do B8". [COBERTO] (substituido depois pela v140)
12. Patch de `window.renderSalesDashboard` (l.17154-17169) encadeando C5/C6/C7. [COBERTO]

### Bloco v128 , C6 expandido (digital/presencial/maior venda) [l.17175-17343]

13. **CSS C6** (l.17175-17303): `min-height/height:620px`, grid expandido 3
    linhas (`1.28fr 1fr 1fr`), `.sales-c6-indicator`, `.sales-c6-detail-list`
    (2 colunas), cores por tipo: `.digital strong` azul, `.presencial strong`
    verde, `.biggest strong` gold3. Responsivo 1120/900/560. [COBERTO , secao 6]
14. `renderSalesC6()` v128 (l.17308-17340): 3 indicadores , **Maior venda**
    (biggest = max total; preenche value/sub/client/uf/margin/seller/date),
    **Venda digital** (pct=digital.total/total, value, orders, ticket=total/count),
    **Venda presencial** (idem). Subtitulo "{periodo} · {n} pedidos". [COBERTO , l.237-254]

### Bloco v129 , reposicionamento de grid C2/C3/C4/C5/C6/C7 [l.17347-17384]

15. **CSS grid-row/column** (l.17347-17383): C2 row1; C3/C4/C5 row2; C7 col 1/5
    row3; C6 col 5/7 row3. Responsivo. [COBERTO , secao "Layout/grid" l.42-47]

### Bloco v131 , C8/C9 comparativos + modal seletor [l.17387-17828]

16. **CSS C8/C9** (l.17387-17466): `aspect-ratio:1/1`, height 590px; C8 col1/3
    row4, C9 col3/5 row4; `.sales-compare-menu-btn` (3 pontinhos), `.sales-compare-kpis`
    (3 KPIs), `.sales-compare-pie-wrap` (SVG drop-shadow), `.sales-compare-slice`
    (hover scale 1.012), rotulos com linha+elbow+dot, `.sales-compare-empty`. [COBERTO , secao 9]
17. **CSS modal `#modal-sales-compare`** (l.17431-17465): cabecalho, abas de
    periodo, panes, botoes aplicar/cancelar; esconde `#sales-compare-period` antigo. [COBERTO , l.339-348]
18. IIFE v131 (l.17468-17827): COMPARE_COLORS (10), COMPARE_UFS (27),
    `SALES_COMPARE_CONFIG={c8:{uf:'SP'...},c9:{uf:'RJ'...}}`. Wrappers locais
    money/number/percent/date/iso/quarter/semester. [COBERTO , l.318-319]
19. `ensureCompareModalUi()` (l.17518-17601): injeta dinamicamente o seletor de
    periodo rico (5 abas dias/meses/anos/trimestres/semestres) + presets +
    botao "Usar periodo atual do C1" + botao Cancelar. [COBERTO , l.342-345]
20. `populateCompareStates`, `hydrateComparePeriod`, `readComparePeriodFromModal`,
    `setCompareMode`, `salesCompareUseCurrentPeriod`, `salesCompareQuickPeriod`
    (presets today/last7/last30/last90/currentMonth/lastMonth/last6Months/
    currentYear/lastYear) (l.17602-17665). [COBERTO , secao 9]
21. `compareAllRows()` (l.17672-17705): monta linhas reais + **fallback demo 12
    UFs x 5 marcas** (Johnson, Long Life, XMaster, Body Joy, Vision). [COBERTO , l.334-336]
22. `compareRows(card)`, `compareBrandData(rows)` (**top 8** marcas, l.17718-17726),
    `distributeLabels` (anti-colisao), `renderComparePie` (viewBox 560x320, cx280
    cy158 r78), `renderCompareCard` (KPIs revenue/avg-order/avg-margin),
    `openSalesCompareModal`/`closeSalesCompareModal`/`applySalesCompareModal`.
    [COBERTO , secao 9] **(porem este renderer e sobrescrito por v132/v134, ver GAPs)**

### Bloco v132 , C8/C9 mais juntos + DADOS FICTICIOS [l.17832-18020]

23. **CSS** (l.17832-17879): `column-gap:4px; row-gap:8px`; **badge permanente
    "DADOS FICTICIOS"** via `::after` em `.sales-compare-selected` (l.17845-17860,
    azul). [GAP , a pericia cita "dados ficticios" generico (l.400) mas nao o
    badge CSS permanente coladado em todo card C8/C9]
24. **IIFE v132** (l.17882-18019): **SOBRESCREVE `window.renderSalesCompareCards`**.
    Novo conjunto de constantes: `UF_MULT` (27 UFs), `BRANDS=['Johnson','Movement',
    'Kikos','Life Fitness','Technogym','Athletic']` (DIFERENTE do v131/fallback),
    `BRAND_MULT`. `mockRows(card)` gera vendas **sinteticas deterministas** por
    UF/periodo (base 218000 c8 / 182000 c9, ufMult, periodFactor log10, wobble,
    marginRate). `renderPie` (viewBox 600x350, cx300 cy172 r86). `renderCard`
    sempre remove `is-empty` (nunca vazio). [GAP , a pericia trata v131
    compareAllRows/compareBrandData como caminho de dado ativo; na verdade o ativo
    e este gerador mock v132]

### Bloco v133 , relabel margem + altura 760 [l.18023-18127]

25. **CSS** (l.18023-18109): C8/C9 `height:760px`, `aspect-ratio:auto`; pizza
    `min-height:485px`; KPIs maiores. [GAP , altura final 760px nao registrada
    (pericia diz 590px, l.47)]
26. **Script v133** (l.18112-18126): patch DOM que **renomeia o label do KPI
    avg-profit para "Margem de lucro media"** e re-chama renderSalesCompareCards.
    [GAP , nao mencionado]

### Bloco v134 , DELTA comparativo entre os dois quadros [l.18131-18417]

27. **CSS** (l.18131-18229): `.sales-compare-delta` badge (positive verde /
    negative vermelho / neutral); `.sales-compare-vs-pill` ("vs {UF}");
    `.sales-compare-label-delta-positive/negative/neutral` (cores das 3a linha
    do rotulo da pizza); `.sales-compare-chart-title::after` = subtitulo
    permanente **"variacao vs outro quadro"** (l.18217-18225). [GAP]
28. **IIFE v134** (l.18231-18417): **SOBRESCREVE renderSalesCompareCards de novo
    (versao ATIVA FINAL).** Reusa BRANDS/UF_MULT/BRAND_MULT/mockRows.
    - `metrics(card)`: total/cost/count/avgOrder/avgMargin/brands/brandMap.
    - `deltaPct(current,other)`, `deltaClass`, `deltaText` (sinal +/-, "0,0%"). [GAP]
    - `ensureDelta(id,delta)`: cria/atualiza `<em class="sales-compare-delta">`
      em cada KPI com a variacao % vs o outro quadro. [GAP]
    - `distribute()` REESCRITO (l.18339-18351): espacamento uniforme centralizado
      (diferente do `distributeLabels` anti-colisao do v131). [GAP]
    - `renderPie(svg,data,total,otherBrandMap)`: viewBox **760x430**, cx380 cy214
      r96; cada rotulo de fatia tem **3 linhas de texto** (nome / valor·pct /
      "{delta}% vs outro" colorido). Tooltip inclui "{delta} vs outro quadro". [GAP]
    - `getUf` normaliza **BSB->DF** (l.18386). [GAP , minor]
    - `renderCard(card,own,other)`: subtitulo, `selected` com pill "vs {otherUf}",
      3 KPIs + 3 badges de delta, pizza com delta. [GAP]
    - `renderSalesCompareCards()`: c8 vs c9 cruzados (own/other). [GAP]

### Bloco v135 / v136 , CSS de fonte dos rotulos da pizza [l.18421-18477]

29. CSS puro: aumenta fonte dos `label-name/label-meta/label-delta` e ajusta
    `label-line` (v135 l.18421-18445, v136 l.18449-18477). [GAP , minor, cosmetico]

### Bloco v139 , C10 formas de pagamento [l.18481-18683]

30. **CSS C10** (l.18481-18607): card por forma de pagamento, barra lateral
    colorida por tipo (`.pix` verde, `.credito` azul, `.debito` roxo, `.cheque`
    amarelo, default/boleto gold); `.sales-c10-pct` pill; `.sales-c10-pay-value`. [COBERTO , secao 8]
31. **IIFE v139** (l.18609-18683): `PAYMENT_FORMS` (boleto/pix/credito/debito/
    cheque), `normalizePayment` (NFD, regex), `inferPayment` (heuristica: total>=
    120000->boleto; SP/RJ->credito/pix alternado; DF/GO->boleto/pix; senao hash),
    `renderSalesC10` lista 5 cards + total. [COBERTO , l.288-303]

### Bloco v140 , C7 clicavel filtra C10 [l.18687-18969]

32. **CSS** (l.18687-18771): C10 sobe para row3, C6 desce para row4; barras C7
    viram `<button>` (`appearance:none`), estados hover/focus/active (ring
    dourado), `.sales-c7-min-clear`, `.sales-c10-selected-product`. [COBERTO , l.53-63]
33. **IIFE v140** (l.18773-18968): re-declara PAYMENT_FORMS/normalizePayment/
    inferPayment/c7NiceMax/c7AxisLabels; `SALES_C7_SELECTED_MODEL`;
    `salesC7DataV140` (top 22); `currentRowsForC10()` filtra pedidos pelo modelo
    selecionado; `salesSelectC7Model` (toggle), `salesClearC7Model`;
    **`renderSalesC7` v140** (barras como botoes, aria-pressed, filtro ativo no
    subtitulo/rodape, botao "Limpar produto"); **`renderSalesC10` v140** (recalcula
    por forma de pagamento do produto selecionado; subtitulo com produto; total "do
    produto X"). [COBERTO , secoes 7 e 8]
34. Fim do documento: `</body></html>` (l.18971-18972). [COBERTO]

---

## GAPS CONSOLIDADOS

- **G1 [CRITICO]** Pericia afirma C8/C9 "sem logica de delta" (04-vendas l.411-413),
  mas v134 (l.18231-18417) implementa delta completo (badges KPI + rotulos de pizza
  "{delta}% vs outro" + pill "vs {UF}"). Conclusao da pericia materialmente errada.
- **G2 [ALTO]** `renderSalesCompareCards` e sobrescrito 3x (v131->v132->v134); a
  versao ATIVA e v134, nao v131. Pericia documenta so v131.
- **G3 [ALTO]** Fonte de dado real do C8/C9 (v131 compareAllRows/compareBrandData)
  esta MORTA; o ativo e o gerador 100% mock `mockRows` (v132/v134) com marcas
  diferentes (Johnson/Movement/Kikos/Life Fitness/Technogym/Athletic).
- **G4 [MEDIO]** v133: KPI avg-profit renomeado para "Margem de lucro media" via
  patch DOM (l.18112-18126); altura final C8/C9 = 760px (pericia diz 590px).
- **G5 [MEDIO]** Badges/labels permanentes via CSS `::after`: "DADOS FICTICIOS"
  (v132 l.17846) e "variacao vs outro quadro" (v134 l.18218); `distribute()` do
  v134 reescrito (espacamento uniforme) vs anti-colisao do v131.
- **G6 [BAIXO]** Algoritmo de eixo "nice max" do C7 (`c7NiceMax`/`c7AxisLabels`,
  escala 1/2/5/10) e normalizacao BSB->DF (v134) nao detalhados.

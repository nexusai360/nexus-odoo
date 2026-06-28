# Auditoria de cobertura adversarial , FAIXA 07 (linhas 14400 a 16800)

> Objetivo: garantir que NADA da faixa 14400-16800 escapou da perícia existente
> (`00` a `06`). Cada item marcado **[COBERTO]** (já descrito na perícia, com
> referência) ou **[GAP]** (ausente ou descrito de forma incompleta a ponto de
> impedir reconstrução fiel).
>
> A faixa contém o fim do módulo **Demandas** (A4 cobertura de estoque, B7, B8 em
> 7 camadas de override) e o início do módulo **Vendas** (C1 período global, C2
> KPIs, C3 pizza por estado, C4 pizza por marca, C5 tabela de pedidos fechados,
> C6 modalidades) , tudo em `<script>`/`<style>` injetados por versão (v112 a v126).

---

## 1. Mapa da faixa (blocos por versão)

| Linhas | Bloco | Tipo | Tema |
|---|---|---|---|
| 14400-14538 | resto de Demandas (B7/B1/orquestração) | script | `getDemandStockRows` (1ª def), `renderDemandStockList`, `renderDemandasDashboard`, listeners + MutationObserver |
| 14541-14675 | v112 | script | A4 "Tempo de cobertura" sensível ao **A6** (`renderStockA4AgeAndTurnover`) |
| 14678-14824 | v113 | script | A4 "Tempo de cobertura" sensível ao **A3** (`renderStockCoverageFromA3`) + monkeypatch |
| 14827-14917 | v114 | script | B2 por unidade; `demandUnitRowsFromOrders`, `renderDemandTable` (2ª def, vence) |
| 14920-15036 | v116 | script | reservas por unidade em localStorage; `getDemandStockRows` (2ª def, vence) |
| 15039-15154 | v118 | script | B8 v1 (barras horizontais) `renderDemandB8Chart` |
| 15157-15189 | , | HTML | modal de período do B8 (`#demand-b8-period-modal`) |
| 15192-15316 | v119 | script | B8 barras verticais + modal + período custom |
| 15319-15392 | v120 | script | B8 "ref-style" |
| 15395-15518 | v121 | script | B8 "site-style" + **21 vendas fictícias** (`sampleSales`) |
| 15521-15701 | v122 | style | CSS B8 "minimal-style" (vars de plot, responsivo) |
| 15706-15743 | v123 | style | CSS cards de indicadores do B8 + barras-botão |
| 15745-15856 | v122 (2º) | script | B8 minimal-style render + **+12 vendas fictícias** (`moreSampleSales`) |
| 15859-16003 | v123 | script | cards de indicadores por modelo + barras viram `<button>` |
| 16006-16053 | v124 | script | B8 filtra só pedidos ativos |
| 16056-16161 | v114 | script | **Vendas C1**: seleção global de período (`SALES_PERIOD`) |
| 16164-16310 | v120 | script | **Vendas C2**: KPIs do período |
| 16313-16439 | v121 | script | **Vendas C3**: pizza por estado |
| 16442-16535 | v123 | script | **Vendas C4**: pizza por marca |
| 16539-16658 | v125 | script | **Vendas C5**: tabela de pedidos fechados |
| 16661-16703 | v126 | script | **Vendas C6**: modalidade + maior pedido (superada por v128 fora da faixa) |
| 16707-16800+ | v127 | style | CSS layout C5/C6/C7 (grid 6 colunas) |

---

## 2. Inventário detalhado e cruzamento

### 2.1 Demandas , A4 / B7 / B2 (14400-15036)

1. **[COBERTO]** `getDemandStockRows` (1ª def, 14410) e a versão que vence v116
   (14974). Fonte `getProductsWithTotals`→`STOCK_PRODUCTS`→`STOCK_SERIALS`,
   dedup por `demandStockKey`, cruzamento com reservas do B2, `available =
   totalStock - reserved`, `reservedPct`. , `03-demandas.md` §8 (l.255-261).
   - **[GAP menor]** Existem **DUAS definições** de `getDemandStockRows` na
     faixa (14410 e 14974); a perícia cita só a v116. A 1ª (14410) usa
     `getDemandReservedOrders().find(...)` para repor linhas de reserva sem
     estoque (`category:'Reserva B2'`), a v116 usa `getDemandReservedUnitRows`.
     A perícia documenta "DUAS definições" só para `renderDemandTable`, não aqui.
2. **[COBERTO]** `renderDemandStockList` (14471): tabela B7, subtítulo
   `N modelos · N disponíveis · N reservados`, linha `stock-negative` quando
   `available<0`, mini-barra `% reservado`. , `03-demandas.md` §8.
3. **[COBERTO]** `renderDemandasDashboard` (14498): KPIs B1
   (`demand-b1-value/subtitle/detail`), open/late orders, pending items,
   `avgTicket = pendingValue/openOrders.length`. Orquestração. , `03-demandas.md`
   §3 e tabela de KPIs.
4. **[COBERTO]** `MutationObserver` no `document.body` (attributeFilter
   `class`) re-renderizando o dashboard a cada troca de tema. , `03-demandas.md`
   l.40.
5. **[COBERTO]** A4 v112 `renderStockA4AgeAndTurnover` (14638): card "Idade
   média" (média `getStockSerialAgeDays` dos seriais do A6) + card cobertura
   `(estoque/demanda)*30`. , `01-estoque.md` §5 (l.167, 223).
6. **[COBERTO]** A4 v113 `renderStockCoverageFromA3` (14773) + monkeypatch
   (14802) que envelopa `renderStockSummary`/`renderStockProductTable`. Fórmula,
   formatos `∞ dias`/`999+ dias`/`0 dias`, escopo por busca/local A3. ,
   `01-estoque.md` §5 (l.169-175).
7. **[COBERTO]** Helpers de matching `stockCoverageNorm/Tokens/ModelMatches/
   MatchAnyModel` (14543-14576) e `stockA3Coverage*` (14680-14771): normalização
   NFD, tokens, match por inclusão/token. , implícito em `01-estoque.md` (lógica
   de cobertura A3-driven), mas o **detalhe do algoritmo de token-match
   bidirecional** (`stockA3CoverageModelMatch`, 14730, tokens com `length>=2 ||
   /^\d+$/`) não é citado. **[GAP menor]**
8. **[COBERTO]** B2 v114: `demandUnitRowsFromOrders`, `demandPendingUnitCount`
   (`ceil`, min 1), `unitId = id::unit-N`, `renderDemandTable` (explode por
   unidade), colunas Cliente/Modelo/UF/Prazo/Status/Reserva/Valor-pendente,
   `.demand-order-break`. , `03-demandas.md` §7 (l.87-126).
9. **[COBERTO]** Reservas v116: `DEMAND_UNIT_RESERVATIONS_KEY_V2 =
   'ig_demand_reserved_units_v2'`, regex `/::unit-\d+$/`, `isDemandReserved`,
   `toggleDemandReservation`, `getDemandReservedCountMap`, vínculo B2↔B7. ,
   `03-demandas.md` §7 e §8 (l.117-120, 275).

### 2.2 Demandas , B8 (15039-16053)

10. **[COBERTO]** As 7 camadas de override do B8 (v118→v124), versão efetiva
    v122+v123+v124. , `03-demandas.md` §9 (l.281).
11. **[COBERTO]** Modal de período B8 (HTML 15157): presets `all/base_month/
    base_30/base_90/base_year/custom`, inputs de data, fechar por X/Cancelar/
    backdrop/Escape. , `03-demandas.md` §9 (l.314-321).
12. **[COBERTO]** `demandB8Bounds` ancorado na **data máxima do dataset** (não
    em hoje); custom com fim +1 dia inclusivo. , `03-demandas.md` l.320.
13. **[COBERTO]** `demandB8NiceMax`/`axisLabels` (1/2/5/10 × potência de 10, 6
    ticks). , `03-demandas.md` l.306.
14. **[COBERTO]** Cards de indicadores por modelo v123 (`b8Stats`,
    `b8RenderInsights`): entregue/a-entregar(no prazo)/atrasado, barras viram
    `<button>` com `selectDemandB8Model`. , `03-demandas.md` §9 (l.286-293, 309).
15. **[COBERTO]** v124 `demandB8IsActiveOrder` (pending>0, exclui done/cancel/
    draft), sufixo "pedidos ativos". , `03-demandas.md` l.299, 311.
16. **[GAP]** **Segundo lote de vendas fictícias (`moreSampleSales`, v122,
    15749-15762): +12 modelos** (ESTEIRA MOVEMENT R4, BIKE ERGOMÉTRICA B75,
    PECK DECK P80, etc.) concatenados por cima dos 21 do v121, com guarda
    `__DEMAND_B8_MORE_SAMPLE_PATCHED__`. A perícia (`03-demandas.md` l.298) só
    menciona "~21 vendas fictícias" do v121. **O total injetado é 21+12 = 33**,
    em dois patches encadeados. Reconstrução fiel precisa dos dois arrays.
17. **[GAP menor]** Detalhe do CSS v122 "minimal-style" (15521-15701): variáveis
    de plot exatas (`--plot-top:34px`, `--plot-bottom:132px`, `--plot-left:58px`),
    largura de barra 44px, `min-width:max(100%, bar-count*126px+100px)`, label
    truncado por `-webkit-line-clamp:4`, e os overrides de `grid-template-rows`
    do `.demand-container` por breakpoint (570px→660px conforme v122/v123). A
    perícia descreve o gráfico mas não esses valores de CSS.

### 2.3 Vendas , C1 período global (16056-16161)

18. **[COBERTO]** `SALES_PERIOD={mode,start,end,label}`, `SALES_PERIOD_STORAGE_KEY
    ='ig_sales_period_v1'`, `loadSalesPeriod` (default "Últimos 30 dias"),
    `renderSalesDashboard` (atualiza chip C1). , `04-vendas.md` §1.
19. **[COBERTO]** 5 abas do modal (dias/meses/anos/trimestres/semestres),
    `applySalesPeriodFromModal`, validações (`data inicial > final` → alert),
    helpers `salesQuarterStart/End`, `salesSemesterStart/End`. , `04-vendas.md`
    §1 (l.102-111).
20. **[COBERTO]** Presets `salesQuickPeriod` (today/last7/last30/last90/
    currentMonth/lastMonth/last6Months/currentYear/lastYear). , tabela exata em
    `00-design-system-shell.md` l.244-255.

### 2.4 Vendas , C2 KPIs (16164-16310)

21. **[COBERTO]** `renderSalesC2`: total vendido, margem
    `((vendido-custo)/vendido)*100`, itens, média itens/pedido, ticket médio. ,
    `04-vendas.md` §2.
22. **[COBERTO]** `salesModelPrice` (16184: esteira/t600 42000, elíptico/e200
    18000, climb/c100 26000, bike 14500, força 22000, default 16000) e
    `salesModelCost` heurística (28500/11200/16500/9100/14200, senão price*0.64).
    , `04-vendas.md` l.138-140.
23. **[COBERTO]** `salesRowsFromDemand` + `salesRowsFromSerials` (fallback C2 por
    seriais vendidos) + `salesRowsInCurrentPeriod`. , `04-vendas.md` l.121, 136.
24. **[GAP]** **`salesNormalizeBrand` canonical map (16207-16209): 11 marcas**
    canonizadas (Johnson, Long Life, XMaster, Body Joy, Vision, Movement, Kikos,
    Technogym, Life Fitness, Matrix, Athletic) com aliases (bodyjoy→Body Joy,
    x master→XMaster, etc.) e title-case de fallback. A perícia cita só o nome da
    função (`04-vendas.md` l.186). O mapa de 11 marcas + aliases não está listado.
25. **[GAP]** **`salesBrandFromModel` (16213-16234): inferência de marca por
    código/SKU do modelo via regex** , `\bjx[-\s]?\d+`→Johnson; `\blt[-\s]?\d+`
    →Long Life; `\bx\d{2,}`→XMaster; `\bbj[-\s]?\d+`→Body Joy; "vision"→Vision;
    senão "Marca não informada". Também cruza com `STOCK_PRODUCTS` (por produto)
    e `STOCK_PURCHASE_ORDERS` (por item) para puxar `supplier`. A perícia
    menciona "cruzamento" genérico (l.187-190) mas não as regex de SKU.

### 2.5 Vendas , C3 pizza por estado (16313-16439)

26. **[COBERTO]** `renderSalesC3`: pizza/donut SVG por UF (não mapa),
    `salesBuildStateDistribution` (top 10), `salesPieSlicePath` (trata 360°),
    `salesPolar`, leader lines com `distributeSalesLabels` (anti-colisão,
    `labelGap=34`, faixa 42-458), fallback demo de 8 UFs quando vazio. ,
    `04-vendas.md` §3 (l.145-170).
27. **[GAP menor]** Fórmula exata do **fallback demo do C3** (16346-16347):
    `demoUfs=['SP','RJ','MG','DF','GO','PR','BA','SC']`, `total=(idx+2)*8750 +
    (idx%3)*6400`. A perícia diz "8 UFs com valores fictícios" sem a fórmula.
28. **[COBERTO]** `salesUfLabel` (usa `UF_FULL`, formato "SP — São Paulo"),
    `salesFallbackUf`. , `04-vendas.md` (UF helpers) e `06`.

### 2.6 Vendas , C4 pizza por marca (16442-16535)

29. **[COBERTO]** `renderSalesC4`/`salesBuildBrandDistribution`: cópia do C3 por
    marca, top 10, nomes longos truncados em 13 chars, fallback demo
    (`STOCK_SUPPLIERS` ou Johnson/Long Life/XMaster/Body Joy). , `04-vendas.md`
    §4 (l.179-195).

### 2.7 Vendas , C5 tabela de pedidos fechados (16539-16658)

30. **[COBERTO]** `renderSalesC5` (v125, base) , superada por v127 fora da
    faixa; `salesClosedOrderRows` (top 40), busca client-side `salesC5RowText`/
    `salesC5Normalize`, classe de margem `low`(<25)/`mid`(<32), colunas
    Cliente/UF/Margem/Valor/Vendedor/Data. , `04-vendas.md` §5 (l.199-228).
31. **[GAP]** **`salesClosedFallbackSeller` (16547-16550): mapa regional de
    vendedor fictício** , `{SP:'Marina Costa', RJ:'Rafael Lima', MG:'Bruna
    Alves', DF/GO:'Pedro Nunes', PR/SC/RS:'Lucas Rocha', BA/PE/CE:'Camila
    Torres'}` + ciclo `['Ana Beatriz','Carlos Mendes','Juliana Prado','Felipe
    Castro']`. Não documentado em nenhum doc da perícia.
32. **[GAP menor]** **Demo de 8 linhas do C5 v125** (16579-16593: "Academia
    Força Total"/SP/36.4/148500/Marina Costa/2 dias, "Power House Gym"/RJ, etc.)
    , dataset fictício com cliente+margem+valor+vendedor+offset-de-dias. A
    perícia documenta o `sampleClosedOrders` da v127 (com modelo+qty), mas não
    este array da v125 (dead version, ainda presente na faixa).
33. **[COBERTO]** `salesIsOrderClosedForSales` (exclui cancel/draft),
    derivação de `client`/`seller`/`uf` por múltiplos campos-fallback. ,
    `04-vendas.md` §5 (l.221).

### 2.8 Vendas , C6 modalidade + maior pedido (16661-16703)

34. **[COBERTO]** `renderSalesC6` (v126) , superada por v128 fora da faixa;
    `salesC6Modality` (regex `digital|online|ecommerce|whatsapp|...` vs
    `presencial|loja|showroom|...`, senão seed determinístico
    `seed%4===0?presencial:digital`); maior pedido + % digital/presencial. ,
    `04-vendas.md` §6 (l.235-253).

### 2.9 CSS de layout (16707-16800)

35. **[COBERTO]** v127 grid de 6 colunas do `#mod-vendas .sales-container`,
    colocação C2(1-7)/C3(1-3)/C4(3-5)/C5(5-7)/C6(5-7)/C7(1-5), CSS do
    `sales-c7-chart.minimal-style` (espelho do B8). , `04-vendas.md` §0 (tabela de
    layout, l.39-48) e §7.

---

## 3. Tokens visuais / dados / mocks observados na faixa

- **Paleta:** `--gold`/`--gold2` (barras B8/C7), verde `#6FE0B0` (entregue/
  disponível), vermelho `#F17A7A` (atrasado/negativo), azul `#6F8FF3`. Cores de
  pizza (10): `['#C8A96E','#E8D5A8','#9B7E45','#6F8FF3','#6FE0B0','#A8844C',
  '#B8BDC8','#F17A7A','#8FB5F5','#9B72CF']` (16379, 16473). , [COBERTO] em `00`/`04`.
- **Fontes:** Space Grotesk (números de valor/eixo), Inter (corpo). , [COBERTO].
- **localStorage keys:** `ig_demand_reserved_units_v2` (reservas B2),
  `ig_sales_period_v1` (período Vendas). , [COBERTO].
- **Mocks fictícios na faixa:** `sampleSales` (21, v121), `moreSampleSales`
  (12, v122) [GAP #16]; demo C3 (8 UFs) [GAP menor #27]; demo C5 v125 (8
  pedidos) [GAP menor #32]; fallback C4 (4 marcas) [COBERTO].

---

## 4. Resumo dos GAPS

| # | Severidade | Gap |
|---|---|---|
| 16 | **Alta** | `moreSampleSales` , 2º lote de 12 vendas fictícias do B8 (v122). Perícia só cita os 21 do v121; total real = 33. |
| 31 | **Alta** | `salesClosedFallbackSeller` , mapa regional de vendedor fictício (C5), não documentado em lugar nenhum. |
| 24 | **Média** | `salesNormalizeBrand` , mapa canônico de 11 marcas + aliases ausente da perícia. |
| 25 | **Média** | `salesBrandFromModel` , regex de inferência de marca por SKU (jx/lt/x/bj) + cruzamento STOCK_PRODUCTS/PURCHASE_ORDERS. |
| 1/7/17/27/32 | Baixa | 2ª def de `getDemandStockRows`; token-match `stockA3CoverageModelMatch`; valores de CSS v122; fórmula demo C3; demo C5 v125. |

**Total de itens inventariados:** 35
**Total de GAPS:** 9 (2 altos, 2 médios, 5 menores)

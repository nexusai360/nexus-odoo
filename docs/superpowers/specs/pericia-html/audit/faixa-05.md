# Auditoria adversarial , Faixa 05 (linhas 9600 a 12000)

> Arquivo-fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Faixa coberta: linhas 9600-12000.
> Perícia cruzada: `01-estoque.md`, `02-compras.md` (e checagem em todos `0*.md`).
> Veredito macro: a faixa é quase toda composta por blocos `<script>` iterativos
> (v82 a v97) do módulo ESTOQUE (A2-A6, modal Estoque Ideal) e COMPRAS (A7/A8).
> A perícia 01/02 documenta as versões ATIVAS (v104/v113) e marca explicitamente
> as intermediárias/mortas. Cobertura conceitual ~95%. Gaps restantes são de
> granularidade fina (vars/keys/geometria de versões intermediárias).

## Convenção
[COBERTO] = presente na perícia com profundidade suficiente.
[GAP] = ausente ou raso na perícia (escapou).
[COBERTO-MORTO] = perícia documenta e marca como código morto/intermediário.

---

## 1. Modal "Estoque Ideal" (A3 · CONFIGURAÇÃO) , markup 10105-10129

- [COBERTO] `#modal-stock-ideal` `.modal.stock-ideal-modal`, botão fechar `✕`, kicker
  "A3 · CONFIGURAÇÃO", título "Configurar estoque ideal por modelo", descrição
  longa (alerta amarelo). Perícia 01:134.
- [COBERTO] Toolbar: busca `#stock-ideal-search` (oninput `renderStockIdealConfigList`),
  resumo `#stock-ideal-summary`, nota "limite máximo... individualmente em cada modelo". 01:139.
- [COBERTO] Lista `#stock-ideal-list`; ações: "Cancelar" (ghost), "Salvar configurações". 01.
- [COBERTO] Campo "Máximo acima do ideal (%)" `.stock-ideal-over-input` default 30 +
  ajuda "Ex.: 30 significa alerta amarelo...". 01:146.

## 2. Funções de Estoque Ideal / config (9601-9735, 10195-10580)

- [COBERTO] `getStockQuery` (9601) , lê `#stock-search` (perícia nota: input inexistente no DOM final). 01:69.
- [COBERTO] `loadStockIdealConfig` (9604) , lê `STOCK_IDEAL_STORAGE_KEY` (`stock_ideal_config_v73`). 01:230.
- [COBERTO] `getDefaultIdealPerLocation` (9611) , `round(total / nº locais)`. 01:153/231.
- [COBERTO] `getIdealConfigForProduct` (9616) , objeto `{total, byLocation, overPct}` ou número ou fallback `item.ideal`. 01:153.
- [COBERTO] `getIdealQtyForProduct` (9636) , ideal por escopo/local. 01:153.
- [COBERTO] `openStockIdealModal`/`closeStockIdealModal` (9645/9653). 01.
- [COBERTO] `renderStockIdealConfigList` (3 defs: 9657, 10195, **10509** ativa com overPct) , chips de status `is-ok/is-low/is-high`, statusText. 01:144/151.
- [COBERTO] `saveStockIdealConfig` (3 defs: 9699, 10237, **10557** ativa grava overPct) , merge em `STOCK_IDEAL_MAP` + localStorage. 01:151.
- [COBERTO] `setStockLocationFilter` (9717) , seta `ACTIVE_STOCK_LOCATION`. 01:65.
- [COBERTO] `getStockPerItemOverPct` (10383) , lê overPct salvo, senão 30. 01:153.

## 3. v82/v83 , threshold GLOBAL (10131-10377)

- [COBERTO-MORTO] `STOCK_WARN_STORAGE_KEY='stock_over_ideal_warn_pct_v82'` + `STOCK_OVER_IDEAL_WARN_PCT=30` (10132-10133). Perícia menciona o input morto `#stock-over-ideal-threshold` e que `loadStockWarnConfig`/`saveStockWarnConfig` "continuam existindo mas o input é nulo: legado morto" (01:139). **[GAP fino]**: nome exato da var/chave global e as funções `getStockA3StatusClass`/`getStockA3StatusText` GLOBAIS (v83, 10150-10161) não são nomeadas , superadas pela versão per-item (v83 segunda metade, 10391). Não-crítico.
- [COBERTO] `loadStockWarnConfig`/`saveStockWarnConfig` (10135/10144). 01:139.
- [COBERTO] `STOCK_SERIAL_REFERENCE_DATE = new Date('2026-06-15')` (10134). 01:53.
- [COBERTO] `formatDayDiff(start,end)` (10162) , dias entre datas, "N dias". 01:219.
- [COBERTO] `getStockSerialEndDate` (10169) , `saleDate` ou data-ref. 01:219.
- [COBERTO] Enriquecimento `STOCK_SERIALS.forEach` (10173-10193) , `saleDate`/`available`/`ageDays`; regra ~1 em 4 disponível, `saleDate=arrival+(18+(idx%7)*11+(idx%3)*4)`. 01:61.

## 4. A2 , Estoque geral e por local (9721-9772)

- [COBERTO] `getLocationValue` (9721), `getStockTotalValue` (9725, = R$ 172.836.270), `getProductsWithTotals` (9728). 01:83.
- [COBERTO] `renderStockLocations` (2 defs: 9736, **12027** ativa) , `#stock-total-value/label/sub/block`, lista `.stock-location-row` (nome|%|valor) ordenada desc, clique filtra A3/A4, estado vazio "Nenhum local encontrado...". 01:76-94.
- [COBERTO] Diferença chave: versão ativa (12027, fora da faixa) sempre mostra valor GERAL; a desta faixa (9736) trocava p/ valor do local. 01:83.

## 5. A3 , Gráfico de modelos (barras) , múltiplas versões

- [COBERTO] `renderStockProductTable` (4 defs nesta faixa: 9773, 10256, 10459, 10698; ativa real é 11513 v91). Linha `.stock-graph-row`: nome, barra `width=max(4, qty/maxQty*100)`, qty (status), Ideal, VARIAÇÃO `±diffPct%`, `% DO TOTAL` (share). 01:109-121.
- [COBERTO] `getStockA3StatusClass`/`Text` per-item (10391/10397) , `is-low`/`is-high`/`is-ok` vs limite individual. 01:144.
- [COBERTO-MORTO] `renderStockA3Indicators` (10428) , KPIs idade média / modelo +antigo/-antigo / turnover `soldCount/estoqueMédio` "N,NNx". Órfã: `#stock-a3-turnover`/`#stock-a3-avg-age` inexistentes. 01:256.
- [COBERTO] `getStockSerialAgeDays` (10404, 10632) , `ageDays` ou (saída/ref − chegada). 01:61. (grep do nome falhou mas conceito documentado.)
- [COBERTO] `groupStockSerialAgesByModel` (10413) , agrega idade/sold/available por modelo. 01 (via A3 indicators).
- [COBERTO] `stockA3RangeStatus` (11498) , status `below/ideal/above` por limite individual. 01.
- [COBERTO] Filtro de status A3 `setStockA3StatusFilter` (11428) + `ACTIVE_STOCK_A3_STATUS_FILTER` + botões `#stock-a3-filter-buttons`; `stockA3FilterLabel` (all/below/ideal/above). 01:102.
- [COBERTO] Busca A3 `#stock-a3-search` + `stockA3MatchesProduct`/`stockA3BuildProductSearchText`/normalizadores (11435-11497). 01:102.
- [COBERTO] Subtítulo dinâmico `"<n>/<total> modelos · <filtro>[· LOCAL][· busca]"`. 01:102.

## 6. A4 , Resumo / KPIs (9822-9858, 10641, 10856)

- [COBERTO] `renderStockSummary` (9822) , `#stock-avg-per-product` (custo médio de seriais), `#stock-total-items` (unidades), `#stock-avg-items-per-location` (÷5), `#stock-avg-stock-value` (÷5). 01:163-165.
- [COBERTO] `renderStockA4AgeAndTurnover` (10641, 10856; ativa 14638 fora da faixa) , idade média geral/filtrada + turnover `sold/estoqueMédio` "N,NNx". 01:167. Nota: card cobertura sobreposto por v113. 01:169.

## 7. Mapa do Brasil (9859-9882)

- [COBERTO-MORTO] `buildStockBrazilMap` (9859) , SVG `#stock-brazil-map`, paths por UF de `GEO`/`GEO_VB`, labels de UF (exceto DF). Perícia: "**Não** implementar mapa do Brasil... resto de versão anterior". 01:258.

## 8. A6 , Seriais + busca loose (9884-9941, 10017-10050, 10328-10362, 10747, 10880)

- [COBERTO] `getSelectedSerialModel`/`populateStockSerialModelFilter` (9884/9887) , filtro `<select>` de modelos (escape HTML). 01:202.
- [COBERTO] `getStockSerialSearchQuery` (9895), `getFilteredStockSerials` (várias defs até 11128). 01:207.
- [COBERTO] `groupStockSerialsByModel` (9907) , avgCost/avgLead por modelo. 01 (lead morto).
- [COBERTO] `renderStockSerialDashboard` (defs 10017, 10328, 10747, 10880) , KPIs custo médio + tabela. Colunas: Modelo | Serial | Valor que custou | Chegada | Data de saída | Idade. 01:214.
- [COBERTO] Badge "DISPONÍVEL" (verde) vs `saleDate` (`.sold`); idade `formatDayDiff`. 01:218-219.
- [COBERTO] Busca loose evolutiva v84/v85/v86/v87: `stockSearchTokens`/`stockNumericVariants`/`buildStockSerialSearchText`/`stockMatchesSerial` + normalizadores (`stockNormalizeLoose`/`stockCompactLoose`/`stockSpacedLoose`). 01:207.
- [COBERTO] Regra estrita v87: `stockIsStrictModelCodeQuery` (11060) + `stockMatchesStrictModelCode` (11064) + `stockPrimaryModelCode`/`stockSerialSequenceCode` , "001 filtra o modelo 001, não seriais terminados em 0001". 01:207.
- [COBERTO] Textos de ajuda `.stock-serial-search-help` evolutivos (10785, 10919, 11015, 11135) + placeholder dinâmico do input (11018). 01:202 (texto final). **[GAP fino]**: a evolução exata dos 4 textos de ajuda / placeholders por versão não é transcrita; só o conceito final. Não-crítico.

## 9. A5 , Pizzas (categoria/fornecedor) (9924-9979, 10304, 10670)

- [COBERTO] `createStockPieSlicePath` (9924) , path de fatia (arco SVG). 01:185.
- [COBERTO] `buildStockDistributionData` (9934) , conta nº de SERIAIS por categoria/fornecedor (não qty); fora da lista → último rótulo/"OUTROS". 01:187.
- [COBERTO] `renderStockPieChart` (3 defs: 9942, 10304, **10670** ativa) + `renderStockPieDashboard` (9976/10694) , 2 donuts (categoria, fornecedor). Paleta 6 cores. 01:185.
- [GAP fino] 1ª geometria (9942: cx=120,cy=120,r=92) com **texto TOTAL + valor DENTRO do SVG** (`<text class="stock-pie-center-*">`, 9963-9965) difere da ativa (10670: r=78, rótulo em `<div>` externo). A perícia descreve só a ativa ("centro do donut: rótulo Total + valor"). A variante interna morta não é detalhada. Não-crítico.

## 10. Lead time (9981-10016) , MORTO

- [COBERTO-MORTO] `renderStockLeadTime` (9981) , KPIs lead médio/max/min + tabela Modelo|Lead médio|Seriais (`#stock-lead-*`). Perícia: órfã/morta, nunca chamada, "**Não** implementar lead-time card". 01:255/258.

## 11. Bootstrap / binds (10058-10102, 10375, 10783, 10917, 11013, 11133)

- [COBERTO] `renderStockDashboard` (10052) , ordem locations→productTable→summary. 01:69.
- [COBERTO] `bindStockSearch` (10058/10363) , liga inputs e dispara renders + pizzas + mapa. 01.
- [COBERTO] `DOMContentLoaded` master (10070) , `applyAppearanceSettings`, limpa login, binds UF/usuário/CPF/CNPJ/foto, `getUsers`, máscaras data/hora, etc. (vários cobertos por 00/06).
- [GAP fino] Múltiplos `DOMContentLoaded` extras de cada bloco vXX (10375, 10783, 10917, 11013, 11133, 11418, 11642, 11701, 11791, 11958) com `setTimeout(...,0)` re-render. Padrão de "empilhamento por bloco" mencionado (01:9), mas a profusão de listeners DOMContentLoaded por versão não é inventariada individualmente. Não-crítico.

## 12. A7 , Compras (detalhe) (11141-11421, 11589-11704)

- [COBERTO] `STOCK_PURCHASE_ORDERS` (11143) , 5 pedidos, schema `{id,label,supplier,purchaseDate,arrivalDate,user,freight,amountPaid,items:[{model,qty,deliveredQty,unitCost,category}]}`. Dados exatos dos 5 pedidos. 02:68-72.
- [COBERTO] `ACTIVE_STOCK_PURCHASE_ID` (11221). 02.
- [COBERTO] Helpers: `getPurchaseReferenceDate`/`purchaseFormatCurrency`/`purchaseFormatDate`/`purchaseDayDiff`/`purchaseDaysUntil` (11223-11253). 02:85.
- [COBERTO] `getPurchaseMetrics` (11257) , subtotal, total=subtotal+freight, qty, deliveredQty (clamp), paid, paidPct, deadline, countdown, categoryMap{FORÇA,CARDIO,PESO LIVRE}. 02:90-98.
- [COBERTO] `purchaseSlicePath`/`renderPurchasePie` (11275/11284) , donut A7 viewBox 176, centro 88,88, r=66; rótulo "Total"+valor. 02:178-185.
- [COBERTO] `renderStockPurchaseList` (2 defs: 11306, **11590** v92 compacta) , itens da lista (label, badge un., fornecedor, chegada, restante `{n}d`/`hoje`/`+{n}d`). 02:116.
- [COBERTO] `renderStockPurchaseItems` (2 defs: 11326, **11610** v92) , tabela Modelo|Comprado|Chegou|A receber; status `pending/delivered/partial` (dot+linha). 02:120-139.
- [COBERTO] `renderStockPurchaseInfo` (2 defs: 11357, **11650** v93 com "falta pagar") , 10 cards KPI via `setText`; unpaid=max(0,total-paid), unpaidPct; cards "VALOR JÁ PAGO" (highlight) e "FALTA PAGAR" (warning); 2 donuts (entrega, categorias). 02:146-185.
- [COBERTO] `setActiveStockPurchase`/`renderStockPurchasesDashboard` (11404/11408). 02.
- [COBERTO] Contagem regressiva `countdown>0/===0/<0` → "N dias"/"Chega hoje"/"Atrasado N dias". 02:166-168.

## 13. A8 , Resumo compras ativas / por fornecedor (11707-12000)

- [COBERTO] `getActiveStockPurchaseOrders` (11709) , filtra pedidos com entrega OU pagamento pendente. 02:320.
- [COBERTO] `getActiveStockPurchaseOverview` (11715) , KPIs `activeOrders,totalValue,totalPaid,totalUnpaid,paidPct,unpaidPct,qtyTotal,qtyDelivered,qtyPending,qtyLate,withDeliveryPending,withPaymentPending`; `qtyLate`=itens pendentes de pedidos com arrivalDate vencida. 02:320.
- [COBERTO] `renderStockPurchasesOverview` (11761) , `#stock-a8-*` KPIs (ativas/total/pago/a-pagar/qty-total/delivered/pending/late) + subtextos. 02:320.
- [COBERTO] Padrão de monkeypatch/IIFE: wrapper de `renderStockPurchasesDashboard` (11782) e de `renderStockPurchasesOverview` (11949) encadeando overview→pies. Perícia descreve o aliasing em v101 (02:31). **[GAP fino]**: a mecânica IIFE-wrapper específica destes 2 blocos (v94/v96) não é detalhada, só o resultado. Não-crítico.
- [COBERTO-MORTO] `getA8SupplierBreakdown` (11799) , agrega por fornecedor {total,paid,unpaid,qtyTotal,qtyDelivered,qtyPending,qtyLate}. (grep do nome falhou; conceito é `getA8SupplierRows` v104 documentado, 02:196; a versão v96 desta faixa é a antecessora.) **[GAP fino]**: o nome `getA8SupplierBreakdown` (v96) não é citado; perícia salta para `getA8SupplierRows` (v104).
- [COBERTO-MORTO] `a8PiePath`/`renderA8SupplierPie`/`renderA8SupplierValuePies` (11835/11845/11897 e redef v97 11975) , 7 pizzas por fornecedor (TOTAL/PAGO/A PAGAR/COMPRADOS/CHEGARAM/A CHEGAR/ATRASADOS), viewBox 250, r=74, rótulos-callout (leader-line), `valueType` money/qty. Perícia: mortas desde v101 (alias p/ matriz). 02:319.
- [COBERTO] `a8MoneyShort` (11966, "R$ N mi"/"N mil") + `a8TextEsc` (11972). 02:319.
- [GAP fino] IDs exatos das 7 pizzas (`stock-a8-pie-total/paid/unpaid/qty-total/qty-delivered/qty-pending/qty-late`) não aparecem na perícia (grep "stock-a8-pie" = 0); só a lista conceitual dos 7 donuts. Como são mortas, baixo impacto.
- [GAP fino] Geometria do callout (`rect 88x38 rx=7`, clamps `labelX=min(193)/max(4)`, `labelY=max(12)/min(218)`, linha `M..L..L..`) não transcrita em detalhe. Mortas; baixo impacto.

---

## Resumo de gaps (todos de granularidade fina; nenhuma feature ATIVA escapou)

1. [GAP] Nomes exatos da config GLOBAL de alerta morta: `STOCK_WARN_STORAGE_KEY='stock_over_ideal_warn_pct_v82'` / `STOCK_OVER_IDEAL_WARN_PCT` e as funções `getStockA3StatusClass`/`Text` v83 GLOBAIS (10132-10161). Perícia cita só o input morto e load/save.
2. [GAP] Geometria da 1ª pizza A5 (cx120/r92) com texto TOTAL+valor DENTRO do SVG (9960-9966), variante morta não detalhada (perícia descreve só a ativa de rótulo externo).
3. [GAP] IDs reais das 7 pizzas A8 por fornecedor (`stock-a8-pie-*`) e a geometria dos rótulos-callout (rect/clamps) , conceito coberto, IDs/medidas não.
4. [GAP] Nome `getA8SupplierBreakdown` (v96, 11799) , perícia salta direto para o sucessor `getA8SupplierRows` (v104).
5. [GAP] Evolução textual dos 4 helps/placeholders de busca do A6 (10785/10919/11015/11135/11018) e a profusão de listeners `DOMContentLoaded`+`setTimeout(0)` por bloco vXX , só o estado final é transcrito.

## Conclusão
Faixa 9600-12000 = blocos iterativos v82-v97 de ESTOQUE (A2-A6 + modal ideal) e
COMPRAS (A7/A8). A perícia 01/02 cobre todas as features ATIVAS com profundidade
(fórmulas, IDs, textos, status, schema de dados, cores) e marca corretamente o
código morto (mapa Brasil, lead-time, indicadores A3/giro, pizzas A8 por
fornecedor). Os 5 gaps são detalhes de versões intermediárias/mortas, sem
impacto para a reconstrução. Nada de feature viva escapou.

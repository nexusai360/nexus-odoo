# Perícia HTML MESTRE , Módulo DEMANDAS / PEDIDOS (B1 a B8)

> Arquivo periciado: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.971 linhas).
> Container do módulo: `<div class="module" id="mod-demandas">`, DOM dos cards em 6520 a 6756.
> CSS principal: 4629 a 5605 (layout base e tabelas) e 15521 a 15743 (B8 minimal-style + cards de indicador).
> JS principal: 13897 a 16053, em pilhas de "versões" sobrescritas em tempo de execução (v105 a v124).
> Capítulo definitivo: documenta a versão ATIVA em runtime e marca explicitamente o código morto.
>
> **Aviso de fidelidade textual:** os títulos e rótulos reais do protótipo usam o caractere travessão
> (`—`) em vários pontos (ex.: "B1 — Pedidos..."). Quando uma citação aparece entre crases ou aspas,
> ela reproduz o texto literal do artefato, para permitir reconstrução exata. Esta regra de fidelidade
> vale só para as citações; na reescrita do produto, trocar o travessão por vírgula/dois-pontos/hífen
> conforme a norma do projeto. A prosa deste documento não usa travessão.

---

## 0. Como o código está organizado (pilha de versões e quem vence)

O módulo é construído por dezenas de blocos `<script>`/`<style>` injetados em sequência, cada um
rotulado por um comentário de versão (`/* v105 ... */`, `/* v114 ... */`, etc.). Várias funções têm
o mesmo nome em blocos diferentes. Em JavaScript, a ÚLTIMA declaração no escopo vence (function
declarations são içadas, mas a redeclaração mais tardia prevalece; e `window.x = function(){}`
sobrescreve a anterior). Logo, para reconstruir o comportamento real, vale sempre a versão de maior
linha. Tabela de quem está vivo:

| Função / artefato | Versões existentes (linha) | VIVA (a que vence) | Mortas |
|---|---|---|---|
| `renderDemandTable` | v105 (14097), v114 (14875) | **v114 (14875)**, explode por unidade | v105 (14097) |
| Reservas (`toggleDemandReservation`, `isDemandReserved`, `saveDemandReservations`) | v105 (14024 a 14036), v116 (14932 a 14948) | **v116 (14932+)**, por unidade, chave `ig_demand_reserved_units_v2` | v105, chave `ig_demand_reserved_orders_v1` |
| `getDemandReservedOrders` | v105 (14057), v114 (14857), v116 (14953) | **v116 (14953)** | v105, v114 |
| `getDemandReservedCountMap` | v105 (14084), v116 (14964) | **v116 (14964)** | v105 |
| `getDemandStockRows` | v105 (14410), v116 (14974) | **v116 (14974)** | v105 |
| `demandOrderReserveMarkup` | v105 (14093, arg `order`), v114 (14870, arg `unit`) | **v114 (14870)** | v105 |
| `renderDemandB8Chart` | v118 (15111), v119 (15279), v120 (15345), v121 (15468), v122 (15805), v123 (15932), v124 (16042 wrapper) | **v123 (15932) embrulhado por v124 (16042)** | v118, v119, v120, v121, v122 |
| `demandB8Rows` | v118 (15078), v121 (15432, + sampleSales), v122 (15774, + moreSampleSales), v124 (16030, filtra ativos) | **v124 (16030) sobre v122 sobre v121 sobre v118** | nenhuma some, todas encadeiam |
| `demandB8Data` | v118 (15100), v124 (16036 wrapper) | **v124 (16036) sobre v118 (15100)** | v118 sozinha |
| `demandB8Bounds` | v118 (15068), v119 (15225, + custom) | **v119 (15225)** | v118 |

Estado global inicial (v105, 13900 a 13907):
`DEMAND_FILTER = 'open'`, `DEMAND_SELECTED_ID = ''`, `DEMAND_STOCK_QUERY = ''`,
`DEMAND_RESERVED_IDS = new Set()` (carregado do localStorage), `DEMAND_RESERVATIONS_KEY =
'ig_demand_reserved_orders_v1'` (chave v105, depois reescrita pela v116). `DEMAND_UF_FILTER = ''`
é declarado mais abaixo (14133). `DEMAND_B8_PERIOD = 'all'` na v118 (15041);
`DEMAND_B8_CUSTOM_START`/`DEMAND_B8_CUSTOM_END = ''` na v119 (15194 a 15195);
`DEMAND_B8_SELECTED_MODEL_KEY`/`_LABEL = ''` na v123 (15862 a 15863).

---

## 1. Layout, grid e ordem das seções

### 1.1 Grid base (CSS 5216 a 5228)

`#mod-demandas` rola vertical, `padding:14px 16px 18px`, fundo `var(--bg)`. O contêiner
`.demand-container` é um grid CSS. A versão base posiciona os cards assim (5223 a 5228):

| Card | classe | grid-column | grid-row | min-height base |
|---|---|---|---|---|
| B1 | `.demand-b1` | `1 / 3` (metade esquerda) | 1 | 168px |
| B3 | `.demand-b3` | `3 / 5` (metade direita) | 1 | 168px |
| B2 | `.demand-b2` | `1 / 3` | 2 | 540px |
| B5 | `.demand-b5` | `1 / 3` | 3 | 260px |
| B6 | `.demand-b6` | `1 / 3` | 4 | 360px |
| B4 | `.demand-b4` | `3 / 5` | `2 / 4` (ocupa 2 linhas) | 812px |
| B7 | `.demand-b7` | `1 / 3` | 3 | 220px (4630) |
| B8 | `.demand-b8` | linha própria ao fim | auto | 430 a 660px (overrides) |

Overrides de linha (4642 a 4651) reescrevem `grid-template-rows` para acomodar o B7 entre B3 e B2:
`grid-template-rows:auto 540px 220px 260px 360px` no desktop. O override de B8 mais recente (v123,
15740 a 15742) reescreve para `auto 220px 540px 260px 360px 660px` e coloca o B8 em
`grid-column:1 / 5; grid-row:6`, largura cheia ao fim.

### 1.2 Ordem visual real no DOM (6555 a 6755)

A ordem dos cards no DOM é: **B7, B2, B5, B6, B4, B8** (B1 e B3 vêm antes, em 6526 e 6542). Com o grid,
o resultado visual é: topo com B1 (esquerda) e B3 (direita); a coluna esquerda empilha B7, B2, B5, B6;
a coluna direita tem o B4 (mapa) ocupando verticalmente; o B8 fecha o módulo em largura cheia.

### 1.3 Responsivo

Breakpoints: 1180px (`.demand-container` vira 1 coluna; B1..B7 viram `grid-column:1`, 4650 a 4651) e
760px (B8 minimal-style reduz vars de plot, 15695 a 15698; cards de indicador viram 1 coluna, 15742).
Há um conjunto de media-queries `@media(min-width:1181px)` que fixam as rows com o B8 ao fim.

### 1.4 Anatomia de cada card

`.demand-card` (fundo `var(--s1)`, borda `var(--bd)`, radius 14px). Header `.demand-card-header` com
ícone SVG (stroke currentColor 2px), `.demand-card-title` (Space Grotesk 11px, weight 900, uppercase,
letter-spacing 1.35px, 5221) e `.demand-card-subtitle` (margin-left auto, 10.5px, `var(--tx3)`,
alinhado à direita, 5222) que o JS atualiza dinamicamente. Corpo `.demand-card-body`.

### 1.5 Orquestração de render (`renderDemandasDashboard`, 14498 a 14527)

Maestro da tela. Calcula a base e chama, NESTA ordem (14522 a 14526):
`renderDemandTable(filteredOrders)`, `renderDemandOrderDetails(selectedOrder)`,
`renderDemandMap(openOrders)`, `renderDemandOverview(openOrders)`, `renderDemandStockList()`.
A v118 (15139 a 15147) embrulha a função: guarda a anterior em `previousRenderDemandasDashboard` e
redefine `renderDemandasDashboard` para chamar a original e em seguida `renderDemandB8Chart()`. Assim
o B8 entra no ciclo de render sem mexer no corpo do maestro.

Disparos (14529 a 14536): no `DOMContentLoaded` liga os listeners de busca e o `MutationObserver`, e
agenda `setTimeout(()=>renderDemandasDashboard(),0)`. O `MutationObserver` (14534 a 14535) observa
`document.body` com `attributeFilter:['class']`, ou seja, qualquer troca de tema/paleta (que muda a
classe do body) dispara re-render completo do dashboard. A v116 adiciona outro `DOMContentLoaded`
(15033 a 15035) que também chama o dashboard, garantindo que as redefinições já estejam aplicadas.

### 1.6 Núcleo de dados (helpers e fonte)

Fonte bruta: `demandBaseRows()` (13967) lê `window.MALL`, senão `MALL`, senão `DEMO` (mesmo dataset
de vendas do resto do painel). `getDemandOrders()` (13971 a 13993) normaliza cada linha em um objeto
de pedido:

```
{ id, client, model, uf (UPPERCASE), dueDate, status,
  qty, deliveredQty, pendingQty, total, pendingValue }
```

Regras (13972 a 13991):
- `status = demandStatus(row)` (13953): mapeia `done`/`entregue` para `done`; `cancel`/`cancelado`
  para `cancel`; `draft`/`rascunho` para `draft`; qualquer outro para `sale`.
- `qty = demandInferQty(row,idx)` (13946): se `row.qty` é número finito, usa `max(1,qty)`; senão,
  heurística por modelo: contém `t600` retorna `1 + (idx % 2)`; contém `e200` retorna `1 + (idx % 3)`;
  senão `1`.
- `deliveredQty`: se status `done`, igual a `qty`; senão `clamp(row.deliveredQty||delivered_qty, 0, qty)`.
- `total = row.value || amount_total || total`, OU, se zero, `demandUnitValue(model) * qty`.
- `pendingQty = max(0, qty - deliveredQty)`.
- `pendingValue = (status==='cancel') ? 0 : (qty>0 ? total*(pendingQty/qty) : 0)`. VALOR PROPORCIONAL:
  é só a fração do total ainda não entregue, não o total do pedido. Esta fórmula liga B1, B2, B3 e B4.

`demandUnitValue(model)` (13937 a 13945), tabela de preço unitário por palavra-chave (normalizada):
- contém `t600` ou `esteira`: **42000**
- contém `e200` ou `eliptico`: **18000**
- contém `c100` ou `climb`: **26000**
- contém `bike`: **14500**
- contém `forca` ou `force`: **22000**
- default: **16000**

`demandIsLate(order)` (13960): só atrasado se `pendingQty>0` E `dueDate` parseável E `dueDate < hoje`
(zerando horas dos dois lados). Pedido sem prazo nunca é atrasado.

`demandFilteredOrders()` (13994 a 14012): aplica filtro de botão (`DEMAND_FILTER` open/late/all),
filtro de UF (`DEMAND_UF_FILTER`), busca textual sobre `[client, model, uf, status, dueDate formatada]`,
e ordena por prazo ascendente (sem prazo vai para o fim, chave `9999999999999`).

Helpers de formato: `demandMoney` (13913, R$ pt-BR), `demandNumber` (13917, inteiro pt-BR),
`demandPercent` (14277, 0 a 1 casa decimal mais `%`), `demandFormatDate`/`demandParseDate`
(13921 a 13936, aceita dd/mm/aaaa e ISO), `demandSafe` (13909, escape HTML), `demandNormalize`
(13918, NFD + lowercase para matching).

---

## 2. B1 , Pedidos que ainda precisamos entregar (hero de valor pendente)

DOM em 6526 a 6535. Título `"B1 — Pedidos que ainda precisamos entregar"`; subtítulo
`#demand-b1-subtitle` (estático no DOM `"Valor pendente em reais"`, sobrescrito em runtime).

Componente hero (`.demand-hero`, 5230 a 5234): fundo radial dourado mais `var(--s3)`, barra dourada
vertical de 4px à esquerda via `::before` (gradiente `var(--gold)` para `var(--gold2)`). Conteúdo:
- `.demand-hero-label` (texto fixo no DOM): `"R$ em pedidos ainda não entregues"` (10px, 900, uppercase).
- `.demand-hero-value#demand-b1-value` (Space Grotesk **44px**, weight 900, cor `var(--gold)`,
  letter-spacing -1.5px, `white-space:nowrap`), valor inicial `"R$ 0,00"`.
- `.demand-hero-sub#demand-b1-detail` (parágrafo de detalhe).

Cálculo (em `renderDemandasDashboard`, 14499 a 14508):
- `openOrders = all.filter(pendingQty>0 && status!=='cancel')` (14500).
- `pendingValue = Σ openOrders.pendingValue` (14502), vai em `demand-b1-value` (14506).
- subtítulo `demand-b1-subtitle` (14507): `` `${openOrders.length} pedidos abertos` ``.
- detalhe `demand-b1-detail` (14508): `` `Base: ${N} pedidos com ${M} itens ainda pendentes. Esta
  tela mede o que devemos entregar aos clientes, separada da visão de estoque.` `` (N e M em pt-BR).

Cor: sempre dourado, sem semáforo. Não há clique nem hover funcional no hero.

---

## 3. B2 , Lista de pedidos pendentes (`renderDemandTable`, versão ATIVA v114)

DOM em 6578 a 6602. Título `"B2 — Lista de pedidos pendentes"`; subtítulo `#demand-b2-subtitle`
(no DOM `"Clientes · produtos · prazos"`, sobrescrito).

### 3.1 Painel de filtro (6584 a 6594)

Campo de busca `#demand-search` (placeholder `"Buscar cliente, modelo, UF ou status…"`,
`.demand-search-box` com ícone de lupa). Três botões pílula `#demand-filter-buttons`
(`data-demand-filter`): **Abertos** (`open`, classe `active` por padrão no DOM), **Atrasados**
(`late`), **Todos** (`all`). Cada um chama `setDemandFilter('...')` (14013): seta `DEMAND_FILTER`,
alterna a classe `active` percorrendo `[data-demand-filter]`, e re-renderiza. O input de busca tem
listener `input` (14531) que chama o dashboard inteiro.

### 3.2 Cabeçalho da tabela (6597) , as 7 colunas reais

`<thead><tr>`: **Cliente | Modelo | UF | Prazo | Status | Reserva | Valor pendente**. Exatamente 7
colunas. NÃO existe coluna "Margem" nem coluna de valor total separado em nenhum lugar do módulo
Demandas (o briefing original presumiu "Margem"; é falso). A coluna 2 é Modelo.

Larguras (CSS 5470 a 5481, sobre `min-width:980px`): Cliente 25%, Modelo 17%, UF 7% (centralizado),
Prazo 11% (centro), Status 12% (centro), Reserva 12% (centro), Valor pendente 16% (direita). As
colunas 3 a 6 ficam centralizadas em Space Grotesk weight 800; a coluna 7 fica à direita em
`var(--gold)` weight 900.

### 3.3 Explosão por unidade (a marca da v114)

A v114 (14828 a 14916) não renderiza um pedido por linha; ela explode cada pedido em uma linha por
unidade pendente, via `demandUnitRowsFromOrders(orders)` (14837 a 14856):
- `demandPendingUnitCount(order)` (14829): se `pendingQty>0` retorna `max(1, ceil(pendingQty))`,
  senão `1`. Cada unidade vira uma linha.
- `unitId = demandOrderUnitId(order, idx)` (14834): `` `${order.id}::unit-${idx+1}` ``. Regex de
  validação `/::unit-\d+$/` (14924).
- `perUnitValue = pendingQty>0 ? pendingValue/max(1,pendingQty) : (pendingValue||total)` (14842).
  Valor de UMA unidade.
- `reservable = pendingQty>0 && status!=='cancel'` (14851).

### 3.4 Conteúdo de cada coluna por linha-unidade (14881 a 14896)

| Coluna | Conteúdo | Formatação e cor |
|---|---|---|
| **Cliente** | `order.client` (atributo `title` repetido para tooltip) | texto normal `var(--tx)`; na linha selecionada fica dourado (`tr.selected td:first-child`, herdado do CSS de seleção) |
| **Modelo** | `.demand-unit-model`: `.demand-unit-model-main` com `order.model` (truncado) mais `.demand-unit-sub` com o rótulo de unidade | sublinha vira verde `#6FE0B0` quando a linha está reservada (4682, `tr.reserved .demand-unit-sub`) |
| **UF** | `order.uf` (sigla maiúscula) | centralizado |
| **Prazo** | `demandFormatDate(order.dueDate)` | centralizado; vazio vira string vazia |
| **Status** | `demandStatusMarkup(order)`, pílula colorida | ver 3.5 |
| **Reserva** | `demandOrderReserveMarkup(unit)`, checkbox custom mais pílula | ver 3.6 |
| **Valor pendente** | `demandMoney(unit.unitValue)`, valor de **1 unidade** | R$ pt-BR, dourado, à direita |

Rótulo de unidade (14886): `unit.unitTotal>1 ? `Unidade ${idx+1} de ${unitTotal}` : 'Unidade 1 de 1'`.

A primeira unidade de um novo pedido (não a primeira da tabela) recebe a classe
`.demand-order-break` (14885: `unit.unitIndex===0 && unit.orderIndex>0`), que desenha um separador
visual de borda superior reforçada (CSS 4668 a 4675).

### 3.5 Pílula de Status (`demandStatusMarkup`, 14018 a 14023)

- `status==='done'`: `<span class="demand-status done">Entregue</span>` (verde).
- `demandIsLate(order)`: `"Atrasado"`, classe `late` (vermelho).
- `status==='draft'`: `"Pré-venda"`, classe `open` (amarelo).
- senão: `"A entregar"`, classe `open` (amarelo).
Pílula base: inline-flex, radius 999px, peso 900, uppercase (CSS na faixa 5274+).

### 3.6 Coluna Reserva (mecânica completa, ATIVA v114 + v116)

`demandOrderReserveMarkup(unit)` (v114, 14870 a 14874): se `unit.reservable` for falso, renderiza
`<span class="demand-reserve-muted">—</span>` (mudo). Se reservável, renderiza um checkbox custom
`<label class="demand-reserve-check" title="Reservar 1 unidade" | "Remover reserva desta unidade">`
com `<input type="checkbox" data-reserve-id="{unitId}">` mais, quando reservado, a pílula
`<span class="demand-reserved-pill">Reservado</span>`.

Listeners (14900 a 14908): clique no `input[data-reserve-id]` chama `event.stopPropagation()` e
`toggleDemandReservation(input.dataset.reserveId)`; o `stopPropagation` impede que o clique também
dispare o drill-in da linha. A própria label também tem `stopPropagation`.

`toggleDemandReservation(id)` (v116, 14941 a 14948): só aceita ids que casem `/::unit-\d+$/`
(`demandIsUnitReservationId`); alterna a presença no `Set DEMAND_RESERVED_IDS`, persiste via
`saveDemandReservations()` (14932, grava no localStorage filtrando por unit-id) e re-renderiza tudo.

Chave de persistência ATIVA: `DEMAND_UNIT_RESERVATIONS_KEY_V2 = 'ig_demand_reserved_units_v2'`
(14922). A v116, ao carregar (14926 a 14931), reconstrói `DEMAND_RESERVED_IDS` a partir dessa chave,
filtrando só ids no formato de unidade, descartando o resíduo da v105.

DEAD: a v105 reservava por PEDIDO. `DEMAND_RESERVATIONS_KEY = 'ig_demand_reserved_orders_v1'`
(13902), `toggleDemandReservation(id)` em 14030 (sem regex de unidade), `isDemandReserved` em 14027.
A v116 redefine `isDemandReserved` (14937 a 14940) exigindo o formato de unidade, então a semântica
v105 fica inerte. Reproduzir só a v116 (por unidade, chave v2).

Marcar uma reserva debita 1 do estoque do B7 (ver seção 8).

### 3.7 Interação de linha (drill-in) e estados

Cada `<tr>` tem `data-demand-id` e `data-demand-unit-id`. Clique em qualquer parte da linha (14897 a
14899) chama `selectDemandOrder(order.id)` (14273), que seta `DEMAND_SELECTED_ID` e re-renderiza,
alimentando o B5. O `title` da linha é `"Clique na linha para ver os indicadores no B5"`. Linha
selecionada ganha classe `selected` (fundo dourado translúcido); linha reservada ganha `reserved`
(fundo verde translúcido, 5482; sublinha do modelo verde).

### 3.8 Subtítulo dinâmico e vazio (14910 a 14915)

`#demand-b2-subtitle` recebe:
`` `${orderCount} pedido(s) · ${units.length} linha(s) unitária(s)${ufLabel} · ${reservedCount}
reservado(s)` `` com pluralização correta. `ufLabel` aparece como `` ` · SIGLA — Nome` `` se houver
UF filtrada. `#demand-orders-empty` (texto `"Nenhum pedido encontrado para os filtros atuais."`)
aparece quando `units.length===0`.

DEAD: a v105 de `renderDemandTable` (14097 a 14132) renderizava uma linha por pedido (não por
unidade), com `demandMoney(order.pendingValue)` (valor do pedido inteiro) e subtítulo
`` `${n} pedido(s) no filtro atual${ufLabel} · ${reservedCount} reservado(s)` ``. Sobrescrita pela
v114.

---

## 4. B3 , Indicadores da dívida com clientes (4 KPIs)

DOM em 6542 a 6552. Título `"B3 — Indicadores da dívida com clientes"`; subtítulo estático no DOM.
Grid `.demand-kpi-grid` de 4 colunas. Cada `.demand-kpi` tem barra de cor no topo via `::before`,
label uppercase, valor Space Grotesk weight 900, sub menor. Os 4 KPIs são preenchidos dentro de
`renderDemandasDashboard` (14509 a 14516):

| KPI | id (valor) | id (sub) | cor | fórmula | sub em runtime |
|---|---|---|---|---|---|
| **Pedidos abertos** | `demand-open-orders` | `demand-open-orders-sub` | gold | `openOrders.length` | `` `${all.length} pedidos totais considerados` `` |
| **Pedidos atrasados** | `demand-late-orders` | `demand-late-orders-sub` | red | `openOrders.filter(demandIsLate).length` | `"Há prazos vencidos"` ou `"Nenhum prazo vencido"` |
| **Itens pendentes** | `demand-pending-items` | `demand-pending-items-sub` | blue | `Σ openOrders.pendingQty` | `"Unidades ainda não entregues"` |
| **Ticket médio pendente** | `demand-avg-ticket` | `demand-avg-ticket-sub` | green | `pendingValue / openOrders.length` (`avgTicket`, 14504) | `"Média por pedido aberto"` |

Onde `openOrders` e `pendingValue` são os mesmos do B1 (proporcional). Os subs estáticos no DOM
("A entregar", "Prazo vencido", "Quantidade ainda não entregue", "Por pedido aberto", 6547 a 6550)
são placeholders sobrescritos pelo JS na primeira render.

---

## 5. B4 , Mapa de demandas por estado (choropleth interativo)

DOM em 6702 a 6714. Título `"B4 — Mapa de demandas por estado"`; subtítulo `#demand-b4-subtitle`
(no DOM `"Clique em um estado para filtrar o B2"`, sobrescrito).

### 5.1 O que está realmente no DOM (versão "somente mapa")

O corpo é `.demand-card-body.demand-map-only-body` contendo só `.demand-map-svg-wrap.demand-map-only
#demand-map-wrap` com `<svg id="demand-brazil-map" preserveAspectRatio="xMidYMid meet">` e
`.demand-map-tooltip#demand-map-tooltip`. NÃO há, no DOM, os elementos do ranking lateral nem do
painel de seleção (`#demand-map-ranking`, `#demand-map-selected-name`, `#demand-map-clear`,
`#demand-map-empty`). Consequência forense: `renderDemandMapSelection` (14196) e
`renderDemandMapRanking` (14216) executam mas todos os seus `setText`/`innerHTML` não encontram alvo,
operando como no-op silencioso. São vestígio de um design anterior com painel lateral, removido
visualmente mas com a lógica ainda chamada em 14269 a 14270.

### 5.2 Tamanho gigante (causa raiz)

Cascata de `!important`: `.demand-b4{grid-row:2 / 4; min-height:812px}` (5461),
`.demand-map-only{min-height:700px !important}` (5462), e o SVG com
`width:100%!important; height:100%!important; max-height:none!important`. A base tinha
`max-height:600px`, removida pela versão somente-mapa. Resultado: o mapa estica para preencher os
700 a 812px de altura. `preserveAspectRatio="xMidYMid meet"` preserva proporção, então fica enorme
nos dois eixos. Para reduzir a queixa do cliente: baixar `min-height` do card/wrap e reintroduzir
`max-height` no SVG.

### 5.3 Como o mapa é desenhado (`renderDemandMap`, 14226 a 14271)

1. Aborta se não houver `#demand-brazil-map` ou se `GEO` for indefinido (14229).
2. `demandStateMap(openOrders)` (14138 a 14154): inicializa todas as UFs de `GEO` com zeros, agrega
   por UF: `value` (Σ pendingValue), `orders`, `items` (Σ pendingQty), `late` (contagem de atrasados).
   `activeRows` = UFs com value ou orders maior que zero, ordenadas por value desc e UF asc.
   `max = max(1, ...values)`.
3. Define o `viewBox` do SVG a partir de `GEO_VB` (default `'5 5 735 745'`, 14232) e limpa o SVG.
4. Para cada UF de `GEO` (14234 a 14260): cria `<path>` com `d=v.d`, classe `demand-state`
   (mais ` active` se for a UF filtrada), `data-uf`, `role="button"`, `tabindex="0"`,
   `aria-label="SIGLA — Nome. R$ X pendentes."`, e `fill = demandStateFill(value, max)`.
5. Adiciona um `<text class="demand-state-label">` central com a sigla, posicionado em `(v.cx, v.cy)`,
   `text-anchor:middle`, `dominant-baseline:central`, EXCETO para DF (14250), omitido por ser pequeno.

### 5.4 Choropleth e cor temática

`demandStateFill(value, max)` (14164 a 14175):
- `ratio = clamp(value/max, 0, 1)`.
- `value<=0`: cor neutra. No `theme-light` é `rgb(116,122,135)`; senão `rgb(47,51,62)` (14166 a 14169).
- stops: `low = rgb(88,58,58)`, `mid = rgb(142,54,54)`, `high = rgb(205,52,52)`.
- `ratio<.55`: `demandMixColor(low, mid, ratio/.55)`.
- `ratio>=.55`: `demandMixColor(mid, high, (ratio-.55)/.45)`.
Quanto mais R$ pendente, mais vermelho intenso. A quebra é em 0.55.

`demandMixColor(base, target, amount)` (14159 a 14163): interpola linearmente cada canal RGB com
`amount` clampado em [0,1], retornando `rgb(r, g, b)` arredondado.

`demandGetBaseTone()` (14155 a 14158): retorna `{r:185,g:189,b:199}` se o body tem classe
`palette-silver`, senão o dourado `{r:200,g:169,b:110}`. (Este helper existe para a coloração
temática, embora `demandStateFill` use os stops vermelhos fixos; o tom prateado/dourado e o
theme-light é o que torna o mapa sensível a troca de paleta no MutationObserver.)

Estilo dos paths (CSS 5298+ mais override da versão somente-mapa): stroke claro, transição de
fill/stroke/transform/filter ~0.16s; hover acende stroke dourado mais brightness (glow); `.active`
recebe stroke vermelho `#F17A7A` ~2.6px mais drop-shadow vermelho. Labels de sigla em ~15px weight
900 com contorno escuro (`paint-order:stroke`).

### 5.5 Tooltip que segue o mouse (`renderDemandMapTooltip`, 14181 a 14189)

Ligado a `mousemove` e `mouseenter` de cada path (14246 a 14247). Conteúdo (HTML, 14186):
```
<strong>SIGLA — Nome do estado</strong>
<span>R$ X pendentes</span>
<span>N pedido(s) · M item(ns) · K atrasado(s)</span>
```
(pluralização em cada termo). Posiciona via `transform: translate(...)`, clampado dentro do wrap:
X em `min(rect.width-170, max(8, clientX-rect.left+14))`, Y em `min(rect.height-72, max(10,
clientY-rect.top+12))`. Offset +14/+12px do cursor. `hideDemandMapTooltip` (14190) no `mouseleave`
zera a opacidade e joga para `translate(-9999px,-9999px)` (some fora do país). CSS: card flutuante
`rgba(16,16,24,.96)`, min-width 168px, z-index 2.

### 5.6 Clique na UF filtra B2 e B6 (`setDemandUfFilter`, 14176 a 14180)

Clique no path (14244) ou Enter/Espaço via teclado (14245, com `preventDefault`) chama
`setDemandUfFilter(uf)`: faz toggle de `DEMAND_UF_FILTER` (clicar na UF já ativa limpa o filtro,
`DEMAND_UF_FILTER===next ? '' : next`) e re-renderiza tudo. Cascata: `demandFilteredOrders` passa a
filtrar a lista B2 por UF (14001), `renderDemandOverview` reescopa o B6 só para a UF (14362), e o
path da UF recebe a classe `active`.

Subtítulo do mapa (14261 a 14268): com UF, `` `SIGLA — Nome · R$ X pendentes` ``; sem UF,
`` `N estado(s) com pendências · clique para filtrar` ``.

### 5.7 Ranking e seleção (presentes no código, mortos no DOM)

`renderDemandMapRanking(activeRows)` (14216 a 14225): geraria botões ordenados por value desc, cada
um `` `${idx+1}. SIGLA — Nome` `` mais R$ mais `"N pedidos · M itens"` mais `"K atrasados"`, com
`onclick="setDemandUfFilter('UF')"` e `.active` na UF filtrada. Alvo `#demand-map-ranking` não existe.

`renderDemandMapSelection(rows, activeRows)` (14196 a 14215): com UF, mostraria nome, R$ e meta
`"N pedido(s) abertos · M item(ns) pendentes · K atrasado(s). A lista B2 foi filtrada para esta UF."`;
sem UF, "Brasil inteiro" mais totais agregados `"N pedido(s) abertos distribuídos em K estado(s) · M
itens pendentes · L atrasados."`. Botão `#demand-map-clear` (toggle `hidden`) só com UF ativa.
Alvos ausentes, no-op.

---

## 6. B5 , Indicadores do pedido selecionado (drill-in, `renderDemandOrderDetails`)

DOM em 6606 a 6655. Título `"B5 — Indicadores do pedido selecionado"`; subtítulo `#demand-b5-subtitle`
(no DOM `"Selecione uma linha no B2"`).

### 6.1 Acionamento

Clique numa linha do B2 chama `selectDemandOrder(id)` (14273), que seta `DEMAND_SELECTED_ID` e
re-renderiza. No dashboard (14518 a 14521): se o id selecionado não está mais nos pedidos filtrados,
é zerado (a seleção se perde ao trocar para um filtro que esconde o pedido); o pedido é então buscado
em `all` por id e passado para `renderDemandOrderDetails(order)` (14307).

### 6.2 Dois estados (14312 a 14319)

- Vazio (`order` nulo): `#demand-detail-empty` com `display:flex` (texto `"Clique em um pedido na
  tabela B2 para visualizar os indicadores detalhados do pedido."`, caixa tracejada); painel perde
  `active`; subtítulo vira `"Selecione uma linha no B2"`.
- Ativo: `#demand-detail-panel` ganha classe `active`; `#demand-detail-empty` some.

### 6.3 Cabeçalho do painel (14328 a 14340)

`#demand-detail-client` recebe `order.client` (ou "Cliente não informado"). `#demand-detail-model`
recebe `` `${model} · ${uf} · Prazo ${data}` ``. `#demand-detail-status` recebe o texto de
`demandOrderStatusText(order)` (14293 a 14299: "Entregue" / "Pré-venda" / "Atrasado" / "A entregar" /
"Sem pendência") e a classe `` `demand-detail-pill ${demandOrderStatusClass}` `` (14301 a 14306:
done / late / open).

### 6.4 Grid de 5 indicadores (DOM 6624 a 6652, dados 14331 a 14346)

| Indicador | id | cor | conteúdo |
|---|---|---|---|
| **Valor total do pedido** | `demand-detail-total` | gold | `demandMoney(order.total)` (total bruto, NÃO o proporcional) |
| **Quantidade de máquinas** | `demand-detail-qty` | blue | `demandNumber(qty)` |
| **Porcentagem entregue** | `demand-detail-delivered` | green | `demandPercent(delivered/qty*100)` mais barra `#demand-detail-delivered-bar` mais sub `` `${delivered} de ${qty} máquina(s) entregues` `` |
| **Porcentagem não entregue** | `demand-detail-pending` | red | `demandPercent(pending/qty*100)` mais barra `#demand-detail-pending-bar` mais sub `` `${pending} máquina(s) ainda não entregue(s)` `` |
| **Prazo** | `demand-detail-deadline` (card `#demand-detail-deadline-card`) | gold ou red | texto e sub de `demandDeadlineInfo`; card ganha classe `late` se vencido |

`deliveredPct = clamp(delivered/qty*100, 0, 100)` e `pendingPct = clamp(pending/qty*100, 0, 100)`
(14323 a 14324). As barras animam por `style.width = pct.toFixed(1)+'%'` (14345 a 14346).

`demandDeadlineInfo(order)` (14280 a 14292): sem prazo retorna `{text:'Sem prazo', sub:'Nenhuma data
limite informada', cls:'open'}`. Com prazo, `diff = round((dueDate - hoje)/86400000)` em dias:
`diff>0` retorna `"Faltam N dia(s)"` sub `"Prazo final: data"`; `diff===0` retorna `"Vence hoje"`;
`diff<0` retorna `"Passou N dia(s)"` sub `"Prazo vencido em data"` com `cls:'late'`. O card vermelho
acende quando `cls==='late'` (14342).

Subtítulo (14347): `` `${order.client} · ${order.uf}` ``.

---

## 7. B6 , Visão geral das demandas (`renderDemandOverview`, 14361 a 14407)

DOM em 6657 a 6700. Título `"B6 — Visão geral das demandas"`; subtítulo `#demand-b6-subtitle`
(no DOM `"Brasil inteiro"`).

### 7.1 Escopo

Respeita `DEMAND_UF_FILTER` (14362 a 14364): se houver UF do mapa, `scopeOrders` é só dela; senão são
todos os `openOrders`. `scopeLabel` é "Brasil inteiro" ou `SIGLA — Nome` (14365). Subtítulo (14375):
`` `${scopeLabel} · ${activeCount} pedido(s) ativo(s)` ``.

### 7.2 Layout

`.demand-overview-layout`, grid 2 colunas (à esquerda 4 KPIs, à direita o donut).

### 7.3 Os 4 KPIs (14376 a 14382)

| KPI | id | fórmula | sub |
|---|---|---|---|
| Valor total em pedidos ativos | `demand-b6-total-active` | `Σ scopeOrders.total` | "Somatório dos pedidos ativos em {escopo}" ou "...no Brasil" |
| Quantidade de pedidos ativos | `demand-b6-active-count` | `scopeOrders.length` | `` `${lateCount} atrasado(s) · ${onTimeCount} no prazo` `` |
| Valor médio dos pedidos | `demand-b6-average` | `totalActive / activeCount` | "Média dos pedidos ativos" (DOM) |
| Pedido mais caro | `demand-b6-expensive` | `max(total)` | `` `${cliente} · ${modelo} · ${uf}` `` do mais caro |

### 7.4 Donut SVG (14384 a 14406)

`#demand-b6-pie`, `viewBox 0 0 180 180`, centro (90,90), raio externo 72, furo central raio 43.
Sem pedidos: dois círculos cinza (`var(--s2)` e `var(--s3)`). Com pedidos: fatia vermelha de atrasados
(`#F17A7A`, ângulo `lateCount/activeCount*360`) mais fatia verde de no-prazo (`#6FE0B0`, restante),
via `demandPieSlicePath(cx,cy,r,start,end)` (14351 a 14359, arco SVG que começa no topo, -90 graus).
Centro do donut (DOM 6690): `#demand-b6-late-pct` (percentual de atrasados, grande) mais label fixo
"Atrasados".

Legenda `#demand-b6-legend` (14398 a 14401): linha "Atrasados" (dot vermelho) com `% · contagem`;
linha "No prazo" (dot verde) com `% · contagem`. Nota `#demand-b6-pie-note` (14402 a 14406):
`` `${scopeLabel}: ${N} pedido(s) ativo(s) analisado(s).` `` ou `` `${scopeLabel}: sem pedidos
ativos para análise.` ``.

---

## 8. B7 , Máquinas em estoque (`renderDemandStockList`, 14471; fonte v116)

DOM em 6555 a 6576. Título `"B7 — Máquinas em estoque"`; subtítulo `#demand-b7-subtitle`
(no DOM `"Modelos disponíveis"`).

### 8.1 Busca

Campo `#demand-stock-search` (placeholder `"Buscar por letras ou números do modelo…"`). Listener
`input` (14533) seta `DEMAND_STOCK_QUERY` e chama SÓ `renderDemandStockList()` (não o dashboard
inteiro). Match via `demandStockMatches(row, query)` (14047 a 14056): normaliza, compacta (remove não
alfanuméricos), e exige que cada token esteja contido em `[model, category, supplier, key]` (AND),
mais um teste de substring compacta.

### 8.2 Cabeçalho (6570) , 4 colunas

`<thead>`: **Modelo | Disponível | Reservado | % reservado**.

### 8.3 Fonte de dados (`getDemandStockRows`, v116, 14974 a 15032)

Tenta, em ordem: `getProductsWithTotals('')`, senão `STOCK_PRODUCTS`, senão agrega `STOCK_SERIALS`
contando 1 por serial. Deduplica por `demandStockKey(model)` (14044, texto normalizado) somando
quantidades e preservando primeira categoria/fornecedor não vazios (15000 a 15013). Depois cruza com
as reservas do B2 via `getDemandReservedCountMap(stockRows)` (v116, 14964 a 14973): para cada unidade
marcada no B2, encontra a chave de estoque via `demandFindStockKeyForOrder` e soma 1. Se uma reserva
não casa com nenhuma linha de estoque existente, injeta uma linha sintética com `qty:0,
category:'Reserva B2'` (15017 a 15022).

`demandFindStockKeyForOrder(order, stockRows)` (14060 a 14083), score fuzzy de match modelo para
estoque:
- match exato de `key`: retorna direto.
- senão acumula score por linha: `+100` se o compacto do estoque contém o compacto do pedido;
  `+45` se o compacto do pedido contém o do estoque (e o do estoque tem `length>=4`); por token do
  pedido (`length>=2`), `+18` se o token contém dígito, senão `+8`, quando presente no texto/compacto
  da linha. Desempate por maior `qty`. Sem match positivo, devolve `orderKey`.

### 8.4 Cálculo por linha (15024 a 15029)

- `totalStock = max(0, qty agregada)`.
- `reserved = nº de unidades marcadas no B2 para o modelo`.
- `available = totalStock - reserved` (PODE FICAR NEGATIVO).
- `reservedPct = totalStock>0 ? min(100, reserved/totalStock*100) : (reserved>0 ? 100 : 0)`.

Filtra linhas com `totalStock>0 || reserved>0` (15030); ordena por `reserved` desc, depois
`totalStock` desc, depois nome A para Z (15031).

### 8.5 Colunas detalhadas (14485 a 14495)

| Coluna | Conteúdo | Formatação |
|---|---|---|
| **Modelo** | `.demand-stock-model-main` (nome, truncado) mais `.demand-stock-model-sub` com `` `categoria · fornecedor` `` ou `"Estoque geral"` | sub vira vermelho quando a linha é negativa (4688) |
| **Disponível** | `demandNumber(available)` | classe `is-negative` (texto `#F17A7A`, 4687) e linha `stock-negative` (fundo vermelho, 4686) quando `available<0` |
| **Reservado** | `demandNumber(reserved)` | normal |
| **% reservado** | `.demand-stock-percent`: `<b>pct%</b>` mais mini-barra `.demand-stock-percent-bar > .demand-stock-percent-fill` com `width: pct.toFixed(1)%` | barra de progresso |

### 8.6 Subtítulo e vazio (14483 a 14484)

`#demand-b7-subtitle`: `` `${allRows.length} modelos · ${totalAvailable} disponíveis · ${totalReserved}
reservados` ``. Vazio (`#demand-stock-empty`): `"Nenhuma máquina em estoque para exibir."`.

Integração B2 para B7: cada checkbox marcado no B2 incrementa "Reservado" e decrementa "Disponível"
do modelo correspondente, em tempo real (1 unidade por linha). É o vínculo funcional entre os cards.
DEAD: a v105 de `getDemandStockRows` (14410) e `getDemandReservedCountMap` (14084) faziam o mesmo por
PEDIDO, sobrescritas pela v116.

---

## 9. B8 , Itens vendidos em pedidos ativos (composição v122 + v123 + v124)

DOM em 6716 a 6755. Título `"B8 — ITENS VENDIDOS EM PEDIDOS ATIVOS"`; subtítulo `#demand-b8-subtitle`
(no DOM `"Itens vendidos"`). Header especial `.demand-b8-header` traz, centralizado por
`position:absolute`, o botão de período `#demand-b8-period-btn` (`"Todos os períodos"`,
`onclick="openDemandB8PeriodModal()"`, `aria-haspopup="dialog"`).

B8 é a parte mais retrabalhada: 7 camadas. v118 (barras horizontais), v119 (barras verticais mais
modal mais período custom), v120 ("ref-style"), v121 ("site-style" mais 21 vendas fictícias),
v122 ("minimal-style" mais 12 vendas fictícias adicionais), v123 (barras viram botões mais 3 cards de
indicador por modelo), v124 (filtra só pedidos ativos). A versão efetiva é v123 embrulhada por v124.

### 9.1 Dados e dados fictícios injetados

`demandB8Rows` base (v118, 15078 a 15089): casa cada `getDemandOrders()[idx]` com
`demandBaseRows()[idx]` para extrair uma data de venda via `demandB8CandidateDate` (15042: tenta
`saleDate`/`sale_date`/`date_order`/`orderDate`/`date`/`create_date`/... e cai em `order.dueDate`).
Filtra fora cancelados, draft e `qty<=0`.

Dois lotes de vendas fictícias são concatenados por cima da base real:
- v121 (`sampleSales`, 15399 a 15422): **21 vendas fictícias**, ids `B8-SAMPLE-N`, ex.: "ESTEIRA
  VISION T600X" qty 18 em 2026-06-02, "BIKE HORIZONTAL U60" qty 15 em 2026-06-05, etc. Guarda
  implícita ao redefinir `window.demandB8Rows` (15432 a 15443).
- v122 (`moreSampleSales`, 15749 a 15762): **mais 12 vendas fictícias**, ids `B8-MORE-SAMPLE-N`,
  ex.: "ESTEIRA MOVEMENT R4" qty 6 em 2026-06-12, "BIKE ERGOMÉTRICA B75" qty 8 em 2026-05-29, "PECK
  DECK P80" qty 7, "BANCO ABDOMINAL A10" qty 9, etc. Guarda `__DEMAND_B8_MORE_SAMPLE_PATCHED__`
  (15772 a 15782) para não duplicar.

Total injetado: 21 + 12 = **33 vendas fictícias** (rodapé do gráfico cita "Dados fictícios"). Na
reconstrução real, remover ambos os arrays e plugar a base verdadeira.

v124 (16030 a 16033) reembrulha `demandB8Rows` para manter só pedidos com entrega pendente, via
`demandB8IsActiveOrder(order)` (16027 a 16029: `b8ActivePending(order)>0`, que zera cancel/draft e
exige `qty - delivered > 0`). Também embrulha `demandB8Data` (16034 a 16039) para refiltrar antes de
agregar.

`demandB8Data(rows)` (v118, 15100 a 15110): agrega por modelo normalizado em `{model, qty (Σ), orders
(contagem)}`, ordenado por qty desc, depois nome.

### 9.2 O gráfico (v122 minimal-style, render efetivo v123)

`renderDemandB8Chart` v123 (15932 a 16000): lê `demandB8Rows()` (já filtrado por v124), aplica o
período via `demandB8FilterRowsByPeriod(rows, DEMAND_B8_PERIOD)`, agrega com `demandB8Data`, pega o
top 28 (`rawData.slice(0,28)`). `axisMax = demandB8NiceMax(maxQty)` (15321, arredonda para
1/2/5/10 vezes potência de 10). Eixo Y: `axisLabels(axisMax)` gera 6 ticks (0 ao max em 5 passos),
posicionados por `calc(var(--plot-bottom) + position% * ...)`, com gridlines horizontais (a do zero
ganha classe `zero`).

Barras verticais (15971 a 15986): cada item vira um `<button class="demand-b8-min-bar-item"
data-b8-key data-b8-label>` (a v123 transforma a barra em botão). Altura `max(3, min(100,
qty/axisMax*100))%`. Valor dentro da barra (`.demand-b8-min-value`); barras curtas (`height<18`)
ganham classe `short` (move o valor para fora). Abaixo, tick e label do modelo
(`.demand-b8-min-xlabel`, `-webkit-line-clamp:4`, 15656). `title` nativo de cada barra:
`` `${modelo} · ${qty} unidade(s) · X,X% · ${períodoLabel}` ``.

CSS minimal-style (15521 a 15700): `--plot-top:34px; --plot-right:26px; --plot-bottom:132px;
--plot-left:58px`; stage `height:445px` (15736) com `min-width:max(100%, var(--bar-count)*126px +
100px)` (rolagem horizontal quando há muitos modelos); barra `width:44px`; label `width:108px`. Card
`min-height:660px` (v123, 15708). Hover de barra: `filter:brightness(1.08)` (15615).

Rodapé (15991): "Clique em uma barra para ver os indicadores do modelo" mais "Pedidos ativos · dados
fictícios para visualização". A v124 reescreve o segundo span (16046 a 16047) para
`"<strong>Somente pedidos ativos</strong> · com entrega ainda pendente"`.

Subtítulo (15955 a 15959): `` `${total} unidade(s) vendida(s) · ${nModelos} modelo(s) ·
${períodoLabel}${ · top X de Y}${ · selecionado: Label}` ``, com sufixo " · pedidos ativos" anexado
pela v124 (16044 a 16045) se ainda não presente. Vazio (`#demand-b8-empty`): `"Nenhuma venda
encontrada para o período selecionado."`.

### 9.3 Cards de indicador por modelo (v123, DOM 6726 a 6751)

Acima do gráfico, `.demand-b8-insights` com cabeçalho ("Indicadores do modelo" mais escopo dinâmico
`#demand-b8-insights-scope` mais botão `#demand-b8-clear-model` "Limpar seleção",
`onclick="selectDemandB8Model('')"`) e 3 cards:
- **Itens entregues** (`#demand-b8-delivered-value`, verde) sub `` `X% do total · N pedido(s)` ``.
- **Itens a serem entregues** (`#demand-b8-pending-value`, gold) sub `` `X% do total · no prazo` ``.
- **Itens atrasados** (`#demand-b8-late-value`, vermelho) sub `` `X% do total · prazo vencido` ``.

`b8Stats(rows, modelKey)` (15894 a 15912): soma por modelo (ou geral): `delivered`, `pending`
(no prazo = pending menos late), `late`, `total`, `orders`. `b8RenderInsights` (15913 a 15925)
preenche os 3 cards e o escopo: `` `${Label} · ${período}` `` quando há modelo selecionado, senão
`` `Todos os modelos · ${período}` ``; ativa o botão "Limpar seleção" só com modelo selecionado.

Clique numa barra (15993 a 15999) chama `selectDemandB8Model(key, label)` (15926 a 15930): seta
`DEMAND_B8_SELECTED_MODEL_KEY`/`_LABEL` e re-renderiza; a barra ativa ganha classe `active` (outline
dourado `outline:2px solid rgba(200,169,110,.75)`, 15738). Se o modelo selecionado some do período,
a seleção é zerada (15948 a 15951). "Limpar seleção" volta para "todos".

### 9.4 Modal de período (HTML 15157 a 15189; lógica v119 15192 a 15315)

`.demand-b8-modal-bg#demand-b8-period-modal` (`role="dialog"`, `aria-modal="true"`). Título
`"Selecionar período do B8"`, sub `"Escolha um período pronto ou informe datas personalizadas."`.
6 presets (`#demand-b8-preset-grid`, `data-b8-period`): **Todos** (`all`), **Mês mais recente**
(`base_month`), **Últimos 30 dias** (`base_30`), **Últimos 90 dias** (`base_90`), **Ano da base**
(`base_year`), **Personalizado** (`custom`). Caixa custom com dois inputs date (`#demand-b8-start`,
`#demand-b8-end`). Rodapé: "Cancelar" (`closeDemandB8PeriodModal()`) mais "Aplicar período"
(`applyDemandB8CustomPeriod()`). Botão X no canto.

Bounds (`demandB8Bounds`, v119, 15225 a 15241), ancorados na DATA MÁXIMA do dataset (não em hoje):
- `base_month`: do dia 1 do mês da data máxima ao dia 1 do mês seguinte.
- `base_year`: do dia 1 de janeiro ao dia 1 de janeiro do ano seguinte da data máxima.
- `base_30`: de `max-29` dias a `max+1` dia. `base_90`: de `max-89` a `max+1`.
- `custom`: do `DEMAND_B8_CUSTOM_START` ao `DEMAND_B8_CUSTOM_END + 1 dia` (fim inclusivo); se só uma
  ponta, usa limite mínimo/máximo de Date.
- `all` ou base vazia: `null` (sem filtro).

Interações: clicar num preset chama `setDemandB8Preset(period)` (15262 a 15268): seta o período,
limpa datas custom se não for custom, sincroniza o botão, re-renderiza e fecha o modal (exceto se for
"custom"). "Aplicar período" chama `applyDemandB8CustomPeriod` (15269 a 15278): lê os dois inputs,
seta `DEMAND_B8_PERIOD='custom'` e as datas, re-renderiza e fecha. Fecha por: botão X, "Cancelar",
clique no backdrop (15311 a 15312), ou tecla Escape (15313). `syncDemandB8PeriodButton` (15242 a
15252) atualiza o texto do botão do header com o rótulo de `demandB8PeriodLabel()` (15207 a 15224,
ex.: `"Mês mais recente · jun 2026"`, `"Últimos 30 dias"`, `"15/05/2026 a 20/06/2026"` no custom) e
marca o preset ativo.

### 9.5 Versões mortas do B8

v118 `renderDemandB8Chart` (15111, barras horizontais com `<select>` de período `#demand-b8-period`),
v119 (15279, barras verticais `.demand-b8-bar-col`), v120 (15345, ref-style, top 18, `shortLabel` a
24 chars), v121 (15468, site-style, top 22, classe `site-style`), v122 primeira render (15805,
minimal-style sem botões, top 28, rodapé "Dados fictícios"). Todas sobrescritas pela v123 mais v124.
Reconstruir só a composição viva.

---

## 10. Cores semânticas e animações (módulo inteiro)

| Cor | Hex / var | Uso |
|---|---|---|
| Gold | `var(--gold)` / `#C8A96E` / `#F6C453` | valores principais, "aberto/a entregar", barra do hero, item "a entregar" do B8, seleção de barra |
| Verde | `#6FE0B0` | entregue, no prazo, disponível, sub de unidade reservada |
| Vermelho | `#F17A7A` | atrasado, pendente, estoque negativo, choropleth alto, fatia de atrasados |
| Azul | `#6F8FF3` | KPI de itens pendentes (B3), quantidade de máquinas (B5) |
| Cinza | `var(--tx3)` e neutros | labels, UFs sem valor no mapa |

Animações: transições ~0.15 a 0.16s em hover de linhas, botões e paths do mapa; barras de progresso
(B5, B7) e barras do B8 animam por `width`/`height`; tooltip do mapa faz fade ~0.12s e segue o cursor.
A paleta troca dinamicamente: o `MutationObserver` no body (14534) re-renderiza tudo ao mudar a
classe, e o choropleth tem variantes `palette-silver` e `theme-light` (14156, 14166).

---

## 11. Achados forenses para a reconstrução

1. **B2 tem 7 colunas, sem Margem.** Cliente, Modelo, UF, Prazo, Status, Reserva, Valor pendente. O
   "Valor pendente" exibido por linha é o valor de UMA unidade (a v114 explode pedidos em linhas-unidade).
2. **`pendingValue` é proporcional** (`total*pendingQty/qty`), não o total do pedido. Reproduzir a
   fórmula é essencial para B1, B2, B3 e B4 baterem entre si.
3. **Mapa gigante** por `min-height:700-812px !important` mais `max-height:none !important` no SVG.
   Reduzir esses valores resolve a queixa.
4. **Ranking e seleção do mapa estão mortos no DOM** (versão somente-mapa). As funções rodam como
   no-op. Decidir entre reintroduzir o painel lateral ou remover o código.
5. **Reservas vinculam B2 e B7** via localStorage `ig_demand_reserved_units_v2`, 1 unidade por
   checkbox; debitam "Disponível" no B7 (pode ficar negativo). A v105 por pedido está morta.
6. **B8 embute 33 vendas fictícias** (21 da v121 mais 12 da v122). Remover na reconstrução e plugar a
   base real. O B8 vivo é v123 (barras-botão mais 3 cards por modelo) embrulhado por v124 (só pedidos
   ativos), com modal de período ancorado na data máxima da base, não em "hoje".
7. **Sempre usar a última versão de cada função** (tabela da seção 0). As anteriores são lixo
   histórico sobrescrito em runtime.
8. **`demandUnitValue`** define o total quando o dado bruto não traz valor: t600/esteira 42000,
   e200/eliptico 18000, c100/climb 26000, bike 14500, forca/force 22000, default 16000. `demandInferQty`
   inventa quantidade quando ausente (t600: 1+idx%2; e200: 1+idx%3). Ambos são heurísticas de mock que
   devem dar lugar ao dado real do Odoo.

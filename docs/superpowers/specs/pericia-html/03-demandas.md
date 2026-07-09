# Perícia HTML , Módulo DEMANDAS / PEDIDOS (B1 a B8)

> Arquivo periciado: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.971 linhas).
> Container do módulo: `<div class="module" id="mod-demandas">` (linha 6522).
> JS principal: linhas 13900 a 16050 (várias camadas de override versionadas v106 a v124).
> CSS principal: linhas 4629 a 5605 e 15350 a 15745.
>
> **Aviso de fidelidade:** os títulos/labels reais do protótipo usam o caractere travessão (`—`). As citações abaixo preservam o texto literal do artefato para permitir reconstrução exata. Na reescrita do produto, trocar por vírgula/dois-pontos conforme regra do projeto.

---

## 0. Visão macro: layout, grid e ordem das seções

O módulo é um **grid CSS** (`.demand-container`) de **4 colunas** (`repeat(4,minmax(0,1fr))`) e linhas de altura fixa. Definição base (linha 5217):

```css
.demand-container{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
  grid-template-rows:auto 540px 260px 360px;gap:12px;align-items:stretch}
```

**Posicionamento de cada card (CSS, linhas 5223 a 5228 + overrides):**

| Card | classe | grid-column | grid-row | min-height |
|---|---|---|---|---|
| B1 | `.demand-b1` | `1 / 3` (metade esquerda) | 1 | 168px |
| B3 | `.demand-b3` | `3 / 5` (metade direita) | 1 | 168px |
| B7 | `.demand-b7` | `1 / 3` | 3 (v110/v111 reposiciona) | 220px |
| B2 | `.demand-b2` | `1 / 3` | 2 | 540px |
| B5 | `.demand-b5` | `1 / 3` | 3 | 260px |
| B6 | `.demand-b6` | `1 / 3` | 4 | 360px |
| B4 | `.demand-b4` | `3 / 5` | `2 / 4` (ocupa 2 linhas) | **812px** |
| B8 | `.demand-b8` | (linha própria ao fim do grid) | auto | ver seção B8 |

**Ordem visual real (no DOM, linhas 6522+):** B1, B3, B7, B2, B5, B6, B4, B8. Ou seja: topo tem B1 (esquerda) e B3 (direita); abaixo a coluna esquerda empilha B7 → B2 → B5 → B6, enquanto a coluna direita tem o B4 (mapa) ocupando verticalmente as linhas 2 a 4; o B8 fecha o módulo em largura cheia.

**Responsivo:** breakpoints em 1180px (`.demand-container` vira 1 coluna, mapa empilha) e 700px (KPIs viram 1 coluna, `.demand-table{min-width:820px}` com scroll horizontal). Há overrides v110/v111/v112 que reescrevem `grid-template-rows` para acomodar o B7 entre B3 e B4.

**Estrutura de cada card:** `.demand-card` (fundo `var(--s1)`, borda `var(--bd)`, radius 14px) com `.demand-card-header` (ícone SVG stroke + `.demand-card-title` em Space Grotesk 11px 900 uppercase letter-spacing 1.35px + `.demand-card-subtitle` dinâmico) e `.demand-card-body`.

**Orquestração de render:** `renderDemandasDashboard()` (linha 14498) é o maestro. Chama, nesta ordem: `renderDemandTable(filteredOrders)`, `renderDemandOrderDetails(selectedOrder)`, `renderDemandMap(openOrders)`, `renderDemandOverview(openOrders)`, `renderDemandStockList()`. Um wrapper (v118) reembrulha a função para também chamar `renderDemandB8Chart()` ao final. Disparos: `DOMContentLoaded` + `setTimeout(0)` + um `MutationObserver` no `document.body` que re-renderiza a cada mudança de classe do body (troca de tema/paleta dispara re-render completo).

---

## 1. Fonte de dados e funções-base (núcleo compartilhado)

Toda a tela é alimentada por `getDemandOrders()` (linha 13971), que mapeia `demandBaseRows()`. A base (`demandBaseRows`, 13967) lê de `window.MALL` (ou `MALL`, ou `DEMO` como fallback) , é o mesmo dataset bruto de vendas usado pela tela de Vendas. Cada linha bruta é normalizada para o objeto de pedido:

```js
{
  id, client, model, uf (UPPERCASE), dueDate,
  status,        // demandStatus(): 'done'|'cancel'|'draft'|'sale'
  qty,           // demandInferQty(row,idx) , default 1
  deliveredQty,  // se status 'done' => qty; senão row.deliveredQty/delivered_qty clampado [0,qty]
  pendingQty,    // max(0, qty - deliveredQty)
  total,         // row.value||amount_total||total  OU  demandUnitValue(model)*qty
  pendingValue   // status 'cancel' => 0; senão total*(pendingQty/qty)  [VALOR PROPORCIONAL]
}
```

Pontos forenses importantes:
- **`pendingValue` é proporcional**: não é o total do pedido, é `total * (pendingQty / qty)`. Só conta o valor do que ainda falta entregar.
- **`demandStatus()`** (13953): mapeia strings PT/EN do campo bruto (`s`/`state`/`status`) , `done`/`entregue` → done; `cancel`/`cancelado` → cancel; `draft`/`rascunho` → draft; resto → `sale`.
- **`demandIsLate(order)`** (13960): só é atrasado se `pendingQty>0` E existe `dueDate` parseável E `dueDate < hoje` (zerando horas dos dois lados). Pedido sem prazo nunca é atrasado.
- **`demandFilteredOrders()`** (13994): aplica o filtro de botão (`DEMAND_FILTER`: open/late/all), o filtro de UF (`DEMAND_UF_FILTER`), a busca textual (campo `#demand-search`), e **ordena por prazo ascendente** (sem prazo vai para o fim, key 9999999999999).

**Helpers de formatação:** `demandMoney` (R$ via toLocaleString pt-BR), `demandNumber` (inteiro pt-BR), `demandPercent` (0 a 1 casa + `%`), `demandFormatDate`, `demandParseDate`, `demandSafe` (escape HTML).

**Estado global:** `DEMAND_FILTER='open'`, `DEMAND_SELECTED_ID=''`, `DEMAND_UF_FILTER=''`, `DEMAND_STOCK_QUERY=''`, `DEMAND_B8_PERIOD='all'`, reservas em `Set` persistido em `localStorage`.

---

## 2. B1 , Pedidos que ainda precisamos entregar (hero)

- **Título:** `"B1 — Pedidos que ainda precisamos entregar"`; subtítulo `"Valor pendente em reais"`.
- **Componente hero** (`.demand-hero`, barra dourada vertical à esquerda via `::before`): label fixo `"R$ em pedidos ainda não entregues"`, valor gigante (`.demand-hero-value`, Space Grotesk **44px** 900, cor `var(--gold)`) com id `demand-b1-value`, e um parágrafo de detalhe (`#demand-b1-detail`).
- **Cálculo** (em `renderDemandasDashboard`, 14498):
  - `openOrders = all.filter(pendingQty>0 && status!=='cancel')`.
  - `pendingValue = Σ openOrders.pendingValue` → vai no hero.
  - subtítulo: `` `${openOrders.length} pedidos abertos` ``.
  - detalhe dinâmico: `` `Base: N pedidos com M itens ainda pendentes. Esta tela mede o que devemos entregar aos clientes, separada da visão de estoque.` ``
- **Cor:** sempre dourado (sem semáforo aqui).

---

## 3. B2 , Lista de pedidos pendentes (`renderDemandTable`)

> **DUAS definições de `renderDemandTable` existem** (14097 e 14875). A **ativa é a v114, linha 14875** (a última declarada vence). A v114 explode cada pedido em **uma linha por unidade pendente**.

- **Título:** `"B2 — Lista de pedidos pendentes"`; subtítulo dinâmico `#demand-b2-subtitle`.
- **Painel de filtro** (`.demand-filter-panel`): campo de busca `#demand-search` (placeholder `"Buscar cliente, modelo, UF ou status…"`) + 3 botões pílula (`#demand-filter-buttons`): **Abertos** (`open`, ativo por padrão), **Atrasados** (`late`), **Todos** (`all`). `setDemandFilter()` (14010) alterna a classe `.active` e re-renderiza.
- **Cabeçalho da tabela** (`<thead>`, exato): **Cliente | Modelo | UF | Prazo | Status | Reserva | Valor pendente** , **7 colunas**.

> **DIVERGÊNCIA crítica vs. briefing:** o briefing pediu para confirmar as colunas "Cliente, UF, Prazo, Status/Etapa, Reserva, Valor pendente, **Margem**". O HTML real **NÃO tem coluna Margem** e **NÃO tem coluna de Valor total separado**. A coluna 2 é **Modelo** (não citada no briefing). Não há margem em lugar nenhum do módulo Demandas.

### Detalhamento de cada coluna (v114, render por unidade)

A função monta `units = demandUnitRowsFromOrders(orders)`: para cada pedido com `pendingQty>0`, gera `ceil(pendingQty)` linhas (mínimo 1), cada uma com `unitValue = pendingValue / pendingQty` (valor de 1 unidade).

| Coluna | Conteúdo | Formatação / cor |
|---|---|---|
| **Cliente** | `order.client` | texto normal `var(--tx)`; em linha selecionada fica dourado (`tr.selected td:first-child{color:var(--gold)}`) |
| **Modelo** | bloco `.demand-unit-model`: linha principal `order.model` (750 weight, truncada com ellipsis) + sublinha `.demand-unit-sub` com `"Unidade X de Y"` (9.2px uppercase `var(--tx3)`) | sublinha fica verde (`#6FE0B0`) quando a linha está reservada (`tr.reserved .demand-unit-sub`) |
| **UF** | `order.uf` (sigla maiúscula) | texto normal |
| **Prazo** | `demandFormatDate(order.dueDate)` | texto normal; vazio vira string vazia |
| **Status** | `demandStatusMarkup(order)` , pílula colorida | ver semântica abaixo |
| **Reserva** | `demandOrderReserveMarkup(unit)` , checkbox custom + pílula "Reservado" | ver mecânica de reserva |
| **Valor pendente** | `demandMoney(unit.unitValue)` , valor de **1 unidade**, não do pedido | R$ pt-BR |

**Pílula de Status** (`demandStatusMarkup`, 14018; CSS 5274 a 5277):
- `status==='done'` → `<span class="demand-status done">Entregue</span>` , verde `#6FE0B0`, fundo `rgba(111,224,176,.10)`.
- `demandIsLate()` → `"Atrasado"` , vermelho `#F17A7A`, fundo `rgba(241,122,122,.10)`.
- `status==='draft'` → `"Pré-venda"` , classe `open` (amarelo `#F6C453`).
- senão → `"A entregar"` , classe `open` (amarelo).
- Pílula base: inline-flex, radius 999px, 9.5px 900 uppercase.

**Coluna Reserva (mecânica completa):**
- `demandOrderReserveMarkup(unit)` (14881): se a unidade é reservável (`pendingQty>0 && status!=='cancel'`), renderiza um checkbox custom (`.demand-reserve-check` com `<input data-reserve-id="{unitId}">`) + se reservado, pílula `"Reservado"`. Se não reservável, mostra `"—"` mudo (`.demand-reserve-muted`).
- `unitId` = `` `${order.id}::unit-${idx+1}` `` (formato validado por regex `/::unit-\d+$/`).
- Clique no checkbox: `toggleDemandReservation(unitId)` (v116, 14938), com `event.stopPropagation()` para não disparar o drill-in da linha. Persiste em `localStorage` chave `ig_demand_reserved_units_v2`.
- Reservar 1 unidade **debita do estoque** no B7 (ver seção B7).

**Ordenação:** herdada de `demandFilteredOrders()` , por prazo ascendente. Linhas do mesmo pedido ficam agrupadas; a primeira unidade de um novo pedido recebe classe `.demand-order-break` (separador visual, borda superior reforçada, CSS 4668).

**Interação de linha:** clique em qualquer `<tr>` chama `selectDemandOrder(order.id)` → seta `DEMAND_SELECTED_ID` e re-renderiza (alimenta o B5). `title` da linha: `"Clique na linha para ver os indicadores no B5"`. Linha selecionada: fundo `rgba(200,169,110,.105)`, cliente dourado.

**Subtítulo dinâmico (v114):** `` `${orderCount} pedidos · ${units.length} linhas unitárias${ufLabel} · ${reservedCount} reservados` `` (com pluralização e, se houver UF filtrada, ` · SIGLA — Nome do estado`).

**Estado vazio:** `#demand-orders-empty` com texto `"Nenhum pedido encontrado para os filtros atuais."`

---

## 4. B3 , Indicadores da dívida com clientes (`renderDemandasDashboard`)

- **Título:** `"B3 — Indicadores da dívida com clientes"`; subtítulo estático `"Operacional"`.
- **Grid de 4 KPIs** (`.demand-kpi-grid`, `repeat(4,minmax(0,1fr))`). Cada `.demand-kpi` tem barra de cor no topo (`::before`), label uppercase 8.8px, valor Space Grotesk 25px 900, sub 9.8px.

Os 4 KPIs (preenchidos dentro de `renderDemandasDashboard`, 14498), com cores semânticas:

| KPI | id | Cor | Fórmula | Sub |
|---|---|---|---|---|
| **Pedidos abertos** | `demand-open-orders` | gold | `openOrders.length` | `` `${all.length} pedidos totais considerados` `` |
| **Pedidos atrasados** | `demand-late-orders` | red `#F17A7A` | `openOrders.filter(demandIsLate).length` | `"Há prazos vencidos"` ou `"Nenhum prazo vencido"` |
| **Itens pendentes** | `demand-pending-items` | blue `#6F8FF3` | `Σ openOrders.pendingQty` | `"Unidades ainda não entregues"` |
| **Ticket médio pendente** | `demand-avg-ticket` | green `#6FE0B0` | `pendingValue / openOrders.length` | `"Média por pedido aberto"` |

Onde `openOrders = pendingQty>0 && status!=='cancel'` e `pendingValue = Σ pendingValue proporcional`. (O HTML estático traz subs ligeiramente diferentes como placeholder: "A entregar", "Prazo vencido", "Quantidade ainda não entregue", "Por pedido aberto" , o JS sobrescreve.)

---

## 5. B4 , Mapa de demandas por estado (`renderDemandMap` + ranking + selection + tooltip)

- **Título:** `"B4 — Mapa de demandas por estado"`; subtítulo dinâmico `#demand-b4-subtitle` (`"Clique em um estado para filtrar o B2"`).
- **HTML real renderizado é a versão v106 "somente mapa"** (`.demand-map-only-body` > `.demand-map-only#demand-map-wrap` > `<svg id="demand-brazil-map">`). O ranking lateral e o painel de seleção existem nas **funções** mas seus elementos-alvo (`#demand-map-ranking`, `#demand-map-selected-name`, `#demand-map-clear`) **não estão no DOM da v106**, então `renderDemandMapSelection`/`renderDemandMapRanking` rodam como **no-op** (os `setText`/`innerHTML` não encontram elemento). Vestígio de um design anterior (`.demand-map-layout` em grid com `.demand-map-side`) que foi removido visualmente.

### Por que o mapa ficou "gigante" (causa raiz do tamanho)

O dimensionamento vem de uma cascata de `!important`:
```css
.demand-b4{grid-column:3 / 5;grid-row:2 / 4;min-height:812px}          /* card ocupa 2 linhas */
#mod-demandas .demand-map-only{min-height:700px !important}            /* v106 */
#mod-demandas #demand-brazil-map{width:100%!important;height:100%!important;max-height:none!important}
```
O SVG usa `width:100%;height:100%` com `max-height:none` (a base tinha `max-height:600px`, mas a v106 removeu) dentro de um container de **700 a 812px de altura mínima**. Resultado: o mapa do Brasil estica para preencher quase 812px de altura na coluna direita. `preserveAspectRatio="xMidYMid meet"` mantém proporção, então ele fica enorme em ambos os eixos. Para corrigir a queixa do cliente: reduzir `min-height` do card/wrap e/ou reintroduzir `max-height`.

### Como o mapa é desenhado (`renderDemandMap`, 14226)

1. Lê `GEO` (dicionário UF → `{d: pathData, cx, cy}`) e `GEO_VB` (viewBox, default `'5 5 735 745'`).
2. `demandStateMap(openOrders)` agrega por UF: `value` (Σ pendingValue), `orders`, `items` (Σ pendingQty), `late`. Calcula `max` (maior value) para normalizar.
3. Para cada UF: cria `<path>` com a classe `.demand-state` (+ `.active` se for a UF filtrada), `role=button`, `tabindex=0`, `aria-label`, e **fill por choropleth**.
4. Adiciona um `<text>` central com a sigla da UF (exceto **DF**, que é omitido por ser pequeno demais).

**Choropleth (`demandStateFill`, value, max):** escala sequencial de vermelho.
- `value<=0` → cinza neutro (`rgb(47,51,62)` no dark, `rgb(116,122,135)` no light).
- `ratio = value/max` clampado [0,1].
- `ratio<.55` → interpola low `rgb(88,58,58)` → mid `rgb(142,54,54)`.
- `ratio>=.55` → interpola mid → high `rgb(205,52,52)`.
- Ou seja, estados com mais R$ pendente ficam vermelho mais intenso.

**Estilos de path (CSS 5298 + override v106 5350):** stroke claro, transição de fill/stroke/transform/filter 0.16s; hover → stroke dourado + brightness; `.active` → stroke vermelho `#F17A7A` 2.6px + drop-shadow vermelho. Labels de sigla na v106 são **15px 900** com contorno escuro (`paint-order:stroke`).

**Tooltip (`renderDemandMapTooltip`, 14181):** segue o mouse (`mousemove`/`mouseenter`), posicionado por `transform: translate(...)` clampado dentro do wrap (offset +14/+12px do cursor). Conteúdo exato (HTML):
```
<strong>SIGLA — Nome do estado</strong>
<span>R$ X pendentes</span>
<span>N pedidos · M itens · K atrasados</span>
```
(com pluralização). `hideDemandMapTooltip` joga para fora da tela (opacity 0 + translate -9999). CSS: card flutuante `rgba(16,16,24,.96)`, min-width 168px, max-width 230px, z-index 2.

**Seleção de UF (`setDemandUfFilter`, 14172):** clique no estado (ou Enter/Espaço via teclado) faz toggle de `DEMAND_UF_FILTER` (clicar na UF já ativa limpa o filtro) e re-renderiza **tudo**. Efeito cascata: filtra a lista B2 (`demandFilteredOrders` respeita UF), reescopa o B6 (overview por UF), e marca o estado como `.active` no mapa.

**Subtítulo do mapa:** com UF → `` `SIGLA — Nome · R$ X pendentes` ``; sem UF → `` `N estados com pendências · clique para filtrar` ``.

**Ranking lateral (`renderDemandMapRanking`, 14216) , presente na lógica, oculto na v106:** lista de botões ordenados por value desc, cada um `` `idx. SIGLA — Nome` `` + R$ + `"N pedidos · M itens"` + `"K atrasados"`, com `onclick=setDemandUfFilter`. Botão da UF ativa ganha `.active` (borda vermelha).

**Painel de seleção (`renderDemandMapSelection`, 14196) , idem oculto:** se UF selecionada, mostra nome + R$ daquela UF + meta `"N pedidos abertos · M itens pendentes · K atrasados. A lista B2 foi filtrada para esta UF."`; sem seleção, mostra "Brasil inteiro" + totais agregados (`"N pedidos distribuídos em K estados · M itens · L atrasados."`). Botão "limpar" (`#demand-map-clear`) aparece só com UF ativa.

---

## 6. B5 , Indicadores do pedido selecionado (`renderDemandOrderDetails`, drill-in)

- **Título:** `"B5 — Indicadores do pedido selecionado"`; subtítulo dinâmico (`"Selecione uma linha no B2"` quando vazio).
- **Acionamento (drill-in):** clicar numa linha da tabela B2 → `selectDemandOrder(id)` → `DEMAND_SELECTED_ID` → `renderDemandasDashboard` → `renderDemandOrderDetails(selectedOrder)`. O pedido é buscado em `all` por id. Se `DEMAND_SELECTED_ID` não estiver mais nos pedidos filtrados, é zerado (a seleção se perde ao trocar filtro que esconde o pedido).
- **Dois estados:**
  - **Vazio** (`#demand-detail-empty`, display flex): texto `"Clique em um pedido na tabela B2 para visualizar os indicadores detalhados do pedido."` (caixa tracejada).
  - **Ativo** (`#demand-detail-panel.active`): exibe o painel.

**Cabeçalho do painel** (`.demand-detail-context`): `#demand-detail-client` (nome do cliente), `#demand-detail-model` (`` `${model} · ${uf} · Prazo ${data}` ``), e pílula de status `#demand-detail-status` com classe semântica (`demandOrderStatusClass`: done/late/open) e texto (`demandOrderStatusText`: "Entregue"/"Pré-venda"/"Atrasado"/"A entregar"/"Sem pendência").

**Grid de 5 indicadores** (`.demand-detail-grid`), cada `.demand-detail-item` com barra de cor no topo:

| Indicador | id | Cor | Conteúdo |
|---|---|---|---|
| **Valor total do pedido** | `demand-detail-total` | gold | `demandMoney(order.total)` (total bruto, não o proporcional) |
| **Quantidade de máquinas** | `demand-detail-qty` | blue | `order.qty` |
| **Porcentagem entregue** | `demand-detail-delivered` | green | `delivered/qty*100` + **barra de progresso** (`#demand-detail-delivered-bar`) + sub `"X de Y máquinas entregues"` |
| **Porcentagem não entregue** | `demand-detail-pending` | red | `pending/qty*100` + barra (`#demand-detail-pending-bar`) + sub `"X máquinas ainda não entregues"` |
| **Prazo** | `demand-detail-deadline` | gold/red | `demandDeadlineInfo()`: "Faltam N dias" / "Vence hoje" / "Passou N dias" + sub com data limite. Card ganha `.late` (vermelho) se vencido |

`demandDeadlineInfo` (14282) calcula `diff = dueDate - hoje` em dias: `>0` faltam, `=0` vence hoje, `<0` passou (atrasado). Barras de progresso animam via `style.width = pct%`.

**Subtítulo:** `` `${order.client} · ${order.uf}` ``.

---

## 7. B6 , Visão geral das demandas (`renderDemandOverview`, 14361)

- **Título:** `"B6 — Visão geral das demandas"`; subtítulo dinâmico (`"Brasil inteiro"` ou nome da UF).
- **Escopo:** respeita `DEMAND_UF_FILTER` (se houver UF selecionada no mapa, o B6 reescopa só para ela). `scopeLabel` = "Brasil inteiro" ou `SIGLA — Nome`.
- **Layout** (`.demand-overview-layout`, grid 2 colunas `1.1fr / .9fr`): à esquerda 4 KPIs, à direita um gráfico de pizza.

**4 KPIs** (`.demand-overview-kpis`):
| KPI | id | Fórmula |
|---|---|---|
| Valor total em pedidos ativos | `demand-b6-total-active` | `Σ scopeOrders.total` |
| Quantidade de pedidos ativos | `demand-b6-active-count` | `scopeOrders.length` (sub: "K atrasados · L no prazo") |
| Valor médio dos pedidos | `demand-b6-average` | `totalActive / activeCount` |
| Pedido mais caro | `demand-b6-expensive` | `max(total)`; sub: `"Cliente · Modelo · UF"` do mais caro |

**Gráfico de pizza (donut SVG, desenhado à mão):** `viewBox 0 0 180 180`, centro (90,90), raio 72, furo central raio 43 (donut). Dois slices via `demandPieSlicePath` (path com arco SVG):
- **Atrasados** , fatia vermelha `#F17A7A`, ângulo `lateCount/activeCount*360`.
- **No prazo** , fatia verde `#6FE0B0`, restante.
- Centro do donut: `#demand-b6-late-pct` (% atrasados, grande) + label "Atrasados".
- Estado sem pedidos: dois círculos cinza (donut vazio).
- **Legenda** (`#demand-b6-legend`): linha "Atrasados" (dot vermelho) + `% · contagem`; linha "No prazo" (dot verde) + `% · contagem`.
- **Nota** (`#demand-b6-pie-note`): `"scopeLabel: N pedidos ativos analisados."` ou `"sem pedidos ativos para análise."`

---

## 8. B7 , Máquinas em estoque (`renderDemandStockList`, 14471)

- **Título:** `"B7 — Máquinas em estoque"`; subtítulo dinâmico (`"Modelos disponíveis"`).
- **Busca:** campo `#demand-stock-search` (placeholder `"Buscar por letras ou números do modelo…"`), liga em `DEMAND_STOCK_QUERY` e re-renderiza só a lista. Match por `demandStockMatches` (normaliza + compacta, tokens AND).
- **Cabeçalho da tabela** (exato): **Modelo | Disponível | Reservado | % reservado** , 4 colunas.

**Fonte (`getDemandStockRows`, v116 14945):** tenta `getProductsWithTotals('')` → senão `STOCK_PRODUCTS` → senão agrega `STOCK_SERIALS` por modelo. Deduplica por `demandStockKey(model)` somando quantidades. Depois cruza com as **reservas do B2** via `getDemandReservedCountMap` (cada unidade marcada no B2 conta como 1 reserva no modelo correspondente, casado por `demandFindStockKeyForOrder` , match exato de key ou melhor score por tokens).

**Cálculo por linha:**
- `totalStock` = quantidade em estoque do modelo.
- `reserved` = nº de unidades marcadas no B2 para aquele modelo.
- `available` = `totalStock - reserved` (**pode ficar negativo** se reservou mais do que tem).
- `reservedPct` = `min(100, reserved/totalStock*100)` (ou 100 se totalStock=0 e há reserva).

**Colunas detalhadas:**
| Coluna | Conteúdo | Formatação |
|---|---|---|
| **Modelo** | nome principal + sub com `categoria · fornecedor` (ou "Estoque geral") | truncado |
| **Disponível** | `demandNumber(available)` | fica vermelho `#F17A7A` (`td.is-negative`) e a linha toda ganha fundo vermelho (`tr.stock-negative`) quando negativo |
| **Reservado** | `demandNumber(reserved)` | normal |
| **% reservado** | `.demand-stock-percent`: `% bold` + **mini barra horizontal** (`.demand-stock-percent-fill`, largura = pct) | barra de progresso |

**Ordenação:** por `reserved` desc, depois `totalStock` desc, depois nome A→Z. Só mostra linhas com `totalStock>0 || reserved>0`.

**Subtítulo:** `` `${allRows.length} modelos · ${totalAvailable} disponíveis · ${totalReserved} reservados` ``. Vazio: `"Nenhuma máquina em estoque para exibir."`

> **Integração B2↔B7:** marcar uma reserva no checkbox do B2 incrementa o "Reservado" e decrementa o "Disponível" deste modelo no B7, em tempo real (1 unidade por linha marcada). Esse é o vínculo funcional entre os dois cards.

---

## 9. B8 , Itens vendidos em pedidos ativos (`renderDemandB8Chart` + `openDemandB8PeriodModal`)

> **B8 é a parte mais retrabalhada do módulo: 6 camadas de override** (v118 barras horizontais → v119 barras verticais + modal → v120 "ref-style" → v121 "site-style" + dados fictícios → **v122 "minimal-style" (a base do gráfico ativo)** → **v123 (barras viram botões + cards de indicadores por modelo)** → **v124 (filtra só pedidos ativos)**). A versão final efetiva é a composição v122+v123+v124. As declarações anteriores são substituídas por `window.renderDemandB8Chart = function(){...}`.

- **Título:** `"B8 — ITENS VENDIDOS EM PEDIDOS ATIVOS"`; subtítulo dinâmico `#demand-b8-subtitle`.
- **Header especial** (`.demand-b8-header`): além do título, traz o **botão de período** centralizado `#demand-b8-period-btn` (`"Todos os períodos"`, pílula dourada, min-width 215px) que abre o modal (`onclick=openDemandB8PeriodModal()`).

### Cards de indicadores por modelo (v123, topo do corpo)

Acima do gráfico há `.demand-b8-insights` com cabeçalho (`"Indicadores do modelo"` + escopo dinâmico `#demand-b8-insights-scope` + botão `"Limpar seleção"` `#demand-b8-clear-model`) e **3 cards** (`.demand-b8-insights-grid`):
- **Itens entregues** (`#demand-b8-delivered-value`, verde) , sub `"X% do total · N pedidos"`.
- **Itens a serem entregues** (`#demand-b8-pending-value`, gold) , sub `"X% do total · no prazo"`.
- **Itens atrasados** (`#demand-b8-late-value`, vermelho) , sub `"X% do total · prazo vencido"`.

`b8Stats(rows, modelKey)` (v123) soma por modelo (ou geral): delivered, pending (no prazo = pending - late), late, total, orders. `b8RenderInsights` preenche os cards e o escopo (`"Todos os modelos · {período}"` ou `"{Modelo} · {período}"`).

### Dados e período

- `demandB8Rows()` (v118, depois reembrulhada): casa cada `getDemandOrders()` com a linha bruta correspondente para extrair uma **data de venda** (tenta `saleDate`/`date_order`/`orderDate`/`date`/`create_date`/... ou cai no `dueDate`). Filtra fora cancelados/draft e `qty<=0`.
- **v121 injeta ~21 vendas fictícias** (array `sampleSales`, ex.: "ESTEIRA VISION T600X" qty 18 em 2026-06-02) concatenadas à base real, com nota "Dados fictícios adicionados para visualização".
- **v124 reembrulha** `demandB8Rows`/`demandB8Data` para manter **só pedidos com entrega pendente** (`demandB8IsActiveOrder`: pending>0, exclui done/cancel/draft) , reforçando "pedidos ativos".
- `demandB8Data(rows)` agrega por modelo: `{model, qty (Σ), orders (contagem)}`, ordenado por qty desc.

### O gráfico (v122 "minimal-style", barras verticais)

- `chart` recebe classe `minimal-style`. Renderiza um "stage" com:
  - título do eixo `"Quantidade vendida"`.
  - **eixo Y com grade**: `axisLabels(axisMax)` gera 6 ticks (0 a niceMax em 5 passos), via `niceMax` (arredonda para 1/2/5/10 × potência de 10). Gridlines horizontais + labels Y posicionados por `calc(...)` com vars `--plot-top`/`--plot-bottom`.
  - **barras verticais** (top 28 modelos, `data=rawData.slice(0,28)`): cada `.demand-b8-min-bar-item` com altura `max(3, min(100, qty/axisMax*100))%`, valor dentro da barra (`.demand-b8-min-value`), tick e label do modelo embaixo (`.demand-b8-min-xlabel`, truncado por `shortLabel` a ~26 chars). Barras curtas (`height<18`) ganham classe `.short` (move o valor para fora).
  - rodapé: `"Modelo abaixo da respectiva barra"` + (v124) `"Somente pedidos ativos · com entrega ainda pendente"`.
- **v123 transforma cada barra em `<button>`** com `data-b8-key`/`data-b8-label`; clique → `selectDemandB8Model(key,label)` → recalcula os 3 cards de indicadores só para aquele modelo e marca a barra com `.active` (outline dourado). "Limpar seleção" volta para "todos".
- `title` (tooltip nativo) de cada barra: `"{modelo} · N unidades · X% · {período}"`.
- **Subtítulo:** `` `${total} unidades vendidas · ${nModelos} modelos · ${períodoLabel}${top X de Y}${selecionado}` `` + sufixo " · pedidos ativos" (v124).
- **Estado vazio:** `#demand-b8-empty` , `"Nenhuma venda encontrada para o período selecionado."`

### Modal de período (`openDemandB8PeriodModal`, v119, linha 15263)

- HTML: `.demand-b8-modal-bg#demand-b8-period-modal` (role=dialog, aria-modal), título `"Selecionar período do B8"`, sub `"Escolha um período pronto ou informe datas personalizadas."`.
- **6 presets** (`#demand-b8-preset-grid`, `data-b8-period`): **Todos** (`all`), **Mês mais recente** (`base_month`), **Últimos 30 dias** (`base_30`), **Últimos 90 dias** (`base_90`), **Ano da base** (`base_year`), **Personalizado** (`custom`).
- **Caixa custom:** dois inputs date (`#demand-b8-start`, `#demand-b8-end`).
- **Rodapé:** "Cancelar" (fecha) + "Aplicar período" (`applyDemandB8CustomPeriod`).
- **Lógica de bounds** (`demandB8Bounds`): os períodos "da base" são ancorados na **data máxima do dataset** (não em hoje): `base_month` = mês da data máxima; `base_year` = ano da máxima; `base_30`/`base_90` = janela de 30/90 dias retroativa à máxima; `custom` = intervalo dos dois inputs (com fim +1 dia inclusivo).
- **Interações:** clicar num preset → `setDemandB8Preset` (re-renderiza; fecha o modal exceto se for "custom"). Aplicar custom → seta `DEMAND_B8_PERIOD='custom'` + datas, re-renderiza, fecha. Fecha por: botão X, "Cancelar", clique no backdrop, ou tecla **Escape**. `syncDemandB8PeriodButton` atualiza o texto do botão do header com o rótulo do período ativo (ex.: `"15/05/2026 a 20/06/2026"` no custom, `"Mês mais recente · jun 2026"` etc.) e marca o preset ativo.

---

## 10. Resumo de cores semânticas (módulo inteiro)

| Cor | Hex | Uso |
|---|---|---|
| Gold (dourado) | `var(--gold)` / `#C8A96E` / `#F6C453` | valores principais, "aberto/a entregar", barras de destaque |
| Verde | `#6FE0B0` | entregue, no prazo, disponível |
| Vermelho | `#F17A7A` | atrasado, pendente, estoque negativo, choropleth alto |
| Azul | `#6F8FF3` | quantidades/itens (KPI azul, detalhe qty) |
| Cinza | `var(--tx3)`/neutros | labels, estados sem valor |

Animações: transições de 0.15s a 0.16s em hover de linhas/botões/paths; barras de progresso e fills animam por `width`/`height`; tooltip do mapa fade 0.12s. Paleta troca dinamicamente (o `MutationObserver` re-renderiza tudo ao mudar a classe do body; o choropleth tem variante `palette-silver` e `theme-light`).

---

## 11. Achados forenses para a reconstrução

1. **B2 não tem coluna Margem** (o briefing presumiu errado). Colunas reais: Cliente, Modelo, UF, Prazo, Status, Reserva, Valor pendente. "Valor pendente" é o valor de **1 unidade** (a tabela explode pedidos em linhas-unidade na v114).
2. **`pendingValue` é proporcional** (`total * pending/qty`), não o total do pedido. Reproduzir essa fórmula é essencial para os números baterem entre B1, B3 e B2.
3. **Mapa gigante**: causado por `min-height:700-812px !important` + `max-height:none !important` no SVG. Ajustar essas regras resolve a queixa do cliente.
4. **Ranking/seleção do mapa estão mortos no DOM** (v106 deixou só o mapa); as funções existem mas não têm alvo. Decidir se reintroduz o painel lateral ou remove o código.
5. **Reservas vinculam B2↔B7** via `localStorage` (`ig_demand_reserved_units_v2`), 1 unidade por checkbox; debitam "Disponível" no B7 (pode ficar negativo).
6. **B8 tem dados fictícios embutidos** (v121 `sampleSales`) , na reconstrução real, remover e plugar a base verdadeira. O B8 é o gráfico mais complexo: barras verticais clicáveis + 3 cards de indicadores por modelo + modal de período ancorado na data máxima da base (não em "hoje").
7. **Camadas de override**: ao portar, usar sempre a ÚLTIMA versão de cada função (`renderDemandTable` v114/14875; `renderDemandB8Chart` v122+v123+v124). As versões antigas (14097, 15111, 15279, 15345) são lixo histórico sobrescrito em runtime.

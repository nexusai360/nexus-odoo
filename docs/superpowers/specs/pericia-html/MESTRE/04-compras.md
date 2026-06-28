# Perícia MESTRE , Módulo COMPRAS (A7 detalhe + A8 resumo/fornecedores)

> Arquivo periciado: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.971 linhas).
> Escopo: cartão **A7 , Compras** (detalhe de UMA compra) e cartão **A8 , Resumo das compras ativas / Compras por fornecedor**, ambos dentro do módulo Estoque (`#mod-estoque`).
> Capítulo definitivo: tudo abaixo é citado da fonte real com número de linha. Onde houver evolução por "versões" (blocos `<script>` rotulados v82…v104 que **redefinem** as mesmas funções), o comportamento **efetivo é o da ÚLTIMA definição carregada** (JS lê de cima para baixo; a última `function X(){}` sobrescreve as anteriores). As versões intermediárias/mortas estão documentadas na §10 para fidelidade total.
> Todos os números de exemplo foram **recomputados** com a data de referência viva do estoque (`STOCK_SERIAL_REFERENCE_DATE = 2026-06-15`); ver §11.

---

## 0. Mapa de versões , o que roda vs o que está morto

O protótipo foi construído por iterações empilhadas. A mesma função é redeclarada várias vezes em `<script>` distintos. Versão **efetiva** (a que executa):

| Função / artefato | Versão efetiva | Linha | Observação |
|---|---|---|---|
| `STOCK_PURCHASE_ORDERS` (mock) | única | 11143 | 5 pedidos |
| `getPurchaseMetrics` | única | 11257 | coração do A7 |
| `renderPurchasePie` (A7) | única | 11284 | viva (2 donuts) |
| `renderStockPurchaseList` | **v92** | 11590 | sobrescreve a v91 (11306) |
| `renderStockPurchaseItems` | **v92** (4 colunas) | 11610 | sobrescreve a v91 (11326, 3 colunas) |
| `renderStockPurchaseInfo` | **v93** (com "falta pagar") | 11650 | sobrescreve a v? (11357, sem unpaid) |
| `renderStockPurchasesDashboard` | única | 11408 | A7 (chama list+items+info) |
| `getActiveStockPurchaseOrders` | única | 11709 | define "compra ativa" |
| `renderStockPurchasesOverview` | **v104** | 13367 | sobrescreve v94/v99/v101/v103 |
| `getA8SupplierRows` | **v104** | 13733 | +`alertCfg` por fornecedor |
| `renderA8SupplierTable` | **v104** (11 colunas + pílula origem) | 13779 | sobrescreve a 13324/12908/12706 |
| `renderA8SupplierRanking` | **v104** (+source) | 13816 | sobrescreve a 13305/12887/12688 |
| `ensureA8SupplierMatrixMarkup` | **v104** | 13837 | reescreve o `.stock-a8-body` |
| `renderA8SupplierMatrix` | **v104** | 13358 | ensure→rows→ranking+table |
| `filterA8SupplierRows` | **v104** | 13294 | sobrescreve a 12677 |
| `setA8SupplierFilter` | única | 12672 | toggle do botão + re-render |
| `a8FinanceLevel` / `a8FinanceLabel` | única | 12821 / 12827 | níveis paid/open/high |
| `getA8AlertSettings` / `setA8AlertSettings` | **v104** (por fornecedor) | 13500 / 13517 | sobrescreve a v103 (13059/13073) |
| `getA8SupplierAlertConfig` | **v104** | 13528 | custom \|\| default |
| `a8StatusFromOverdueValue` | **v104** (recebe `supplier`) | 13534 | sobrescreve a v103 (13078) |
| `a8StatusLabel` | **v103** ("Saudável", não "OK") | 13085 | usada por todos |
| `ensureA8AlertModal` | **v104** (`.supplier-mode`) | 13546 | sobrescreve a v103 (13095) |
| `openA8AlertSettingsModal` | **v104** | 13609 | sobrescreve a v103 (13146) |
| `renderA8SupplierAlertRows` | **v104** | 13639 | lista por fornecedor (nova no v104) |
| `saveA8AlertSettings` / `clearA8SupplierAlertOverrides` / `resetA8AlertSettings` | **v104** | 13698 / 13722 / 13728 | |
| `ensureA8AlertHeaderButton` | única | 13178 | injeta o botão 3-pontos |
| `renderA8SupplierValuePies` | **v104** = alias de `renderA8SupplierMatrix` | 13364 | as pizzas morreram |

**Consequência grande #1 , as pizzas SVG por fornecedor morreram.** A partir do v101, `renderA8SupplierValuePies` virou apenas `renderA8SupplierMatrix()` (13364). O código das donuts existe (v96/v97/v99/v100: `a8PiePath`, `renderA8SupplierPie`, `renderA8SupplierValuePies`), mas o A8 final **renderiza a matriz tabular**, nunca as pizzas. As pizzas do A7 (`renderPurchasePie`, 11284) continuam vivas.

**Consequência grande #2 , o markup estático do A8 é reescrito em runtime.** O HTML estático do card A8 (6394-6401, com `.stock-a8-layout`) é **inteiramente substituído** por `ensureA8SupplierMatrixMarkup()` (v104, 13837), que reescreve `body.innerHTML` quando `body.dataset.a8Matrix !== 'v104'`. Logo, qualquer KPI antigo do markup estático (lead time, "1 a cada N atrasa") **não aparece na tela final**. A UI viva do A8 = 6 KPIs + ranking + matriz de 11 colunas + botão de alertas no header.

---

## 1. Layout da tela de Compras

A tela vive dentro do módulo **Estoque** (`#mod-estoque .stock-container`), como dois cartões grandes da grade do estoque. Ordem vertical:

1. **A7 , Compras** (`.stock-card.stock-a7`, markup linha 6292): detalhe de UMA compra.
2. **A8 , Resumo das compras ativas / por fornecedor** (`.stock-card.stock-a8`, markup linha 6394).

A grade do estoque é fixada por CSS (v101): `grid-template-rows:auto 420px 660px 540px 760px`; o A8 ocupa 760px com `overflow:hidden` (rolagem fica interna na tabela).

### 1.1 A7 , markup (6292-6393), 3 colunas
Cabeçalho (6293-6297): ícone SVG de carrinho de compras + título `"A7 — Compras"` (6295) + subtítulo `#stock-purchases-subtitle` default `"Lista de compras · itens · indicadores do pedido"` (6296). Em runtime o subtítulo vira `"{label} · {fornecedor} · atualização da entrega e categorias"` (11415).

Corpo `.stock-purchases-body` (6298) em 3 colunas:
- **Esquerda , `.stock-purchase-list-col`** (6299): título de seção `"LISTAS DE COMPRAS"` + container `#stock-purchase-list`.
- **Centro , `.stock-purchase-items-col`** (6303): título `"ITENS COMPRADOS"` + subtítulo `#stock-purchase-items-sub` (default `"Selecione uma compra à esquerda."`) + tabela `.stock-purchase-table` com `<thead>` de 4 `<th>` estáticos (6314-6317) + `<tbody id="stock-purchase-items-body">` + vazio `#stock-purchase-items-empty` (`"Selecione uma compra para visualizar os itens."`, 6322).
- **Direita , `.stock-purchase-info-col`** (6325): título `"INFORMAÇÕES DA COMPRA"` + grade `.stock-purchase-info-grid` com 10 cards (6327-6378) + `.stock-purchase-charts-grid` com 2 donuts (6379-6390).

### 1.2 A8 , markup estático (6394-6401) e markup vivo (v104)
Markup estático: cabeçalho com ícone SVG + título `"A8 — RESUMO DAS COMPRAS ATIVAS"` (6397) + subtítulo `#stock-a8-subtitle` (`"Pedidos ainda abertos por entrega pendente ou pagamento pendente."`, 6398) + corpo `.stock-a8-body > .stock-a8-layout` (6400-6401). **Tudo isso é descartado em runtime.**

Markup vivo (`ensureA8SupplierMatrixMarkup` v104, 13837-13883): reescreve `title.textContent = 'A8 — COMPRAS POR FORNECEDOR'` (13844) e `subtitle.textContent = 'Alertas personalizados por fornecedor, vinculados ao valor a pagar atrasado.'` (13845), injeta o botão 3-pontos no header (`ensureA8AlertHeaderButton`, 13841) e escreve `body.innerHTML` com `.stock-a8-matrix` contendo:
- **Faixa de 6 KPIs** (`.stock-a8-summary-strip`, 13850-13857).
- **Bloco analítico** (`.stock-a8-analytics`, 13858) em 2 painéis: ranking `FORNECEDORES EM ALERTA` + matriz `MATRIZ COMPARATIVA POR FORNECEDOR` (busca + 4 filtros + tabela 11 colunas).

---

## 2. Dados-fonte (mock) , `STOCK_PURCHASE_ORDERS` (11143-11220)

Array de **5 pedidos**. Schema de cada pedido:
```
{ id, label, supplier, purchaseDate, arrivalDate, user, freight, amountPaid,
  items:[ {model, qty, deliveredQty, unitCost, category}, ... ] }
```

Os 5 pedidos, com itens reais (qty / deliveredQty / unitCost / category):

| id | label | supplier | compra | chegada | usuário | frete | pago | itens (model · qty/entregue · custo · cat) |
|---|---|---|---|---|---|---|---|---|
| PO-2026-001 | COMPRA 001 | Johnson | 2026-05-20 | 2026-06-25 | Ícaro Victor | 4200 | 61500 | ESTEIRA VISION T600X 8/8 6900 CARDIO · BIKE HORIZONTAL U60 4/2 5200 CARDIO · REMADA FORCE R100 3/0 4800 FORÇA · SUPINO OLÍMPICO PX-10 5/5 3100 PESO LIVRE |
| PO-2026-002 | COMPRA 002 | Long Life | 2026-06-02 | 2026-07-04 | Fernanda Almeida | 3100 | 29500 | ELÍPTICO MOTION E500 6/3 4300 CARDIO · TORRE FUNCIONAL LT90 2/0 9800 FORÇA · KIT HALTER SEXTAVADO 1-10 12/12 420 PESO LIVRE |
| PO-2026-003 | COMPRA 003 | XMaster | 2026-06-15 | 2026-07-30 | João Pedro | 2800 | 18000 | ESTEIRA VISION T600X 5/1 7000 CARDIO · CADEIRA EXTENSORA X90 4/0 5400 FORÇA · BARRA OLÍMPICA 20KG 10/10 980 PESO LIVRE |
| PO-2026-004 | COMPRA 004 | Body Joy | 2026-04-10 | 2026-05-05 | Carlos Souza | 1900 | 40200 | SPINNING BJ-700 7/7 3600 CARDIO · LEG PRESS PRO 45 2/2 12500 FORÇA · ANILHA EMBORRACHADA 20KG 16/16 390 PESO LIVRE |
| PO-2026-005 | COMPRA 005 | Johnson | 2026-06-28 | 2026-08-12 | Marina Nunes | 4600 | 0 | ESCADA CLIMB C550 3/0 14500 CARDIO · PUXADA ALTA JX-12 4/0 5100 FORÇA · BANCO AJUSTÁVEL PRO 6/2 1600 PESO LIVRE |

Categorias usadas: `CARDIO`, `FORÇA`, `PESO LIVRE` (o donut de categorias do A7 só agrega essas 3 fixas). **Johnson** aparece em 2 pedidos (001 e 005), por isso vira 1 linha agregada no A8. **Não existe campo `paymentDueDate`**; portanto, em todo cálculo de atraso financeiro, o A8 usa `order.arrivalDate` como vencimento padrão (texto do modal confirma: "a data de chegada da compra é usada como vencimento financeiro padrão").

`ACTIVE_STOCK_PURCHASE_ID = STOCK_PURCHASE_ORDERS[0]?.id` (11221), começa em PO-2026-001.

---

## 3. Helpers compartilhados (11223-11304, 12567-12581, 13090)

- `getPurchaseReferenceDate()` (11223): retorna `STOCK_SERIAL_REFERENCE_DATE` se for `Date`, senão `new Date()`. O "hoje" do dashboard é a data-ref do estoque (2026-06-15), não o relógio real.
- `purchaseFormatCurrency(v)` (11231): usa `formatStockCurrency` se existir, senão `toLocaleString('pt-BR',{style:'currency',currency:'BRL'})`.
- `purchaseFormatDate(v)` (11235): `"—"` se vazio; senão data pt-BR. **(Nota: o protótipo usa o travessão "—" como placeholder de data vazia; é o único travessão do módulo, vindo do código-fonte.)**
- `purchaseDayDiff(start,end)` (11241): `max(0, round((end-start)/86400000))` , dias entre datas, nunca negativo. Usado para PRAZO.
- `purchaseDaysUntil(dateStr)` (11247): `round((target - ref)/dia)` com `ref` zerada às 00:00. **Pode ser negativo** (atrasado). Usado para contagem regressiva e detecção de atraso.
- `getPurchaseOrder(id)` (11254): pedido por id, fallback no 1º.
- `purchaseSlicePath(cx,cy,r,startDeg,endDeg)` (11275): path de arco SVG; `largeArc=1` se ângulo>180°.
- `a8SafeHtml(v)` (12567): escapa `& < > " '`.
- `a8CompactMoney(v)` (12570): `≥1mi → "R$ X,Y mi"` (1 casa); `≥1mil → "R$ X mil"` (0 casas); senão moeda cheia.
- `a8Number(v)` (12580): `toLocaleString('pt-BR')`.
- `a8FormatFullMoney(v)` (13090): sempre moeda cheia BRL.

### 3.1 `getPurchaseMetrics(order)` (11257) , o coração do A7
- `subtotal` = Σ `unitCost * qty`.
- `total` = `subtotal + freight`.
- `qty` = Σ `qty`.
- `deliveredQty` = Σ `min(qty, deliveredQty)` (clampa entrega ≤ comprado).
- `paid` = `order.amountPaid`; `paidPct` = `total>0 ? paid/total*100 : 0`.
- `deadline` = `purchaseDayDiff(purchaseDate, arrivalDate)` (PRAZO em dias).
- `countdown` = `purchaseDaysUntil(arrivalDate)` (negativo = atrasado).
- `categoryMap` = `{FORÇA:0, CARDIO:0, PESO LIVRE:0}` somando `qty` por categoria (chaves extras são criadas se houver outra categoria, mas o donut só lê as 3 fixas).
- Retorna `{items, subtotal, total, qty, deliveredQty, paid, paidPct, deadline, countdown, categoryMap}`.

---

## 4. A7 , Detalhe da compra

### 4.1 Lista de compras , `renderStockPurchaseList()` (v92, 11590)
Renderiza `#stock-purchase-list`: um `<button.stock-purchase-list-item>` por pedido, com classe extra ` active` quando `order.id === ACTIVE_STOCK_PURCHASE_ID` (11595). Clique → `onclick="setActiveStockPurchase('{id}')"` (11597), que seta `ACTIVE_STOCK_PURCHASE_ID` e chama `renderStockPurchasesDashboard()` (11404-11407).

Conteúdo de cada item (v92):
- **Topo** (`.stock-purchase-list-top`): `order.label` (ex.: "COMPRA 001") + badge `.stock-purchase-list-badge` = `"{qty} un."` (quantidade total comprada, `toLocaleString`).
- **Meta** (`.stock-purchase-list-meta`, 3 linhas):
  - `<b>{fornecedor}</b>`
  - `Chegada: {purchaseFormatDate(arrivalDate)}`
  - `Restante: {countdown}` , formatado curto (11596): `countdown>0 → "{n}d"`; `===0 → "hoje"`; `<0 → "+{|n|}d"` (o "+" sinaliza dias de atraso).

> Versão morta v91 (11306): mostrava 4 linhas (Fornecedor / Compra / Chegada / `Entregue: x/y`) e badge `"{qty} itens"`. A v92 enxugou.

### 4.2 Itens comprados , `renderStockPurchaseItems(order)` (v92, 11610)
Renderiza `#stock-purchase-items-body`. Cabeçalho estático (6314-6317), **4 colunas com rótulos exatos**:

| Coluna (th) | Conteúdo (célula) | Linha |
|---|---|---|
| **Modelo** | dot de status `.stock-purchase-item-dot {statusClass}` + `item.model` (com `title`) | 11629-11634 |
| **Quantidade comprada** | `qty` = `Number(item.qty)` | 11635 |
| **Quantidade que chegou** | `deliveredQty` = `min(qty, max(0, item.deliveredQty))` | 11636 |
| **Quantidade a receber** | `remainingQty` = `max(0, qty - deliveredQty)` | 11637 |

Subtítulo `#stock-purchase-items-sub` (11622) = `"{label} · {fornecedor} · {N} modelo(s) na compra."`.

**Status por linha** (`statusClass`, 11627): `deliveredQty <= 0` → `pending`; `deliveredQty >= qty` → `delivered`; intermediário → `partial`. A classe vai no `<tr>` e no dot.

Cores semânticas (CSS): dot/linha `delivered` verde translúcido, `pending` vermelho translúcido, `partial` âmbar/parcial próprio.

Estado vazio (11615-11620): sem `order` → limpa tbody, mostra `#stock-purchase-items-empty`, subtítulo `"Selecione uma compra à esquerda."`. Com itens, `empty.style.display='none'` (11640).

> Versão morta v91 (11326): só 3 colunas (Modelo / qty / % do total via `pct`). A v92 trocou "%" por "chegou" + "a receber".

### 4.3 Informações da compra , `renderStockPurchaseInfo(order)` (v93, 11650)
Se `!order` retorna cedo (11651). Calcula `metrics`, `unpaid = max(0, total - paid)` (11665), `unpaidPct` (11666). Preenche 10 cards via `setText(id, …)` (11669-11689). Rótulos EXATOS, valores e subtextos:

| # | Rótulo (label) | id valor | Valor | id sub | Subtexto |
|---|---|---|---|---|---|
| 1 | VALOR DOS PRODUTOS | `stock-purchase-value` | `purchaseFormatCurrency(subtotal)` | `stock-purchase-value-sub` | `Subtotal de {N} modelo(s).` |
| 2 | VALOR TOTAL [COM FRETE] | `stock-purchase-total` | `purchaseFormatCurrency(total)` | `stock-purchase-total-sub` | `Frete/encargos simulados: {freight}.` |
| 3 | PRAZO | `stock-purchase-deadline` | `{deadline} dias` | `stock-purchase-deadline-sub` | `Prazo entre {dataCompra} e {dataChegada}.` |
| 4 | DIA DE CHEGADA | `stock-purchase-arrival` | `purchaseFormatDate(arrivalDate)` | `stock-purchase-arrival-sub` | `Fornecedor: {supplier}.` |
| 5 | CONTAGEM REGRESSIVA | `stock-purchase-countdown` | ver §4.3.1 | `stock-purchase-countdown-sub` | ver §4.3.1 |
| 6 | QUANTIDADE DE ITENS COMPRADOS | `stock-purchase-qty` | `qty` | `stock-purchase-qty-sub` | `{deliveredQty} já entregues.` |
| 7 | USUÁRIO QUE FEZ A COMPRA | `stock-purchase-user` | `order.user` | `stock-purchase-user-sub` | `Compra registrada por {user}.` |
| 8 | DATA DA COMPRA | `stock-purchase-date` | `purchaseFormatDate(purchaseDate)` | `stock-purchase-date-sub` | `Pedido {label}.` |
| 9 | VALOR JÁ PAGO (card `highlight`) | `stock-purchase-paid` | `purchaseFormatCurrency(paid)` | `stock-purchase-paid-sub` | `{paidPct}% do valor total já pago.` |
| 10 | FALTA PAGAR (card `warning`) | `stock-purchase-unpaid` | `purchaseFormatCurrency(unpaid)` | `stock-purchase-unpaid-sub` | `{unpaidPct}% ainda pendente de pagamento.` |

- `paidPct`/`unpaidPct` formatados com 1 casa decimal (`minimumFractionDigits:1,maximumFractionDigits:1`).
- Card 9 tem classe `highlight` (markup 6368): valor verde + barra superior verde (`::before`).
- Card 10 tem classe `warning` (markup 6373): borda/valor/barra âmbar.
- Os cards 4, 7, 8 usam `.stock-purchase-info-value sm` (fonte menor, para texto/data).

#### 4.3.1 Contagem regressiva , texto e coloração
`countdown = metrics.countdown = purchaseDaysUntil(arrivalDate)`.
- **Valor exibido** (`#stock-purchase-countdown`, 11655): `>0 → "{countdown} dias"`; `===0 → "Chega hoje"`; `<0 → "Atrasado {|countdown|} dias"`.
- **Subtexto** (`#stock-purchase-countdown-sub`, 11660): `>0 → "Tempo restante até a chegada prevista."`; `=0 → "Data de chegada é hoje."`; `<0 → "A data prevista já passou."`.
- **Coloração/animação:** NÃO há cor dinâmica nem animação por estado. `renderStockPurchaseInfo` só troca `textContent`; nenhuma classe (ex.: vermelho para atrasado) é aplicada ao card de contagem. O card herda o estilo padrão `.stock-purchase-info-card` (acento dourado). A única animação CSS do arquivo é `@keyframes spin` (spinner do mapa, sem relação com Compras). Estado "Chega hoje"/"Atrasado" é comunicado **só pelo texto**. (Ponto de melhoria óbvio na reconstrução: colorir/animar atrasado.)

### 4.4 Donuts do A7 , `renderPurchasePie(containerId, legendId, data)` (11284)
Donut SVG vetorial puro (`viewBox 0 0 176 176`, centro `cx=88,cy=88`, raio `r=66`, 11291). Chamado 2x dentro de `renderStockPurchaseInfo`:
1. **ENTREGA DO PEDIDO** (`stock-purchase-delivery-pie` + `-delivery-legend`, 11691): `[{Entregues: deliveredQty}, {Pendentes: qty-deliveredQty}]`.
2. **CATEGORIAS DA COMPRA** (`stock-purchase-category-pie` + `-category-legend`, 11695): `[{FORÇA}, {CARDIO}, {PESO LIVRE}]` somando `qty`.

Detalhes (11288-11304):
- Paleta fixa, 5 cores, ciclo `idx%len` (11288): `#C8A96E` (dourado), `#6F8FF3` (azul), `#53C597` (verde), `#E07B7B` (vermelho), `#A17BE0` (roxo).
- Fatias via `purchaseSlicePath`; cada `<path.stock-purchase-chart-slice>` tem `title="{label} · {valor} · {pct%}"` (tooltip nativo do browser, 1 casa).
- Centro do donut: `<div.stock-purchase-chart-total-label>Total</div>` + `<div.stock-purchase-chart-total-value>{total}</div>` (`toLocaleString`).
- Legenda (`.stock-purchase-chart-legend-item`): dot colorido + `.stock-purchase-chart-name` + `.stock-purchase-chart-value` = percentual (1 casa).
- Interação: nativa por `title` SVG. Sem hover JS, sem clique.

### 4.5 Orquestração do A7 , `renderStockPurchasesDashboard()` (11408)
Chama `renderStockPurchaseList()` → `getPurchaseOrder(ACTIVE_STOCK_PURCHASE_ID)` → `renderStockPurchaseItems(order)` → `renderStockPurchaseInfo(order)` → atualiza `#stock-purchases-subtitle`. Há 2 `DOMContentLoaded` que disparam `setTimeout(()=>renderStockPurchasesDashboard(),0)` (11642, 11701), ambos com `try/catch` silencioso.

---

## 5. A8 , Resumo das compras ativas / por fornecedor (versão viva v104)

### 5.1 Definição de "compra ativa" , `getActiveStockPurchaseOrders()` (11709)
Filtra pedidos onde `deliveredQty < qty` **OU** `paid < total` (11712), ou seja, com entrega pendente OU pagamento pendente. Pedido 100% entregue E 100% pago sumiria do A8. (Com os mocks atuais, os **5 pedidos estão ativos**; ver §11.)

### 5.2 Agregação por fornecedor , `getA8SupplierRows()` (v104, 13733)
Itera as compras ativas, agrupa por `supplier` (fallback `"Fornecedor não informado"`, 13737). Por pedido, via `getPurchaseMetrics`:
- `total`, `paid`, `unpaid = max(0, total-paid)`, `qty`, `deliveredQty`, `pendingQty = max(0, qty-deliveredQty)`.
- `daysUntilDue = purchaseDaysUntil(order.paymentDueDate || order.arrivalDate)` , como não há `paymentDueDate`, usa `arrivalDate` (13749).
- `isPaymentLate = unpaid > 0 && daysUntilDue < 0` (13750).
- `isDeliveryLate = pendingQty > 0 && daysUntilDue < 0` (13751).

Acumula por fornecedor (13752-13766): `total, paid, unpaid, qtyTotal, qtyDelivered, qtyPending`; `if(isDeliveryLate) qtyLate += pendingQty`; `if(isPaymentLate){ lateUnpaid += unpaid; lateOrders += 1; maxPaymentDelayDays = max(…, |daysUntilDue|) }`; `activeOrders += 1`; `leadSum += deadline`, `leadCount += 1`.

Derivados por fornecedor (13768-13776):
- `deliveryPct = qtyDelivered/qtyTotal*100`.
- `unpaidPct = unpaid/total*100` (% financeiro a pagar).
- `lateUnpaidPct = lateUnpaid/total*100`.
- `avgLead = leadSum/leadCount` (lead time médio , calculado mas NÃO exibido na tabela final).
- `alertCfg = getA8SupplierAlertConfig(supplier)` (limites efetivos + origem custom/default).
- `status = a8StatusFromOverdueValue(lateUnpaid, supplier)` , **ok / attention / critical** pelo valor atrasado vs limites do fornecedor.
- `riskScore = lateUnpaid + maxPaymentDelayDays*1200 + unpaid*0.08` (13775).

**Ordenação** (13777): `riskScore desc → lateUnpaid desc → unpaid desc → supplier (localeCompare pt-BR)`.

### 5.3 Faixa de 6 KPIs , `renderStockPurchasesOverview()` (v104, 13367)
Chama `ensureA8SupplierMatrixMarkup()`, soma as linhas de `getA8SupplierRows()` em `totals` (13370-13378), e preenche via `setText` (13383-13394). Os 6 KPIs (markup 13851-13856):

| # | Rótulo | id valor | classe acento | Fórmula | Subtexto (id) |
|---|---|---|---|---|---|
| 1 | VALOR TOTAL EM COMPRAS | `stock-a8-total` | `gold` | Σ `total` | `Soma de {activeOrders} compra(s) ativa(s), já com frete.` |
| 2 | VALOR PAGO | `stock-a8-paid` | `green` | Σ `paid` | `{paidPct}% do valor total já pago.` |
| 3 | VALOR A PAGAR | `stock-a8-unpaid` | `yellow` | Σ `unpaid` | `{unpaidPct}% ainda pendente.` |
| 4 | VALOR A PAGAR ATRASADO | `stock-a8-overdue-unpaid` | `red` | Σ `lateUnpaid` | `{lateUnpaidPct}% do valor total está vencido.` |
| 5 | ITENS A CHEGAR | `stock-a8-qty-pending` | `blue` | Σ `qtyPending` | `{qtyPending} item(ns) ainda precisam chegar.` |
| 6 | COMPRAS ATIVAS | `stock-a8-active-orders` | `purple` | Σ `activeOrders` | `{K} fornecedor(es) com valor a pagar.` |

- Valores de R$ via `a8FormatFullMoney` (moeda cheia, NÃO compacta); quantidades via `a8Number`.
- `paidPct/unpaidPct/lateUnpaidPct` calculados sobre `totals.total`, 1 casa decimal.
- **Quirk do KPI 6:** o valor é Σ `activeOrders` (soma de compras ativas, não de fornecedores), mas o subtexto conta `rows.filter(item=>item.unpaid>0).length` fornecedores com valor a pagar (13394). Com os mocks: valor = 5, subtexto = 4 fornecedores.
- Ao fim chama `renderA8SupplierMatrix()` (13395). Há `DOMContentLoaded` com `setTimeout(...,40)` e `console.error` no catch (13397-13399).

### 5.4 Ranking , `renderA8SupplierRanking(rows)` (v104, 13816)
Painel `FORNECEDORES EM ALERTA` (`#stock-a8-critical-ranking`). **Top 6** por `riskScore desc` (13819). `maxLate = max(1, …lateUnpaid, …unpaid)` para normalizar a barra (13820). Vazio → `"Sem fornecedores para exibir."` (13822). Cada card `.stock-a8-rank-card`:
- `title` do card = `a8SupplierConfigText(supplier)` (limites configurados, 13829).
- Topo (`.stock-a8-rank-top`): `.stock-a8-rank-name` (fornecedor) + badge `.stock-a8-status {status}` → `a8StatusLabel` ("Saudável"/"Atenção"/"Crítico").
- Barra vencido (`.stock-a8-overdue-track` > `.stock-a8-overdue-fill status-{status}`): largura `latePct = max(3, min(100, lateUnpaid/maxLate*100))%` (13826).
- Meta (`.stock-a8-rank-meta`, 4 campos, 13832): **Atrasado:** `a8CompactMoney(lateUnpaid)` · **Dias:** `maxPaymentDelayDays` · **A pagar:** `a8CompactMoney(unpaid)` · **% fin.:** `unpaidPct` (1 casa).
- `<span.stock-a8-alert-source>` "Personalizado"/"Padrão geral" (13833; oculto por CSS quando dentro de `.stock-a8-status`, mas aqui é irmão direto, então visível no rodapé do card).

### 5.5 Matriz comparativa , `renderA8SupplierTable(rows)` (v104, 13779)
Tabela `.stock-a8-table` (`#stock-a8-supplier-tbody`). Cabeçalho v104 (13877), **11 colunas com largura, conteúdo e cor**:

| # | th (texto exato) | Largura | Célula | Cor/semântica |
|---|---|---|---|---|
| 1 | Fornecedor | 150px | `supplier` + `<span.stock-a8-alert-source>` ("Personalizado"/"Padrão geral") | nome em destaque |
| 2 | Ativas | 72px | `activeOrders` | neutro (`stock-a8-num`) |
| 3 | % entregue | 150px | `deliveryPct` (0 casas) + barra `.stock-a8-delivery-fill status-{status}` | **barra colorida pelo status financeiro** (quirk abaixo) |
| 4 | Comprado | 88px | `qtyTotal` | neutro |
| 5 | Recebido | 88px | `qtyDelivered` | verde (`stock-a8-good`) |
| 6 | Pendente | 88px | `qtyPending` | neutro |
| 7 | A pagar | 120px | `a8CompactMoney(unpaid)` | `unpaid>0` vermelho (`stock-a8-bad`), senão verde |
| 8 | % financeiro a pagar | 150px | `unpaidPct` (0 casas) + barra `.stock-a8-finance-fill finance-{level}` | `a8FinanceLevel`: `<=0→paid` verde, `<70→open` âmbar, `>=70→high` vermelho |
| 9 | A pagar atrasado | 160px | `a8CompactMoney(lateUnpaid)` + barra `.stock-a8-overdue-fill status-{status}` | `lateUnpaid>0` vermelho, senão verde; largura `max(lateUnpaid>0?4:0, min(100, lateUnpaid/maxLate*100))` |
| 10 | Dias atraso | 92px | `maxPaymentDelayDays` | `>0` vermelho |
| 11 | Status | 112px | badge `.stock-a8-status {status}` ("Saudável"/"Atenção"/"Crítico") + `<span.stock-a8-alert-source>` (oculto por CSS dentro do status) | ok verde / attention âmbar / critical vermelho |

- `<tr title="{a8SupplierConfigText(supplier)}">` (13801).
- Subtítulo `#stock-a8-table-subtitle` (13787) = `"{N} fornecedor(es) exibido(s) · alertas por valor a pagar atrasado."`.
- Hint `#stock-a8-alert-hint` (13788) = `"Padrão geral: saudável até {X} · crítico a partir de {Y}. {K} fornecedor(es) com limites personalizados."`.
- `maxLate = max(1, …lateUnpaid, …unpaid)` (13793). Vazio → `<td colspan="11">"Nenhum fornecedor encontrado para o filtro atual."` (13790). Carregando → `"Carregando fornecedores..."` (13878).

> **Quirk a preservar/decidir:** a barra de "% entregue" (col 3) usa `status-{item.status}`, e `status` no v104 vem do **valor a pagar atrasado** (financeiro), não da entrega (13804). A cor da barra de entrega reflete o alerta financeiro, não o quão entregue está. Pode ser intencional (mesma "saúde" geral) ou bug visual.

### 5.6 Filtros e busca da matriz
- Busca `#stock-a8-supplier-search` (13867): `oninput` → `A8_SUPPLIER_QUERY` + `renderA8SupplierMatrix()` (bind em 13887). Normaliza NFD, case-insensitive, `includes` no nome (`filterA8SupplierRows` v104, 13294).
- 4 botões `.stock-a8-filter-btn` (`setA8SupplierFilter`, 12672), onclick em 13868-13871: **Todos** (`all`), **Críticos** (`critical` → `status==='critical'`), **Pendentes** (`pending` → `unpaid>0 || qtyPending>0`), **Atrasados** (`late` → `lateUnpaid>0 || qtyLate>0 || lateOrders>0`). `setA8SupplierFilter` faz `toggle('active')` no botão clicado e re-renderiza.

### 5.7 Orquestração e aliasing
- `renderA8SupplierMatrix()` (13358): `ensureA8SupplierMatrixMarkup()` → `getA8SupplierRows()` → `renderA8SupplierRanking` + `renderA8SupplierTable`.
- `renderA8SupplierValuePies()` (13364): apenas `renderA8SupplierMatrix()` (alias , as pizzas morreram).
- `renderStockPurchasesOverview()` (13367): KPIs + `renderA8SupplierMatrix()`. É a entrada do A8 (chamada em `DOMContentLoaded` e após salvar alertas).

---

## 6. Modal de alertas configuráveis , v104 (13483-13731)

### 6.1 Gatilho e botão
`ensureA8AlertHeaderButton()` (13178) injeta no `.stock-card-header` do A8 um `<button id="stock-a8-alert-settings-btn" class="stock-more-btn stock-a8-alert-btn">` com 3 `<span>` (os 3 pontos), `title="Configurar alertas do A8"`, `aria-label` igual, e `onclick=openA8AlertSettingsModal` (13189). Guard contra duplicação (13181).

### 6.2 Conceito
O **gatilho do alerta é o "valor a pagar atrasado"** (`lateUnpaid`) por fornecedor (`a8StatusFromOverdueValue`, 13534): `lateUnpaid <= healthyMax → ok`; `>= criticalFrom → critical`; entre os dois → `attention`. Default global: `{healthyMax:0, criticalFrom:50000}` (`a8DefaultAlertSettings`, 13487).

### 6.3 Markup do modal , `ensureA8AlertModal()` (v104, 13546)
Guard por `dataset.a8SupplierModal === 'v104'` (13548; remove versão antiga se existir). `#modal-a8-alert-settings.modal-bg` > `.modal.stock-a8-alert-modal.supplier-mode` (até 980px, 88vh, scroll interno). Conteúdo:
- Botão fechar `×` → `closeA8AlertSettingsModal()`.
- Título `"Alertas A8 — por fornecedor"` (13557).
- Descrição (13558): explica Saudável/Atenção/Crítico e que o gatilho é o valor a pagar atrasado; fornecedores sem personalização usam o padrão geral.
- **Padrão geral** (`.stock-a8-alert-default-grid`, 2 cards):
  - `#a8-alert-default-healthy-max` (number, min 0, step 100, placeholder "0"), título "Padrão geral · Saudável até", ajuda "Usado por todos os fornecedores sem regra própria." (13560-13564).
  - `#a8-alert-default-critical-from` (number, placeholder "50000"), título "Padrão geral · Crítico a partir de", ajuda "Atenção fica entre o limite saudável e o limite crítico." (13565-13569).
- **Preview "Faixas resultantes"** (`.stock-a8-alert-preview`, 3 chips ok/attention/critical, 13571-13575): `#a8-alert-preview-ok` / `-attention` / `-critical`, atualizados por `refreshA8AlertPreview`.
- **Personalização por fornecedor** (`.stock-a8-alert-supplier-card`, 13576-13588): título + sub + busca `#a8-alert-supplier-search` (placeholder "Buscar fornecedor...") + contador `#a8-alert-supplier-summary` ("0 fornecedor(es)") + lista `#a8-alert-supplier-list`.
- **Ações** (`.stock-a8-alert-actions`, 13589-13593): "Limpar personalizações" (ghost) · "Restaurar tudo" (ghost) · "Salvar alertas".

### 6.4 Preview ao vivo , `refreshA8AlertPreview()` (13598)
Lê os 2 inputs do padrão geral, normaliza via `a8NormalizeAlertPair`, escreve nos chips: ok = `"Até {X} atrasado"`; attention = `"Acima de {X} e abaixo de {Y}"`; critical = `"A partir de {Y} atrasado"` (13605-13607).

### 6.5 Abertura , `openA8AlertSettingsModal()` (13609)
`ensureA8AlertModal()` → carrega `cfg.defaults` nos 2 inputs (13614-13615) → liga `input` listener (refresh) com guard `dataset.boundA8SupplierAlert` (13616-13621) → liga busca (`A8_ALERT_SUPPLIER_QUERY` + `renderA8SupplierAlertRows`, 13622-13629) → restaura valor da busca → `refreshA8AlertPreview()` → `renderA8SupplierAlertRows()` → `modal.classList.add('open')` (13633). Fechar = `removeClass('open')` (13635).

### 6.6 Linhas por fornecedor , `renderA8SupplierAlertRows()` (13639)
Lista `#a8-alert-supplier-list`. Pega `getA8SupplierRows()` ordenado por `lateUnpaid desc → nome` (13644), filtra por `A8_ALERT_SUPPLIER_QUERY` (NFD/lowercase/includes, 13643-13648). Contador `#a8-alert-supplier-summary` = `"{N} fornecedor(es)"`. Vazio → `"Nenhum fornecedor encontrado."`. Cada linha (`.stock-a8-alert-supplier-row`, grid de 5 colunas: `minmax(190px,1.2fr) 92px minmax(120px,.7fr) minmax(120px,.7fr) 82px`):
- **Coluna 1:** `.stock-a8-alert-supplier-name` (fornecedor) + `.stock-a8-alert-supplier-meta` = `"<b>{a8FormatFullMoney(lateUnpaid)}</b> atrasado · {statusLabel} · {personalizado|padrão geral}"` (13662).
- **Coluna 2:** checkbox `.a8-alert-supplier-custom` + label "Personalizar" (13664).
- **Coluna 3:** `<label>Saudável até</label>` + input `.a8-alert-supplier-healthy` (number, min 0, step 100; `disabled` se não custom) (13665).
- **Coluna 4:** `<label>Crítico a partir de</label>` + input `.a8-alert-supplier-critical` (idem) (13666).
- **Coluna 5:** botão `.stock-a8-alert-supplier-reset` "Padrão" (13667).
- Linha ganha classe `custom` (destaque dourado, fundo `rgba(200,169,110,.055)`) quando há regra própria (13659).
- Comportamento por linha (13670-13696): toggle "Personalizar" liga/desliga os inputs e a classe `custom`; ao ligar com inputs vazios, preenche com `defaults` (13678-13684). Botão "Padrão" desmarca o toggle e repõe os valores default na linha (13687-13695).

### 6.7 Normalização e persistência
- `a8NormalizeAlertPair(h,c)` (13491): `h = max(0, h)`; `c = max(h+1, c)` , crítico sempre 1 acima do saudável. Fallback default `{0, 50000}` em valores não finitos.
- `setA8AlertSettings(settings)` (13517): normaliza defaults + cada supplier; grava em `localStorage` chave **`stock_a8_alertas_valor_atrasado_v1`** (`A8_ALERT_SETTINGS_KEY`, 13054) o JSON `{defaults:{healthyMax,criticalFrom}, suppliers:{ "Nome":{healthyMax,criticalFrom}, ... }}` (13526).
- `getA8AlertSettings()` (13500): lê e normaliza; tolerante a formato antigo (`parsed.defaults || parsed`, 13504); retorna `{healthyMax, criticalFrom, defaults, suppliers}`.
- `getA8SupplierAlertConfig(supplier)` (13528): `{...(custom || defaults), source: custom?'custom':'default'}`.
- `a8SupplierConfigText(supplier)` (13541): `"{Personalizado|Padrão geral}: saudável até {X} · crítico a partir de {Y}"` (usado como `title` na tabela e ranking).

### 6.8 Ações do modal
- **Salvar alertas** (`saveA8AlertSettings`, 13698): lê defaults dos inputs; varre as linhas DOM, salva só as marcadas custom (`row.dataset.supplier` + checkbox, 13704-13712); **preserva** personalizações de fornecedores que não estavam na lista filtrada (merge com o anterior via `CSS.escape`, 13713-13717); persiste; fecha; tenta `renderStockPurchasesOverview()` (fallback `renderA8SupplierMatrix()`).
- **Limpar personalizações** (`clearA8SupplierAlertOverrides`, 13722): mantém defaults, zera `suppliers`; re-renderiza lista + overview.
- **Restaurar tudo** (`resetA8AlertSettings`, 13728): volta ao default (`{healthyMax:0, criticalFrom:50000, suppliers:{}}`), reabre o modal, re-renderiza overview.

### 6.9 Como o alerta "dispara"
Não há notificação/push. O "disparo" é **visual e em tempo de render**: ao salvar, `getA8SupplierRows` recomputa `status` por fornecedor (limites efetivos) e a UI repinta , badge de status na tabela e no ranking, cor das barras (`status-ok|attention|critical`), KPI "VALOR A PAGAR ATRASADO", e o filtro "Críticos". Mudar os limites pode mover um fornecedor de Saudável→Crítico no próximo render. Com os mocks, baixar `criticalFrom` de 50000 para abaixo de 18140 transforma Body Joy de `attention` em `critical`.

---

## 7. Pizzas A8 por fornecedor , MORTAS

As donuts SVG por fornecedor (`renderA8SupplierPie` v96/v97/v100 em 11845/11975/12184, `renderA8SupplierValuePies` v96/v99/v100 em 11897/12120/12236) desenhavam 7-8 pizzas por fornecedor (TOTAL/PAGO/A PAGAR/COMPRADOS/CHEGARAM/A CHEGAR/ATRASADOS, + ATIVAS/ATRASOS) com rótulos-folha (callout, leader-line via `a8PiePath`, viewBox 250×250, raio 74, paleta de 6 cores acrescentando `#E8D5A8`). Helpers `a8MoneyShort` (11966), `a8FormatPieValue` (12178), `a8TextEsc` (11972). **Mortas desde v101**: `renderA8SupplierValuePies` virou alias de `renderA8SupplierMatrix` (12739, depois 13364). Os IDs `stock-a8-pie-*` da geometria callout (rect 88×38, clamps de label) não aparecem na UI final. Status: **MORTO** , o A8 renderiza a matriz tabular.

---

## 8. Cores semânticas (paleta Compras)
- Verde "bom/pago/entregue": `#6FE0B0` / `#53C597` (`stock-a8-good`, dots delivered, status ok, finance paid).
- Âmbar/dourado "atenção/em aberto": `#C8A96E` (acento), `#F6C453` (warning/attention, finance open).
- Vermelho "crítico/atrasado/falta": `#F17A7A` / `#E05555` / `#E07B7B` (status critical, `stock-a8-bad`, finance high, dots pending).
- Azul `#6F8FF3`, Roxo `#A17BE0` , categorias/KPIs.
- Acentos de KPI por classe (`gold/green/yellow/red/blue/purple`) via `::before`.
- Sem animações próprias do módulo (só o spinner global do mapa, irrelevante aqui).

---

## 9. Estados, cliques, hovers (inventário de interação)
- **A7 lista:** clique no item → `setActiveStockPurchase(id)` → re-render completo do A7 + subtítulo. Item ativo ganha classe `active` (destaque).
- **A7 itens:** estático; linhas coloridas por status (pending/delivered/partial); `title` no nome do modelo (tooltip nativo).
- **A7 donuts:** tooltip nativo por `title` SVG; sem hover/clique JS.
- **A7 contagem regressiva:** só texto, sem cor/animação.
- **A8 header:** botão 3-pontos (`:hover` muda cor da borda para gold via CSS) → abre modal.
- **A8 KPIs:** estáticos, sem clique.
- **A8 ranking:** card com `title` (limites); sem clique.
- **A8 matriz:** busca (oninput, debounce-less), 4 botões de filtro (toggle `active`), `<tr title>` com limites; scroll horizontal (`min-width` da tabela) e vertical (overflow interno).
- **Modal alertas:** inputs `:focus` mudam borda para gold; checkbox `accent-color` gold; toggle liga/desliga inputs; "Padrão" reseta linha; busca filtra lista; preview ao vivo; 3 ações no rodapé; fechar por `×`.

---

## 10. Versões mortas (não renderizam, mas existem)
- **A7:** `renderStockPurchaseList` v91 (11306, 4 linhas + "itens"), `renderStockPurchaseItems` v91 (11326, 3 colunas com %), `renderStockPurchaseInfo` sem unpaid (11357).
- **A8 KPIs/agregação:** `getActiveStockPurchaseOverview` (11715, KPIs `activeOrders/totalValue/...withPaymentPending`), `getA8SupplierBreakdown` (11799 e 12070, base das pizzas v99/v100), `getA8OrderOverview` (12109, `every = activeOrders/lateOrders` → "1 a cada N atrasa", `stock-a8-late-ratio`), `renderStockPurchasesOverview` v94/v99/v101/v103 (11761/12138/12742/13367-pré-edição).
- **A8 tabelas intermediárias:** `ensureA8SupplierMatrixMarkup` v101 (12583, 11 col com "ITENS ATRASADOS"), v102 (12832, 12 col com "% financeiro a pagar"); `getA8SupplierRows` v101 (12638, `riskScore = unpaid + qtyPending*1200 + qtyLate*2500 + lateOrders*9000`, status por regra fixa); `renderA8SupplierTable`/`Ranking` v101/v102/v103 (12706/12908/13324, 13305/12887).
- **A8 alertas:** `getA8AlertSettings`/`set` v103 globais (13059/13073), `a8StatusFromOverdueValue` v103 sem supplier (13078), `ensureA8AlertModal`/`open` v103 (13095/13146), `a8StatusLabel` v102 retornava "OK" (v103 mudou para "Saudável", 13085).
- **A8 pizzas:** ver §7.

Candidatos a reintroduzir conscientemente na reconstrução (existiram no protótipo, não estão na UI viva): pizzas por fornecedor, "1 a cada N atrasa", lead time na tabela, total/atrasado-em-unidades na tabela.

---

## 11. Valores verificados em runtime (ref 2026-06-15)

Recomputados de `getPurchaseMetrics` + `getA8SupplierRows` v104 com `STOCK_SERIAL_REFERENCE_DATE = 2026-06-15`. **Os 5 pedidos estão ativos.**

**Por pedido** (subtotal · total · qty · entregue · pendente · pago · falta · prazo · countdown):
- PO-001 Johnson: 105.900 · 110.100 · 20 · 15 · 5 · 61.500 · 48.600 · 36d · 10d (a chegar).
- PO-002 Long Life: 50.440 · 53.540 · 20 · 15 · 5 · 29.500 · 24.040 · 32d · 19d.
- PO-003 XMaster: 66.400 · 69.200 · 19 · 11 · 8 · 18.000 · 51.200 · 45d · 45d.
- PO-004 Body Joy: 56.440 · 58.340 · 25 · 25 · 0 · 40.200 · 18.140 · 25d · **-41d (atrasado)**.
- PO-005 Johnson: 73.500 · 78.100 · 13 · 2 · 11 · 0 · 78.100 · 45d · 58d.

**Por fornecedor** (total · pago · a pagar · atrasado · comprado · recebido · pendente · diasAtraso · ativas · %entregue · %fin · riskScore · status):
- Body Joy: 58.340 · 40.200 · 18.140 · **18.140** · 25 · 25 · 0 · 41 · 1 · 100% · 31% · 68.791 · **attention** (único com pagamento vencido, pois arrivalDate 2026-05-05 < ref).
- Johnson: 188.200 · 61.500 · 126.700 · 0 · 33 · 17 · 16 · 0 · 2 · 52% · 67% · 10.136 · ok.
- XMaster: 69.200 · 18.000 · 51.200 · 0 · 19 · 11 · 8 · 0 · 1 · 58% · 74% · 4.096 · ok.
- Long Life: 53.540 · 29.500 · 24.040 · 0 · 20 · 15 · 5 · 0 · 1 · 75% · 45% · 1.923 · ok.

Ordem da matriz/ranking (riskScore desc): **Body Joy → Johnson → XMaster → Long Life**.

**KPIs agregados da faixa A8:** VALOR TOTAL = R$ 369.280; PAGO = R$ 149.200 (40,4%); A PAGAR = R$ 220.080 (59,6%); A PAGAR ATRASADO = R$ 18.140 (4,9%); ITENS A CHEGAR = 29; COMPRAS ATIVAS = 5 (subtexto: 4 fornecedores com valor a pagar).

Com o default de alerta (`criticalFrom = 50.000`), nenhum fornecedor atinge "critical" (o maior atrasado é Body Joy com 18.140 = attention). Para disparar "critical" em Body Joy, basta baixar o limite crítico para ≤ 18.140 (geral ou por fornecedor no modal).

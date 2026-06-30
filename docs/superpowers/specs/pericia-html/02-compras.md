# Perícia HTML , Módulo COMPRAS (A7 detalhe + A8 resumo/fornecedores)

> Arquivo periciado: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.972 linhas).
> Escopo: o cartão **A7 , Compras** (detalhe de uma compra) e o cartão **A8 , Resumo das compras ativas / por fornecedor**, dentro do módulo Estoque (`#mod-estoque`).
> Toda a lógica abaixo é citada da fonte real. Onde houver evolução por "versões" (blocos `<script>` rotulados v91…v104 que **redefinem** as mesmas funções), o comportamento **efetivo é sempre o da ÚLTIMA definição carregada** , JS lê de cima para baixo e a última `function X(){}` sobrescreve as anteriores. Documento as versões intermediárias só quando ajudam a entender a intenção, mas marco claramente o que vale no fim.

---

## 0. Aviso crítico de reconstrução , "versões" que se sobrescrevem

O protótipo foi construído por iterações empilhadas. As mesmas funções são redeclaradas várias vezes em blocos `<script>` distintos. Versão efetiva (a que roda):

| Função | Versão efetiva | Linha |
|---|---|---|
| `renderStockPurchaseList` | v92 | 11590 |
| `renderStockPurchaseItems` | v92 (4 colunas) | 11610 |
| `renderStockPurchaseInfo` | v93 (com "falta pagar") | 11650 |
| `renderPurchasePie` (A7) | única | 11284 (viva) |
| `renderStockPurchasesDashboard` | original + wrapper | 11408 / 11785 |
| `renderStockPurchasesOverview` | **v104** | 13367 |
| `getA8SupplierRows` | **v104** | 13733 |
| `renderA8SupplierTable` | **v104** (11 colunas) | 13779 |
| `renderA8SupplierRanking` | **v104** | 13816 |
| `ensureA8SupplierMatrixMarkup` | **v104** | 13837 |
| `getA8AlertSettings` / `setA8AlertSettings` | **v104** (por fornecedor) | 13500 / 13517 |
| `a8StatusFromOverdueValue` | **v104** (por fornecedor) | 13534 |
| `a8StatusLabel` | **v103** ("Saudável", não "OK") | 13085 |
| `renderA8SupplierValuePies` | **v101+** , vira alias de `renderA8SupplierMatrix` | 12739 / 13364 |
| `openA8AlertSettingsModal` / `renderA8SupplierAlertRows` | **v104** | 13609 / 13639 |

**Consequência grande #1:** as pizzas SVG por fornecedor (`renderA8SupplierPie` / `renderA8SupplierValuePies`) **morreram** na versão final. A partir do v101, `renderA8SupplierValuePies = () => renderA8SupplierMatrix()`. O código das donuts existe (v96/v97/v100), mas o A8 final **renderiza a matriz tabular**, não as pizzas. As pizzas do A7 (`renderPurchasePie`) continuam vivas.

**Consequência grande #2:** o markup estático do A8 no HTML (linhas 6400+, blocos "VALORES", "QUANTIDADES" com `stock-a8-active-orders`, `stock-a8-late-ratio` etc.) é **inteiramente substituído** em runtime por `ensureA8SupplierMatrixMarkup()` (v104), que reescreve `.stock-a8-body.innerHTML`. Logo, KPIs antigos como "lead time geral", "1 a cada N atrasa" (`getA8OrderOverview`) **não aparecem na tela final** , ficaram em versões mortas (v99). Documento-os abaixo na seção "versões mortas" para fidelidade, mas a UI final do A8 tem 6 KPIs + ranking + tabela.

---

## 1. Layout geral da tela de Compras

A tela de Compras vive dentro do módulo **Estoque** (`#mod-estoque .stock-container`), como dois cartões grandes na grade de cartões do estoque (A1…A8). A ordem na vertical:

1. **A7 , Compras** (`.stock-card.stock-a7`, linha 6292): detalhe de UMA compra selecionada.
2. **A8 , Resumo das compras ativas / Compras por fornecedor** (`.stock-card.stock-a8`, linha 6394).

A grade do estoque é fixada por CSS (v101, linha 2265): `grid-template-rows:auto 420px 660px 540px 760px`; o A8 ocupa 760px de altura, com `overflow:hidden` (a rolagem fica interna na tabela).

### 1.1 A7 , Compras (3 colunas)
Cabeçalho: ícone de carrinho + título "A7 , Compras" + subtítulo `#stock-purchases-subtitle` (default "Lista de compras · itens · indicadores do pedido"; em runtime vira `"{label} · {fornecedor} · atualização da entrega e categorias"`).

Corpo `.stock-purchases-body` em 3 colunas:
- **Coluna esquerda , LISTAS DE COMPRAS** (`#stock-purchase-list`): botões de compra, um por pedido.
- **Coluna central , ITENS COMPRADOS**: subtítulo `#stock-purchase-items-sub` + tabela `.stock-purchase-table` (`#stock-purchase-items-body`) + estado vazio `#stock-purchase-items-empty`.
- **Coluna direita , INFORMAÇÕES DA COMPRA**: grade de 10 cards de KPI (`.stock-purchase-info-grid`) + 2 donuts (`.stock-purchase-charts-grid`).

### 1.2 A8 , final (matriz por fornecedor, v104)
Cabeçalho: ícone + título reescrito para "A8 , COMPRAS POR FORNECEDOR" + subtítulo "Alertas personalizados por fornecedor, vinculados ao valor a pagar atrasado." + **botão de 3 pontos** injetado no header (`#stock-a8-alert-settings-btn`, classe `stock-more-btn stock-a8-alert-btn`) que abre o modal de alertas.

Corpo (`.stock-a8-matrix`):
- **Faixa de 6 KPIs** (`.stock-a8-summary-strip`, grid de 6 colunas).
- **Bloco analítico** (`.stock-a8-analytics`) em 2 painéis: ranking de fornecedores em alerta + matriz comparativa (tabela com busca/filtros).

---

## 2. Dados-fonte (mock)

`STOCK_PURCHASE_ORDERS` (linha 11143) , array de **5 pedidos**. Estrutura de cada pedido:

```
{ id, label, supplier, purchaseDate, arrivalDate, user, freight, amountPaid,
  items:[ {model, qty, deliveredQty, unitCost, category}, ... ] }
```

Os 5 pedidos (resumo): PO-2026-001 "COMPRA 001" / Johnson / compra 2026-05-20 / chegada 2026-06-25 / Ícaro Victor / frete 4200 / pago 61500; PO-2026-002 "COMPRA 002" / Long Life / 2026-06-02→2026-07-04 / Fernanda Almeida / 3100 / 29500; PO-2026-003 "COMPRA 003" / XMaster / 2026-06-15→2026-07-30 / João Pedro / 2800 / 18000; PO-2026-004 "COMPRA 004" / Body Joy / 2026-04-10→2026-05-05 / Carlos Souza / 1900 / 40200; PO-2026-005 "COMPRA 005" / Johnson / 2026-06-28→2026-08-12 / Marina Nunes / 4600 / 0. Categorias dos itens: `CARDIO`, `FORÇA`, `PESO LIVRE`. `category` é livre, mas o A7 só agrega essas 3 no donut de categorias.

Não existe campo `paymentDueDate` nos dados; portanto, em todo cálculo financeiro de atraso o A8 usa `order.arrivalDate` como **vencimento financeiro padrão** (decisão explicitada no texto do modal: "a data de chegada da compra é usada como vencimento financeiro padrão").

`ACTIVE_STOCK_PURCHASE_ID` inicia no 1º pedido (`STOCK_PURCHASE_ORDERS[0].id`).

---

## 3. Funções de cálculo compartilhadas (helpers)

- `purchaseFormatCurrency(v)` (11231): usa `formatStockCurrency` se existir, senão `toLocaleString('pt-BR',{style:'currency',currency:'BRL'})`.
- `purchaseFormatDate(v)` (11235): "—" se vazio; senão data pt-BR.
- `purchaseDayDiff(start,end)` (11241): `max(0, round((end-start)/86400000))` , dias entre datas, nunca negativo. Usado para **PRAZO** e **lead time**.
- `purchaseDaysUntil(dateStr)` (11247): `round((target - ref)/dia)`, onde `ref` = `getPurchaseReferenceDate()` zerada em 00:00. **Pode ser negativo** (atrasado). Usado para **contagem regressiva** e para detectar atraso.
- `getPurchaseReferenceDate()` (11223): retorna `STOCK_SERIAL_REFERENCE_DATE` (data de referência global do estoque) se for um `Date`; senão `new Date()`. Ou seja, "hoje" do dashboard é a data de referência do estoque, não necessariamente o relógio real.
- `getPurchaseOrder(id)` (11254): pedido por id, fallback no 1º.
- **`getPurchaseMetrics(order)` (11257) , o coração:**
  - `subtotal` = Σ `unitCost * qty` de todos os itens.
  - `total` = `subtotal + freight`.
  - `qty` = Σ `qty`.
  - `deliveredQty` = Σ `min(qty, deliveredQty)` (clampa entrega ≤ comprado).
  - `paid` = `order.amountPaid`.
  - `paidPct` = `total>0 ? paid/total*100 : 0`.
  - `deadline` = `purchaseDayDiff(purchaseDate, arrivalDate)` (PRAZO em dias).
  - `countdown` = `purchaseDaysUntil(arrivalDate)` (dias até chegar; negativo = atrasado).
  - `categoryMap` = `{FORÇA, CARDIO, PESO LIVRE}` somando `qty` por categoria (chaves extras são adicionadas dinamicamente se houver outra categoria, mas o donut só lê as 3 fixas).
  - retorna `{items, subtotal, total, qty, deliveredQty, paid, paidPct, deadline, countdown, categoryMap}`.
- `a8SafeHtml(v)` (12567) / `a8TextEsc` (11972): escape de HTML.
- `a8CompactMoney(v)` (12570): `≥1mi → "R$ X,Y mi"`; `≥1mil → "R$ X mil"`; senão moeda cheia.
- `a8FormatFullMoney(v)` (13090): sempre moeda cheia (BRL).
- `a8Number(v)` (12580): `toLocaleString('pt-BR')`.

---

## 4. A7 , Detalhe da compra

### 4.1 Lista de compras , `renderStockPurchaseList()` (v92, linha 11590)
Renderiza `#stock-purchase-list`. Um `<button.stock-purchase-list-item>` por pedido, marcado `active` quando `order.id === ACTIVE_STOCK_PURCHASE_ID`. Clique → `setActiveStockPurchase(id)` (que seta o id ativo e chama `renderStockPurchasesDashboard()`).

Conteúdo de cada item (v92, efetivo):
- **Topo:** `order.label` (ex.: "COMPRA 001") + badge `"{qty} un."` (quantidade total comprada).
- **Meta (3 linhas):**
  - `<b>{fornecedor}</b>`
  - `Chegada: {purchaseFormatDate(arrivalDate)}`
  - `Restante: {countdown}` , onde `countdown` aqui é formatado curto: `>0 → "{n}d"`; `===0 → "hoje"`; `<0 → "+{|n|}d"` (o "+" indica dias de atraso).

> Nota: a versão v91 (morta, 11306) mostrava 4 linhas (Fornecedor / Compra / Chegada / `Entregue: x/y`) e badge "{qty} itens". A v92 enxugou para fornecedor + chegada + restante.

### 4.2 Itens comprados , `renderStockPurchaseItems(order)` (v92, linha 11610)
Renderiza a tabela `#stock-purchase-items-body`. Cabeçalho estático (linha 6311), **4 colunas**:

| Coluna (rótulo exato) | Conteúdo |
|---|---|
| **Modelo** | dot de status + nome do modelo (`item.model`, com `title`) |
| **Quantidade comprada** | `item.qty` |
| **Quantidade que chegou** | `deliveredQty` = `min(qty, max(0, deliveredQty))` |
| **Quantidade a receber** | `remainingQty` = `max(0, qty - deliveredQty)` |

Subtítulo `#stock-purchase-items-sub` = `"{label} · {fornecedor} · {N} modelo(s) na compra."`.

**Status por linha** (`statusClass`):
- `deliveredQty <= 0` → `pending`
- `deliveredQty >= qty` → `delivered`
- caso intermediário → `partial`

Cores semânticas (CSS 3174-3731):
- dot `delivered`: verde `#6FE0B0`; `pending`: vermelho `#F17A7A`; `partial`: (estilo próprio, âmbar/parcial em 3698).
- fundo da linha: `delivered` verde translúcido `rgba(62,207,142,.045)`; `pending` vermelho `rgba(224,85,85,.045)`; `partial` próprio. As células 2/3/4 recebem ênfase de cor por nth-child.

Estado vazio: sem `order` → limpa tbody, mostra `#stock-purchase-items-empty` ("Selecione uma compra para visualizar os itens.") e subtítulo "Selecione uma compra à esquerda."

> Nota: v91 (morta) tinha só 3 colunas (Modelo / qty / % do total). A v92 trocou a coluna "%" por "chegou" + "a receber".

### 4.3 Informações da compra , `renderStockPurchaseInfo(order)` (v93, linha 11650)
Preenche 10 cards de KPI (grade `.stock-purchase-info-grid`, markup 6327-6377) via `setText(id, …)`. Rótulos EXATOS e valores:

| # | Rótulo (label) | id valor | Valor | Subtexto |
|---|---|---|---|---|
| 1 | **VALOR DOS PRODUTOS** | `stock-purchase-value` | `purchaseFormatCurrency(subtotal)` | `Subtotal de {N} modelo(s).` |
| 2 | **VALOR TOTAL [COM FRETE]** | `stock-purchase-total` | `purchaseFormatCurrency(total)` | `Frete/encargos simulados: {freight}.` |
| 3 | **PRAZO** | `stock-purchase-deadline` | `{deadline} dias` | `Prazo entre {dataCompra} e {dataChegada}.` |
| 4 | **DIA DE CHEGADA** | `stock-purchase-arrival` | `purchaseFormatDate(arrivalDate)` | `Fornecedor: {supplier}.` |
| 5 | **CONTAGEM REGRESSIVA** | `stock-purchase-countdown` | ver 4.3.1 | ver 4.3.1 |
| 6 | **QUANTIDADE DE ITENS COMPRADOS** | `stock-purchase-qty` | `qty` | `{deliveredQty} já entregues.` |
| 7 | **USUÁRIO QUE FEZ A COMPRA** | `stock-purchase-user` | `order.user` | `Compra registrada por {user}.` |
| 8 | **DATA DA COMPRA** | `stock-purchase-date` | `purchaseFormatDate(purchaseDate)` | `Pedido {label}.` |
| 9 | **VALOR JÁ PAGO** (card `highlight`) | `stock-purchase-paid` | `purchaseFormatCurrency(paid)` | `{paidPct}% do valor total já pago.` |
| 10 | **FALTA PAGAR** (card `warning`) | `stock-purchase-unpaid` | `purchaseFormatCurrency(unpaid)` | `{unpaidPct}% ainda pendente de pagamento.` |

- `unpaid` = `max(0, total - paid)`; `unpaidPct` = `total>0 ? unpaid/total*100 : 0`.
- Card 9 "VALOR JÁ PAGO" tem classe `highlight`: valor em verde `#6FE0B0` + barra superior verde (`::before` gradiente).
- Card 10 "FALTA PAGAR" tem classe `warning`: borda âmbar `rgba(246,196,83,.24)`, valor âmbar `#F6C453`, barra superior âmbar, subtexto em negrito.

#### 4.3.1 Contagem regressiva , cálculo, texto e (não) coloração
`countdown = metrics.countdown = purchaseDaysUntil(arrivalDate)` (dias entre a data de referência e a chegada).
- **Valor exibido** (`#stock-purchase-countdown`):
  - `countdown > 0` → `"{countdown} dias"`
  - `countdown === 0` → `"Chega hoje"`
  - `countdown < 0` → `"Atrasado {|countdown|} dias"`
- **Subtexto** (`#stock-purchase-countdown-sub`):
  - `>0` → "Tempo restante até a chegada prevista."
  - `=0` → "Data de chegada é hoje."
  - `<0` → "A data prevista já passou."

**Coloração/animação:** No protótipo, a contagem regressiva **NÃO** recebe cor dinâmica nem animação por estado. `renderStockPurchaseInfo` apenas troca o texto via `textContent`; nenhuma classe (ex.: vermelho para atrasado) é aplicada ao card de contagem. O card herda o estilo padrão dos `.stock-purchase-info-card` (acento dourado). A única animação CSS do arquivo inteiro é `@keyframes spin` (spinner de mapa, linha 455), sem relação com Compras. Ou seja: o estado "Chega hoje"/"Atrasado" é comunicado **só pelo texto**, não por cor pulsante. (Ponto de melhoria óbvio na reconstrução: colorir/animar atrasado.)

### 4.4 Pizzas do A7 , `renderPurchasePie(containerId, legendId, data)` (linha 11284)
Donut SVG vetorial puro (viewBox 0 0 176 176, centro 88,88, raio 66). Chamado 2x dentro de `renderStockPurchaseInfo`:
1. **ENTREGA DO PEDIDO** (`stock-purchase-delivery-pie` + legenda): dados `[{Entregues: deliveredQty}, {Pendentes: qty-deliveredQty}]`.
2. **CATEGORIAS DA COMPRA** (`stock-purchase-category-pie` + legenda): `[{FORÇA}, {CARDIO}, {PESO LIVRE}]` somando `qty` por categoria.

Paleta fixa (5 cores, ciclo `idx%len`): `#C8A96E` (dourado), `#6F8FF3` (azul), `#53C597` (verde), `#E07B7B` (vermelho), `#A17BE0` (roxo).
- Fatias via `purchaseSlicePath(cx,cy,r,start,end)` (path arc; `largeArc=1` se ângulo>180°). Cada fatia tem `title` "label · valor · pct%".
- Centro do donut: rótulo "Total" + valor total (`toLocaleString`).
- Legenda: dot colorido + nome + **percentual** (1 casa decimal). `total` = soma dos valores; pct por item.
- Interação: nativa por `title` SVG (tooltip do browser); sem hover JS.

---

## 5. A8 , Resumo das compras ativas / por fornecedor

### 5.1 Definição de "compra ativa"
`getActiveStockPurchaseOrders()` (11709): filtra pedidos onde `deliveredQty < qty` **OU** `paid < total` , ou seja, pedido com entrega pendente OU pagamento pendente. (Pedido 100% entregue E 100% pago some do A8.)

### 5.2 Agregação por fornecedor , `getA8SupplierRows()` (v104, linha 13733)
Itera as compras ativas, agrupa por `supplier` (fallback "Fornecedor não informado"). Por pedido calcula via `getPurchaseMetrics`:
- `total`, `paid`, `unpaid = max(0, total-paid)`, `qty`, `deliveredQty`, `pendingQty = max(0, qty-deliveredQty)`.
- `daysUntilDue = purchaseDaysUntil(order.paymentDueDate || order.arrivalDate)` , como não há `paymentDueDate`, usa `arrivalDate`.
- `isPaymentLate = unpaid > 0 && daysUntilDue < 0`.
- `isDeliveryLate = pendingQty > 0 && daysUntilDue < 0`.

Acumula por fornecedor: `total, paid, unpaid, qtyTotal, qtyDelivered, qtyPending`; `qtyLate += pendingQty` se entrega atrasada; se pagamento atrasado: `lateUnpaid += unpaid`, `lateOrders += 1`, `maxPaymentDelayDays = max(…, |daysUntilDue|)`; `activeOrders += 1`; `leadSum += deadline`, `leadCount += 1`.

Derivados por fornecedor:
- `deliveryPct = qtyDelivered/qtyTotal*100`.
- `unpaidPct = unpaid/total*100` (% financeiro a pagar).
- `lateUnpaidPct = lateUnpaid/total*100`.
- `avgLead = leadSum/leadCount` (lead time médio em dias).
- `alertCfg = getA8SupplierAlertConfig(supplier)` (limites de alerta efetivos + origem).
- `status = a8StatusFromOverdueValue(lateUnpaid, supplier)` , **ok / attention / critical** com base no valor atrasado vs limites do fornecedor.
- `riskScore = lateUnpaid + maxPaymentDelayDays*1200 + unpaid*0.08`.

Ordenação: `riskScore desc → lateUnpaid desc → unpaid desc → nome (pt-BR)`.

### 5.3 KPIs do A8 (faixa de 6 cards) , `renderStockPurchasesOverview()` (v104, 13367)
Recalcula totais somando as linhas de fornecedor (`getA8SupplierRows`). Os **6 KPIs efetivos** (markup v104 em `ensureA8SupplierMatrixMarkup`):

| # | Rótulo | id | Fórmula | Subtexto |
|---|---|---|---|---|
| 1 | **VALOR TOTAL EM COMPRAS** (`gold`) | `stock-a8-total` | Σ `total` (subtotal+frete de todos ativos) | `Soma de {activeOrders} compra(s) ativa(s), já com frete.` |
| 2 | **VALOR PAGO** (`green`) | `stock-a8-paid` | Σ `paid` | `{paidPct}% do valor total já pago.` |
| 3 | **VALOR A PAGAR** (`yellow`) | `stock-a8-unpaid` | Σ `unpaid` | `{unpaidPct}% ainda pendente.` |
| 4 | **VALOR A PAGAR ATRASADO** (`red`) | `stock-a8-overdue-unpaid` | Σ `lateUnpaid` (vencido e em aberto) | `{lateUnpaidPct}% do valor total está vencido.` |
| 5 | **ITENS A CHEGAR** (`blue`) | `stock-a8-qty-pending` | Σ `qtyPending` | `{qtyPending} item(ns) ainda precisam chegar.` |
| 6 | **COMPRAS ATIVAS** (`purple`) | `stock-a8-active-orders` | Σ `activeOrders` | `{N} fornecedor(es) com valor a pagar.` |

Onde `paidPct = paid/total*100`, `unpaidPct = unpaid/total*100`, `lateUnpaidPct = lateUnpaid/total*100` (sobre os totais agregados). Cada `.stock-a8-kpi` tem barra/acento de cor pela classe (gold/green/yellow/red/blue/purple) via `::before`.

### 5.4 Ranking , `renderA8SupplierRanking(rows)` (v104, 13816)
Painel "FORNECEDORES EM ALERTA" (`#stock-a8-critical-ranking`). Pega o **top 6** por `riskScore desc`. `maxLate` = maior `lateUnpaid`/`unpaid` do top (para normalizar a barra). Cada card (`.stock-a8-rank-card`):
- Topo: nome do fornecedor + badge de status (`.stock-a8-status {ok|attention|critical}` → "Saudável"/"Atenção"/"Crítico").
- Barra de "vencido" (`.stock-a8-overdue-track`/`-fill status-{status}`), largura `max(3, min(100, lateUnpaid/maxLate*100))%`.
- Meta (4 campos): **Atrasado:** `a8CompactMoney(lateUnpaid)` · **Dias:** `maxPaymentDelayDays` · **A pagar:** `a8CompactMoney(unpaid)` · **% fin.:** `unpaidPct` (1 casa).
- `<span.stock-a8-alert-source>` "Personalizado"/"Padrão geral" (oculto via CSS dentro de status, mas presente no card).
- `title` do card = texto dos limites configurados (`a8SupplierConfigText`).
- Vazio: "Sem fornecedores para exibir."

### 5.5 Matriz comparativa , `renderA8SupplierTable(rows)` (v104, 13779)
Tabela `.stock-a8-table` (`#stock-a8-supplier-tbody`). `min-width:1320px` com rolagem horizontal. Cabeçalho v104, **11 colunas** , confirmadas e detalhadas:

| # | Coluna (th exato) | Largura | Conteúdo da célula | Cor/semântica |
|---|---|---|---|---|
| 1 | **Fornecedor** | 150px | `supplier` + `<span.stock-a8-alert-source>` ("Personalizado"/"Padrão geral") | nome em destaque |
| 2 | **Ativas** | 72px | `activeOrders` (nº de compras ativas do fornecedor) | neutro |
| 3 | **% entregue** | 150px | `deliveryPct` (0 casas) + mini-barra `.stock-a8-delivery-fill status-{status}` | **barra colorida pelo status financeiro** (ver quirk abaixo) |
| 4 | **Comprado** | 88px | `qtyTotal` | neutro |
| 5 | **Recebido** | 88px | `qtyDelivered` | verde (`stock-a8-good`) |
| 6 | **Pendente** | 88px | `qtyPending` | neutro |
| 7 | **A pagar** | 120px | `a8CompactMoney(unpaid)` | `unpaid>0` vermelho, senão verde |
| 8 | **% financeiro a pagar** | 150px | `unpaidPct` (0 casas) + barra `.stock-a8-finance-fill finance-{level}` | level por `a8FinanceLevel(pct)`: 0→paid(verde), <70→open(âmbar), ≥70→high(vermelho) |
| 9 | **A pagar atrasado** | 160px | `a8CompactMoney(lateUnpaid)` + barra `.stock-a8-overdue-fill status-{status}` | `lateUnpaid>0` vermelho, senão verde; largura `max(4 se>0, min(100, lateUnpaid/maxLate*100))` |
| 10 | **Dias atraso** | 92px | `maxPaymentDelayDays` | `>0` vermelho |
| 11 | **Status** | 112px | badge `.stock-a8-status {status}` ("Saudável"/"Atenção"/"Crítico") + source | ok verde / attention âmbar / critical vermelho |

- `<tr title="…">` = `a8SupplierConfigText(supplier)` (limites do alerta).
- Subtítulo `#stock-a8-table-subtitle` = `"{N} fornecedor(es) exibido(s) · alertas por valor a pagar atrasado."`.
- Hint `#stock-a8-alert-hint` = `"Padrão geral: saudável até {X} · crítico a partir de {Y}. {K} fornecedor(es) com limites personalizados."`.
- `colspan` do estado vazio = 11 ("Nenhum fornecedor encontrado para o filtro atual." / "Carregando fornecedores...").

> **Quirk a preservar/corrigir:** a barra de "% entregue" usa `status-{item.status}`, e `status` no v104 vem do **valor a pagar atrasado** (financeiro), não da entrega. Então a cor da barra de entrega reflete o alerta financeiro, não o quão entregue está. Pode ser intencional (mesma "saúde" geral) ou bug visual , marcar como decisão na reconstrução.

**Colunas que existiram em versões anteriores (mortas) , para o histórico:**
- v102 (12908) tinha **12 colunas**: Fornecedor, Ativas, % entregue, Comprado, Recebido, Pendente, **Atrasado**, **Total**, A pagar, **% financeiro a pagar**, **Lead time**, Status.
- A v104 **removeu** "Atrasado" (un.), "Total" (R$) e "Lead time" da tabela; e **adicionou** "A pagar atrasado" (R$) e "Dias atraso". `avgLead`/lead time continua calculado em `getA8SupplierRows` mas não é mais exibido na tabela final. "Total" (valor cheio do fornecedor) e "Atrasado" (un.) idem.

### 5.6 Filtros e busca da matriz
- Busca `#stock-a8-supplier-search` → seta `A8_SUPPLIER_QUERY` e re-renderiza (normaliza NFD, case-insensitive, `includes` no nome).
- 4 botões `.stock-a8-filter-btn` (`setA8SupplierFilter`): **Todos** (`all`), **Críticos** (`critical` → `status==='critical'`), **Pendentes** (`pending` → `unpaid>0 || qtyPending>0`), **Atrasados** (`late` → `lateUnpaid>0 || qtyLate>0 || lateOrders>0`). Botão ativo ganha classe `active`.

### 5.7 `renderA8SupplierMatrix()` (13358) e `renderStockPurchasesDashboard`
`renderA8SupplierMatrix()` = `ensureA8SupplierMatrixMarkup()` (garante o markup v104) → `getA8SupplierRows()` → `renderA8SupplierRanking` + `renderA8SupplierTable`. `renderA8SupplierValuePies` é alias dela. `renderStockPurchasesDashboard` (A7) foi "envelopado" para também chamar `renderStockPurchasesOverview` (A8) em cada atualização.

---

## 6. Modal de alertas configuráveis , `openA8AlertSettingsModal` + `renderA8SupplierAlertRows` (v104)

Aberto pelo botão de 3 pontos no header do A8 (`ensureA8AlertHeaderButton`, 13178). Modal `#modal-a8-alert-settings` (`.stock-a8-alert-modal.supplier-mode`, até 980px, 88vh, scroll interno).

### 6.1 Conceito
O **gatilho do alerta é o "valor a pagar atrasado"** (`lateUnpaid`) por fornecedor. Cada fornecedor cai em:
- **Saudável** (`ok`): `lateUnpaid <= healthyMax`.
- **Crítico** (`critical`): `lateUnpaid >= criticalFrom`.
- **Atenção** (`attention`): entre os dois.
(`a8StatusFromOverdueValue`, 13534.)

### 6.2 Campos
- **Padrão geral , Saudável até** (`#a8-alert-default-healthy-max`, number, min 0, step 100, default 0).
- **Padrão geral , Crítico a partir de** (`#a8-alert-default-critical-from`, number, default 50000).
- **Preview "Faixas resultantes"** (3 chips ok/attention/critical) atualizado ao vivo por `refreshA8AlertPreview`: "Até {X} atrasado" / "Acima de {X} e abaixo de {Y}" / "A partir de {Y} atrasado".
- **Personalização por fornecedor** (`renderA8SupplierAlertRows`): lista com busca (`#a8-alert-supplier-search` → `A8_ALERT_SUPPLIER_QUERY`), contador "{N} fornecedor(es)". Cada linha (`.stock-a8-alert-supplier-row`, grid de 5 colunas):
  - Nome + meta `"{lateUnpaid} atrasado · {statusLabel} · personalizado|padrão geral"`.
  - Checkbox **"Personalizar"** (`.a8-alert-supplier-custom`).
  - Input **"Saudável até"** (`.a8-alert-supplier-healthy`, desabilitado se não personalizado).
  - Input **"Crítico a partir de"** (`.a8-alert-supplier-critical`, idem).
  - Botão **"Padrão"** (reset da linha: desmarca personalização e repõe valores do padrão geral).
  - Linha ganha classe `custom` (destaque dourado) quando o toggle está ligado. Ordenação da lista: `lateUnpaid desc → nome`.

### 6.3 Normalização e persistência
- `a8NormalizeAlertPair(h,c)` (13491): `h=max(0,h)`; `c=max(h+1,c)` , garante crítico sempre acima do saudável.
- `setA8AlertSettings` (13517): grava em `localStorage` chave **`stock_a8_alertas_valor_atrasado_v1`** o JSON `{defaults:{healthyMax,criticalFrom}, suppliers:{ "Nome": {healthyMax,criticalFrom}, ... }}`. Só persiste fornecedores marcados como personalizados.
- `getA8AlertSettings` (13500): lê e normaliza defaults + cada supplier; tolerante a formato antigo (lê `parsed.defaults` ou o próprio `parsed`).
- `getA8SupplierAlertConfig(supplier)` (13528): retorna `{healthyMax, criticalFrom, source:'custom'|'default'}` , custom se houver regra própria, senão o padrão geral.

### 6.4 Ações do modal
- **Salvar alertas** (`saveA8AlertSettings`, 13698): lê defaults dos inputs; varre as linhas, salva só as marcadas como personalizadas; **preserva** personalizações de fornecedores que não estavam na lista filtrada no momento (merge com o anterior); persiste; fecha; re-renderiza `renderStockPurchasesOverview`.
- **Limpar personalizações** (`clearA8SupplierAlertOverrides`, 13722): mantém defaults, zera `suppliers`; re-renderiza lista + overview.
- **Restaurar tudo** (`resetA8AlertSettings`, 13728): volta ao default (`{healthyMax:0, criticalFrom:50000, suppliers:{}}`), reabre o modal e re-renderiza.
- **Fechar** (`closeA8AlertSettingsModal`): remove classe `open`.

### 6.5 Como o alerta "dispara"
Não há notificação/push: o "disparo" é **visual e em tempo de render**. Ao salvar, `getA8SupplierRows` recomputa `status` por fornecedor (via limites efetivos) e a UI repinta: badge de status na tabela/ranking, cor das barras (`status-ok|attention|critical`), KPI "VALOR A PAGAR ATRASADO", e o filtro "Críticos". Mudar os limites pode mover um fornecedor de Saudável→Crítico instantaneamente no próximo render.

---

## 7. Versões mortas (não renderizam na tela final, mas existem no arquivo)

Para fidelidade total na reconstrução, registro o que ficou sobrescrito:
- **Pizzas SVG por fornecedor** (`renderA8SupplierPie` v96/v97/v100, `renderA8SupplierValuePies` v96/v99/v100): donuts de TOTAL/PAGO/A PAGAR/COMPRADOS/CHEGARAM/A CHEGAR/ATRASADOS/ATIVAS/ATRASOS por fornecedor, com rótulos-folha (callout) ligados por linha (`a8PiePath`, viewBox 250x250, raio 74). Paleta de 6 cores (acrescenta `#E8D5A8`). `a8MoneyShort`/`a8FormatPieValue` formatam money/qty/orders. **Mortas** desde v101 (alias para a matriz).
- **`getActiveStockPurchaseOverview()` (11715, ainda usado por versões antigas)** , KPIs do A8 v94/v99: `activeOrders, totalValue, totalPaid, totalUnpaid, paidPct, unpaidPct, qtyTotal, qtyDelivered, qtyPending, qtyLate, withDeliveryPending, withPaymentPending`. `qtyLate` = itens pendentes de pedidos cuja `arrivalDate` já passou. Esses KPIs (incl. "X já chegou %", "X a chegar %") apareciam no markup estático mas foram substituídos pela faixa de 6 KPIs do v104.
- **`getA8OrderOverview()` (12109)** , KPIs "compras atrasadas x no prazo" e **"1 a cada N atrasa"**: `lateOrders` (pedidos ativos com entrega atrasada), `onTimeOrders = activeOrders - lateOrders`, `every = activeOrders/lateOrders`. Exibidos no v99 como `stock-a8-late-ratio` ("1 a cada {every}") e `stock-a8-active-orders-sub` ("{late} atrasada(s) · {onTime} no prazo"). **Não estão na UI v104.**
- **`getA8SupplierRows` v102 (12638)** , versão com `riskScore = unpaid + qtyPending*1200 + qtyLate*2500 + lateOrders*9000` e status por regra fixa (`qtyLate>0 || deliveryPct<60 || unpaidPct>70 → critical`; `qtyPending>0 || unpaid>0 || deliveryPct<90 → attention`). Substituída pela lógica de alerta por valor atrasado no v104.
- **`getA8AlertSettings` v103 (13059)** , versão global (sem per-supplier) e `a8StatusLabel` v102 retornava "OK" (v103 mudou para "Saudável").

Se a reconstrução quiser "tudo que o protótipo já teve", esses elementos (pizzas por fornecedor, "1 a cada N atrasa", lead time na tabela, total/atrasado-un. na tabela) são candidatos a reintroduzir conscientemente , no HTML final eles não aparecem.

---

## 8. Resumo de cores semânticas (paleta Compras)
- Verde "bom/pago/entregue": `#6FE0B0` / `#53C597` (texto `stock-a8-good`, dots delivered, status ok, fill finance paid).
- Âmbar/dourado "atenção/em aberto": `#C8A96E` (acento), `#F6C453` (warning/attention, finance open).
- Vermelho "crítico/atrasado/falta": `#F17A7A` / `#E05555` / `#E07B7B` (status critical, `stock-a8-bad`, finance high, dots pending).
- Azul `#6F8FF3`, Roxo `#A17BE0` , categorias/KPIs.
- Sem animações próprias do módulo (só o spinner global de mapa, irrelevante aqui).

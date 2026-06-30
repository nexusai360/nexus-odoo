# Perícia HTML , Módulo VENDAS (telas C1 a C10 + comparativo)

> Fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> (18.971 linhas, protótipo monolítico vanilla; gráficos em SVG e barras em HTML/CSS).
> Esta perícia documenta TODA a tela de Vendas, com números de linha reais.
>
> **Aviso de arquitetura (importantíssimo):** a tela de Vendas foi construída por
> "patches" sucessivos (`v114`, `v120`...`v140`), cada um num `<script>`/`<style>`
> separado que **redefine** funções e CSS criados antes. Várias funções existem em
> 2 ou 3 versões (`renderSalesC5`, `renderSalesC6`, `renderSalesC7`, `renderSalesC10`).
> Na reconstrução vale **sempre a última versão** (a de maior `vNNN`, mais abaixo no
> arquivo), porque ela sobrescreve `window.renderSalesXX` e o CSS com `!important`
> com maior especificidade/ordem. Abaixo eu marco qual versão vence.

---

## 0. Visão geral da tela e layout final

A tela inteira vive em `#mod-vendas` (markup base linhas 6822-7058). Estrutura:

1. **Topbar C1** (linhas 6824-6835): um único "chip" botão (`openSalesPeriodModal()`)
   que mostra o período global selecionado. Kicker "C1", valor principal
   (`#sales-period-value`, ex.: "Últimos 30 dias"), detalhe (`#sales-period-detail`),
   sub ("Clique para alterar") e seta ▾.
2. **`.sales-container`** (grid de cards), markup na ordem do DOM:
   C2 → C3 → C4 → C5 → C6 → **C10** → C7 → C8 → C9. (Note: no HTML cru o C10 vem
   ANTES do C7, linhas 6984 e 6997; o posicionamento visual é todo por CSS grid.)
3. Dois modais: **`#modal-sales-compare`** (configurar C8/C9, 7062-7095) e
   **`#modal-sales-period`** (seletor de período C1, 7097-7175).

### Layout em grade (resolvido pela ÚLTIMA regra de cada card)

Grid de **6 colunas** (`repeat(6,minmax(0,1fr))`, v127 l.16709-16711) com `row-gap`
pequeno (v132 reduz `column-gap:4px; row-gap:8px`, l.18834-18837). Posições finais
(após v140 vencer):

| Linha | Esquerda | Centro | Direita |
|---|---|---|---|
| **1** | C2 (cols 1-7, largura total) | | |
| **2** | C3 (1-3) | C4 (3-5) | C5 (5-7) |
| **3** | C7 (1-5, dois terços) | | C10 (5-7) |
| **4** | C8 (1-3) | C9 (3-5) | C6 (5-7) |

Fonte das colocações: C2 l.16713 / v129 l.17349-17350; C3/C4/C5 l.16714-16716 +
v129 l.17352-17356; C7 v129 l.17357-17361 (col 1/5, row 3); C8/C9 v131 l.17396-17397
(row 4); **C10 v140 l.18689-18695 (col 5/7, row 3)**; **C6 v140 l.18696-18701
(col 5/7, row 4)**. Cards comparativos têm `aspect-ratio:1/1` e `height:590px`
(v131 l.17391-17393). C6/C7/C10 também têm `height:590px`.

Breakpoints: `@media(max-width:1120px)` colapsa para 2 colunas; `@media(max-width:900px)`
para 1 coluna (l.17368-17383, 17288-17302, 18754-18770).

### O que o nome do arquivo significa ("c6 c10 trocados c7 filtra pagamentos")

Decifrado pela perícia do patch **v140** (l.18687-18968):
- **"c6 c10 trocados":** até o v139 (l.18482-18485) o C10 ficava na **linha 4**
  (col 5/7) e o C6 na linha 3. O v140 **inverteu**: C10 subiu para a **linha 3** e
  C6 desceu para a **linha 4**. Ou seja, C6 e C10 trocaram de posição na coluna direita.
- **"c7 filtra pagamentos":** no v140 as barras do C7 deixaram de ser `<div>` e
  viraram `<button>` clicáveis (l.18895). Clicar numa barra (um modelo de produto)
  define `window.SALES_C7_SELECTED_MODEL` e **recalcula o C10 (formas de pagamento)
  apenas com os pedidos daquele produto** (`currentRowsForC10`, l.18846-18851).
  Clicar de novo na mesma barra limpa o filtro (toggle, l.18854). Há botão "Limpar
  produto" (l.18903).

---

## 1. C1 , Seletor de período global (`openSalesPeriodModal`)

Estado global: `SALES_PERIOD = {mode,start,end,label}` (l.16060), persistido em
`localStorage['ig_sales_period_v1']` (l.16058, 16082). Default = "Últimos 30 dias"
(últimos 30 dias corridos, l.16078-16079). Helpers: `salesISO`, `salesParseISO`,
`salesMonthValue`, `salesStartOfMonth/EndOfMonth`, `salesMonthBR`, `salesPeriodDetail`
(retorna "dd/mm/aaaa até dd/mm/aaaa", l.16083).

`renderSalesDashboard()` (base l.16084-16092) só atualiza os textos do chip C1.
Cada patch vNNN faz monkey-patch: `previous = window.renderSalesDashboard; window.
renderSalesDashboard = function(){ previous(); renderSalesCX(); }`. Assim, ao final,
chamar `renderSalesDashboard()` redesenha **todos** os cards em cascata. Também há
um `setTimeout(...,0)` no `DOMContentLoaded` de cada patch como rede de segurança.

`openSalesPeriodModal()` (l.16093-16099): garante período carregado, seta o modo de
aba e abre `#modal-sales-period` (classe `.open`).

### Modal de período , abas e presets EXATOS

5 abas (`setSalesPeriodMode`, l.16101-16105; markup 7107-7112):
**Dias · Meses · Anos · Trimestres · Semestres**.

- **Aba Dias** (7115-7126): inputs `date` início/fim + presets:
  - **Hoje** (`salesQuickPeriod('today')`)
  - **Últimos 7 dias** (`last7`, hoje-6)
  - **Últimos 30 dias** (`last30`, hoje-29)
  - **Últimos 90 dias** (`last90`, hoje-89)
- **Aba Meses** (7128-7138): inputs `month` + presets:
  - **Mês atual** (`currentMonth`)
  - **Mês anterior** (`lastMonth`)
  - **Últimos 6 meses** (`last6Months`)
- **Aba Anos** (7140-7149): inputs `number` (2000-2100) + presets:
  - **Ano atual** (`currentYear`)
  - **Ano anterior** (`lastYear`)
- **Aba Trimestres** (7151-7158): ano inicial/final + selects 1º-4º trimestre
  (sem presets; aplica manual). Label gerado: `T{q}/{ano} até T{q}/{ano}`.
- **Aba Semestres** (7160-7167): ano inicial/final + selects 1º/2º semestre.
  Label: `S{s}/{ano} até S{s}/{ano}`.
- Rodapé: **Cancelar** (`closeSalesPeriodModal`) + **Aplicar período**
  (`applySalesPeriodFromModal`, l.16137-16159).

`applySalesPeriodFromModal` lê os campos do modo ativo, valida ("Preencha o período
antes de aplicar." / "A data inicial não pode ser maior que a data final."), grava
`SALES_PERIOD`, persiste e redesenha tudo (l.16155-16158). Presets (`salesQuickPeriod`,
l.16117-16132) aplicam direto e fecham implicitamente (re-hidratam o modal).

---

## 2. C2 , Indicadores do período (`renderSalesC2`, l.16279-16301)

Card de KPIs. Markup 6837-6872 (`.sales-kpi-grid`, 5 cards). Fonte de dados:
`salesRowsInCurrentPeriod()` (l.16267-16278), que monta linhas a partir de
`salesRowsFromDemand()` (l.16243-16256) filtradas pelo período; se vazio, cai para
`salesRowsFromSerials()` (seriais vendidos, l.16257-16266).

5 KPIs (rótulo exato → fórmula):
1. **"Valor vendido no período"** (`#sales-c2-total-sold`) = Σ `total` de todas as
   linhas (l.16282). Sub: "{n} pedido(s) no período".
2. **"Margem de lucro média por pedido"** (`#sales-c2-margin`) =
   `((totalSold - totalCost) / totalSold) * 100` (l.16285), formatado 1 casa + "%".
   Sub: "{R$ lucro} de lucro bruto estimado" ou "Sem vendas no período".
3. **"Quantidade de itens vendidos"** (`#sales-c2-items`) = Σ `qty` (l.16284).
   Sub: "{n} unidade(s) vendida(s)".
4. **"Média de itens vendidos por pedido"** (`#sales-c2-avg-items`) =
   `itemCount / orderCount` (l.16286), 1 casa. Sub: "{itens} itens ÷ {pedidos} pedidos".
5. **"Média de valor por pedido"** (`#sales-c2-avg-order`) =
   `totalSold / orderCount` (l.16287). Sub: "{R$} ÷ {n} pedidos".

Subtítulo do card (`#sales-c2-subtitle`): "{período} · {n} {pedidos|seriais vendidos}".

Custos quando não vêm no dado: `salesModelCost(model,price)` heurística por modelo
(esteira 28500, elíptico 11200, climb 16500, bike 9100, força 14200; senão price*0.64;
l.16194-16202). Preços: `salesModelPrice` (l.16184-16192). Status cancelado/draft é
excluído (`salesIsOrderClosedForSales`, l.16239-16242).

---

## 3. C3 , Vendas por estado (`renderSalesC3`, l.16367-16430)

**NÃO é mapa choropleth.** É um **gráfico de pizza (donut sólido) SVG** por UF.
Markup: `<svg id="sales-c3-pie" viewBox="0 0 560 500">` (l.6883). O título do card é
"C3 — Vendas por estado" mas a renderização é pizza. (Relevante para a queixa do
cliente sobre "mapa gigante": aqui em Vendas o C3 é pizza; o mapa gigante do Brasil
fica em **B4** no módulo Demanda, `#demand-brazil-map`, l.6710 , módulo diferente.
Ainda assim a pizza C3 ocupa um `viewBox` alto 560x500, o que a deixa visualmente
grande/alta.)

Dados: `salesBuildStateDistribution()` (l.16349-16357) agrega por UF, filtra value>0,
ordena desc por valor, **top 10**. As linhas por estado vêm de
`salesRowsByStateInCurrentPeriod()` (l.16322-16348) que cruza `demandBaseRows()` com
`getDemandOrders()`, extrai UF de muitos campos possíveis (`order.uf || row.u || ...`,
fallback `salesFallbackUf`), filtra cancelados e período. **Se não houver vendas no
período, gera fallback de demonstração** (8 UFs com valores fictícios, l.16345-16347).

Desenho (l.16380-16429):
- `cx=280, cy=250, r=132`. Cores (10): `['#C8A96E','#E8D5A8','#9B7E45','#6F8FF3',
  '#6FE0B0','#A8844C','#B8BDC8','#F17A7A','#8FB5F5','#9B72CF']` (l.16379, paleta
  dourada Matrix + acentos).
- Fatias via `salesPieSlicePath` (l.16359-16366; trata caso 360°). Cada fatia tem
  `<title>` tooltip nativo: "{UF — Nome} · {R$} · {pct}%".
- **Rótulos com linhas-guia (leader lines)** em cotovelo: ponto na borda (r+4),
  cotovelo (r+34), texto à esquerda (x=128) ou direita (x=432) conforme o lado.
  Anti-colisão vertical: `distributeSalesLabels` (l.16385-16397) empurra rótulos
  para não sobrepor (gap 34px, faixa Y 42-458). Cada rótulo: UF em destaque + linha
  meta "{R$} · {pct}%". `<title>` traz o nome completo do estado.
- Subtítulo: "{período} · {n} estado(s)". Card ganha classe `is-empty` se vazio.

UF→nome usa `UF_FULL` global e `salesUfLabel` (l.16316-16320).

---

## 4. C4 , Vendas por marca (`renderSalesC4`, l.16463-16526)

**Cópia estrutural do C3**, mas por marca em vez de UF. Pizza SVG
`#sales-c4-pie viewBox 0 0 560 500` (l.6899). Mesmos `cx/cy/r`, mesma paleta de 10
cores, mesmas leader lines e `distributeSalesLabels` (reescrito inline, idêntico).

Dados: `salesBuildBrandDistribution()` (l.16444-16462): agrega `salesRowsInCurrentPeriod`
por marca normalizada (`salesNormalizeBrand` / `salesBrandFromModel`), value>0, top 10.
Marca é deduzida de: campos diretos (`brand/marca/supplier/...`), depois cruzamento
com `STOCK_PRODUCTS`/`STOCK_PURCHASE_ORDERS` por modelo, depois heurística por nome
(Johnson, Long Life, XMaster, Body Joy, Vision; senão "Marca não informada";
l.16204-16238). **Fallback demo** se vazio (Johnson/Long Life/XMaster/Body Joy ou
`STOCK_SUPPLIERS`, l.16457-16460).

Diferença visual: nomes de marca longos são truncados em 13 chars com "…" no rótulo
(`shortBrand`, l.16506), com `<title>` mostrando o nome completo. Subtítulo:
"{período} · {n} marca(s)".

---

## 5. C5 , Pedidos fechados (tabela) (`renderSalesC5`)

**Duas versões. Vence a v127** (`window.renderSalesC5`, l.17043-17079) sobre a base
v125 (l.16612-16645). Markup 6906-6938.

Colunas do `<thead>` (markup l.6924-6930): **Cliente · UF · Margem · Valor · Vendedor
· Modalidade · Fechamento** (7 colunas). A versão base v125 renderizava só 6 colunas
(sem Modalidade); a v127 acrescenta a célula **Modalidade** (l.17075), alinhando com o
cabeçalho.

Por linha (l.17069-17077):
- **Cliente**: `<span title>` truncável.
- **UF**: centralizado, badge.
- **Margem**: à direita, com classe semântica , `low` se `margin<25`, `mid` se
  `<32`, senão normal (verde/ouro; l.17066). Formato "{x,x}%".
- **Valor**: à direita, `salesMoney` (R$ pt-BR).
- **Vendedor**: `<span title>`.
- **Modalidade**: centralizado, badge "Digital" ou "Presencial" com classe
  `.sales-c5-modality {modality}` (l.17075).
- **Fechamento**: data `dd/mm/aaaa` (`salesDateBR`).

Dados: `salesClosedOrderRows()` (v127, l.16997-17035) , reconstrói cada pedido com
client/uf/margin/total/seller/date/status/model/qty/**modality**, exclui
cancelado/draft, filtra período, **ordena por data desc**, limita a **40 linhas**
(l.17026). Modalidade vem de `salesC6Modality(item,idx)` (l.17019). Se a base estiver
vazia, usa `sampleClosedOrders` (8 pedidos fictícios COM modelo+qty, l.16987-16996).

**Busca/filtro** (markup 6913-6919): input `#sales-c5-search` com placeholder
"Buscar cliente, UF, margem, valor, vendedor, modalidade ou data…". Filtra client-side
por texto normalizado (`salesC5RowText` agora inclui a modalidade, l.17036-17042),
atualiza subtítulo ("{período} · {n} de {N} pedidos") e o help
("{n} resultado(s) encontrado(s)…"). Ordenação é fixa (data desc); não há sort por
coluna. Estado vazio: "Sem pedidos fechados no período selecionado." (`#sales-c5-empty`).

---

## 6. C6 , Modalidades e maior pedido (`renderSalesC6`)

**Vence a v128** (`window.renderSalesC6`, l.17308-17340) sobre v126 (l.16670-16693).
Markup 6941-6981 (grid `sales-c6-grid-expanded`, 3 blocos empilhados).

Três indicadores:
1. **"Maior pedido do período"** (destaque, `.sales-c6-featured`): valor =
   maior `total` entre os pedidos (l.17312). Mostra lista de detalhes:
   **Cliente, UF, Margem, Vendedor, Fechamento** (`#sales-c6-biggest-*`,
   l.17325-17331). Sub fallback: "Sem pedidos no período".
2. **"Venda digital"**: percentual = `digital.total / total * 100`. Detalhes:
   **Valor vendido**, **Pedidos** ("{n} pedidos"), **Ticket médio**
   (`digital.total/digital.count`) , l.17332-17335. Cor azul (#8FB5F5).
3. **"Venda presencial"**: idem para presencial (l.17336-17339). Cor verde (#6FE0B0).

Classificação digital vs presencial: `salesC6Modality(row,idx)` (l.16663-16669) ,
regex sobre campos de canal (`digital|online|ecommerce|site|whatsapp|...` → digital;
`presencial|loja|showroom|fisico|visita|externa` → presencial); se indefinido, usa um
**seed determinístico** (hash de client+uf+seller) → `seed%4===0 ? presencial : digital`
(≈25% presencial). Subtítulo: "{período} · {n} pedido(s)". CSS v128 (l.17175-17303)
expande o card para 620px de altura com tipografia grande nos valores.

---

## 7. C7 , Itens vendidos no período (`renderSalesC7`) + filtro de pagamentos

**Vence a v140** (`window.renderSalesC7`, l.18863-18913) sobre v127 (l.17114-17153).
Markup 6997-7007. **NÃO é SVG** , é um gráfico de **barras verticais em HTML/CSS**
(`#sales-c7-chart.minimal-style`, "mesmo padrão do B8", l.7001/7004).

Dados: `salesC7DataV140()` (l.18833-18845) agrega `salesClosedOrderRows` por modelo,
soma qty/value/orders, ordena por qty desc (desempate por value), **top 22 modelos**.
Eixo Y "nice max" (`c7NiceMax`/`c7AxisLabels`, 6 ticks, l.18812-18827). Cada barra:
altura `qty/axisMax*100%` (mín 3%), label X truncado em 28 chars, `<title>` com
"{modelo} · {n} itens · {pct}% · {R$}".

**Interatividade v140 (o "c7 filtra pagamentos"):**
- Cada barra é um `<button>` (l.18895) com `data-sales-c7-model`, `aria-pressed`,
  aria-label "Filtrar formas de pagamento por {modelo}".
- Clique → `salesSelectC7Model(model)` (l.18852-18857): toggle de
  `SALES_C7_SELECTED_MODEL` e re-render de C7 + C10.
- Barra ativa ganha classe `.active` (brilho + ring dourado, l.18724-18730).
- Rodapé mostra "Clique em uma barra para filtrar o C10" ou
  "Produto selecionado: **{modelo}**" + botão **"Limpar produto"**
  (`salesClearC7Model`, l.18858-18862, 18903).
- Subtítulo: "{período} · {n} itens · {n} modelos" + " · filtrando {modelo}" quando
  ativo. Estado vazio: "Sem itens vendidos no período selecionado." (`#sales-c7-empty`).

---

## 8. C10 , Formas de pagamento (`renderSalesC10`)

**Vence a v140** (`window.renderSalesC10`, l.18914-18957) sobre v139 (l.18639-18675).
Markup 6984-6995 (`#sales-c10-grid`). **NÃO é donut/pizza** , é uma **lista de cards**
(um por forma de pagamento), apesar de o briefing supor donut.

5 formas fixas (`PAYMENT_FORMS`, l.18777-18783): **Boleto, PIX, Cartão de crédito,
Débito, Cheque**. Cada card mostra: nome (uppercase), contagem ("{n} pedidos"),
pílula de **percentual** (`count/totalCount*100`) e **valor** (Σ total) à direita.
Cores por forma (barra lateral + pílula): PIX verde #6FE0B0, crédito azul #6F8FF3,
débito roxo #9B72CF, cheque #F6C453, boleto dourado (default) , l.18525-18583.
Rodapé: "Total {escopo}: **{R$}**". Estado vazio: "Sem pedidos com forma de pagamento
no período selecionado."

Atribuição da forma: `inferPayment(row,idx)` (l.18801-18810) , usa campo explícito
se houver (`payment/forma_pagamento/...`), senão heurística: valor ≥ R$120.000 →
boleto; SP/RJ → alterna crédito/PIX; DF/GO → boleto/PIX; senão hash determinístico.

**Vínculo com C7 (v140):** `currentRowsForC10()` (l.18846-18851) filtra os pedidos
por `SALES_C7_SELECTED_MODEL` quando há produto selecionado no C7. Assim o C10 mostra
"como esse modelo foi pago". Subtítulo e mensagens incorporam o nome do produto
selecionado (l.18929-18936, 18955).

---

## 9. C8 e C9 , Comparativo de estado (`renderComparePie` / `renderCompareCard`)

Ambos são **o mesmo componente comparativo**, instanciado 2x (`c8` e `c9`),
implementados no IIFE v131 (l.17468-17827). Markup 7009-7055. **Não é comparação
lado-a-lado de 2 UFs num gráfico**: cada card é independente e configura **um estado
+ um período próprios**; o usuário compara visualmente C8 vs C9 colocando UFs/períodos
diferentes em cada um (ex.: default C8=SP, C9=RJ, l.17477-17478).

Estado: `SALES_COMPARE_CONFIG = {c8:{uf,periodSource,period}, c9:{...}}` (l.17476-17479).
27 UFs disponíveis (`COMPARE_UFS`, l.17472).

Cada card mostra (`renderCompareCard`, l.17764-17784):
- Faixa "selecionada": "{UF} · {label do período} · {dd/mm até dd/mm}"
  (`#sales-cN-selected`).
- **3 KPIs** (l.17018-17022 markup; cálculo l.17768-17780):
  **Faturamento** (Σ total), **Valor médio de pedido** (total/count),
  **Margem de lucro média** (`((total-cost)/total)*100`, em %).
- **Pizza "Composição do faturamento por marca"** (`renderComparePie`,
  l.17734-17763): SVG `viewBox 0 0 560 320`, `cx=280, cy=158, r=78` (menor que C3/C4),
  mesmas 10 cores (`COMPARE_COLORS`), top 8 marcas (`compareBrandData`, l.17718-17726),
  leader lines com anti-colisão (`distributeLabels`, gap 25, faixa 32-292). Tooltip
  por fatia "{marca} · {R$} · {pct}%".
- Estado vazio: "Sem vendas em {UF} no período selecionado." (`#sales-cN-empty`).

Dados: `compareAllRows()` (l.17672-17705) monta todas as linhas (uf/brand/model/qty/
total/cost/date/status), exclui cancelados; **fallback demo** com 12 UFs × 5 marcas se
vazio (l.17694-17704). `compareRows(card)` filtra por UF + período do card
(`comparePeriodFor`, l.17666-17670: usa período custom do card ou clona o C1).

**Configuração via modal** (`openSalesCompareModal(card)`, l.17789-17803): o botão de
3 pontinhos no header de cada card (`.sales-compare-menu-btn`, l.7011/7035) abre
`#modal-sales-compare`. O modal tem: **select de Estado** (todas as 27 UFs com nome,
`populateCompareStates`, l.17602-17607) e um **seletor de período idêntico ao C1**
injetado dinamicamente (`ensureCompareModalUi`, l.17518-17601) , mesmas 5 abas
(Dias/Meses/Anos/Trimestres/Semestres), mesmos presets, mais botão **"Usar período
atual do C1"** (`salesCompareUseCurrentPeriod`, l.17646-17650). O `<select>` de
período HTML original (l.7078-7088, com opções current/today/last7/...) é **ocultado**
por CSS (`#sales-compare-period{display:none}`, l.17437) e substituído pelo seletor
rico. Aplicar (`applySalesCompareModal`, l.17805-17817): grava UF + período (marca
`periodSource:'current'` se igual ao C1, senão `'custom'`), valida datas e re-renderiza
os dois cards (`renderSalesCompareCards`, l.17785-17788).

---

## 10. Primitivas reutilizadas (os "renderPie/renderCard genéricos")

Não existem funções com os nomes exatos `renderPie`/`renderCard`. Os blocos
reutilizáveis de fato são:
- **`salesPolar(cx,cy,r,angle)`** (l.16358) e **`salesPieSlicePath(...)`** (l.16359-16366):
  geometria de fatia de pizza SVG, usadas por C3, C4 e (com fallback próprio) pelo
  comparativo C8/C9.
- **`distributeSalesLabels` / `distributeLabels`**: anti-colisão de rótulos , o mesmo
  algoritmo aparece reescrito inline em C3 (l.16385), C4 (l.16479) e no comparativo
  (l.17727-17733).
- **Formatadores**: `salesMoney` (BRL pt-BR, l.16166), `salesNumber` (l.16169),
  `salesPercent` (1 casa + %, l.16170), `salesSafeText` (escape HTML, l.16315),
  `salesDateBR`. O IIFE comparativo redeclara wrappers locais (`money/number/percent/
  safe/...`, l.17488-17511) que delegam às globais com fallback.
- Os "cards" (KPI de C2, indicadores de C6, cards de pagamento de C10) são puro
  HTML/CSS montado por template string, sem função genérica de card.

---

## 11. Cores semânticas, animações e estados vazios (resumo)

- **Paleta de gráficos (10 cores)**, idêntica em C3/C4/C8/C9: dourados Matrix
  (#C8A96E #E8D5A8 #9B7E45 #A8844C) + acentos (#6F8FF3 azul, #6FE0B0 verde,
  #B8BDC8 cinza, #F17A7A vermelho, #8FB5F5 azul claro, #9B72CF roxo).
- **Semântica de margem (C5)**: `<25%` low, `<32%` mid, senão ok.
- **Modalidade**: digital=azul #8FB5F5, presencial=verde #6FE0B0 (C5 badge e C6).
- **Formas de pagamento (C10)**: PIX verde, crédito azul, débito roxo, cheque amarelo
  #F6C453, boleto dourado.
- **Animações**: fatias de pizza fazem `scale(1.012)` + `opacity .92` no hover
  (l.17422-17423); barras do C7 fazem brightness/translateY/box-shadow no hover/focus
  e ring dourado quando ativas (l.18713-18730); botão de menu do comparativo
  translada no hover (l.17406).
- **Estados vazios (textos exatos)**: C3 "Sem vendas no período selecionado.";
  C4 "Sem vendas por marca no período selecionado."; C5 "Sem pedidos fechados no
  período selecionado."; C6 "Sem pedidos no período"; C7 "Sem itens vendidos no
  período selecionado."; C8/C9 "Sem vendas para este estado no período selecionado." /
  "Sem vendas em {UF}…"; C10 "Sem pedidos com forma de pagamento no período
  selecionado." Cada card alterna a classe `.is-empty`. **Importante:** quase todos
  os cards têm **fallback de dados de demonstração** quando a base real está vazia,
  então o estado vazio raramente aparece em prática , atenção na reconstrução para
  não copiar dados fictícios para produção.

---

## 12. Riscos / observações para a reconstrução

1. **Dados fictícios embutidos** em C3 (l.16346), C4 (l.16458), C5 (l.16579-16593),
   C5/C7 v127 (`sampleClosedOrders`, l.16987), comparativo (l.17696-17704). Não portar.
2. **Margem e custo são estimados** por heurística de modelo (`salesModelCost`,
   price*0.64) quando o dado não traz custo , confirmar fonte real no cache Odoo.
3. **Modalidade e forma de pagamento são INFERIDAS** (hash determinístico /
   regra por UF e valor), não vêm de campo real na maioria dos casos. Em produção,
   precisam de campos reais do Odoo, senão os percentuais de C6/C10 são fabricados.
4. **C3 é pizza, não mapa.** Se a diretoria quer "vendas por estado" num mapa, é
   decisão nova; o protótipo entrega pizza top-10 UFs com viewBox alto (560x500).
5. **Cascata de monkey-patches**: na reconstrução React/Next, consolidar cada card
   numa função única (a versão vNNN final) em vez de replicar o padrão de override.
6. **C8/C9 não comparam 2 UFs num só gráfico** , são 2 cards independentes; se o
   requisito for comparação real lado-a-lado com delta, é evolução (já há CSS de
   `label-delta-positive/negative` preparado, l.18467-18472, mas sem lógica de delta
   implementada).

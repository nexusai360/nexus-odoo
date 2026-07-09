# Perícia HTML MESTRE , Capítulo 06: Módulo VENDAS (`#mod-vendas`, C1 a C10 + comparativo C8/C9)

> **Fonte única:** `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> (18.971 linhas; protótipo monolítico vanilla JS; gráficos em SVG e barras em HTML/CSS).
>
> **Este é o capítulo DEFINITIVO de Vendas.** Consolida e corrige a perícia base
> (`04-vendas.md`) com os achados das auditorias `audit/faixa-07.md` e
> `audit/faixa-08.md`. Documenta a versão ATIVA (até v140) e marca explicitamente
> o código MORTO (sobrescrito) e os DADOS FICTÍCIOS.
>
> **Convenção de notação:** o HTML usa em-dash e ponto-médio (`·`) como separadores
> dentro de rótulos e tooltips. Para respeitar a regra de estilo do projeto, este
> documento NÃO reproduz o caractere em-dash; onde o HTML usa em-dash como separador
> de rótulo (ex.: o formato de `salesUfLabel`), descreve-se a estrutura em vez de
> colar o glifo. O ponto-médio `·` dos tooltips é preservado porque é o separador
> literal usado no código.

---

## 0. Arquitetura de patches (regra de leitura obrigatória)

A tela de Vendas foi construída por **patches sucessivos** (`v114`, `v120` ... `v140`),
cada um num `<script>`/`<style>` separado que **redefine** funções (`window.renderSalesXX`)
e CSS (`!important`) criados antes. Várias funções existem em 2 ou 3 versões.
**Vale SEMPRE a última versão** (maior `vNNN`, mais abaixo no arquivo), porque ela
sobrescreve `window.renderSalesXX` e o CSS tem maior ordem/especificidade.

Padrão de monkey-patch de cascata (l.16084-16092 e cada vNNN):
```js
const previous = window.renderSalesDashboard;
window.renderSalesDashboard = function(){ previous(); renderSalesCX(); };
```
Assim, chamar `renderSalesDashboard()` redesenha **todos** os cards em cascata.
Cada patch ainda tem um `document.addEventListener('DOMContentLoaded', ()=>setTimeout(()=>{...},0))`
como rede de segurança.

### Mapa versão ativa vs morto (resumo)

| Função | Versões existentes | ATIVA (vence) | MORTO |
|---|---|---|---|
| `renderSalesC2` | base 16279-16301 | base | (única) |
| `renderSalesC3` | base 16367-16430 | base | (única) |
| `renderSalesC4` | base 16463-16526 | base | (única) |
| `renderSalesC5` | v125 16612-16645; v127 17043-17079 | **v127** | v125 |
| `renderSalesC6` | v126 16670-16693; v128 17308-17340 | **v128** | v126 |
| `renderSalesC7` | v127 17114-17153; v140 18863-18913 | **v140** | v127 |
| `renderSalesC10` | v139 18639-18675; v140 18914-18957 | **v140** | v139 |
| `renderSalesCompareCards` (C8/C9) | v131 17468-17827; v132 17832-18020; v134 18231-18417 | **v134** | v131, v132 |

### O nome do arquivo decifrado ("c6 c10 trocados c7 filtra pagamentos")
- **"c6 c10 trocados":** até v139 o C10 ficava na linha 4 (col 5/7) e o C6 na linha 3.
  O v140 inverteu: C10 subiu para a linha 3, C6 desceu para a linha 4. C6 e C10
  trocaram de posição na coluna direita.
- **"c7 filtra pagamentos":** no v140 as barras do C7 deixaram de ser `<div>` e
  viraram `<button>` clicáveis (l.18895). Clicar numa barra (um modelo de produto)
  filtra o C10 por forma de pagamento daquele modelo.

---

## 0.1 Layout final da tela (`#mod-vendas`, markup base 6822-7058)

1. **Topbar C1** (6824-6835): um único chip botão (`openSalesPeriodModal()`) com
   kicker "C1", valor principal (`#sales-period-value`, ex.: "Últimos 30 dias"),
   detalhe (`#sales-period-detail`), sub "Clique para alterar" e seta ▾.
2. **`.sales-container`** (grid de cards). Ordem no DOM cru:
   C2, C3, C4, C5, C6, **C10**, C7, C8, C9 (no HTML cru o C10, l.6984, vem ANTES do
   C7, l.6997; o posicionamento visual é todo resolvido por CSS grid, última regra vence).
3. Dois modais: **`#modal-sales-compare`** (configura C8/C9, 7062-7095) e
   **`#modal-sales-period`** (seletor de período C1, 7097-7175).

Posicionamento de grid efetivo (v129, l.17347-17384): C2 grid-row 1; C3/C4/C5 grid-row 2;
C7 `grid-column:1/5` e C6 `grid-column:5/7` na grid-row 3 (depois ajustado por v140
para a troca C6/C10); C8 e C9 na grid-row 4 (v131/v132). Responsivo em 1120px e 900px
colapsa para 2 e 1 colunas.

---

## 1. C1 , Seletor de período global (`openSalesPeriodModal`)

**Estado global:** `SALES_PERIOD = {mode, start, end, label}` (l.16060), persistido em
`localStorage['ig_sales_period_v1']` (l.16058, 16082). **Default = "Últimos 30 dias"**
(30 dias corridos, l.16078-16079).

**Helpers de data:** `salesISO`, `salesParseISO`, `salesMonthValue`,
`salesStartOfMonth`/`salesEndOfMonth`, `salesMonthBR`, `salesPeriodDetail`
(retorna "dd/mm/aaaa até dd/mm/aaaa", l.16083).

`renderSalesDashboard()` base (16084-16092) só atualiza os textos do chip C1; os cards
são plugados pelos patches em cascata. `openSalesPeriodModal()` (16093-16099): garante
o período carregado, seta o modo de aba, abre `#modal-sales-period` (classe `.open`).

### Modal de período , 5 abas e presets EXATOS

5 abas (`setSalesPeriodMode`, l.16101-16105; markup 7107-7112):
**Dias · Meses · Anos · Trimestres · Semestres**.

- **Aba Dias** (7115-7126): inputs `date` início/fim + presets:
  - **Hoje** (`salesQuickPeriod('today')`)
  - **Últimos 7 dias** (`last7`, hoje menos 6)
  - **Últimos 30 dias** (`last30`, hoje menos 29)
  - **Últimos 90 dias** (`last90`, hoje menos 89)
- **Aba Meses** (7128-7138): inputs `month` + presets:
  - **Mês atual** (`currentMonth`)
  - **Mês anterior** (`lastMonth`)
  - **Últimos 6 meses** (`last6Months`)
- **Aba Anos** (7140-7149): inputs `number` (faixa 2000-2100) + presets:
  - **Ano atual** (`currentYear`)
  - **Ano anterior** (`lastYear`)
- **Aba Trimestres** (7151-7158): ano inicial/final + selects 1º a 4º trimestre.
  Sem presets (aplica manual). Label gerado: "T{q}/{ano} até T{q}/{ano}".
- **Aba Semestres** (7160-7167): ano inicial/final + selects 1º/2º semestre.
  Label gerado: "S{s}/{ano} até S{s}/{ano}".
- Rodapé: **Cancelar** (`closeSalesPeriodModal`) + **Aplicar período**
  (`applySalesPeriodFromModal`, l.16137-16159).

`applySalesPeriodFromModal` lê os campos do modo ativo, valida ("Preencha o período
antes de aplicar." / "A data inicial não pode ser maior que a data final."), grava
`SALES_PERIOD`, persiste em localStorage e redesenha tudo (l.16155-16158).
`salesQuickPeriod` (16117-16132) aplica o preset direto e re-hidrata o modal.

---

## 2. C2 , Indicadores do período (`renderSalesC2`, base l.16279-16301)

Card de KPIs. Markup 6837-6872 (`.sales-kpi-grid`, 5 cards). Versão única (não foi
sobrescrita).

**Fonte de dados:** `salesRowsInCurrentPeriod()` (16267-16278) monta linhas a partir
de `salesRowsFromDemand()` (16243-16256) filtradas pelo período; se vazio, cai para
`salesRowsFromSerials()` (seriais vendidos, 16257-16266). Status cancelado/draft é
excluído por `salesIsOrderClosedForSales` (16239-16242).

**5 KPIs (rótulo exato e fórmula):**
1. **"Valor vendido no período"** (`#sales-c2-total-sold`) = Σ `total` de todas as
   linhas (l.16282). Sub: "{n} pedido(s) no período".
2. **"Margem de lucro média por pedido"** (`#sales-c2-margin`) =
   `((totalSold - totalCost) / totalSold) * 100` (l.16285), 1 casa decimal + "%".
   Sub: "{R$ lucro} de lucro bruto estimado" ou "Sem vendas no período".
3. **"Quantidade de itens vendidos"** (`#sales-c2-items`) = Σ `qty` (l.16284).
   Sub: "{n} unidade(s) vendida(s)".
4. **"Média de itens vendidos por pedido"** (`#sales-c2-avg-items`) =
   `itemCount / orderCount` (l.16286), 1 casa. Sub: "{itens} itens ÷ {pedidos} pedidos".
5. **"Média de valor por pedido"** (`#sales-c2-avg-order`) =
   `totalSold / orderCount` (l.16287). Sub: "{R$} ÷ {n} pedidos".

Subtítulo do card (`#sales-c2-subtitle`): "{período} · {n} {pedidos|seriais vendidos}".

**Preço e custo heurísticos (quando o dado real não traz):**
- `salesModelPrice` (16184-16192): esteira/t600 42000; elíptico/e200 18000; climb/c100
  26000; bike 14500; força 22000; default 16000.
- `salesModelCost` (16194-16202): esteira 28500; elíptico 11200; climb 16500; bike 9100;
  força 14200; senão `price * 0.64`.

---

## 3. C3 , Vendas por estado (`renderSalesC3`, base l.16367-16430)

**NÃO é mapa choropleth.** É um **gráfico de pizza (donut sólido) SVG por UF**.
Markup: `<svg id="sales-c3-pie" viewBox="0 0 560 500">` (l.6883). O título do card usa
o texto "C3, Vendas por estado", mas a renderização é pizza. (O mapa gigante do Brasil
é B4 no módulo Demanda, `#demand-brazil-map` l.6710, módulo diferente. A pizza C3 ocupa
viewBox alto 560x500, o que a deixa visualmente grande.)

**Dados:** `salesBuildStateDistribution()` (16349-16357) agrega por UF, filtra value>0,
ordena desc por valor, **top 10**. As linhas vêm de `salesRowsByStateInCurrentPeriod()`
(16322-16348), que cruza `demandBaseRows()` com `getDemandOrders()`, extrai UF de muitos
campos possíveis (`order.uf || row.u || ...`, fallback `salesFallbackUf`), filtra
cancelados e período.

**FALLBACK DEMO (DADOS FICTÍCIOS, 16345-16347):** se não houver vendas no período, gera
8 UFs fictícias: `demoUfs = ['SP','RJ','MG','DF','GO','PR','BA','SC']`, com
`total = (idx+2)*8750 + (idx%3)*6400`. Não portar para produção.

**Desenho (16380-16429):**
- Geometria: `cx=280, cy=250, r=132`.
- **Paleta de 10 cores** (l.16379, dourados Matrix + acentos):
  `#C8A96E #E8D5A8 #9B7E45 #6F8FF3 #6FE0B0 #A8844C #B8BDC8 #F17A7A #8FB5F5 #9B72CF`.
- Fatias via `salesPieSlicePath` (16359-16366; trata caso 360°) e `salesPolar`.
- Cada fatia tem `<title>` tooltip nativo: "{UF e nome do estado} · {R$} · {pct}%".
- **Rótulos com leader-lines em cotovelo:** ponto na borda (r+4), cotovelo (r+34),
  texto à esquerda (x=128) ou direita (x=432) conforme o lado. Anti-colisão vertical
  por `distributeSalesLabels` (16385-16397): gap 34px, faixa Y 42 a 458. Cada rótulo:
  UF em destaque + linha meta "{R$} · {pct}%"; `<title>` traz o nome completo do estado.
- Subtítulo: "{período} · {n} estado(s)". Card ganha classe `is-empty` se vazio.

UF para nome usa `UF_FULL` global e `salesUfLabel` (16316-16320), cujo formato é "{sigla}
{em-dash} {nome do estado}" (ex.: a sigla SP seguida do nome São Paulo). Estado vazio:
"Sem vendas no período selecionado."

---

## 4. C4 , Vendas por marca (`renderSalesC4`, base l.16463-16526)

**Cópia estrutural do C3, mas por marca em vez de UF.** Pizza SVG
`#sales-c4-pie viewBox 0 0 560 500` (l.6899). Mesmos `cx/cy/r`, mesma paleta de 10
cores, mesmas leader-lines e `distributeSalesLabels` (reescrito inline, idêntico).
Versão única.

**Dados:** `salesBuildBrandDistribution()` (16444-16462): agrega
`salesRowsInCurrentPeriod` por marca normalizada, value>0, **top 10**.

**FALLBACK DEMO (DADOS FICTÍCIOS, 16457-16460):** se vazio, usa
Johnson/Long Life/XMaster/Body Joy ou `STOCK_SUPPLIERS`.

Diferença visual: nomes longos são truncados em 13 chars com reticências no rótulo
(`shortBrand`, l.16506), com `<title>` mostrando o nome completo. Subtítulo:
"{período} · {n} marca(s)". Estado vazio: "Sem vendas por marca no período selecionado."

### 4.1 Inferência de marca (compartilhada C4 e C8/C9 v131)

- **`salesNormalizeBrand` (mapa canônico, 16207-16209): 11 marcas** canonizadas,
  Johnson, Long Life, XMaster, Body Joy, Vision, Movement, Kikos, Technogym,
  Life Fitness, Matrix, Athletic, com aliases (ex.: "bodyjoy" para Body Joy,
  "x master" para XMaster) e title-case de fallback.
- **`salesBrandFromModel` (inferência por SKU, 16213-16234)**, regex:
  `\bjx[-\s]?\d+` para Johnson; `\blt[-\s]?\d+` para Long Life; `\bx\d{2,}` para XMaster;
  `\bbj[-\s]?\d+` para Body Joy; "vision" para Vision; senão "Marca não informada".
  Também cruza com `STOCK_PRODUCTS` (por produto) e `STOCK_PURCHASE_ORDERS` (por item)
  para puxar `supplier`.

---

## 5. C5 , Pedidos fechados (tabela) (`renderSalesC5`)

**ATIVA = v127** (`window.renderSalesC5`, l.17043-17079). **MORTO = v125** (16612-16645,
só 6 colunas, sem Modalidade). Markup 6906-6938.

**Colunas do `<thead>` (markup 6924-6930): 7 colunas:**
**Cliente · UF · Margem · Valor · Vendedor · Modalidade · Fechamento.**
A v125 renderizava 6 colunas; a v127 acrescenta a célula **Modalidade** (l.17075),
alinhando com o cabeçalho.

**Por linha (17069-17077):**
- **Cliente:** `<span title>` truncável.
- **UF:** centralizado, badge.
- **Margem:** à direita, classe semântica: `low` se `margin < 25`, `mid` se `< 32`,
  senão normal (verde/ouro; l.17066). Formato "{x,x}%".
- **Valor:** à direita, `salesMoney` (R$ pt-BR).
- **Vendedor:** `<span title>`.
- **Modalidade:** centralizado, badge "Digital" ou "Presencial", classe
  `.sales-c5-modality {modality}` (l.17075).
- **Fechamento:** data "dd/mm/aaaa" (`salesDateBR`).

**Dados:** `salesClosedOrderRows()` (v127, 16997-17035) reconstrói cada pedido com
client/uf/margin/total/seller/date/status/model/qty/**modality**, exclui cancelado/draft,
filtra período, **ordena por data desc**, limita a **40 linhas** (l.17026). Modalidade
vem de `salesC6Modality(item,idx)` (l.17019).

**FALLBACK (DADOS FICTÍCIOS):** se a base estiver vazia, usa `sampleClosedOrders`
(8 pedidos fictícios com modelo+qty, l.16987-16996).

**`salesClosedFallbackSeller(uf, idx)` (16547-16550), VENDEDOR FICTÍCIO por região**
(antes não documentado; DADOS FICTÍCIOS):
```js
const regional = {SP:'Marina Costa', RJ:'Rafael Lima', MG:'Bruna Alves',
  DF:'Pedro Nunes', GO:'Pedro Nunes', PR:'Lucas Rocha', SC:'Lucas Rocha',
  RS:'Lucas Rocha', BA:'Camila Torres', PE:'Camila Torres', CE:'Camila Torres'};
return regional[uf] || ['Ana Beatriz','Carlos Mendes','Juliana Prado','Felipe Castro'][abs(idx)%4];
```
Só é usado quando o pedido real não traz vendedor (`order.seller || ... || salesClosedFallbackSeller(uf,idx)`).

**Busca/filtro (markup 6913-6919):** input `#sales-c5-search`, placeholder
"Buscar cliente, UF, margem, valor, vendedor, modalidade ou data…". Filtra client-side
por texto normalizado (`salesC5RowText` inclui a modalidade, 17036-17042), atualiza
subtítulo ("{período} · {n} de {N} pedidos") e o help ("{n} resultado(s) encontrado(s)…").
Ordenação fixa (data desc), sem sort por coluna. Estado vazio:
"Sem pedidos fechados no período selecionado." (`#sales-c5-empty`).

---

## 6. C6 , Modalidades e maior pedido (`renderSalesC6`)

**ATIVA = v128** (`window.renderSalesC6`, l.17308-17340; corpo confirmado no script
v128). **MORTO = v126** (16670-16693). Markup 6941-6981, grid `sales-c6-grid-expanded`
(3 blocos empilhados, grid-template-rows `1.28fr 1fr 1fr`).

**Fonte:** `salesClosedOrderRows()` filtrado por `total > 0`.

**Três indicadores:**
1. **"Maior pedido do período"** (destaque, `.sales-c6-featured`): valor =
   `rows.reduce((best,row)=> total>best.total ? row : best)` (maior `total`).
   Detalhes (`#sales-c6-biggest-*`): **Cliente, UF, Margem, Vendedor, Fechamento**
   (markup 6954-6958; preenchimento 17325-17331). Sub: "{cliente} · {uf} · {data}"
   ou "Sem pedidos no período".
2. **"Venda digital"** (`#sales-c6-digital-pct`): pct = `digital.total / total * 100`.
   Detalhes: **Valor vendido** (`digital.total`), **Pedidos** ("{n} pedidos"),
   **Ticket médio** (`digital.total / digital.count`). Cor azul `#8FB5F5` / `#6F8FF3`.
3. **"Venda presencial"** (`#sales-c6-presencial-pct`): idem para presencial.
   Cor verde `#6FE0B0`.

**Classificação digital vs presencial:** `salesC6Modality(row, idx)` (16663-16669),
regex sobre campos de canal: `digital|online|ecommerce|site|whatsapp|...` para digital;
`presencial|loja|showroom|fisico|visita|externa` para presencial. Se indefinido, usa
**seed determinístico** (hash de client+uf+seller) com `seed % 4 === 0 ? presencial : digital`
(aproximadamente 25% presencial). Modalidade e ticket são portanto INFERIDOS, não vêm
de campo real na maioria dos casos.

Subtítulo: "{período} · {n} pedido(s)". CSS v128 (17175-17303) fixa o card em **620px**
de altura (`min-height:620px; height:620px`), tipografia grande nos valores
(`clamp(30px,2.45vw,42px)`, featured `clamp(32px,2.65vw,46px)`); o C7 também recebe
620px nesse mesmo bloco.

---

## 7. C7 , Itens vendidos no período (`renderSalesC7`) + filtro de pagamentos

**ATIVA = v140** (`window.renderSalesC7`, l.18863-18913). **MORTO = v127** (17114-17153).
Markup 6997-7007. **NÃO é SVG**, é um gráfico de **barras verticais em HTML/CSS**
(`#sales-c7-chart.minimal-style`, mesmo padrão do B8, l.7001/7004).

**Dados:** `salesC7DataV140()` (18833-18845) agrega `salesClosedOrderRows` por modelo,
soma qty/value/orders, ordena por qty desc (desempate por value), **top 22 modelos**
(`.slice(0,22)`).

**Eixo Y "nice max":** `c7NiceMax(value)` (18812+) calcula o teto arredondado pela escala
1/2/5/10: `pow = 10^floor(log10(n))`, normaliza `n/pow`, escolhe step 1, 2, 5 ou 10.
`c7AxisLabels(axisMax)` gera 6 ticks; cada tick vira `.sales-c7-min-y-label` +
`.sales-c7-min-gridline` (a do valor 0 ganha classe `zero`).

**Cada barra (18889+):** altura `Math.max(3, Math.min(100, qty/axisMax*100))%` (mín 3%),
label X truncado em 28 chars, `<title>` "{modelo} · {n} item(s) · {pct}% · {R$}".

**Interatividade v140 (o "c7 filtra pagamentos"):**
- Estado global `window.SALES_C7_SELECTED_MODEL` (string vazia por padrão).
- Cada barra é um `<button>` (l.18895) com `data-sales-c7-model`, `aria-pressed`,
  aria-label "Filtrar formas de pagamento por {modelo}".
- Clique chama `salesSelectC7Model(model)` (18852-18857): **toggle** de
  `SALES_C7_SELECTED_MODEL` (clicar de novo no mesmo limpa) e re-render de C7 e C10.
- Barra ativa ganha classe `.active` (brilho + ring dourado, CSS 18724-18730).
- Guarda de coerência: se o modelo selecionado não está mais no top 22, limpa a seleção
  (`if(selected && !data.some(... )) SALES_C7_SELECTED_MODEL=''`).
- Rodapé mostra "Clique em uma barra para filtrar o C10" ou
  "Produto selecionado: {modelo}" + botão **"Limpar produto"** (`salesClearC7Model`,
  18858-18862, que zera e re-renderiza C7 e C10).
- Subtítulo: "{período} · {n} itens · {n} modelos", acrescido de " · filtrando {modelo}"
  quando há seleção ativa. Estado vazio: "Sem itens vendidos no período selecionado."
  (`#sales-c7-empty`).

---

## 8. C10 , Formas de pagamento (`renderSalesC10`)

**ATIVA = v140** (`window.renderSalesC10`, l.18914-18957). **MORTO = v139** (18639-18675,
sem o vínculo com o C7). Markup 6984-6995 (`#sales-c10-grid`). **NÃO é donut/pizza**,
é uma **lista de cards** (um por forma de pagamento).

**5 formas fixas** (`PAYMENT_FORMS`, l.18777-18783, definido igual em v139 e v140):
```js
[{key:'boleto',label:'Boleto'}, {key:'pix',label:'PIX'},
 {key:'credito',label:'Cartão de crédito'}, {key:'debito',label:'Débito'},
 {key:'cheque',label:'Cheque'}]
```

**Cada card mostra:** nome (uppercase), contagem ("{n} pedidos"), pílula de
**percentual** (`count / totalCount * 100`, 1 casa) e **valor** (Σ total) à direita.
Cores por forma (barra lateral + pílula, CSS 18525-18583): PIX verde `#6FE0B0`, crédito
azul `#6F8FF3`, débito roxo `#9B72CF`, cheque amarelo `#F6C453`, boleto dourado (default).
Rodapé: "Total {escopo}: {R$}". Estado vazio: "Sem pedidos com forma de pagamento no
período selecionado."

**Atribuição da forma de pagamento (INFERIDA):** `inferPayment(row, idx)` (18801-18810):
usa campo explícito se houver (`payment / payment_method / forma_pagamento / method / ...`)
via `normalizePayment` (NFD + lowercase, casa pix/boleto/credito/debito/cheque); senão
heurística determinística:
- `value >= 120000` para boleto;
- UF SP ou RJ para `idx%2 ? credito : pix`;
- UF DF ou GO para `idx%3 ? boleto : pix`;
- senão `PAYMENT_FORMS[abs(idx + round(value/1000)) % 5].key`.

Portanto os percentuais de C10 são fabricados quando não há campo real de pagamento no Odoo.

**Vínculo com C7 (v140):** `currentRowsForC10()` (18846-18851) filtra os pedidos por
`SALES_C7_SELECTED_MODEL` quando há produto selecionado no C7
(`rows.filter(row => row.model === selected)`). Assim o C10 mostra "como esse modelo foi
pago". Subtítulo e mensagens incorporam o nome do produto selecionado (18929-18936, 18955).

---

## 9. C8 e C9 , Comparativo de estado (versão ATIVA = v134)

**Os dois cards são o mesmo componente comparativo, instanciado 2x (`c8` e `c9`).**
Markup 7009-7055. **Não é comparação lado-a-lado de 2 UFs num gráfico:** cada card
configura **um estado + um período próprios** (default C8=SP, C9=RJ); o usuário compara
visualmente C8 vs C9. A partir do v134 há **delta percentual cruzado** entre os dois quadros.

### 9.1 Correção crítica em relação à perícia base

A perícia base (`04-vendas.md` §9 e §12 item 6) documenta apenas o IIFE **v131** como
fonte ativa e afirma "sem lógica de delta implementada". **Isso está materialmente errado
para este arquivo.** `window.renderSalesCompareCards` é **sobrescrito 3 vezes**
(v131 para v132 para v134); a versão que de fato roda é a **v134**, que:
(a) gera dados **100% fictícios próprios** (`mockRows`), com um conjunto de marcas
DIFERENTE do v131; (b) **implementa a lógica de delta/comparação percentual** entre os
dois quadros (badges nos KPIs, rótulos de pizza "{delta}% vs outro", pill "vs {UF}").
A v131 (`compareAllRows`/`compareBrandData`/`renderComparePie`/`renderCompareCard`) e a
v132 são **CÓDIGO MORTO**.

### 9.2 v131 (MORTO, l.17468-17827) , o que ainda vale: modal e config

Embora o renderer v131 esteja morto, o **modal de configuração e o estado global
continuam ativos** (não foram sobrescritos):
- `SALES_COMPARE_CONFIG = {c8:{uf:'SP', periodSource, period}, c9:{uf:'RJ', ...}}` (17476-17479).
- `COMPARE_UFS` (27 UFs, 17472), `COMPARE_COLORS` (10 cores, mesma paleta).
- `ensureCompareModalUi()` (17518-17601): injeta dinamicamente o seletor de período rico
  (5 abas Dias/Meses/Anos/Trimestres/Semestres + presets + botão "Usar período atual do C1").
- `populateCompareStates` (27 UFs com nome), `hydrateComparePeriod`,
  `readComparePeriodFromModal`, `setCompareMode`, `salesCompareUseCurrentPeriod`,
  `salesCompareQuickPeriod` (presets today/last7/last30/last90/currentMonth/lastMonth/
  last6Months/currentYear/lastYear) (17602-17665).
- `openSalesCompareModal(card)` (17789-17803): o botão de 3 pontinhos
  (`.sales-compare-menu-btn`, l.7011/7035) no header de cada card abre `#modal-sales-compare`.
  O modal tem select de Estado (27 UFs) + o seletor de período rico injetado; o
  `<select>` de período HTML original (7078-7088) é ocultado por CSS
  (`#sales-compare-period{display:none}`, l.17437).
- `applySalesCompareModal` (17805-17817): grava UF + período (marca `periodSource:'current'`
  se igual ao C1, senão `'custom'`), valida datas, re-renderiza os dois cards.
- **MORTO no v131:** `compareAllRows()` (17672-17705, dados reais + fallback demo 12 UFs x
  5 marcas Johnson/Long Life/XMaster/Body Joy/Vision), `compareRows`, `compareBrandData`
  (top 8), `renderComparePie` (viewBox 560x320, cx280 cy158 r78), `renderCompareCard`.

### 9.3 v132 (MORTO renderer, ATIVO CSS, l.17832-18020)

- **CSS ATIVO:** posiciona C8 `grid-column:1/3` e C9 `grid-column:3/5`, column-gap 4px,
  row-gap 8px. Injeta o badge permanente **"DADOS FICTÍCIOS"** via
  `.sales-compare-selected::after` (l.17846): pílula azul `#8FB5F5`, font 8.4px,
  font-weight 950, letter-spacing 0.8px. `.sales-compare-pie-wrap` min-height 345px.
- **mockRows v132 (DADOS FICTÍCIOS, gerador estável):** introduz o conjunto de marcas e
  multiplicadores que o v134 reusa (ver 9.4). O renderer v132 em si é sobrescrito pelo v134.

### 9.4 v133 (ATIVO, l.18023-18127) , relabel + altura final

- **CSS:** C8/C9 `height:760px` (ALTURA FINAL; a perícia base dizia 590px, incorreto),
  `aspect-ratio:auto`, pizza `min-height:485px`, KPIs maiores.
- **Script (18112-18126):** patch DOM que **renomeia o label do KPI de margem para
  "Margem de lucro média"** e re-chama `renderSalesCompareCards`.

### 9.5 v134 (ATIVO, VERSÃO FINAL, l.18231-18417)

**Sobrescreve `renderSalesCompareCards` pela última vez.** IIFE com:

**Constantes (DADOS FICTÍCIOS):**
- `COLORS` (10, mesma paleta).
- `UF_MULT` (27 UFs + alias BSB:0.74): SP 1.38, RJ 1.12, MG 1.05, PR .96, SC .88, RS .84,
  BA .78, PE .70, CE .66, DF .74, GO .68, ES .62, MT .58, MS .52, PA .55, AM .50, RN .44,
  MA .42, PI .38, PB .40, AL .36, SE .32, RO .34, TO .30, AC .26, AP .24, RR .22 (default .46).
- `BRANDS` (6, DIFERENTES do v131): **Johnson, Movement, Kikos, Life Fitness, Technogym,
  Athletic.**
- `BRAND_MULT`: Johnson 1.22, Movement 1.08, Kikos .92, Life Fitness .86, Technogym .76,
  Athletic .62 (default .7).

**`mockRows(card)`:** normaliza UF (BSB para DF, l.18386), resolve período via
`periodFor(card)` (período custom do card ou período corrente "mês atual"), calcula
`base = (card==='c9' ? 182000 : 218000) * ufMult * periodFactor`, com
`periodFactor = clamp(.82, 1.55, log10(periodDays+12))`. Para cada marca gera N pedidos
(`orders = max(2, round((bIdx<2?5:3)*ufMult + (c9?1:2) - bIdx*.25))`) com `total`,
`cost = total*(1-marginRate)` (marginRate base .23 + variação por marca/índice, +.018 no
c8 ou +.005 no c9), `qty` e `status:'sale'`. **100% sintético.**

**`metrics(card)`:** retorna total, cost, count, `avgOrder = total/count`,
`avgMargin = ((total-cost)/total)*100`, brands, brandMap.

**Delta (o coração do v134):**
- `deltaPct(current, other)`: `((a-b)/abs(b))*100`; se `b` zero e `a` existe, retorna 100.
- `deltaClass(value)`: "positive" se `>0.049`, "negative" se `<-0.049`, senão "neutral".
- `deltaText(value)`: "0,0%" se `|n|<.05`, senão sinal "+"/"-" + percent (ex.: "+12,3%").
- `ensureDelta(valueElId, delta)`: cria/atualiza um `<em class="sales-compare-delta {class}">`
  dentro de cada `.sales-compare-kpi`, com o texto do delta e `title`
  "Variação percentual em relação ao outro quadro selecionado".

**Pizza por marca (`renderPie(svg, data, total, otherBrandMap)`):** viewBox **760x430**,
`cx=380, cy=214, r=96`, minY 56, maxY 374, gap 82. Para cada fatia calcula
`delta = deltaPct(item.value, otherBrandMap.get(item.brand))`. Tooltip
"{marca} · {R$} · {pct}% · {delta}% vs outro quadro". Cada rótulo de fatia tem
**3 linhas de texto:** nome (truncado em 16 chars com `<title>` completo),
"{R$} · {pct}%", e "{delta}% vs outro" colorido pela classe
`sales-compare-label-delta-positive/negative/neutral`. Texto à esquerda (labelX 86,
anchor end) ou direita (labelX 674, anchor start). `distribute()` foi **REESCRITO**
(18339-18351): espaçamento uniforme centralizado (`step = max(gap, (maxY-minY)/(n-1))`),
diferente do anti-colisão do v131.

**`renderCard(card, own, other)`:** subtítulo; faixa `selected` com a pill
**"vs {otherUf}"** (`.sales-compare-vs-pill`); 3 KPIs com badges de delta:
- **Faturamento** (Σ total) com delta vs faturamento do outro card.
- **Valor médio de pedido** (total/count) com delta.
- **Margem de lucro média** (`((total-cost)/total)*100`) com delta.
mais a pizza com delta por marca.

**`renderSalesCompareCards()`:** computa `metrics('c8')` e `metrics('c9')` e cruza
(own vs other) para cada card. CSS v134 (18131-18229) adiciona `.sales-compare-delta`
(verde positivo / vermelho negativo / cinza neutro), `.sales-compare-vs-pill`, as 3
classes de cor do delta no rótulo, e o subtítulo permanente via
`.sales-compare-chart-title::after` = **"variação vs outro quadro"** (18217-18225).

**Estado vazio:** "Sem vendas em {UF} no período selecionado."

### 9.6 v135/v136 (ATIVO, l.18421-18477) , ajuste fino de fonte

CSS que ajusta o tamanho de fonte dos rótulos da pizza do comparativo. Sem lógica nova.

---

## 10. Primitivas reutilizadas

- **`renderPie` / `renderCard` "genéricos":** não existe uma primitiva única
  compartilhada; o padrão de pizza com leader-lines é **reescrito inline** em cada
  contexto (C3, C4 com `distributeSalesLabels`; v131 com `distributeLabels`; v134 com
  `renderPie`/`distribute` próprios). A geometria muda por contexto: C3/C4 cx280 cy250
  r132 viewBox 560x500; v131 cx280 cy158 r78 viewBox 560x320; v134 cx380 cy214 r96
  viewBox 760x430.
- **Paleta de 10 cores idêntica** em C3/C4/C8/C9 (e nos mocks): dourados Matrix
  `#C8A96E #E8D5A8 #9B7E45 #A8844C` + acentos `#6F8FF3` azul, `#6FE0B0` verde,
  `#B8BDC8` cinza, `#F17A7A` vermelho, `#8FB5F5` azul claro, `#9B72CF` roxo.
- **Helpers de formatação:** `salesMoney` (R$ pt-BR), `salesNumber`, `salesPercent`,
  `salesDateBR` (dd/mm/aaaa), `salesPeriodDetail`, `salesSafeText` (escape HTML).

---

## 11. Cores semânticas, animações e estados vazios

- **Semântica de margem (C5):** `<25%` low, `<32%` mid, senão ok.
- **Modalidade (C5 badge e C6):** digital azul `#8FB5F5`/`#6F8FF3`, presencial verde `#6FE0B0`.
- **Formas de pagamento (C10):** PIX verde, crédito azul, débito roxo, cheque amarelo
  `#F6C453`, boleto dourado.
- **Animações:** fatias de pizza fazem `scale(1.012)` + `opacity .92` no hover
  (CSS 17422-17423); barras do C7 fazem brightness/translateY/box-shadow no hover/focus
  e ring dourado quando `.active` (18713-18730); botão de 3 pontinhos do comparativo
  translada no hover (17406).
- **Estados vazios (textos exatos):** C3 "Sem vendas no período selecionado."; C4
  "Sem vendas por marca no período selecionado."; C5 "Sem pedidos fechados no período
  selecionado."; C6 "Sem pedidos no período"; C7 "Sem itens vendidos no período
  selecionado."; C8/C9 "Sem vendas em {UF} no período selecionado."; C10 "Sem pedidos
  com forma de pagamento no período selecionado." Cada card alterna `.is-empty`.
  **Importante:** quase todos têm fallback de demonstração quando a base real está vazia,
  então o estado vazio raramente aparece.

---

## 12. Inventário de DADOS FICTÍCIOS (não portar para produção)

| Local | Linhas | O que é |
|---|---|---|
| C3 fallback | 16345-16347 | 8 UFs demo (`(idx+2)*8750 + (idx%3)*6400`) |
| C4 fallback | 16457-16460 | 4 marcas demo / STOCK_SUPPLIERS |
| C5 sampleClosedOrders | 16987-16996 | 8 pedidos fictícios com modelo+qty |
| C5 salesClosedFallbackSeller | 16547-16550 | vendedor fictício por região |
| C8/C9 v131 compareAllRows | 17694-17704 | fallback demo 12 UFs x 5 marcas (MORTO) |
| C8/C9 v132/v134 mockRows | 17832+, 18231+ | gerador 100% sintético (ATIVO) |
| Margem/custo (C2/C5/C6) | 16194-16202 | heurística `salesModelCost`, `price*0.64` |
| Modalidade (C5/C6) | 16663-16669 | seed determinístico (hash), ~25% presencial |
| Forma de pagamento (C10) | 18801-18810 | `inferPayment` heurístico por UF/valor/idx |

---

## 13. Riscos para a reconstrução

1. **Cascata de monkey-patches:** consolidar cada card numa função única (a versão vNNN
   final) em React/Next em vez de replicar o override.
2. **C8/C9 hoje rodam 100% mock (v134):** a fonte de dado real (v131 compareAllRows)
   está morta. Reconstruir ligando a base real e removendo `mockRows`. O badge "DADOS
   FICTÍCIOS" e o subtítulo "variação vs outro quadro" são permanentes via CSS `::after`.
3. **C3 é pizza, não mapa.** Se a diretoria quer mapa, é decisão nova.
4. **Margem, custo, modalidade e forma de pagamento são INFERIDOS** por heurística;
   precisam de campos reais do Odoo, senão os percentuais de C6/C10 são fabricados.
5. **A lógica de delta do C8/C9 existe e funciona (v134)**, ao contrário do que a perícia
   base afirmava. Preservá-la na reconstrução.
6. **Altura final do C8/C9 é 760px** (v133), não 590px.

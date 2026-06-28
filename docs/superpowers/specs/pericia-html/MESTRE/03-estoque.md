# Perícia HTML MESTRE , Módulo ESTOQUE (#mod-estoque)

> Fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.971 linhas).
> Protótipo monolítico, JS/CSS vanilla, gráficos em SVG puro, dados 100% mock em memória (sem fetch).
> Escopo deste capítulo: o módulo Estoque, `<div id="mod-estoque">` (markup HTML 6139-6519), componentes A1 a A6 e o modal "Estoque ideal" (markup 10105-10129). A7 (Compras) e A8 (Compras ativas) têm capítulo próprio; aqui só registramos a fronteira.
> Este documento confirma cada item diretamente no HTML (linhas citadas), consolida e CORRIGE a perícia anterior `01-estoque.md` e as auditorias `audit/faixa-02.md`, `faixa-05.md`, `faixa-07.md`.

---

## 0. Aviso metodológico , VERSÕES SOBREPOSTAS (a última vence)

O arquivo foi construído por iterações empilhadas em blocos `<script>` rotulados por versão (`v51`, `v54`, `v78`, `v79`, `v80`...`v85`, `v88`...`v99`, `v101`, `v113`, `v114`...). Em JS, **a ÚLTIMA declaração de uma função de mesmo nome no escopo global vence (hoisting de `function`)**; em CSS, a última regra de mesma especificidade vence. A reconstrução DEVE usar a versão ATIVA (a última), não a primeira.

Mapa de versões ativas (confirmado por `grep` de definições):

| Símbolo | Defs (linhas) | ATIVA (vence) | Observação |
|---|---|---|---|
| `STOCK_PRODUCTS` / `STOCK_SERIALS` | 9529 / 9549 | únicas | enriquecimento de seriais em 10173-10193 |
| `getStockTotalValue` | 9725 | 9725 | soma dos 5 locais |
| `getProductsWithTotals` | 9728 | 9728 | totalQty por escopo |
| `renderStockDashboard` | 10052 | **10052** | orquestra A2+A3+A4 |
| `renderStockLocations` | 9736, **12027** | **12027** | A2: card sempre mostra valor GERAL |
| `renderStockSummary` | **9822** | 9822 (+ wrap v113) | A4 cards 1-4 |
| `renderStockProductTable` | 9773, 10256, 10459, 10698, **11513** | **11513** | A3 com busca + filtro de status |
| `getStockA3StatusClass` | 10150, **10391** | **10391** | recebe `item` (overPct individual) |
| `getStockA3StatusText` | 10156, **10397** | **10397** | idem |
| `stockA3RangeStatus` | **11498** | 11498 | classifica below/ideal/above |
| `getStockSerialAgeDays` | 10404, **10632** | 10632 | usa `ageDays` pré-calculado |
| `renderStockPieChart` | 9942, 10304, **10670** | **10670** | viewBox 220, r=78, rótulo HTML |
| `renderStockPieDashboard` | 9976, **10694** | 10694 | 2 pizzas |
| `buildStockDistributionData` | **9934** | 9934 | conta nº de SERIAIS |
| `renderStockSerialDashboard` | 10017, 10328, 10747, **10880** | **10880** | A6 |
| `buildStockSerialSearchText` | 10604, 10814, 10956, **11069** | **11069** | busca "loose" |
| `stockMatchesSerial` | **11097** | 11097 | + regra estrita 11060-11067 |
| `getFilteredStockSerials` | 9898, 10614, **11128** | **11128** | |
| `renderStockA4AgeAndTurnover` | 10641, 10856, **14638** | **14638** | já calcula COBERTURA (não "turnover Nx") |
| `renderStockCoverageFromA3` | **14773** | 14773 | monkeypatch v113 sobrepõe card 6 |
| `bindStockSearch` | 10058, **10363** | 10363 | init geral |
| `buildStockBrazilMap` | **9859** | 9859 | **ÓRFÃO / morto (§11)** |
| `renderStockLeadTime` | **9981** | 9981 | **MORTO, nunca chamado (§11)** |
| `renderStockA3Indicators` | **10428** | 10428 | **ÓRFÃO, elementos inexistentes (§11)** |

**Correções materiais sobre `01-estoque.md`** (esta perícia mestre prevalece):
1. A5 ATIVA é a `renderStockPieChart` de **10670** (viewBox `0 0 220 220`, `cx=cy=110`, `r=78`, SEM furo central, rótulo central via HTML `Total` + valor). A versão com furo donut `r=52` e texto SVG "TOTAL" (9942, `cx=cy=120 r=92`) é CÓDIGO MORTO.
2. Hover de fatia ATIVO é `filter:brightness(1.10)` (2775), não 1.18 (2690, sobrescrito).
3. Card 6 do A4 ("Tempo de cobertura") é alimentado por DUAS vias que escrevem no mesmo `#stock-a4-turnover-value`: a `renderStockA4AgeAndTurnover` ATIVA (14638) já calcula cobertura, e o monkeypatch v113 chama `renderStockCoverageFromA3` (14773) após cada `renderStockSummary`/`renderStockProductTable`. A 1ª versão de A4 (10641) que escrevia "N,NNx" (turnover) é MORTA.

---

## 1. Layout do dashboard (#mod-estoque)

### 1.1 Container e grid final de 4 colunas
- `#mod-estoque` (6139): `overflow:auto; padding` final `14px 16px 16px !important` (773, sobre o inicial `16px 18px 24px 10px` de 363/649).
- `.stock-container` (6140): `display:grid; align-items:start`. A definição-base (364) era 2 colunas `minmax(300px,340px) minmax(780px,1fr)`. Foram empilhadas dezenas de overrides por versão (v51 2 cols, v54 4 cols, v78 rows, ...). **A regra de COLUNAS que prevalece é o v79** (2345-2350):
  ```
  /* v79 - Estoque: A1 removido, A2 ampliado e seriais reorganizados */
  #mod-estoque .stock-container{ grid-template-columns:repeat(4,minmax(0,1fr)) !important; ... gap:12px; }
  ```
  Nenhum bloco posterior redefine `grid-template-columns` no desktop; v88/v90/v91/v94...v101 só alteram `grid-template-rows` (ex.: v101 12264 `grid-template-rows:auto 420px 660px 540px 760px`). **Grid final = 4 colunas iguais** `repeat(4,minmax(0,1fr))`, linhas variáveis por versão de compras.
- Breakpoints ativos colapsam para 1 coluna (`@media(max-width:1100px)` 2491, `@media(max-width:1180px)` 4547) empilhando os cards.

### 1.2 A1 REMOVIDO (registrar)
- O card A1 existiu (CSS `.stock-a1{grid-column:1;grid-row:1}` em 370, e dezenas de overrides `#mod-estoque .stock-a1{...}`), mas foi **desligado no v79**: `#mod-estoque .stock-a1{display:none !important;}` (**linha 2351**). Não há `<div class="stock-a1">` no markup atual (o módulo começa direto no A2, 6141). Logo, A1 NÃO deve ser reconstruído , é resíduo de versão antiga.

### 1.3 Orquestração de render
- `renderStockDashboard()` (10052) chama, nesta ordem: `renderStockLocations(query)` → `renderStockProductTable(query)` → `renderStockSummary()` (10053-10056). `query` vem de `getStockQuery()` (lê `#stock-search`, input que NÃO existe no DOM final , a busca real do A3 é `#stock-a3-search`).
- `bindStockSearch()` (10363, ativa) roda no init: `loadStockIdealConfig`, `loadStockWarnConfig`, liga listeners e dispara `renderStockDashboard`, `renderStockSerialDashboard`, `renderStockPieDashboard`, `buildStockBrazilMap` (este último no-op).
- Vários `DOMContentLoaded` re-executam via `setTimeout(...,0)`: A3-search (11578-11582), serial dashboard + reescrita do help (11133-11137), cobertura (14818-14822).
- **Monkeypatch v113** (14802-14823): envelopa `window.renderStockSummary` e `window.renderStockProductTable` para, ao final, chamar `renderStockCoverageFromA3()`. É por isso que o card "Tempo de cobertura" sempre reflete a lógica A3-driven.

---

## 2. Modelo de dados (mock, em memória) , linhas 9518-9569

Constantes (9518-9528):
```
STOCK_LOCATIONS (9518) = 5 locais com valor fixo:
  CEILÂNDIA      R$ 12.345.678   search "CEILANDIA CEILÂNDIA DF"
  VICENTE PIRES  R$ 23.456.789   search "VICENTE PIRES DF"
  SERGIPE        R$ 34.567.890   search "SERGIPE SE"
  VALINHOS       R$ 45.678.901   search "VALINHOS SP"
  JARINU         R$ 56.789.012   search "JARINU SP"
  (soma = R$ 172.836.270 = getStockTotalValue())
STOCK_TABLE_LOCATIONS (9525) = ['CEILÂNDIA','VICENTE PIRES','SERGIPE','VALINHOS','JARINU']
STOCK_IDEAL_STORAGE_KEY (9526) = 'stock_ideal_config_v73'        (localStorage)
STOCK_CATEGORIES (9527) = ['FORÇA','CARDIO','PESO LIVRE','ACESSÓRIOS','EXTRAS']
STOCK_SUPPLIERS  (9528) = ['JOHNSON','LONG LIFE','XMASTER','BODY JOY']
STOCK_WARN_STORAGE_KEY  = 'stock_over_ideal_warn_pct_v82'        (localStorage, legado morto)
STOCK_SERIAL_REFERENCE_DATE = 2026-06-15  ("hoje" para idade/venda)
```

**`STOCK_PRODUCTS`** (9529-9548): `Array.from({length:48})` , **48 modelos** `Modelo catálogo 001..048`. Por item (`n=idx+1`, `base=(n%9)+1`):
- `product` = `Modelo catálogo ${pad3(n)}`
- `category` = `STOCK_CATEGORIES[idx % 5]` (cíclico)
- `supplier` = `STOCK_SUPPLIERS[(idx*2+1) % 4]` (cíclico)
- `demanda` = `base*12 + n`
- `disponiveis` = `base*18 + n`
- `ideal` (default) = `45 + base*6 + n`
- `qty` por local: CEILÂNDIA `base*3+n`, VICENTE PIRES `base*2+n`, SERGIPE `base+n`, VALINHOS `base*4+n`, JARINU `base*5+n`.

**`STOCK_SERIALS`** (9549-9569): `flatMap` sobre os 48 produtos; cada modelo gera `serialCount = 4 + (idx%4)` seriais (**4 a 7 por modelo**). Por serial (`seq=seqIdx+1`):
- `model` = nome do produto
- `serial` = `SER-${pad3(idx+1)}-${pad4(seq)}` (ex.: `SER-026-0003`)
- `cost` = `850 + (idx%12)*185 + (idx+1)*11 + seq*37`
- `category` / `supplier` = herdados do modelo (fallback `EXTRAS` / `JOHNSON`)
- `purchaseDate` = `new Date(2025,0,6 + idx*7 + seqIdx*3)` (ISO via `formatStockISODate`)
- `leadDays` = `5 + (idx%9)*2 + (seqIdx%4)*3`
- `arrivalDate` = `purchaseDate + leadDays` dias

**Enriquecimento de seriais** (10173-10193), aplicado uma vez no load:
- `simulatedAvailable = ((idx+1)%4===0) || ((idx+7)%9===0)` → serial sem venda (`available=true`, `saleDate=''`).
- senão `saleDelay = 18 + (idx%7)*11 + (idx%3)*4`; `saleDate = arrival + saleDelay`. Se `saleDate > 2026-06-15` vira disponível; senão `available=false` com `saleDate` setada.
- `ageDays = round((getStockSerialEndDate(item) - arrivalDate)/dia)`, `>=0`. `getStockSerialEndDate` (10169) = `saleDate` ou, se vazio, `2026-06-15` (data de referência).

Helpers: `formatStockCurrency` (BRL pt-BR), `formatStockDate` (DD/MM/AAAA; vazio = "—"), `formatStockISODate`, `formatLeadDays`/`formatDayDiff` (`N dia/dias`, 10160-10168), `normalizeStockText` (NFD + lowercase sem acento). Estado global: `ACTIVE_STOCK_LOCATION` (''), `STOCK_IDEAL_MAP`, `ACTIVE_STOCK_A3_STATUS_FILTER` ('all').

---

## 3. A2 , Estoque geral e por local

Markup 6141-6159. Título exato (6144): **"A2 — Estoque geral e por local"** (ícone cubo/caixa, SVG path em 6143). Render: `renderStockLocations(query)` ATIVA em **12027**.

Layout (`.stock-card-body.stock-combined-body`, 6146): à esquerda o botão de valor total, à direita a lista horizontal.

### 3.1 KPI principal , `<button#stock-total-block>` (6147)
- `onclick="setStockLocationFilter('')"` , limpa o filtro de local. Classe inicial `.active` (6147).
- `#stock-total-value` (6148): na versão ATIVA (12027) **SEMPRE mostra o valor GERAL** `getStockTotalValue()` (R$ 172.836.270), independente do local selecionado. Comentário no código: "O card principal do A2 sempre mostra o valor geral." (12035). Diferença-chave vs. a 1ª versão (9736) que trocava para o valor do local.
- `#stock-total-label` (6149): texto fixo **"Valor do estoque geral"** (forçado em 12037).
- `#stock-total-sub` (6150): com local ativo → `"Filtro ativo: <LOCAL>. Clique aqui para voltar ao estoque geral."`; senão → `"Somatório de todos os locais cadastrados."` (12038-12040).
- `.active` é alternada por `totalBlock.classList.toggle('active', !selectedLocation)` (12041).

### 3.2 Lista "Estoque por local" , `#stock-location-list` (6154)
- Subtítulo fixo (6153): **"Estoque por local"**.
- Cada linha é `<button.stock-location-row>` criado em runtime (12054-12065): clique = `setStockLocationFilter(item.name)` (alterna filtro do A3/A4). Ordenada por `value` desc (12049).
- Filtro pela `query` do A2 (campo herdado): casa `name + search` por `normalizeStockText` (12048).
- Conteúdo por linha (12059-12064): **`.stock-location-name`** (nome) | **`.stock-location-percent`** (`value/total*100`, 1 casa) | **`.stock-location-value`** (BRL).
- Linha do local selecionado recebe `.active` (12056).
- Estado vazio `#stock-location-empty` (6155): **"Nenhum local encontrado para a pesquisa."** (toggle display em 12067).

### 3.3 Estado-vazio "livre" , `.stock-free-placeholder` (CSS MORTO)
- CSS existe (2405-2437): `.stock-free-body` (flex centralizado), `.stock-free-placeholder` (borda `1px dashed var(--bd2)`, radius 14px, fundo `rgba(255,255,255,.018)`, padding 24px, coluna centralizada), `.stock-free-title` (Space Grotesk, 15px, 900, uppercase, `var(--white)`), `.stock-free-text` (12px, `var(--tx3)`).
- **Sem markup correspondente** no DOM final (`grep stock-free-placeholder` = só CSS). É resíduo de uma versão de placeholder de coluna vazia , NÃO reconstruir.

---

## 4. A3 , Modelos do catálogo em estoque

Markup 6161-6192. Título (6167): **"A3 — Modelos do catálogo em estoque"** (ícone gráfico). Subtítulo `#stock-a3-subtitle` (6168), default "Gráfico por quantidade total de unidades em estoque", reescrito em runtime. Botão 3-pontos no header (6163-6165): `<button.stock-more-btn onclick="openStockIdealModal()" aria-label="Configurar estoque ideal">` (3 `<span>` = os pontos). Render: `renderStockProductTable(query)` ATIVA **11513** + monkeypatch de cobertura.

### 4.1 Painel de filtro (6170-6181)
- **Busca** `#stock-a3-search` (6173), placeholder "Pesquisar modelo, número, categoria ou fornecedor…". Listener (`input`) dispara `renderStockDashboard()` (11581).
- **Botões de status** `#stock-a3-filter-buttons` (6175-6179): **Todos / Abaixo / Ideal / Acima**, `data-stock-a3-status="all|below|ideal|above"`, `onclick="setStockA3StatusFilter(...)"`. Botão "Todos" inicia com `.active` (6176). `setStockA3StatusFilter` (11428) valida o valor, alterna `.active` no botão correspondente (11430-11432) e re-renderiza.

### 4.2 Busca A3 (`stockA3MatchesProduct`, 11479)
Normalizadores: `stockA3Normalize` (NFD+lowercase, 11438), `stockA3Compact` (só `[a-z0-9]`, 11445), `stockA3Spaced` (separadores → espaço, 11448), `stockA3Tokens` (11451), `stockA3NumericVariants` (gera num, Number(num), pad2/3/4, 11454-11461). Texto indexado por produto (`stockA3BuildProductSearchText`, 11462): `product, category, supplier, demanda, disponiveis` + variantes numéricas. Casa por: substring compact, substring spaced, ou TODOS os tokens (números aceitam variantes com zero à esquerda) (11484-11496).

### 4.3 Classificação de status (`stockA3RangeStatus`, 11498)
Com `realQty` (qtd no escopo), `idealQty` (ideal no escopo), `limitPct` (overPct individual, default 30):
- `realQty < idealQty` → **`below`** (vermelho `is-low`).
- `idealQty <= 0` → `above` se `realQty>0`, senão `ideal`.
- `realQty > idealQty*(1 + limitPct/100)` → **`above`** (amarelo `is-high`).
- senão → **`ideal`** (verde `is-ok`).

`stockA3StatusMatches` (11506) filtra pelo botão ativo; `stockA3FilterLabel` (11509) mapeia `{all:'todos', below:'abaixo do ideal', ideal:'dentro do ideal', above:'acima do limite'}`.

Funções gêmeas para o MODAL (chip de status): `getStockA3StatusClass(realQty,idealQty,item)` (ATIVA 10391) retorna `is-low/is-high/is-ok`; `getStockA3StatusText(...)` (ATIVA 10397) retorna texto "X,X% abaixo do ideal" / "+X,X% acima do limite individual de N%" / "Dentro do limite individual de +N%".

### 4.4 Subtítulo dinâmico
`#stock-a3-subtitle` reescrito em 11535-11540: `"<filtrados>/<total> modelos · <stockA3FilterLabel()>[· <LOCAL>][· busca "<q>"]"`.

### 4.5 Gráfico de barras horizontais (`#stock-model-graph`, 6190)
Cabeçalho de colunas fixo `.stock-graph-columns` (6182-6189), 6 colunas: **MODELO | BARRA | ESTOQUE | IDEAL | VARIAÇÃO | % DO TOTAL**. NÃO é `<table>`; é grid de linhas `.stock-graph-row` (11558). Sem paginação (todos os modelos filtrados). Render em 11542-11574. Por linha:
- **MODELO** `.stock-graph-name` (11559): `item.product` (title = nome completo).
- **BARRA** `.stock-graph-track` + `.stock-graph-fill` (11560-11563): largura `widthPct = max(4, round(totalQty/maxQty*100))%`; `maxQty` = maior `totalQty` entre filtrados (11534).
- **ESTOQUE** `.stock-graph-qty` colorido por status (11567): `realQty.toLocaleString un.`
- **IDEAL** `.stock-graph-ideal` (11568): `Ideal: <idealQty>`.
- **VARIAÇÃO** `.stock-graph-diff` colorido por status (11570): `±diffPct%` (1 casa), `diffPct=(real-ideal)/ideal*100` (11549). `title` (11552-11556): "Acima do limite individual de +N%" / "Abaixo do ideal" / "Dentro do ideal até +N%".
- **% DO TOTAL** `.stock-graph-share` (11571): `totalQty/grandTotalQty*100` (1 casa); `grandTotalQty` = soma de todos os `totalQty` da base (11522).
- `statusClass` derivada de `statusRange` (11548): `above→is-high`, `below→is-low`, else `is-ok`.
- Estado vazio `#stock-products-empty` (6191, `style="display:none"`): **"Nenhum modelo encontrado para a pesquisa."** Toggle em 11575; grid usa `display:flex/none` (11576).

Cores semânticas (CSS): `is-ok` verde `#48d986`, `is-low` vermelho `#ff7474`, `is-high` amarelo `#F6C453` (fundo/borda translúcidos).

---

## 5. Modal "Estoque ideal" (A3 · Configuração)

Abre via `openStockIdealModal()` (9645); fecha via `closeStockIdealModal()` (9653). Markup `#modal-stock-ideal` em 10105-10129.

- **Cabeçalho:** kicker **"A3 · CONFIGURAÇÃO"**, título **"Configurar estoque ideal por modelo"**, descrição: *"Defina a quantidade ideal e o limite máximo acima da meta individualmente para cada modelo. Quando o estoque ultrapassa esse limite, o A3 destaca os números em amarelo."*
- **Toolbar:** busca `#stock-ideal-search` (placeholder "Pesquisar modelo...", `oninput="renderStockIdealConfigList(this.value)"`); resumo `#stock-ideal-summary` `"<n> modelos · base <geral|LOCAL>"` (segue `ACTIVE_STOCK_LOCATION`); nota: *"O limite máximo acima do ideal agora é configurado individualmente em cada modelo."*

### 5.1 Lista (`renderStockIdealConfigList`, ATIVA 10509)
Um cartão por modelo (filtrável). Cada cartão:
- Nome do modelo.
- Chip "Estoque atual: `<currentQty>` un." (escopo de local ativo, ou soma geral).
- Chip de status (`getStockA3StatusClass`): `"±diffPct% · <statusText>"`.
- Campo **"Valor ideal total"** (number, `.stock-ideal-total-input`).
- Campo **"Máximo acima do ideal (%)"** (number, `.stock-ideal-over-input`, default 30) com ajuda: *"Ex.: 30 significa alerta amarelo quando passar de 30% acima do ideal."*
- Bloco **"Valor ideal por local de estoque"**: 5 inputs `.stock-ideal-location-input` (`data-location`).

### 5.2 Persistência
- `saveStockIdealConfig` (ATIVA 10557): varre inputs total/over/por-local, monta `{ [produto]: { total, byLocation:{[local]:n}, overPct } }`, faz merge em `STOCK_IDEAL_MAP`, persiste em `localStorage[STOCK_IDEAL_STORAGE_KEY='stock_ideal_config_v73']`, fecha modal e chama `renderStockDashboard()`.
- Leitura: `loadStockIdealConfig` (9604), `getIdealConfigForProduct` (9616), `getIdealQtyForProduct` (9636), `getDefaultIdealPerLocation` = `round(total / nº de locais)` (9611). `getStockPerItemOverPct` (10383) lê o `overPct` salvo, senão **30**.
- **Legado morto:** `STOCK_WARN_STORAGE_KEY='stock_over_ideal_warn_pct_v82'` + `loadStockWarnConfig`/`saveStockWarnConfig` continuam existindo, mas o input global de threshold (`#stock-over-ideal-threshold`, v82) foi REMOVIDO do DOM; as funções operam sobre elemento nulo. NÃO reconstruir o campo global; o limite é por modelo (`overPct`).
- **Ações:** "Cancelar" (`closeStockIdealModal`) e "Salvar configurações" (`saveStockIdealConfig`).

O ideal alimenta o A3 (status/cor/variação) e a lista do modal.

---

## 6. A4 , Indicadores do estoque

Markup 6194-6234. Título (6197): **"A4 — Indicadores do estoque"**. Subtítulo `#stock-a4-subtitle` (6198), default "Indicadores gerais · tempo de cobertura ligado ao A3" (sobrescrito por `renderStockSummary` 9848 e por `renderStockCoverageFromA3` 14790). Grid `.stock-summary-grid` (6201), **6 cards** (CSS v85 força `repeat(2,minmax(0,1fr))`, 2953).

**Cards 1-4** , preenchidos por `renderStockSummary()` (9822):
1. **VALOR MÉDIO POR PRODUTO** `#stock-avg-per-product` (BRL): `serialTotalCost / serialItemCount` = custo total de TODOS os seriais ÷ nº de seriais (9837-9839). Sub: `"Base geral de seriais · custo total dividido por N itens cadastrados."` (Nota: usa base de SERIAIS, apesar do rótulo "produto".)
2. **QUANTIDADE DE ITENS PRESENTES NO ESTOQUE** `#stock-total-items`: `totalUnits` = soma das unidades no escopo (9835). Sub: `"Base: <escopo> · soma das unidades simuladas."` (escopo = "estoque geral" ou "local <X>").
3. **QUANTIDADE DE ITENS MÉDIA POR LOCAL** `#stock-avg-items-per-location` (1 casa): unidades GERAIS ÷ 5 locais (9843-9845). Sub: `"Base geral · média entre 5 locais."`
4. **QUANTIDADE MÉDIA DE VALOR DE ESTOQUE** `#stock-avg-stock-value` (BRL): `getStockTotalValue() / 5` (9846). Sub: `"Base geral · média entre 5 locais."`

**Card 5 , IDADE MÉDIA POR PRODUTO** `#stock-a4-age-filtered-value` ("N dias" / "—"): preenchido por `renderStockA4AgeAndTurnover(serials, rawQuery)` (ATIVA 14638), chamado de dentro de `renderStockSerialDashboard` (A6, 10890). = média de `getStockSerialAgeDays` dos seriais filtrados pela busca do A6 (14645-14653). Sub (14655-14658): com busca → `"<n> seriais encontrados · <m> modelo(s)."`; sem busca → `"O indicador de cobertura abaixo acompanha busca e local selecionados no A3."`
- **Card oculto até busca (v85):** o card é `.stock-summary-card.stock-a4-age-card` (6222); o markup já vem com a classe `filtered` hardcoded (logo, visível por default). A regra CSS v85 (2949-2951) `#mod-estoque .stock-a4 .stock-summary-card.stock-a4-age-card:not(.filtered){display:none !important;}` esconde o card SE perder a classe `.filtered`; quando `.filtered` está presente, acento azul `#8FB5F5` no valor (2936/2970) e gradiente branco no `::before` (2967).

**Card 6 , TEMPO DE COBERTURA** `#stock-a4-turnover-value` ("N dias" / "∞ dias" / "999+ dias"): card `.stock-a4-turnover-card` (6227), valor verde `#6FE0B0` (2981). Sub default (6230) "Estoque disponível ÷ demanda pendente × 30 dias." Escrito por DUAS vias (ambas válidas, a do monkeypatch é a que prevalece após cada render do A3):
- `renderStockA4AgeAndTurnover` (14638, via A6): `stockQty=stockCoverageAvailableQty`, `demandQty=stockCoveragePendingDemandQty`, `coverageDays = demandQty>0 ? (stockQty/demandQty)*30 : 0`, formatado por `stockFormatCoverageDays` (14661-14669).
- `renderStockCoverageFromA3` (14773, monkeypatch v113, A3-driven , prevalece): `stockQty` = soma de `totalQty` dos produtos do A3 no escopo (`stockA3CoverageCurrentProducts`, 14779-14780); `demandQty` via `stockA3CoveragePendingDemandQty` (pega demanda pendente de pedidos, exclui cancelados e pendência ≤ 0); `days = demandQty>0 ? (stockQty/demandQty)*30 : 0`; formato `stockA3FormatCoverage(days,stockQty,demandQty)`: sem demanda e com estoque → "∞ dias"; sem demanda e sem estoque → "0 dias"; ≥1000 → "999+ dias"; senão "<round(days)> dias". Sub (14794-14797): `"<escopo>: X un. em estoque ÷ Y un. em demanda × 30 dias."` ou `"...nenhuma demanda pendente encontrada."` Escopo = "busca "q" · local L" ou "todos os modelos do A3". Também reescreve `#stock-a4-subtitle` para "Indicadores do A3 · <LOCAL>" ou "Indicadores gerais ligados ao A3".

> Fórmula canônica de cobertura: **cobertura(dias) = (estoque disponível ÷ demanda pendente) × 30**. O cálculo legado de "turnover Nx" (`soldCount / estoqueMédio`, formato "N,NNx") da 1ª versão (10641-10668) e o de `renderStockA3Indicators` NÃO são usados , ver §11.

---

## 7. A5 , Distribuição do estoque (2 pizzas)

Markup 6235-6253. Título (6238): **"A5 — Distribuição do estoque"**, subtítulo (6239) "Categoria · fornecedor · visual minimalista". Render: `renderStockPieDashboard()` (ATIVA 10694) → 2 gráficos.

Dois cartões lado a lado (`.stock-pie-body`):
1. **ESTOQUE POR CATEGORIA** `#stock-category-pie` + legenda `#stock-category-legend` (6242-6246): dados = `buildStockDistributionData('category', STOCK_CATEGORIES)`.
2. **ESTOQUE POR FORNECEDOR** `#stock-supplier-pie` + `#stock-supplier-legend` (6247-6251): `buildStockDistributionData('supplier', STOCK_SUPPLIERS)`.
- Estado inicial dos contêineres (6244/6249): `<div class="stock-pie-loading">Carregando gráfico...</div>`.

`buildStockDistributionData` (9934): conta **nº de SERIAIS** por categoria/fornecedor (não a quantidade de produtos). Itens fora da lista caem no último rótulo ou "OUTROS" (9937).

### 7.1 Geometria do donut/pizza ATIVA (`renderStockPieChart`, 10670)
**Confirmado: a versão ATIVA é 10670** (a 9942 e a 10304 são mortas). Detalhes exatos (10670-10693):
- SVG `viewBox="0 0 220 220"`, `role="img"`, `aria-label` = centerLabel.
- Centro `cx=cy=110`, raio `r=78`.
- `<circle class="stock-pie-bg" cx=110 cy=110 r=78>` (fundo) e por cima as fatias `<path class="stock-pie-slice">` via `createStockPieSlicePath(cx,cy,r,start,end)` (arco por ângulo acumulado, `pct*360`).
- **SEM furo central geométrico** (a versão morta 9942 tinha `<circle r=52>` + texto SVG "TOTAL"). A ATIVA é pizza CHEIA com **rótulo central via HTML overlay**: `<div class="stock-pie-total-label">Total</div>` + `<div class="stock-pie-total-value">${total}</div>` (10688) , total = soma das contagens, em pt-BR. (O efeito "donut" visual vem do CSS de posicionamento do label central.)
- **Paleta fixa de 6 cores** (cicla, 10675): `#C8A96E` (dourado), `#5B8DEF` (azul), `#3ECF8E` (verde), `#9B72CF` (roxo), `#E05555` (vermelho), `#E8D5A8` (areia).
- **Tooltip por fatia** (atributo SVG `title`, 10686): `"<rótulo> · <valor pt-BR> · <pct,1casa>%"`.
- **Legenda** (10689-10691): por item `.stock-pie-legend-item` com `.stock-pie-dot` (cor) + `.stock-pie-name` (title completo) + `.stock-pie-value` `"<valor> · <pct,1casa>%"`.
- Texto escapado por `safeText` (escapa `& < > " '`).

### 7.2 Interações / micro-animações
- **Hover na fatia (ATIVO):** `#mod-estoque .stock-pie-slice:hover{filter:brightness(1.10);}` (**2775**), com `transition:filter .15s,transform .15s` e `transform-origin:center` da regra-base (2774). A regra anterior `brightness(1.18)` + stroke `var(--s3)` width 2 (2689-2690) foi SOBRESCRITA (stroke ativo: `rgba(10,10,16,.22)` width 1, 2774).
- Sem clique/drill-in; interação = hover (title nativo + brilho CSS).
- `.stock-pie-center-title`/`-center-value` (CSS 2691-2692) pertencem à versão morta (texto SVG central); a ativa usa `.stock-pie-total-label`/`-value`.

---

## 8. A6 , Lista de seriais

Markup 6254-6290. Título (6257): **"A6 — Lista de seriais"**, subtítulo `#stock-serial-list-subtitle` (6258) default "Modelo · serial · custo · chegada · saída · idade" (reescrito em runtime). Render: `renderStockSerialDashboard()` (ATIVA 10880).

### 8.1 Busca (`.stock-serial-search-panel`, 6260)
- Input `#stock-serial-search` (6263), placeholder "Pesquisar modelo, número, serial, fornecedor, categoria ou status…".
- Ajuda `.stock-serial-search-help` (6265, estática) REESCRITA em runtime (11135): *"Busca por **qualquer trecho**. Códigos com zeros, como **001**, filtram o modelo 001; buscas curtas, como **6**, continuam encontrando qualquer item com esse dígito."* (`<strong>` com `var(--gold)`, 2992).
- Lógica `getFilteredStockSerials` (11128) → `stockMatchesSerial` (11097) + `buildStockSerialSearchText` (11069).

**`buildStockSerialSearchText` (11069) , índice "loose"** por serial: `model, serial, category, supplier, cost, arrivalDate, saleDate`, `status` (`'disponivel disponivel estoque em estoque'` ou `'vendido saida saiu fora estoque'`, 11070), e códigos `modelCode` (raw/plain/pad3) + `seqCode` (raw/plain/pad3/pad4). Retorna `{raw, spaced, compact}` via `stockNormalizeLoose` / `stockSpacedLoose` / `stockCompactLoose`.

**`stockMatchesSerial` (11097):**
- **Regra estrita (zero à esquerda):** `stockIsStrictModelCodeQuery` (11060) = `/^0+\d+$/` e comprimento ≥ 3 (ex.: 001, 026). Quando bate, casa só o CÓDIGO DO MODELO via `stockMatchesStrictModelCode` (11064: compara `compact` com `modelCode.raw`/`pad3`/plain padronizado), NÃO retorna todos os seriais terminados em 0001/0026.
- **Demais consultas (letras ou número curto):** substring por compact, por spaced, ou todos os tokens (números curtos seguem por trecho amplo) (11113-11126). Ex.: T600X, 600, 6, VISION, SER026.

### 8.2 KPI inline (`.stock-serial-inline-metric`, 6267)
- **VALOR MÉDIO POR SERIAL** `#stock-serial-avg-value` (BRL): média de `cost` dos seriais filtrados (10883). Sub `#stock-serial-avg-sub` (10893): com busca → `'Busca: "q" · custo médio dos N seriais encontrados.'`; senão `'Base: custo médio dos N seriais cadastrados.'`
- Subtítulo da lista `#stock-serial-list-subtitle` (10896): `'<n> resultados para "q"'` ou `'<n> seriais cadastrados'`.

### 8.3 Tabela (`.stock-serial-table`, scroll horizontal, sem paginação)
`thead` 6276-6284, 6 colunas: **Modelo | Serial | Valor que custou | Chegada no estoque | Data de saída | Idade**. Body `#stock-serial-list-body` preenchido em 10900-10913:
- **Modelo / Serial**: texto com `title` completo (escapado).
- **Valor que custou**: `formatStockCurrency(cost)`.
- **Chegada no estoque**: `formatStockDate(arrivalDate)` (DD/MM/AAAA).
- **Data de saída**: se `available` → `<span class="stock-serial-status available">DISPONÍVEL</span>` (verde `#6FE0B0`); senão `formatStockDate(saleDate)` em `<span class="stock-serial-status sold">` (cor `--tx2`).
- **Idade** `.stock-serial-age`: `formatDayDiff(arrivalDate, getStockSerialEndDate(item))` = (saída ou data-ref 2026-06-15) − chegada, "N dias".
- Ordem: ordem natural de `STOCK_SERIALS` (por modelo, depois sequência). Sem ordenação por clique.
- Estado vazio `#stock-serial-empty` (6288): **"Nenhum serial encontrado para a pesquisa."** (toggle em 10915).

`renderStockSerialDashboard` chama `renderStockA4AgeAndTurnover(serials, rawQuery)` (10890) , é assim que a busca do A6 alimenta o card "Idade média por produto" (e a cobertura) do A4.

### 8.4 `.serial-model-summary` (CSS MORTO)
CSS (2397-2404): variante de card de resumo de seriais ocupando linha inteira (`grid-column:1 / -1`), borda azul `rgba(91,141,239,.28)`, valor azul `#8FB5F5`. **Sem markup correspondente** no DOM final , resíduo de versão antiga, NÃO reconstruir.

---

## 9. Cores semânticas e estados (resumo)

| Classe / token | Cor | Quando |
|---|---|---|
| `is-ok` | verde `#48d986` | estoque dentro do ideal (até +overPct) |
| `is-low` | vermelho `#ff7474` | estoque ABAIXO do ideal |
| `is-high` | amarelo `#F6C453` | estoque ACIMA do limite individual (+overPct) |
| `.stock-serial-status.available` | verde `#6FE0B0` (pílula) | serial disponível (não vendido) |
| `.stock-serial-status.sold` | cinza `--tx2` | serial vendido (mostra data) |
| card cobertura A4 (`.stock-a4-turnover-card` valor) | verde `#6FE0B0` | tempo de cobertura |
| card idade A4 (`.stock-a4-age-card.filtered` valor) | azul `#8FB5F5` | idade média (com busca) |
| paleta pizzas A5 | `#C8A96E #5B8DEF #3ECF8E #9B72CF #E05555 #E8D5A8` | fatias (cicla) |

**Estados vazios (textos exatos):**
- A2 `#stock-location-empty`: "Nenhum local encontrado para a pesquisa."
- A3 `#stock-products-empty`: "Nenhum modelo encontrado para a pesquisa."
- A5 pizzas: "Carregando gráfico..."
- A6 `#stock-serial-empty`: "Nenhum serial encontrado para a pesquisa."

---

## 10. Cadeia de cliques / interações (consolidado)

- Clique no botão `#stock-total-block` (A2): `setStockLocationFilter('')` → limpa local → re-render A2/A3/A4.
- Clique em `.stock-location-row` (A2): `setStockLocationFilter(nome)` → filtra escopo do A3/A4; linha ganha `.active`; card de valor permanece no GERAL.
- Clique no `.stock-more-btn` (A3): `openStockIdealModal()`.
- Digitar em `#stock-a3-search` (A3): `renderStockDashboard()` (filtra modelos).
- Clique nos 4 botões de status (A3): `setStockA3StatusFilter(...)` (alterna `.active`, filtra).
- No modal: digitar em `#stock-ideal-search` → `renderStockIdealConfigList`; "Salvar configurações" → `saveStockIdealConfig` (persiste + re-render); "Cancelar" → `closeStockIdealModal`.
- Digitar em `#stock-serial-search` (A6): re-render da tabela + KPI + cards 5/6 do A4.
- Hover na fatia de pizza (A5): `brightness(1.10)` + tooltip nativo.
- Sem clique em fatias, sem ordenação por clique nas tabelas, sem paginação em nenhuma lista.

---

## 11. CÓDIGO MORTO / FUNÇÕES ÓRFÃS , NÃO reconstruir no Estoque

- **A1** , card desligado por `#mod-estoque .stock-a1{display:none !important;}` (2351, v79). Sem markup. Não reconstruir.
- **`buildStockBrazilMap` (9859) , MAPA DO BRASIL: ÓRFÃO.** `grep id="stock-brazil-map"` = 0. A função faz `getElementById('stock-brazil-map')` → `null` → `return` (no-op). Chamada por `bindStockSearch`, mas não pinta. Quando vivo, desenharia choropleth SVG por UF (`GEO`, `GEO_VB="5 5 735 745"`). **Causa provável da reclamação "mapa gigante" do cliente:** ao revivê-lo sem o container estreito original, o SVG `width:100%` (CSS herdado `#stock-brazil-map{max-height:390px}`) estica. No Estoque NÃO há mapa , a distribuição é só pizza (A5). Mapa pertence a Demandas (B4) e Vendas (C3).
- **`renderStockLeadTime` (9981) , LEAD TIME: MORTO.** Referencia `#stock-lead-*` (inexistentes). Nunca chamada na cadeia ativa. Existe CSS `.stock-lead-table` etc., sem HTML.
- **`renderStockA3Indicators` (10428) , INDICADORES A3 (idade/giro): ÓRFÃO.** Referencia `#stock-a3-avg-age`, `#stock-a3-turnover` etc. (inexistentes). A `renderStockProductTable` ATIVA (11513) NÃO o chama (só a versão antiga 10459 chamava). Substituído no A4 pelos 6 cards + cobertura.
- **`renderStockPieChart` 9942 e 10304** , versões de pizza com furo donut/texto SVG: MORTAS (vence 10670).
- **`renderStockA4AgeAndTurnover` 10641/10856** (turnover "N,NNx") , MORTAS (vence 14638, que calcula cobertura).
- **Campo global de threshold `#stock-over-ideal-threshold` (v82)** + `loadStockWarnConfig`/`saveStockWarnConfig` + chave `stock_over_ideal_warn_pct_v82` , input removido do DOM; o limite é por modelo (`overPct`). Legado morto.
- **CSS sem markup:** `.stock-free-placeholder` (2405-2437), `.serial-model-summary` (2397-2404), `.stock-pie-center-title/-value` (2691-2692), `.stock-lead-*`.

**Decisão de reconstrução:** implementar A2, A3 (busca + filtro de status + modal ideal), A4 (6 cards, cobertura A3-driven), A5 (2 pizzas cheias com rótulo central HTML, paleta de 6 cores, hover brightness 1.10), A6 (busca loose + tabela de seriais). NÃO implementar A1, mapa do Brasil, lead-time, indicadores A3/giro nem o threshold global.

---

## 12. Fronteira (fora deste capítulo)

Os cards `.stock-a7` (A7 - Compras, markup a partir de 6292) e `.stock-a8` (A8 - Compras ativas / por fornecedor) também vivem dentro de `#mod-estoque`, mas têm capítulo dedicado (ver `audit/faixa-02.md` §A7/§A8 e `audit/faixa-05.md` §12/§13). Aqui apenas registramos que o grid de 4 colunas e as linhas variáveis (`grid-template-rows` por versão v88...v101) acomodam esses dois cards adicionais abaixo do A2-A6.

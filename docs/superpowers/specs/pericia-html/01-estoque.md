# Perícia HTML , Módulo ESTOQUE (A2 a A6 + Estoque Ideal)

> Fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.971 linhas).
> Protótipo monolítico, JS/CSS vanilla, gráficos e mapas em SVG puro.
> Esta perícia cobre o **módulo Estoque** (`<div id="mod-estoque">`, HTML em 6139-6290) e o modal de estoque ideal (10105-10129).

## 0. Aviso metodológico crítico , VERSÕES SOBREPOSTAS

O arquivo foi construído por iterações empilhadas (blocos `<script>` rotulados `v83`, `v84`, `v86`, `v88`, `v91`, `v92`, `v113`, `v114`...). **Várias funções têm definições duplicadas; em JS a ÚLTIMA declaração de mesmo nome no escopo global vence (hoisting).** A reconstrução deve usar a versão ATIVA (a última), não a primeira. Mapa das versões ativas:

| Função | Defs nas linhas | ATIVA (vence) |
|---|---|---|
| `openStockIdealModal` | 9645 | 9645 |
| `closeStockIdealModal` | 9653 | 9653 |
| `renderStockIdealConfigList` | 9657, 10195, **10509** | 10509 (com campo overPct por modelo) |
| `saveStockIdealConfig` | 9699, **10557** | 10557 (grava overPct) |
| `renderStockLocations` | 9736, **12027** | 12027 (card sempre mostra valor GERAL) |
| `renderStockProductTable` | 9773, 10256, 10459, 10698, **11513** | 11513 (busca + filtro de status) |
| `renderStockSummary` | **9822** | 9822 (+ monkeypatch v113 que anexa cobertura) |
| `buildStockBrazilMap` | **9859** | 9859 , **ÓRFÃ, ver §10** |
| `buildStockDistributionData` | **9934** | 9934 |
| `renderStockPieChart` | 9942, 10304, **10670** | 10670 |
| `renderStockPieDashboard` | 9976, **10694** | 10694 |
| `renderStockLeadTime` | **9981** | 9981 , **ÓRFÃ/morta, nunca chamada, ver §10** |
| `renderStockSerialDashboard` | 10017, 10328, 10747, **10880** | 10880 |
| `renderStockDashboard` | **10052** | 10052 |
| `bindStockSearch` | 10058, **10363** | 10363 |
| `renderStockA3Indicators` | **10428** | 10428 , **ÓRFÃ, elementos não existem, ver §10** |
| `buildStockSerialSearchText` | 10604, 10814, 10956, **11069** | 11069 (busca "loose") |
| `getFilteredStockSerials` | 9898, 10614, **11128** | 11128 |
| `renderStockA4AgeAndTurnover` | 10641, 10856, **14638** | 14638 (mas card "cobertura" é sobreposto pelo v113) |
| `renderStockCoverageFromA3` | **14773** | 14773 (versão A3-driven, é a que prevalece no card de cobertura) |

---

## 1. Modelo de dados (simulado, em memória)

Todo o estoque é **gerado proceduralmente** (não há fetch); 48 modelos de catálogo e seus seriais. Declarações em 9518-9569.

```
STOCK_LOCATIONS (9518) = 5 locais com valor monetário fixo:
  CEILÂNDIA      R$ 12.345.678   (search: "CEILANDIA CEILÂNDIA DF")
  VICENTE PIRES  R$ 23.456.789   (search: "VICENTE PIRES DF")
  SERGIPE        R$ 34.567.890   (search: "SERGIPE SE")
  VALINHOS       R$ 45.678.901   (search: "VALINHOS SP")
  JARINU         R$ 56.789.012   (search: "JARINU SP")

STOCK_TABLE_LOCATIONS (9525) = ['CEILÂNDIA','VICENTE PIRES','SERGIPE','VALINHOS','JARINU']
STOCK_CATEGORIES (9527)      = ['FORÇA','CARDIO','PESO LIVRE','ACESSÓRIOS','EXTRAS']
STOCK_SUPPLIERS (9528)       = ['JOHNSON','LONG LIFE','XMASTER','BODY JOY']
STOCK_IDEAL_STORAGE_KEY      = 'stock_ideal_config_v73'   (localStorage)
STOCK_WARN_STORAGE_KEY       = 'stock_over_ideal_warn_pct_v82' (localStorage, legado)
STOCK_SERIAL_REFERENCE_DATE  = 2026-06-15  (data "hoje" para cálculo de idade/venda)
```

`STOCK_PRODUCTS` (9529-9548): 48 itens `Modelo catálogo 001..048`. Por item:
- `product` (nome), `category` (cíclico), `supplier` (cíclico), `demanda`, `disponiveis`, `ideal` (default `45 + base*6 + n`), e `qty` (objeto com quantidade por cada um dos 5 locais). `base = (n%9)+1`.

`STOCK_SERIALS` (9549-9569): para cada modelo, `4 + (idx%4)` seriais (ou seja 4 a 7). Por serial:
- `model`, `serial` (`SER-NNN-SSSS`), `cost` (`850 + (idx%12)*185 + (idx+1)*11 + seq*37`), `category`, `supplier`, `purchaseDate` (ISO), `arrivalDate` (= purchase + leadDays), `leadDays` (`5 + (idx%9)*2 + (seq%4)*3`).
- **Enriquecimento** (10173-10193): cada serial recebe `saleDate`, `available` (bool) e `ageDays`. Regra: ~1 em cada 4 (ou padrão `(idx+7)%9===0`) fica `available=true` (sem venda); senão calcula `saleDate = arrival + (18 + (idx%7)*11 + (idx%3)*4)` dias; se a venda cair depois de 2026-06-15, vira disponível. `ageDays = ref/venda − chegada`.

Helpers de formatação: `formatStockCurrency` (BRL pt-BR), `formatStockDate` (DD/MM/AAAA; vazio = "—"), `formatStockISODate`, `formatLeadDays` (`N dia/dias`), `normalizeStockText` (NFD + lowercase, remove acento).

Estado global: `ACTIVE_STOCK_LOCATION` (filtro de local A2/A3), `STOCK_IDEAL_MAP` (config ideal por modelo), `ACTIVE_STOCK_A3_STATUS_FILTER` (`'all'`).

## 1.1 Orquestração de render

- `renderStockDashboard()` (10052) chama, nesta ordem: `renderStockLocations(query)`, `renderStockProductTable(query)`, `renderStockSummary()`. `query` vem de `getStockQuery()` (input `#stock-search`, que **não existe** no HTML atual , a busca do A3 usa `#stock-a3-search`, ver A3).
- `bindStockSearch()` (10363, ativa) roda no init geral (chamada em 10078): `loadStockIdealConfig()`, `loadStockWarnConfig()`, liga listeners, e dispara `renderStockDashboard()`, `renderStockSerialDashboard()`, `renderStockPieDashboard()`, `buildStockBrazilMap()`.
- Vários blocos têm `DOMContentLoaded` próprios que reexecutam `renderStockSerialDashboard`/`renderStockPieDashboard`/`renderStockCoverageFromA3` via `setTimeout(...,0)`.
- **Monkeypatch v113** (14802-14823): envelopa `window.renderStockSummary` e `window.renderStockProductTable` para, ao final, chamar `renderStockCoverageFromA3()`. Resultado: o card "Tempo de cobertura" do A4 é sempre recalculado pela lógica A3-driven (14773), não pela `renderStockA4AgeAndTurnover`.

---

## 2. A2 , Estoque geral e por local

HTML 6141-6159. Título exato: **"A2 — Estoque geral e por local"** (ícone cubo/caixa). Render: `renderStockLocations(query)` (ativa 12027).

**Layout:** card com corpo dividido , à esquerda um botão grande (card de valor total), à direita a lista horizontal "Estoque por local".

### KPI principal (botão `#stock-total-block`, onclick `setStockLocationFilter('')`)
- `#stock-total-value`: **Valor do estoque** , na versão ativa (12027) **SEMPRE mostra o valor GERAL** = `getStockTotalValue()` = soma de `value` dos 5 locais (= R$ 172.836.270). Não muda ao filtrar local (diferença chave vs. a 1ª versão 9736, que trocava para o valor do local).
- `#stock-total-label`: texto fixo **"Valor do estoque geral"**.
- `#stock-total-sub`: se há local ativo → `"Filtro ativo: <LOCAL>. Clique aqui para voltar ao estoque geral."`; senão → `"Somatório de todos os locais cadastrados."`
- O bloco recebe classe `.active` quando NÃO há local selecionado.

### Lista "Estoque por local" (`#stock-location-list`)
- Subtítulo fixo: **"Estoque por local"**.
- Cada linha é um `<button.stock-location-row>` (clique = `setStockLocationFilter(nome)`, alterna filtro do A3/A4). Ordenada por `value` desc.
- Filtro: pela `query` do A2 (campo de busca herdado; filtra por `name` + `search`).
- Conteúdo por linha: **nome do local** | **percentual** (`value/total*100`, 1 casa) | **valor** (BRL).
- Linha do local selecionado recebe `.active`.
- Estado vazio (`#stock-location-empty`): **"Nenhum local encontrado para a pesquisa."**

---

## 3. A3 , Modelos do catálogo em estoque

HTML 6161-6192. Título: **"A3 — Modelos do catálogo em estoque"** (ícone gráfico). Botão de 3 pontos no header (`.stock-more-btn`, onclick `openStockIdealModal()`, aria "Configurar estoque ideal"). Render: `renderStockProductTable(query)` (ativa 11513) + monkeypatch que chama cobertura.

**Subtítulo dinâmico** (`#stock-a3-subtitle`): mostra `"<n>/<total> modelos · <rótulo do filtro>[· <LOCAL>][· busca "<q>"]"`. Rótulo do filtro vem de `stockA3FilterLabel()`: `all→"todos"`, `below→"abaixo do ideal"`, `ideal→"dentro do ideal"`, `above→"acima do limite"`.

### Painel de filtro (6170-6181)
- **Busca** (`#stock-a3-search`, placeholder "Pesquisar modelo, número, categoria ou fornecedor…"): listener dispara `renderStockDashboard()`. Lógica em `stockA3MatchesProduct` (11479): normaliza (compact + spaced), casa por substring compact, substring spaced, ou todos os tokens; para números aceita variantes com zero à esquerda (pad 2/3/4). Indexa `product, category, supplier, demanda, disponiveis` + variantes numéricas.
- **Botões de status** (`#stock-a3-filter-buttons`): **Todos / Abaixo / Ideal / Acima** (`setStockA3StatusFilter('all'|'below'|'ideal'|'above')`). O botão ativo ganha classe `.active`.

### Classificação de status (`stockA3RangeStatus`, 11498)
Por modelo, com `realQty` (qtd no escopo) e `idealQty` (ideal por escopo) e `limitPct` (overPct individual do modelo, default 30):
- `realQty < idealQty` → **`below`** (vermelho `is-low`).
- `idealQty <= 0` → `above` se realQty>0, senão `ideal`.
- `realQty > idealQty*(1+limitPct/100)` → **`above`** (amarelo `is-high`).
- senão → **`ideal`** (verde `is-ok`).

### Gráfico de barras horizontais (`#stock-model-graph`)
Cabeçalho de colunas fixo (6182-6189): **MODELO | BARRA | ESTOQUE | IDEAL | VARIAÇÃO | % DO TOTAL**. Não é `<table>`, é grid de linhas `.stock-graph-row`. Sem paginação (todos os modelos filtrados). Por linha:
- **MODELO**: `item.product` (title = nome completo).
- **BARRA** (`.stock-graph-fill`): largura `= max(4, round(totalQty/maxQty*100))%`. `maxQty` = maior qtd entre os filtrados. Trilho cinza + preenchimento.
- **ESTOQUE** (`.stock-graph-qty`, colorido por status): `realQty.toLocaleString un.`
- **IDEAL** (`.stock-graph-ideal`): `Ideal: <idealQty>`.
- **VARIAÇÃO** (`.stock-graph-diff`, colorido por status): `±diffPct%` (1 casa). `diffPct = (real−ideal)/ideal*100`. `title` = explicação ("Acima do limite individual de +X%" / "Abaixo do ideal" / "Dentro do ideal até +X%").
- **% DO TOTAL** (`.stock-graph-share`): `totalQty/grandTotalQty*100` (1 casa).
- `totalQty` por modelo: se local ativo, `qty[local]`; senão soma dos 5 locais (`getProductsWithTotals`).
- Estado vazio (`#stock-products-empty`): **"Nenhum modelo encontrado para a pesquisa."** O grid esconde quando vazio.

Cores semânticas (CSS): `is-ok` verde `#48d986` (bg/borda translúcidos), `is-low` vermelho `#ff7474`, `is-high` amarelo `#F6C453`.

---

## 4. Modal "Estoque ideal" (A3 · Configuração)

Abre via `openStockIdealModal()` (9645) , botão 3-pontos do A3. HTML 10105-10129.

**Cabeçalho:** kicker **"A3 · CONFIGURAÇÃO"**, título **"Configurar estoque ideal por modelo"**, descrição: *"Defina a quantidade ideal e o limite máximo acima da meta individualmente para cada modelo. Quando o estoque ultrapassa esse limite, o A3 destaca os números em amarelo."*

**Toolbar:**
- Busca `#stock-ideal-search` (placeholder "Pesquisar modelo...", `oninput=renderStockIdealConfigList(this.value)`).
- Resumo `#stock-ideal-summary`: `"<n> modelos · base <geral|LOCAL>"` (a base segue `ACTIVE_STOCK_LOCATION`).
- Nota: *"O limite máximo acima do ideal agora é configurado individualmente em cada modelo."* (substituiu um campo global de threshold que existia na v82 , `#stock-over-ideal-threshold` , hoje **ausente** do DOM; `loadStockWarnConfig`/`saveStockWarnConfig` continuam existindo mas o input é nulo: legado morto).

**Lista** (`renderStockIdealConfigList`, ativa 10509). Um cartão por modelo (filtrável pela busca). Cada cartão:
- Nome do modelo.
- Chip "Estoque atual: `<currentQty>` un." (no escopo de local ativo, ou soma geral).
- Chip de status (classe `is-ok`/`is-low`/`is-high` via `getStockA3StatusClass`): `"±diffPct% · <statusText>"`, statusText ∈ {"abaixo do ideal", "acima do limite individual de X%", "dentro do limite individual"}.
- Campo **"Valor ideal total"** (number, `.stock-ideal-total-input`).
- Campo **"Máximo acima do ideal (%)"** (number, `.stock-ideal-over-input`, default 30) com ajuda: *"Ex.: 30 significa alerta amarelo quando passar de 30% acima do ideal."*
- Bloco **"Valor ideal por local de estoque"**: um input numérico por local (5 inputs, `.stock-ideal-location-input`, `data-location`).

**Ações:** "Cancelar" (`closeStockIdealModal`) e "Salvar configurações" (`saveStockIdealConfig`).

**Salvamento** (`saveStockIdealConfig`, 10557): varre os inputs total/over/por-local, monta `{product: {total, byLocation:{...}, overPct}}`, faz merge em `STOCK_IDEAL_MAP`, persiste em `localStorage[STOCK_IDEAL_STORAGE_KEY]`, fecha modal e chama `renderStockDashboard()`.

**Leitura da config** (`getIdealConfigForProduct` 9616, `getIdealQtyForProduct` 9636): se há objeto salvo, usa `total`/`byLocation`/`overPct`; valor por local default = `round(total / nº de locais)`; fallback usa `item.ideal`. `getStockPerItemOverPct` (10383) lê `overPct` salvo, senão 30.

---

## 5. A4 , Indicadores do estoque

HTML 6194-6234. Título: **"A4 — Indicadores do estoque"**. Subtítulo `#stock-a4-subtitle` (sobrescrito por `renderStockCoverageFromA3` → "Indicadores gerais ligados ao A3" ou "Indicadores do A3 · <LOCAL>"). Grid de **6 cards** (`.stock-summary-grid`).

Cards 1-4 preenchidos por `renderStockSummary()` (9822):
1. **VALOR MÉDIO POR PRODUTO** (`#stock-avg-per-product`, BRL): = custo total de TODOS os seriais ÷ nº de seriais (`serialTotalCost/serialItemCount`). Sub: "Base geral de seriais · custo total dividido por N itens cadastrados." (Nota: usa base de seriais, não de produtos , apesar do nome.)
2. **QUANTIDADE DE ITENS PRESENTES NO ESTOQUE** (`#stock-total-items`): soma das unidades no escopo (`totalUnits`). Sub: "Base: <escopo> · soma das unidades simuladas."
3. **QUANTIDADE DE ITENS MÉDIA POR LOCAL** (`#stock-avg-items-per-location`, 1 casa): unidades GERAIS ÷ 5 locais. Sub: "Base geral · média entre 5 locais."
4. **QUANTIDADE MÉDIA DE VALOR DE ESTOQUE** (`#stock-avg-stock-value`, BRL): valor total ÷ 5 locais. Sub: "Base geral · média entre 5 locais."

Card 5 , **IDADE MÉDIA POR PRODUTO** (`#stock-a4-age-filtered-value`, "N dias"): preenchido por `renderStockA4AgeAndTurnover(serials, rawQuery)` (14638), chamado de dentro de `renderStockSerialDashboard` (A6). = média de `ageDays` dos seriais filtrados pela busca do A6. Sub: se há busca, "<n> seriais encontrados · <m> modelo(s)."; senão "O indicador de cobertura abaixo acompanha busca e local selecionados no A3."

Card 6 , **TEMPO DE COBERTURA** (`#stock-a4-turnover-value`, "N dias"/"∞ dias"/"999+ dias"): **a versão que prevalece é `renderStockCoverageFromA3` (14773)**, disparada pelo monkeypatch v113 a cada render do summary/product-table. Fórmula: `coverageDays = (estoqueDisponível / demandaPendente) * 30`.
- `stockQty` = soma de `totalQty` dos produtos do A3 no escopo atual (busca `#stock-search`/local).
- `demandQty` = demanda pendente vinda dos pedidos (`getDemandOrders`/`DEMO`), casada por modelo quando há filtro A3 (`stockA3CoverageModelMatch`). Exclui cancelados e pendência ≤ 0.
- Formato (`stockA3FormatCoverage`): sem demanda e com estoque → "∞ dias"; sem demanda e sem estoque → "0 dias"; ≥1000 → "999+ dias"; senão "<round(days)> dias".
- Sub: `"<escopo>: X un. em estoque ÷ Y un. em demanda × 30 dias."` ou "...nenhuma demanda pendente encontrada." Escopo = "busca "q" · local L" ou "todos os modelos do A3".

> Observação: existe também um cálculo de "giro/turnover" em `renderStockA3Indicators` (10428: `soldCount / estoqueMédio`, formato "N,NNx") e na 1ª versão de A4 (10641), mas esses **elementos (`#stock-a3-turnover`, `#stock-a3-avg-age`) não existem no DOM atual** , o A4 visível usa cobertura, não turnover. Ver §10.

---

## 6. A5 , Distribuição do estoque (gráficos de pizza)

HTML 6235-6253. Título: **"A5 — Distribuição do estoque"**, subtítulo "Categoria · fornecedor · visual minimalista". Render: `renderStockPieDashboard()` (10694) → 2 pizzas.

Dois cartões lado a lado:
1. **ESTOQUE POR CATEGORIA** (`#stock-category-pie` + legenda `#stock-category-legend`): dados = `buildStockDistributionData('category', STOCK_CATEGORIES)`.
2. **ESTOQUE POR FORNECEDOR** (`#stock-supplier-pie` + `#stock-supplier-legend`): `buildStockDistributionData('supplier', STOCK_SUPPLIERS)`.

`buildStockDistributionData` (9934): conta **nº de seriais** por categoria/fornecedor (não usa quantidade de produtos). Itens fora da lista caem no último rótulo ou "OUTROS".

`renderStockPieChart` (10670): SVG donut feito à mão.
- viewBox `0 0 240 240`, centro `cx=cy=120`, raio `r=92`, furo central `r=52`.
- Fatias via `createStockPieSlicePath` (path de arco). **Paleta fixa** (6 cores, cicla): `#C8A96E` (dourado), `#5B8DEF` (azul), `#3ECF8E` (verde), `#9B72CF` (roxo), `#E05555` (vermelho), `#E8D5A8` (areia).
- Centro: texto **"TOTAL"** + valor total (soma das contagens).
- **Tooltip** por fatia (atributo SVG `title`): `"<rótulo> · <valor> · <pct>%"`.
- **Legenda**: por item, ponto colorido + nome (title completo) + `"<valor> · <pct>%"` (1 casa).
- Estado inicial dos contêineres: `<div class="stock-pie-loading">Carregando gráfico...</div>`.
- Não há clique/drill-in; interação = hover (title nativo + `:hover` CSS na fatia).

---

## 7. A6 , Lista de seriais

HTML 6254-6290. Título: **"A6 — Lista de seriais"**, subtítulo "Modelo · serial · custo · chegada · saída · idade". Render: `renderStockSerialDashboard()` (10880).

### Busca (`.stock-serial-search-panel`)
- Input `#stock-serial-search` (placeholder "Pesquisar modelo, número, serial, fornecedor, categoria ou status…").
- Ajuda (`.stock-serial-search-help`, reescrita em runtime, 11135): *"Busca por qualquer trecho. Códigos com zeros, como 001, filtram o modelo 001; buscas curtas, como 6, continuam encontrando qualquer item com esse dígito."*
- Lógica `stockMatchesSerial` (11097) + `buildStockSerialSearchText` (11069, "loose"): indexa modelo, serial, categoria, fornecedor, custo, datas, status (`disponivel...`/`vendido saida...`), e códigos de modelo/sequência (raw/plain/pad). **Regra especial**: consulta estritamente numérica com zeros (001, 026) filtra o CÓDIGO DO MODELO (`stockIsStrictModelCodeQuery`), não todos os seriais terminados naquele número; consultas com letras ou número curto seguem por substring.

### KPI inline (`.stock-serial-inline-metric`)
- **VALOR MÉDIO POR SERIAL** (`#stock-serial-avg-value`, BRL): média de `cost` dos seriais filtrados. Sub (`#stock-serial-avg-sub`): com busca → "Busca: "q" · custo médio dos N seriais encontrados."; senão "Base: custo médio dos N seriais cadastrados."
- Subtítulo da lista (`#stock-serial-list-subtitle`): "<n> resultados para "q"" ou "<n> seriais cadastrados".

### Tabela (`.stock-serial-table`, scroll horizontal, sem paginação)
Colunas (thead 6276-6284): **Modelo | Serial | Valor que custou | Chegada no estoque | Data de saída | Idade**.
- Modelo / Serial: texto (title completo).
- Valor que custou: BRL.
- Chegada no estoque: `arrivalDate` em DD/MM/AAAA.
- Data de saída: se `available` → badge **"DISPONÍVEL"** (`.stock-serial-status.available`, verde `#6FE0B0`); senão `saleDate` formatado (badge `.sold`, cor `--tx2`).
- Idade: `formatDayDiff(arrivalDate, getStockSerialEndDate(item))` = (saída ou data-ref 2026-06-15) − chegada, em "N dias".
- Ordem: ordem natural de `STOCK_SERIALS` (por modelo, depois sequência). Sem ordenação por clique.
- Estado vazio (`#stock-serial-empty`): **"Nenhum serial encontrado para a pesquisa."**

`renderStockSerialDashboard` também chama `renderStockA4AgeAndTurnover(serials, rawQuery)` , é assim que a busca do A6 alimenta o card "Idade média por produto" do A4.

---

## 8. Estoque ideal (resumo consolidado)

Coberto em §4 (modal + lista + persistência). Pontos para reconstrução:
- Persistência client-side em `localStorage` (chave `stock_ideal_config_v73`); estrutura `{ [produto]: { total, byLocation:{[local]:n}, overPct } }`.
- Ideal por local default = `round(total/5)`; overPct default 30.
- O ideal alimenta A3 (status/cor/variação) e a lista do modal.

---

## 9. Cores semânticas e estados (resumo)

| Classe | Cor | Quando |
|---|---|---|
| `is-ok` | verde `#48d986` (texto/bordas) | estoque dentro do ideal (até +overPct) |
| `is-low` | vermelho `#ff7474` | estoque ABAIXO do ideal |
| `is-high` | amarelo `#F6C453` | estoque ACIMA do limite individual (+overPct) |
| `.stock-serial-status.available` | verde `#6FE0B0` (pílula) | serial disponível (não vendido) |
| `.stock-serial-status.sold` | cinza `--tx2` | serial vendido (mostra data) |

Estados vazios (textos exatos): A2 "Nenhum local encontrado para a pesquisa." · A3 "Nenhum modelo encontrado para a pesquisa." · A6 "Nenhum serial encontrado para a pesquisa." · pizzas "Carregando gráfico...".

---

## 10. DEAD CODE / FUNÇÕES ÓRFÃS , atenção na reconstrução

Estas funções existem e foram pedidas na perícia, mas **não renderizam nada na versão final do HTML** porque seus elementos-alvo foram removidos do DOM `#mod-estoque`:

- **`buildStockBrazilMap` (9859) , MAPA DO BRASIL: ÓRFÃO.** `grep id="stock-brazil-map"` retorna **0 ocorrências** no arquivo. A função faz `getElementById('stock-brazil-map')` → `null` → `return` imediato (no-op). Ela é chamada por `bindStockSearch`, mas não pinta nada. Como deveria desenhar (quando o elemento existia): SVG choropleth dos estados via `GEO` (paths por UF) e `GEO_VB = "5 5 735 745"`; cada estado vira `<path class="stock-state" data-uf title="UF — Nome">` + label de texto no centro (`cx/cy`), exceto DF. **CSS herdado:** `#stock-brazil-map{width:100%;height:100%;max-height:390px}` e múltiplos overrides `#mod-estoque #stock-brazil-map{...}`. **→ Causa provável da reclamação do cliente ("mapa gigante"):** o HTML-fonte NÃO mostra mapa nenhum no Estoque (A5 é pizza, não mapa); ao revivê-lo na reconstrução, sem o container de tamanho contido (a coluna estreita original), o SVG `width:100%` esticou. Recomendação: no Estoque, **não há mapa** , a distribuição é só pizza (A5). Mapa do Brasil pertence a Demandas (B4) e Vendas (C3).
- **`renderStockLeadTime` (9981) , LEAD TIME: MORTO.** Referencia `#stock-lead-*` (avg/max/min/tabela), nenhum dos quais existe (`grep id="stock-lead"` = 0). A função nunca é chamada na cadeia ativa. Existe CSS `.stock-lead-table` etc., mas sem HTML. Lógica (caso se queira ressuscitar): agrupa seriais por modelo (`groupStockSerialsByModel`), KPIs de lead médio (compra→chegada), modelo de maior/menor lead, e tabela Modelo | Lead médio | Seriais.
- **`renderStockA3Indicators` (10428) , INDICADORES A3 (idade/giro): ÓRFÃO.** Referencia `#stock-a3-avg-age`, `#stock-a3-max-age-model`, `#stock-a3-turnover` etc., inexistentes. A última `renderStockProductTable` (11513) **não chama** essa função (só a versão antiga 10459 chamava). Lógica (idade média dos seriais do escopo; modelo mais/menos antigo; turnover = vendidos ÷ estoque médio, formato "N,NNx") foi **substituída** no A4 pelos 6 cards + cobertura.

Resumo da decisão de reconstrução: implementar A2, A3 (com busca + filtro de status + modal ideal), A4 (6 cards, sendo cobertura A3-driven), A5 (2 pizzas donut), A6 (busca loose + tabela de seriais). **Não** implementar mapa do Brasil, lead-time card nem o card de indicadores A3/giro no Estoque , são restos de versões anteriores.

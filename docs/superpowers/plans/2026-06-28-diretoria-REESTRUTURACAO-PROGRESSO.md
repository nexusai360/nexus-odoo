# Diretoria , REESTRUTURAÇÃO TOTAL , PROGRESSO

Ponto de retomada da reconstrução do zero (norte: `2026-06-28-diretoria-REESTRUTURACAO.md`).
Branch `feat/menu-diretoria`. NÃO mergear sem autorização (regra F6/cliente).

## Fundação de UI (feita)
- KIT premium: `src/components/diretoria/kit/kpi-button.tsx` (KPI card-botão
  selecionável, tons semânticos) e `section-card.tsx` (card de seção denso).
- `DonutChart` estendido: `onSelect` + `selecionado` (fatia clicável filtra).
- `DataTable` estendido: prop `compactoInicial` (trunca textos longos, revela
  colunas numéricas). Reusado em todas as listas.
- Navegação por ABAS via `Tabs` (base-ui). Estado de filtro compartilhado client.
- Validação: `scripts/diretoria-render-user.ts` (user `render-check@local.test`
  / `Teste@12345`, super_admin) + `scripts/diretoria-screenshot.ts` (login +
  screenshot por aba, dark mode). Rodar: `npx tsx --env-file=.env.local
  scripts/diretoria-render-user.ts` e `npx tsx scripts/diretoria-screenshot.ts
  /diretoria/<rota> aba1,aba2,...`.

## Telas
### Estoque & Compras , FEITA E VALIDADA (commit 22277712)
6 abas: Visão geral / Estoque / Distribuição / Seriais / Compras / Fornecedores.
KPIs-botão, donuts clicáveis (filtram catálogo + navegam), chips de filtro,
busca/sort, matriz por fornecedor, dado real (R$49,4M, 1.894 modelos, 68 locais).
Interação clicar-fatia-filtra-catálogo comprovada por screenshot.
- GAP de dado honesto: `fato_serial` não tem custo/data/local/idade (0 de 8.699).
  A aba Seriais sinaliza e mostra só serial+modelo + agregação por modelo.

### Vendas , FEITA E VALIDADA (commit afc54404)
4 abas: Visão geral / Por estado / Por marca / Pagamentos. Barra de período (C1)
preservada + UF-scoping. MAPA do Brasil coroplético com tooltip que SEGUE o
cursor e some fora do país (BrazilMap refinado, era fixo no canto). Dado real
(R$59,4M este mês). Honestidade: "Operações dos pedidos"/"Maior pedido" vêm de
fato_pedido (misturam vendas/compras/transferências), rotulado; margem "estimada".

### Pedidos & Entregas , FEITA E VALIDADA (commit 9fe1cfdc)
3 abas: Visão geral / Mapa / Pendentes. KPIs (608 demandas, R$146,3M, 109
atrasadas, a receber), donut por etapa, mapa do Brasil de demandas, lista de
pendentes com chips de filtro por prazo (contagem) + busca + badges de previsão.

### Visão Geral (home executiva) , FEITA E VALIDADA (commit 9c7599fa)
6 KPIs globais + mapa do Brasil em destaque + 2 donuts (vendas por marca /
estoque por família) + atalhos drill-in gated por capability. Fix importante:
ícones lucide não cruzam server->client; composição virou VisaoGeralScreen client.

### Agenda , FEITA E VALIDADA (commit a3062902)
Elevada ao cap 02: layout 2 colunas (calendário mensal + painel do dia lateral).
Clicar num dia seleciona (realce violeta); painel lista eventos do dia com hora,
tipo, local, colaboradores e excluir; "Novo evento" cria no dia selecionado;
eventos coloridos por tipo na célula. Validado por screenshot com eventos de
teste (depois removidos). Reusa actions diretoria-agenda; sem mudança de schema.

### Limpeza (commit e7736dd0)
Removidos órfãos: vendas-charts.tsx, vendas-mapa-comparativo.tsx,
pedidos-pendentes-table.tsx (substituídos pelos *-screen.tsx).

## STATUS: as 5 áreas da Diretoria estão reconstruídas/elevadas e validadas.
Nada mergeado (regra F6/cliente). Branch feat/menu-diretoria pushada.

## Feedback do cliente (2026-06-29) , FASE A feita, FASE B especificada
**FASE A , ajustes de qualidade (commit e8d084a0, VALIDADO por screenshot):**
- KPIs abreviados (R$ X,Y mi / R$ N mil) com valor cheio no hover , resolve o
  estouro na Visão geral. Módulo `kit/format.ts`. Aplicado em Visão geral e Pedidos.
- Pílulas de período enxutas: Hoje / Esta semana / Este mês / Este ano / Tudo /
  Personalizado (removidos ano anterior e últimos 7/30/90).
- Mapa do Brasil maior; tooltip e ranking com "% do total" (não "% do líder");
  hover no mapa realça o estado no ranking lateral.
- Sync automático: `/api/diretoria/freshness` + FreshnessBadge dá soft-refresh
  quando o ciclo nativo grava timestamp novo (sem refresh manual).

**FASE B , construtor modular (SPEC: 2026-06-29-diretoria-construtor-modular-SPEC.md):**
Decisões do cliente: provar em Estoque & Compras primeiro; layout duplo (oficial
global + pessoal). A infra do builder JÁ existe (schema DiretoriaRelatorio/Bloco,
catalogo.ts com travas, loaders/layout-repo/gating, grid-relatorio/render-componente)
, REAPROVEITAR. Onda 1: catálogo A-*, grid 4×4 arrastável (react-grid-layout),
modo de edição com paleta, persistência dupla, filtros globais. É grande , execução
dedicada. Próximo passo: auditar a infra do builder e executar a Onda 1.

### Pendências/melhorias (próxima onda, opcional, dependem de feedback)
- A7 drill-in da compra com itens da OC: NÃO viável hoje (não existe
  FatoCompraItem no schema; só FatoCompra cabeçalho). Exigiria ingestão de itens.
- Agenda: month picker multi-mês (1/2/3/6/12) e anexos (cap 02), se desejado.
- "Maior pedido"/"Operações" da tela Vendas vêm de fato_pedido (mistura
  vendas/compras/transferências); filtrar só venda quando houver campo de tipo.
- Polimento responsivo fino (mobile) e revisão reduced-motion.

## Pendências/melhorias registradas
- BrazilMap: tooltip deve SEGUIR o mouse (hoje fixo top-left) e sumir fora do
  país; revisar tamanho/choropleth (reclamação do cliente). Fazer na aba Vendas.
- A7 drill-in (itens da OC + 10 KPIs): a query `queryComprasAtivas` não traz
  itens nem vrPago por OC; enriquecer quando for fazer o detalhe da compra.

## Construtor modular , ONDA 1 FEITA E VALIDADA (commits dfdb09cc, 6b6f1f26, 72e29663)
Rota `/diretoria/relatorios` = construtor de Estoque & Compras:
- Componentes IDENTIFICADOS no catálogo (A-01,A-02,A-03,A-04,A-05,A-06,A-07,A-08,
  A-09,K-01), com badge do id + nome + selo de fonte.
- Grid de OITAVOS (8x8) via react-grid-layout: modo view (estático) e modo
  edição (mãozinha p/ arrastar, redimensionar pelas bordas com travas por tipo,
  paleta p/ adicionar, X p/ remover).
- Salvar OFICIAL (admin/super_admin) ou PESSOAL; "Restaurar oficial" apaga o
  pessoal. Persistência via DiretoriaRelatorio (isPadrao/donoUserId) + x,y no
  configJson (sem migration). Cascata pessoal>oficial>padrão-em-código.
- Renders BI de qualidade (KpiButton/DonutChart/DataTable) , sem barras chapadas.
- E2E validado: salvar+carregar preservam meio-passo (5 de 8); travas clampam;
  restaurar cai p/ oficial. tsc + 21 testes do builder verdes. Screenshot view+edição.

### Onda 2 (próxima, não feita)
- Integrar o construtor às telas com ABAS (cada aba = tela montável) e adicionar
  submenu/entrada no menu (hoje só via URL /diretoria/relatorios).
- Espalhar catálogo p/ Vendas (C-*), Pedidos (B-*), Visão (V/G-*), Agenda.
- Filtros globais (período + UF/local) publicados às pílulas → componentes que
  consomem re-renderizam; filtro por componente interno.
- RBAC fino (capabilities diretoria.layout.edit / .global) em capabilities.ts
  (hoje: editar pessoal = tem acesso; oficial = admin/super_admin por role).
- Responsivo mobile (breakpoints do react-grid-layout) e renomear campos de
  schema p/ oitavos (larguraOitavos/alturaOitavos) via migration cirúrgica.

## Feedback do cliente (2026-06-29, 01h) , construtor pobre vs plataforma
Cliente comparou com Consumo do Agente Nex e Router (que já têm gráficos/tabelas
muito melhores). Reclamações + plano da ONDA 2:

FEITO já (commit bbb2bd2b): UX de edição , matou a "vermelhidão" (placeholder
agora violeta) + alças de redimensionar em todas as bordas/cantos (antes só canto
inf. dir.). Validado por screenshot no arraste.

ONDA 2 (a fazer) , REUSAR os componentes que a plataforma JÁ tem (recharts 3.8.1):
- Variedade de gráfico: `src/components/charts/line-chart.tsx`,
  `bar-chart.tsx`, `interactive/area-chart.tsx`, `pie-chart.tsx`,
  `chart-card.tsx`, `chart-tooltip.tsx`. Hoje o construtor só tem donut caseiro +
  mapa + tabela. Adicionar tipos "linha"/"barra"/"area" ao catálogo e renders.
  Ex.: série temporal (compras/faturamento por dia/mês) com navegação de período
  (‹ 22/06-28/06 ›) e tooltip no hover (igual "Custo por dia" do Consumo);
  barras (Distribuição do topScore do Router); multi-linha com legenda (Latência
  p50/p95/p99). Precisa de queries temporais novas (TDD).
- Tabela RICA: evoluir `charts/data-table.tsx` (já tem busca/sort/CSV/expand/
  colunas/compacto) com PAGINAÇÃO + contagem de registros + TAGS (badge colorido
  por célula) + drill-down de linha (ref: `charts/saldo-produto-drill-down.tsx`).
  É a tabela do Consumo/Router que o cliente quer.
- Filtros GLOBAIS avançados nas pílulas: além de período, dropdowns por dimensão
  (família/marca/local/fornecedor/UF) que cruzam TODOS os componentes (catálogo
  já tem publica/consome); "Personalizado" de datas diferenciado; busca/tags
  clicáveis + botão limpar (padrão Router). Filtro por componente: interno.
- Mini gráficos (sparklines) nos KPIs (padrão Router).
- Integrar o construtor às telas com ABAS (cada aba = tela montável) + entrada no menu.

## ONDA 3 , ELEVAÇÃO DE QUALIDADE (2026-06-29 ~02h-02h40) , feedback forte do cliente
Cliente reprovou a Onda 2: "tudo é pizza/tabela, sem variedade nem criatividade;
a plataforma JÁ TEM componentes melhores (Consumo do Nex, Router, Aprendizado) e o
construtor não usa". Diagnóstico correto: a Diretoria usava o ecossistema
DECLARATIVO (`charts/` raiz: LineChartCard, donut caseiro), enquanto o Agente Nex
usa o INTERATIVO RICO (`charts/interactive/`). Estudei as 12 referências (prints) +
mapeei os componentes reais (Explore). Correção: REUSAR os componentes ricos.

**Onda 3.1 , variedade real de gráficos (commit graficos ricos):**
- A-03 família → `DonutWithCenter` (donut rico: centro com total, hover esmaece, tooltip %).
- A-04 marca e K-01 fornecedor → `InteractiveBarChart` horizontal (não mais donut).
- A-10 compras → `InteractiveAreaChart` (gradient, tooltip rico) no lugar do LineChartCard.
- A-11 NOVO `DistribuicaoDinamica`: pílulas Família/Marca/Local + toggle rosca↔barras
  → o "gráfico dinâmico" pedido (muda dimensão e tipo ao clicar). Eixos em moeda compacta.
- Componentes de `src/components/charts/interactive/` (InteractiveAreaChart,
  InteractiveBarChart, DonutWithCenter) , os MESMOS do Consumo/Router. Validado por screenshot.

**Onda 3.2 , tabela rica padrão Router (commit tabela rica):**
- DataTable ganhou tipo de coluna `tags` (várias pílulas por célula, estilo fiscal/comercial).
- `PageJumpNavigator` (seletor "Página N de M" com busca/lista) no lugar de Anterior/Próxima
  , reusa o componente real do Consumo (`agent/consumo/page-jump-navigator.tsx`).
- Drill-down no catálogo A-05: expandir a linha mostra valor total/médio/% do estoque/presença.
- 43 testes do DataTable verdes. Validado por screenshot (tags JOHNSON+MATRIX + drill-down).

tsc verde; 177 testes (25 suites) verdes. Nada mergeado (regra F6).

### Onda 3.3 (próxima, a validar com cliente)
- Gráfico temporal correlacionado com PÍLULAS de período (Esta semana→navega semana,
  Este mês→navega mês, igual "Custo por dia" do Consumo). Reusar `PeriodNavigator`
  (`dashboard/period-navigator.tsx`). Hoje o A-10 tem navegação própria (toggle dia/mês + ‹ ›).
- Pílulas de período globais + "Personalizado" de datas diferenciado no construtor.
- Cores nas tags de família/marca (hoje neutras); filtros dropdown por coluna na tabela.
- Espalhar o padrão rico para Vendas/Pedidos/Visão.

## ONDA 2 , FEITA E VALIDADA (2026-06-29 ~01h30-02h)
As 4 frentes entregues, cada uma validada por screenshot e com TDD onde há query.
tsc verde; 170 testes (24 suites) verdes. Nada mergeado (regra F6).

FEITO antes (sessão anterior):
- UX de edição: placeholder violeta + alças em todas as bordas (commit bbb2bd2b).
- DataTable: PAGINAÇÃO + tipo de coluna "tag" (commit 033f67f9).

FEITO nesta sessão:
1. GRÁFICO TEMPORAL A-10 (commit grafico temporal): query `queryComprasSerie`
   (fatoDfe por dia/mês, TDD) + componente `SerieTemporalCompras` reusando
   `LineChartCard` (recharts). Toggle Por dia/Por mês, navegação de janela (‹ ›),
   tooltip no hover, total do período. No catálogo como A-10 (widget), no layout
   padrão em largura cheia. Validado: padrão "Custo por dia" do Consumo.
2. COLUNAS-TAG de situação (commit colunas-tag): A-07 Compras ativas (Atrasada/
   Atenção/No prazo/Sem previsão) e A-08 Matriz por fornecedor (Com atraso/Em dia),
   via `tipo:"tag"` + `tagCores`. Validado.
3. FILTROS GLOBAIS CRUZADOS (commit filtros globais): query `queryEstoqueGranular`
   (produto×local, TDD) + módulo puro `derivar-estoque.ts` (filtrar + recomputar
   indicadores/donuts/local/catálogo consistentes, TDD 7 casos). Barra
   `FiltrosGlobais` (dropdowns família/marca/local, tags clicáveis + limpar,
   contagem do efeito). Cruzam TODOS os blocos de estoque ao vivo; compras ficam
   intactas (dimensão independente). Validado: Família=ASTEC → A-01 vira R$ 568 mil
   / 334 produtos / 3 locais (era 49,4 mi / 1.894 / 68).
4. SPARKLINES nos KPIs (commit sparklines): componente `Sparkline` (SVG puro) +
   prop `sparkline` no KpiButton; KPIs "Em aberto" (A-07) e "Comprado" (A-08) com
   tendência dos últimos 14 dias de NF. INTEGRAÇÃO AO MENU (commit menu):
   `diretoriaNavFor` passa a incluir "Estoque montável" → /diretoria/relatorios
   para quem tem diretoria.estoque.view (antes só via URL). Validado por screenshot.

### Pendências/Onda 3 (dependem de validação do cliente do padrão em Estoque)
- Espalhar construtor + filtros globais para Vendas (C-*), Pedidos (B-*), Visão.
- A-09 (indicadores avançados) não responde aos filtros globais (idade/giro vêm de
  seriais/vendas, fora da granularidade de saldo) , aceitável; reavaliar se cliente
  pedir consistência total.
- Integrar cada ABA das telas como tela montável (hoje só Estoque é montável).
- Filtro global de período/UF nas dimensões de compras/vendas (hoje família/marca/
  local só afetam estoque). "Personalizado" de datas diferenciado.
- Eixo Y do LineChartCard usa moeda cheia (R$ 6.000.000) , avaliar formato compacto.

Como retomar: ler este PROGRESSO + SPEC `2026-06-29-diretoria-construtor-modular-SPEC.md`.
Construtor vive em /diretoria/relatorios (tela=estoque). Validar SEMPRE por
screenshot (scripts/diretoria-render-user.ts + diretoria-screenshot.ts; user
render-check@local.test / Teste@12345). NÃO mergear sem autorização (regra F6).

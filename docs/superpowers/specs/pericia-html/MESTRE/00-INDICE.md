# Perícia forense COMPLETA do HTML , Painel Diretoria (índice mestre)

> Perícia 100% do protótipo `~/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> (18.971 linhas, ~1 MB, 567 funções, 86 SVG/canvas, JS/CSS vanilla sem libs além
> de Google Fonts). Cobertura garantida por auditoria linha a linha (8 faixas).
>
> Este índice é o ponto de entrada. Cada capítulo é a perícia definitiva de um
> bloco, conferida no HTML com número de linha, valores e textos reais, separando
> versão ATIVA de código MORTO (o HTML empilha dezenas de versões vXX; só a última
> de cada função vence em runtime).

## Como esta perícia foi feita (rastreabilidade)
1. Esqueleto: libs, módulos (`#mod-*`), navegação, 567 funções.
2. Perícia por módulo (7 docs): `../00`..`../06`.
3. Auditoria de cobertura linha a linha (8 faixas): `../audit/faixa-01..08.md`
   , cada linha do HTML foi lida por um auditor e cruzada com a perícia; gaps listados.
4. Capítulos definitivos (este diretório `MESTRE/`): fundem perícia + auditoria +
   releitura dos gaps. São a fonte da verdade.

## Mapa de telas (módulos do HTML)
| Módulo (id) | Tela | Capítulo |
|---|---|---|
| `scr-auth` | Login / Cadastro / Admin | 01 |
| `mod-home` | Início (welcome + Agenda + Contracheques) | 02 |
| `mod-estoque` | Estoque (A1-A6 + Estoque Ideal) | 03 |
| (dentro de estoque) | Compras (A7-A8) | 04 |
| `mod-demandas` | Demandas / Pedidos (B1-B8) | 05 |
| `mod-vendas` | Vendas (C1-C10) | 06 |
| `mod-admin` | Painel de Usuários (CRUD, permissões, UF) | 07 |
| `mod-tela` | Aparência (tema/ paleta) | 01 |
| `mod-odoo` | Ajustes Odoo (config + status) | 07 |
| `mod-mapa` | Mapa interativo (ÓRFÃO: no DOM, fora do menu) | 07 |

## Capítulos
- **01 , Fundação** (`01-fundacao.md`): design system completo (19 tokens de cor,
  superfícies s1-s4, Inter+Space Grotesk, espaçamento/raio/sombra/glass), 2 eixos
  de tema (dark/light × dourado/prata), shell/sidebar (60↔224px), navegação
  (`navTo`/`hasPerm`), autenticação (3 formulários), animações (`@keyframes spin`
  + transições), utilitários (modais/pills/tooltips).
- **02 , Início + Agenda + Contracheques** (`02-home-agenda.md`): welcome bar;
  agenda em 2 colunas (calendário mês + month picker multi-mês 1/2/3/6/12 + painel
  do dia); criar evento (título, data com chips Hoje/Amanhã/+7, hora com chips,
  tipo, UF, colaboradores, anexos base64 ≤3MB, descrição); picker de colaboradores
  estilo Outlook; detalhes/excluir; filtros avançados; RBAC por hierarquia (4
  níveis) + UF; Central de arquivos/Contracheques (metadados, sem binário).
- **03 , Estoque** (`03-estoque.md`): A1 (removido), A2 valor+por local, A3 modelos
  do catálogo + Estoque Ideal (modal, overPct, alertas), A4 indicadores (valor
  médio/produto, itens, média/local, valor médio, idade média, tempo de cobertura),
  A5 distribuição (2 pizzas donut), A6 seriais (busca loose, idade, valor/serial).
  Mocks: STOCK_PRODUCTS (48 modelos), STOCK_SERIALS.
- **04 , Compras** (`04-compras.md`): A7 detalhe (lista de OCs, itens 4 colunas,
  10 KPIs, contagem regressiva, 2 donuts), A8 resumo (6 KPIs, ranking top-6 de
  fornecedores em alerta, matriz de 11 colunas, alertas configuráveis por
  fornecedor com persistência). Mock: STOCK_PURCHASE_ORDERS.
- **05 , Demandas/Pedidos** (`05-demandas.md`): B1 hero pendente, B2 tabela (7
  colunas, 1 linha por unidade, reservas por unidade), B3 KPIs a receber, B4 mapa
  por estado (choropleth + tooltip tracking + glow + filtro por UF), B5 drill-in do
  pedido (5 indicadores + barras), B6 visão geral (+donut), B7 máquinas em estoque
  (disponível/reservado/% reservado), B8 itens em pedidos ativos (barras clicáveis
  + modal de período). Mocks: demandUnitValue, 33 vendas de amostra.
- **06 , Vendas** (`06-vendas.md`): C1 período (5 abas), C2 KPIs (5), C3 vendas por
  estado (pizza top-10 UFs , NÃO mapa), C4 por marca (pizza), C5 pedidos fechados
  (7 colunas), C6 maior pedido + digital/presencial, C7 itens vendidos (barras
  clicáveis → filtram C10), C10 formas de pagamento (5 cards), C8/C9 comparativo de
  2 estados (2 cards com DELTA cruzado, v134). Mocks: mockRows, vendedor/ marca
  fictícios.
- **07 , Admin + Mapa órfão + Odoo + Dados** (`07-admin-mapa-odoo-dados.md`):
  Painel de Usuários (CRUD, hierarquia comercial 4 níveis), modal editar usuário
  (foto base64, permissões por gaveta do menu), seletor de UF (27 + TODOS), módulo
  Mapa órfão (heatmap + count-up + flash + filtros + Odoo embutido), integração
  Odoo ao vivo (JSON-RPC sale.order→res.partner→sale.order.line), config Odoo, e o
  **catálogo de TODOS os mocks mapeados para o dado real do cache** que deve
  substituí-los.

## Catálogo de componentes (todos os A/B/C do HTML)
Status: V=vivo, M=morto/legado, O=órfão. Fonte: mock no HTML; precisa virar dado real.

### Estoque (A) , cap 03
| HTML | Componente | Tipo | Status |
|---|---|---|---|
| A1 | (removido no HTML) | , | M |
| A2 | Valor total + estoque por local | KPI+tabela+pizza | V |
| A3 | Modelos do catálogo + Estoque Ideal | tabela+modal | V |
| A4 | Indicadores (idade, giro, cobertura) | KPIs | V (cobertura via patch) |
| A5 | Distribuição (família/categoria + marca) | 2 pizzas | V |
| A6 | Seriais em estoque | tabela+busca+KPI | V |

### Compras (A7-A8 → domínio K) , cap 04
| HTML | Componente | Tipo | Status |
|---|---|---|---|
| A7 | Detalhe da compra (lista+itens+10 KPIs+2 donuts) | composto | V |
| A8 | Resumo (6 KPIs+ranking+matriz 11col+alertas) | composto | V |
| , | Pizzas A8 por fornecedor | pizzas | M |

### Demandas (B) , cap 05
| HTML | Componente | Tipo | Status |
|---|---|---|---|
| B1 | Hero de valor pendente | KPI | V |
| B2 | Lista de pendentes (7 colunas, por unidade) | tabela | V |
| B3 | Indicadores da dívida (a receber) | 4 KPIs | V |
| B4 | Mapa de demandas por estado | mapa | V |
| B5 | Indicadores do pedido (drill-in) | KPIs+barras | V |
| B6 | Visão geral das demandas | KPIs+donut | V |
| B7 | Máquinas em estoque (disp/reservado/%) | tabela | V |
| B8 | Itens em pedidos ativos (por período) | barras+modal | V |

### Vendas (C) , cap 06
| HTML | Componente | Tipo | Status |
|---|---|---|---|
| C1 | Barra de período (5 abas) | filtro | V |
| C2 | Indicadores do período | 5 KPIs | V |
| C3 | Vendas por estado | pizza top-10 | V |
| C4 | Vendas por marca | pizza | V |
| C5 | Pedidos fechados | tabela 7 col | V |
| C6 | Maior pedido + digital/presencial | KPIs | V |
| C7 | Itens vendidos | barras clicáveis | V |
| C8/C9 | Comparativo de 2 estados (com delta) | 2 cards | V (v134) |
| C10 | Formas de pagamento | 5 cards | V |

## Achados críticos transversais (ler antes da SPEC)
1. **Versões empilhadas**: o HTML acumula dezenas de redefinições vXX da mesma
   função; só a ÚLTIMA vale. Cada capítulo marca ativo vs morto , a reconstrução
   deve seguir só o ativo.
2. **Muitos números são fictícios** (margem, custo, modalidade, forma de
   pagamento, vendedor, % reservado, lead time, comparativo de estados). O cap 07
   traz a tabela mock→dado real. Regra: usar dado real do cache; rotular
   "estimado" o que só dá pra aproximar; marcar "sem fonte" o que não existe.
3. **Mapa do Brasil**: existe vivo em Demandas (B4) e no módulo órfão Mapa; em
   Vendas/Estoque o "por estado/distribuição" é PIZZA, não mapa. O tamanho gigante
   vem de `min-height:700-812px !important` no B4.
4. **Integração Odoo ao vivo** existe no protótipo (JSON-RPC) mas NÃO vai ao
   produto (nós lemos do cache). Documentada para referência.
5. **Código órfão**: módulo Mapa (#mod-mapa) roda mas saiu do menu; várias
   funções (lead time, pizzas A8, indicadores A3) estão mortas.
6. **Saneamento**: o HTML tem typo ("Painel de Usuáriosistrativo") e travessões
   "—" , corrigir na reconstrução (projeto proíbe em dash).

## Próximo passo
Após aprovação desta perícia: escrever a SPEC v2 (com o catálogo de componentes
numerado no nosso índice A/K/B/C/G, o construtor de layout/grid, RBAC, e o mapa
métrica→dado real), passar pelas 2 reviews adversariais, depois os PLANS, depois
implementar. Nada some do HTML; tudo melhor organizado e com dado real.

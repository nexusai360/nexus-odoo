# Inventário forense do HTML , Menu Diretoria

> Documento de descoberta (escopo). Mapeia, de forma fiel e exaustiva, tudo que
> existe no painel HTML enviado pelo cliente (`index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`,
> 18.971 linhas, 1 MB). Esse HTML é o **objetivo do projeto**: reproduzir tudo
> que está nele, de forma mais bonita, mais limpa e melhor organizada, dentro do
> nosso design system, com liberdade criativa de layout e cor. Onde faltar dado,
> a gente agrega.
>
> Base para a spec de arquitetura do menu Diretoria.

## 1. O que é o HTML

- SPA single-file, sem framework (vanilla JS, render por template strings).
- Fontes: Inter (corpo) + Space Grotesk (números/títulos). Mesma dupla do nosso app.
- Gráficos: Chart.js (168 menções) + alguns desenhos em SVG/d3 (mapa do Brasil).
- Dados **100% mockados** internamente (`mockRows`, `brandData`, `demoUfs`, `seed`,
  `distribute`). Os números são fictícios; o valor do projeto é plugar nas
  fontes reais do nosso cache.
- Tema dark com accent roxo, além de variações de tema (dark/light) e paletas
  (dourado/prata) na tela de configurações.
- Tela de login (client-side, fake) , **descartada** (nosso sistema já tem auth).

## 2. Navegação interna (menu do HTML)

Objeto `DRAWERS` define as 6 telas de topo:

| Chave | Rótulo no HTML | Conteúdo |
|---|---|---|
| `home` | Início | Dashboard inicial + **agenda/calendário de eventos** |
| `estoque` | Estoque | Módulo A , estoque e compras (A2 a A8), com mapa do Brasil |
| `demandas` | Demandas | Módulo B , pedidos/entregas/demandas (B1 a B8), com mapa |
| `vendas` | Vendas | Módulo C , vendas/faturamento/pagamentos (C2 a C10), com mapa |
| `admin` | Painel de Usuários | Gestão de usuários, cargos, hierarquia comercial, permissões por UF, contracheque |
| `settings` | Configurações | Temas/paletas + form de conexão e sync do Odoo |

O **mapa do Brasil** aparece em 3 telas: estoque (`buildStockBrazilMap`),
demandas (`renderDemandMap`) e vendas (`buildMap`). É peça central e muito usada.

## 3. Tela INÍCIO (home) + AGENDA

- Dashboard inicial (`mod-home`).
- **Agenda/calendário** completo: `initCalendar`, `renderCalendar`, `renderMonth`,
  `renderDayPanel`, `openEventDetails`, `openAddEvent`, `openMonthPicker`.
- **Tipos de evento**: Reunião, Entrega, Inventário, Prospecção, Carregamento,
  Organização de Estoque, Assembleia, Visita.
- **Evento** (modal "Novo evento"): Título, Data (atalhos Hoje/Amanhã), Hora,
  tipo, **colaboradores** (`renderEventCollaboratorPicker`, add/remove-collab),
  **anexos** (`initEventAttachmentInput`), filtros avançados
  (`openEventAdvancedFilters`), exclusão com confirmação.
- Observação: a agenda é **dado novo** (criado na plataforma), não vem do Odoo.
  Exige schema próprio (eventos + colaboradores + anexos).

## 4. Tela ESTOQUE (módulo A)

Funções: `renderStockDashboard`, `renderStockSummary`, `renderStockLocations`,
`renderStockProductTable`, `buildStockBrazilMap`, `buildStockDistributionData`,
`renderStockPieChart`/`renderStockPieDashboard`, `renderStockSerialDashboard`,
`renderStockA3Indicators`, `renderStockA4AgeAndTurnover`, `renderStockLeadTime`,
`renderStockCoverageFromA3`, `openStockIdealModal`, `renderStockIdealConfigList`.

| Seção | Título | Visual / conteúdo |
|---|---|---|
| A2 | Estoque geral e por local | Mapa do Brasil + estoque por local |
| A3 | Modelos do catálogo em estoque | Tabela de produtos/modelos, indicadores |
| A4 | Indicadores do estoque | KPIs: valor médio por produto, qtd itens, qtd média por local, valor médio de estoque, idade média por produto, **tempo de cobertura** |
| A5 | Distribuição do estoque | Pizza por categoria + por fornecedor |
| A6 | Lista de seriais | Tabela: Modelo, Serial, Valor que custou, Chegada no estoque, Data de saída, Idade. KPI valor médio por serial |
| A7 | Compras | Listas de compras, itens comprados, info da compra (valor dos produtos, prazo, dia de chegada, **contagem regressiva**, qtd comprada, usuário que fez a compra, data, valor já pago, falta pagar, entrega do pedido) |
| A8 | Resumo das compras ativas | Valores (total em compras, pago, a pagar, por fornecedor), Quantidades (já chegou, a chegar, atrasada), Compras (ativas, atrasadas x no prazo, **lead time**, "a cada quantas compras uma atrasa"), por fornecedor (pie, ranking, matriz, tabela, alertas configuráveis) |

Tabela de compras (A8) colunas: Fornecedor, Ativas, % entregue, Comprado,
Recebido, Pendente, Atrasado, Total, A pagar, Lead time, % financeiro a pagar,
A pagar atrasado, Dias atraso.

## 5. Tela DEMANDAS (módulo B)

Funções: `renderDemandasDashboard`, `renderDemandTable`, `renderDemandMap`,
`renderDemandMapTooltip`, `renderDemandMapSelection`, `renderDemandMapRanking`,
`renderDemandOrderDetails`, `renderDemandOverview`, `renderDemandStockList`,
`renderDemandB8Chart`, `openDemandB8PeriodModal`.

| Seção | Título | Visual / conteúdo |
|---|---|---|
| B1 | Pedidos que ainda precisamos entregar | Lista/cards |
| B2 | Lista de pedidos pendentes | Tabela: Cliente, UF, Prazo, Status, Reserva, Valor pendente, Margem |
| B3 | Indicadores da dívida com clientes | KPIs de a receber |
| B4 | Mapa de demandas por estado | Mapa do Brasil + ranking + seleção + tooltip |
| B5 | Indicadores do pedido selecionado | KPIs do pedido (drill-in) |
| B6 | Visão geral das demandas | KPIs gerais |
| B7 | Máquinas em estoque | Tabela: Disponível, Reservado, % reservado |
| B8 | Itens vendidos em pedidos ativos | Gráfico por período (modal de período próprio) |

## 6. Tela VENDAS (módulo C)

Funções: `renderSalesDashboard`, `openSalesPeriodModal`, `renderSalesC2`...`C6`,
`renderComparePie`, `renderCompareCard`, `renderPie`, `renderCard`.

| Seção | Título | Visual / conteúdo |
|---|---|---|
| C2 | Indicadores do período | KPIs: faturamento, ticket, nº pedidos, margem |
| C3 | Vendas por estado | Mapa do Brasil por UF |
| C4 | Vendas por marca | Barras / pizza por marca |
| C5 | Pedidos fechados | Tabela: Valor, Vendedor, Modalidade, Fechamento, Margem |
| C6 | Modalidades e maior pedido | Modalidades (presencial/etc.) + destaque do maior pedido |
| C7 | Itens vendidos no período | Barras + tabela |
| C8 / C9 | Comparativo de estado | Dois estados lado a lado (compare pie/card) |
| C10 | Formas de pagamento | Donut por forma de pagamento (filtra pagamentos) |

Hierarquia comercial presente nos dados: Vendedor, Vendedor Regional, Gerente
Comercial Regional, Sub Gerente Comercial Global, Diretor Comercial Global.

## 7. Tela PAINEL DE USUÁRIOS (admin)

- Tabela "Usuários Cadastrados": Nome, Usuário, Cargo, Hierarquia, UF(s)/Estado(s),
  Permissões, Cadastro, Ação.
- "Criar Novo Usuário": Nome completo, Usuário de login, E-mail, foto, cargo,
  hierarquia, UFs, permissões (`renderEditUserPerms`, `renderPermTable`).
- **Contracheque** (`renderCC`, `openCCModal`, "Adicionar Contra-cheque").
- Seletor de UF visual (`openUfPicker`, `renderUfPickerGrid`), com bandeiras.

> Sobreposição: nosso sistema já tem `/usuarios` com RBAC. O HTML estende com
> cargo, hierarquia comercial, vínculo por UF e contracheque. Decisão de produto
> pendente (ver spec): reproduzir como gestão dentro de Diretoria vs estender o
> `/usuarios` existente vs extrair só a parte informacional (quem são os
> vendedores / performance por cargo e UF) como relatório.

## 8. Tela CONFIGURAÇÕES (settings)

- Aparência: tema dark/light, paletas dourado/prata (`screen-mode-*`,
  `screen-palette-*`).
- **Conexão e sync do Odoo** (form extenso, mock): enabled, environment,
  protocol, base-url, database, username, auth-method, api-key, proxy-path,
  timeout, company-id(s), warehouse-ids, location-ids, category-ids, lang,
  timezone, endpoints, mapeamento de modelos (product, stock, sale, purchase,
  partner), toggles de sync (stock/products/serials/sales/purchases/partners),
  auto-sync, sync-interval, batch-limit, date-from, extra-domain, allowed-origin,
  webhook-secret, webhook-path, log-level, notes.

> Sobreposição forte: **nosso worker já faz toda essa sincronização de verdade**
> (JSON-RPC, cron incremental + snapshot). O form do HTML é mock. Reproduzir o
> form sobre um backend que já sincroniza seria retrabalho/confusão. Decisão de
> produto pendente (ver spec). Os temas/paletas são cosméticos (já temos
> ThemeProvider).

## 9. Filtros globais

- **Períodos** (pílulas): Hoje, Esta semana, Este mês, Mês atual, Ano atual,
  Ano anterior, Últimos 7 dias, Últimos 30 dias, Últimos 90 dias, Personalizado
  (date picker com navegação de mês, Aplicar/Cancelar).
- **Dropdowns**: Todos os períodos, Todos os modelos, Todos os estados, Todos os
  status, Todas as UFs vinculadas, Todos os fornecedores com compras ativas.
- Vários gráficos têm **navegação por setas** (avançar/voltar dia ou mês) , é
  a interação que o cliente destacou como referência (igual ao Consumo do Nex).

## 10. Mapa do Brasil (componente central)

- Aparece em estoque, demandas e vendas (3 contextos), com tooltip, seleção de
  estado, ranking lateral e coloração por intensidade (choropleth por UF).
- Cliente pediu explicitamente: deve ter **animação bem legal**, será muito
  usado. É **componente novo** (hoje só temos Recharts; não há mapa). Será
  construído uma vez e reusado nos 3 módulos + na Visão geral.

## 11. Cruzamento com o nosso cache (dado real disponível)

Todos os 7 domínios já têm camada de fato populável. Mapa direto:

| Tela HTML | Fonte real no nosso cache |
|---|---|
| Vendas C2/C5/C6 | `FatoPedido`, `FatoNotaFiscal` |
| Vendas C3/C8/C9 (estado) | `FatoPedido` + `FatoParceiro.uf` |
| Vendas C4/C7 (marca/itens) | `FatoNotaFiscalItem` + `FatoProduto.marca` |
| Vendas C10 (pagamento) | `FatoPedidoParcela.formaPagamento` |
| Demandas B1-B8 | `FatoPedido`, `FatoFinanceiroTitulo`, `FatoEstoqueSaldo` |
| Estoque A2-A6 | `FatoEstoqueSaldo`, `FatoProduto`, rastreabilidade (serial) |
| Compras A7/A8 | `FatoDfe`, `FatoFinanceiroTitulo`, `FatoCotacao` (ehCompra) |
| Vendedor/hierarquia | `FatoPedido.vendedor`, `FatoComissao` |
| Agenda | **Novo** (schema próprio; não vem do Odoo) |

As ~80 funções `query*` em `src/lib/reports/queries/` já existem para todos os
domínios; hoje só estoque está ligado na UI (6 relatórios). Para Diretoria, é
registrar/criar as queries que faltam e ligar nas telas.

## 12. Padrão visual de referência (Consumo do Agente Nex)

Telas de referência fornecidas pelo cliente. Padrão a seguir (com liberdade):
- Header: ícone em quadrado roxo translúcido + título grande + subtítulo cinza.
- Barra de período: pílulas (ativa em roxo sólido) + "Personalizado" (date
  picker) + dropdowns à direita com check no selecionado.
- KPI cards em linha: label uppercase + ícone roxo + número grande (Space Grotesk).
- Cards de gráfico: header com ícone + título; area chart com gradiente, donut
  com valor central, bar chart (horizontal e vertical com badge).
- Tabela: linha "Total no filtro" destacada, badges, números à direita,
  paginação completa ("Mostrando X de Y", "Página N de M", "Ir para página",
  "N por página").
- FAB roxo (sparkle) no canto.
- Stack real: Recharts, Tailwind v4, base-ui, componentes em `src/components/charts/`
  e `src/components/reports/`.

## 13. Itens a descartar / integrar (não duplicar)

- **Login do HTML**: descartado (auth do sistema).
- **Form de conexão/sync Odoo**: não reproduzir (worker real já faz). Avaliar
  só expor status de sync ("atualizado há Xs"), que já temos.
- **Gestão de usuários**: integrar ao `/usuarios` existente em vez de duplicar;
  trazer para Diretoria apenas a visão informacional/comercial (hierarquia,
  performance por vendedor/cargo/UF) , a decidir na spec.

## 14. Gaps de construção (o trabalho real)

1. Menu "Diretoria" acima de "Relatórios" na sidebar (sem criar perfil/role novo).
2. Componente **Mapa do Brasil** animado (novo), reusável.
3. Wire das queries de vendas/comercial/financeiro no catálogo/telas (hoje só estoque).
4. Schema novo para **Agenda** (eventos + colaboradores + anexos).
5. Decisão de produto: Usuários e Configurações (reproduzir vs integrar).
6. Sistema de cores semânticas (verde/vermelho/azul/amarelo) para indicadores,
   além do accent roxo.

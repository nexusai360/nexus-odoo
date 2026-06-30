# Auditoria de cobertura adversarial , FAIXA 03 (linhas 4800 a 7200)

> Fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Faixa: 4800-7200 (fim do CSS de Vendas + CSS de Demandas B4-B8 + abertura do `<body>`:
> AUTH, shell/sidebar, HOME, ESTOQUE A2-A8, DEMANDAS B1-B8, MAPA, VENDAS C1-C10 + 2 modais, abertura do ADMIN).
> Cruzamento com perícia existente (`0*.md`). Marcação [COBERTO] / [GAP] / [PARCIAL].

Esta faixa é quase toda **CSS final** (Vendas C2-C6, Demandas B4-B8 com suas 6 camadas de override) e **markup DOM** dos módulos. A perícia 00-06 cobre o arquivo inteiro (não por faixa), então a maior parte do markup está documentada funcionalmente. O foco do audit é o que escapou no **nível de detalhe** dentro desta faixa, especialmente DOM que existe mas não foi inventariado.

---

## 1. CSS , VENDAS C2 a C6 (4848-5212)

- **[COBERTO]** `.sales-period-chip` (C1) e variantes main/detail/sub/arrow/kicker (4803-4845) , layout do chip de período. 04-vendas documenta C1 como chip que abre modal.
- **[COBERTO]** `.sales-c2` / `.sales-kpi-grid` (5 colunas) / `.sales-kpi-card` com faixas coloridas por tipo (total=gold, margin=#6FE0B0, items=#6F8FF3, avg-items=#E8D5A8, avg-order=gold2) (4849-4864). 04 documenta os 5 KPIs.
- **[COBERTO]** `.sales-c3` / `.sales-c4` pizzas (4867-4933): wrap 560x500, slice com hover scale 1.012, label-line/label-dot/label-uf/label-meta, total-chip (escondido no C4), estado `.is-empty`. 04 documenta C3/C4 como pizzas com rótulos distribuídos.
- **[COBERTO]** `.sales-c5` lista de pedidos fechados (4936-5110): grid 6 colunas, search-box, tabela sticky, margem colorida (low=#F17A7A vermelho, mid=#F6C453, default verde), UF pill dourada. 04 documenta as 7 colunas e o filtro.
- **[GAP , detalhe]** **CSS de larguras do `.sales-c5-table` está defasado (define só 6 de 7 colunas).** As regras `thead th:nth-child(1..6)` (5039-5044) cobrem 6 colunas (27/8/12/17/18/18%), mas o `<thead>` real (6924-6930) tem **7 colunas** (Cliente, UF, Margem, Valor, Vendedor, Modalidade, Fechamento). A 7ª coluna (Fechamento) fica **sem largura definida**. A perícia nota que a v127 acrescentou Modalidade no JS, mas não registra que o CSS de larguras ficou preso na versão de 6 colunas. Reconstruir: definir as 7 larguras.
- **[COBERTO]** `.sales-c6` modalidades e maior pedido (5113-5210): indicator com faixa por tipo (biggest=gold, digital=#6F8FF3, presencial=#6FE0B0), sub com strong. 04 documenta os 3 blocos (maior pedido + digital + presencial).

## 2. CSS , DEMANDAS B-blocks (5215-5926)

- **[COBERTO]** Grid `.demand-container` 4 colunas e posicionamento b1-b8 (várias camadas: 5217, 5330, 5456, 5535-5544 v118, 5599 v119, 5739 v120, 5910 v121). 03 documenta o grid e o retrabalho.
- **[COBERTO]** B1 hero (5230-5234), B3 KPI grid (5235-5247: gold/red/green/blue), filtros B2 (5248-5257), tabela `.demand-table` (5261-5278) com status open/late/done.
- **[COBERTO]** B4 mapa do Brasil (5289-5387): `#demand-brazil-map`, `path.demand-state` hover/active, tooltip, ranking lateral, override v106 "somente mapa, UF como botão, visual escuro" (5332-5387). 03 documenta o mapa interativo.
- **[COBERTO]** B5 detalhe do pedido (5390-5421): linha selecionável, detail-grid 5 itens (total/qty/delivered/pending/deadline), barras de progresso delivered (#3ECF8E→#6FE0B0) e pending (#A94B4B→#F17A7A). 03 documenta B5.
- **[COBERTO]** B6 visão geral (5423-5463): overview-kpis (total/count/avg/max), pizza atrasados x no prazo (dot late=#F17A7A, ontime=#6FE0B0). 03 documenta B6.
- **[COBERTO]** B7 máquinas em estoque (5468-5513): `.demand-stock-table` 4 colunas (Modelo/Disponível/Reservado/%reservado), checkbox de reserva `.demand-reserve-check` (verde ao marcar), `.demand-reserved-pill`, barra de % reservado (#F6C453→#F17A7A). 03 documenta reserva e tabela.
  - **[GAP , menor]** `.demand-reserved-pill` (5490) e o comportamento exato do checkbox `.demand-reserve-check input:checked + span` (5489) não aparecem nominalmente na perícia (só "reserva" genérico).
- **[COBERTO]** B8 , as 6 camadas de override de estilo: v118 (5516-5556 barras horizontais), v119 (5560-5601 barras verticais + modal de período `.demand-b8-modal-bg` com preset-grid e custom-box de datas), v120 (5605-5755 "ref-style", fundo #f7f6f1, barras #728527, rótulos inclinados 34deg, nota itálica, y-labels, gridlines), v121 (5758-5925 "site-style", barras douradas, gridline zero dourada, xlabels rotacionados -24deg, foot/axis-title). 03 documenta explicitamente as 6 camadas e que a final efetiva é v122+v123+v124 (minimal-style).

## 3. AUTH `#scr-auth` (5931-5994)

- **[PARCIAL/GAP]** A perícia (00 l.143, 06 l.26) registra que `#scr-auth` existe, que `doAdminLogin` é alias de `doLogin`, e que registro/demo estão desativados. **Mas o DOM interno da tela de login NÃO foi inventariado:**
  - **[GAP]** `.role-selector` oculto (`display:none`, 5934) com `rbtn-user`/`rbtn-admin` e `selectRole('user'|'admin')` , seletor de perfil morto/legado. (`selectRole` [0], `rbtn-admin` [0] na perícia.)
  - **[GAP]** `#admin-strip` (5947): faixa com ícone de escudo e texto **"Painel de Usuáriosistrativo — acesso restrito à diretoria"** (typo evidente de "Painel Administrativo", e contém travessão — proibido pelo projeto). A perícia cita a string uma vez (06) mas não o elemento/contexto.
  - **[GAP]** `.auth-tabs` oculto (`display:none`, 5951): `tab-login`/`tab-reg` com `switchTab('login'|'register')`.
  - **[GAP]** `#form-login` (5955-5965): inputs `l-email` (placeholder "seu usuário", **type text apesar do id "email"**), `l-pass` (password), erro `l-err`, botão "Entrar no site" → `doLogin()`.
  - **[GAP]** `#form-reg` oculto (5966-5981): `r-name`, `r-email`, `r-role` (label **"Cargo / Função"**, placeholder "Ex: Analista Comercial"), `r-pass` ("Mínimo 6 caracteres"), `r-err`, botão "Criar minha conta" → `doRegister()`.
  - **[GAP]** `#form-admin` oculto (5982-5991): `a-user` (placeholder "admin"), `a-pass` (label **"Senha master"**), `a-err`, botão "Acessar painel admin" → `doAdminLogin()`.
  - **[GAP]** Header do card: `.auth-logo-row` (dot + "Icaro Group"), `.auth-subtitle` "Portal Interno — Acesso Restrito" (5945-5946).

## 4. APP SHELL / SIDEBAR (5996-6058)

- **[COBERTO]** `#scr-app`, `.sidebar`, hamburger `toggleSidebar()`, logo "Icaro Group". Nav Principal: home/estoque/demandas/vendas (todos `display:none` por padrão, revelados por permissão). Seção Menu: Ajustes `toggleSettingsMenu()` com submenu admin/tela/odoo. `.sidebar-user` com avatar/uname/urole, dropdown "Sair do portal" `doLogout()`. 00 documenta a hierarquia completa e `applyDrawerAccess()`.

## 5. HOME `#mod-home` (6061-6136)

- **[COBERTO]** welcome-bar (wav/wname/wdate/wrole-pill); calendário `.cal-a1` (calNav, openMonthPicker, calToday, cal-dow-row, cal-grid); painel do dia `.cal-a2` (a2-daynum, add-btn → openAddEventForSelected, busca a2-event-search → setEventSearch, filtros a2-fchip: Todos/Reunião/Inventário/Prospecção/Carregamento/Organização de Estoque/Assembleia, a2-body/a2-empty); contra-cheques `.cc-section` (cc-add-btn → openCCModal, cc-body). 05-agenda documenta agenda+contra-cheques.

## 6. ESTOQUE `#mod-estoque` A2-A8 (6139-6518)

- **[COBERTO]** A2 estoque geral + por local (stock-total-block, stock-location-list, setStockLocationFilter). A3 modelos do catálogo (busca, filtro Todos/Abaixo/Ideal/Acima, colunas MODELO/BARRA/ESTOQUE/IDEAL/VARIAÇÃO/%, stock-model-graph, botão openStockIdealModal). 01-estoque cobre.
- **[COBERTO]** A4 indicadores (6 cards: valor médio/produto, qtd itens, qtd média/local, qtd média de valor, idade média/produto, **tempo de cobertura = "Estoque disponível ÷ demanda pendente × 30 dias"**). 01 documenta tempo de cobertura.
- **[COBERTO]** A5 distribuição (pizza por categoria + por fornecedor). A6 lista de seriais (busca, valor médio por serial, tabela Modelo/Serial/Valor/Chegada/Saída/Idade). 01 cobre (`stock-serial` [1]).
- **[COBERTO]** A7 compras (lista, itens comprados Modelo/Qtd comprada/chegou/a receber, 10 info-cards incluindo VALOR JÁ PAGO/FALTA PAGAR, 2 pizzas entrega+categorias). 02-compras cobre.
- **[COBERTO]** A8 resumo das compras ativas (3 blocos: VALORES com 3 KPIs + 3 pizzas por fornecedor; QUANTIDADES com 4 KPIs + 4 pizzas; COMPRAS com 2 KPIs incluindo "A cada quantas compras uma atrasa" + 2 pizzas). 02 cobre.

## 7. DEMANDAS `#mod-demandas` B1-B8 (6521-6757)

- **[COBERTO]** B1 hero valor pendente; B3 4 KPIs (abertos/atrasados/itens pendentes/ticket médio pendente); B7 máquinas em estoque (busca, tabela disponível/reservado/%); B2 lista pendentes (busca, filtros Abertos/Atrasados/Todos, 7 colunas com Reserva); B5 detalhe do pedido selecionado; B6 visão geral (4 KPIs + pizza); B4 mapa do Brasil; B8 itens vendidos em pedidos ativos (botão de período openDemandB8PeriodModal, insights por modelo delivered/pending/late + Limpar seleção selectDemandB8Model, chart). 03-demandas cobre todos.

## 8. MAPA `#mod-mapa` (6759-6818)  ← MAIOR GAP DA FAIXA

- **[PARCIAL/GAP]** A perícia (00 l.218-224) reconhece `#mod-mapa` como **"módulo órfão/legado, sem item de menu, fora do TITLES"** , mas **NÃO inventaria seu conteúdo**, que é rico e todo nesta faixa:
  - **[GAP]** Barra de filtros `.mapa-filters`: busca `#msi` ("Buscar modelo, cliente, UF…"), select `#mfuf` (estados), select `#mfst` (status: Confirmado=sale / Entregue=done / Rascunho=draft / Cancelado=cancel), botões `applyF()` "Filtrar" e `clearF()` "Limpar", `#mchips` (chips de filtro ativo).
  - **[GAP]** Botão **"Sync Odoo"** → `syncOdoo()` + status `#msyt` ("não sincronizado"). (`syncOdoo` [0], `Sync Odoo` [0] na perícia.)
  - **[GAP]** Coluna esquerda `.map-left`: título "Pedidos", badge `#mrc`, tabela `#mtb` (Cliente/Modelo/UF/Prazo), placeholder "Use os filtros para buscar".
  - **[GAP]** Centro `.map-center`: título "Brasil — Distribuição por Estado", legenda Menor↔Maior, SVG `#bsvg`, overlay de loading `#mov`/`#movmsg` "Carregando…", tooltip `#mtt`. (`bsvg` [0].)
  - **[GAP]** Direita `.map-right`: 3 KPIs (Total `#mkt`, Média/Estado `#mkm`, Líder `#mklid`), barchart "Top Estados" `#mte` ("Sem dados"). (`Top Estados` [0].)
  - **[GAP]** Painel **Odoo ERP** `.odoo-pnl`: indicador on/off `#ooi`/`#ootx` ("Desconectado"), inputs `#ou` (URL), `#odb` (Database), `#ous` (Usuário/E-mail), `#opw` (Senha/API Key), botões `connectOdoo()` "Conectar" e `disconnectOdoo()` "Desconectar". (`connectOdoo` [0].)
  - Observação: é o único ponto do protótipo com UI de **conexão direta ao Odoo** (URL/DB/credenciais) e botão de sync , relevante para reconstrução decidir se expõe ou descarta. A perícia só diz "atenção, confirmar se expõe ou remove" sem detalhar o que existe.

## 9. VENDAS `#mod-vendas` C1-C10 + modais (6822-7175)

- **[COBERTO]** C1 chip de período (openSalesPeriodModal, sales-period-value/detail). C2 5 KPIs (valor vendido, margem média/pedido, itens, média itens/pedido, média valor/pedido). C3 pizza por estado. C4 pizza por marca. C5 pedidos fechados (busca, 7 colunas). C6 modalidades + maior pedido (featured com Cliente/UF/Margem/Vendedor/Fechamento; digital e presencial com Valor/Pedidos/Ticket médio). C10 formas de pagamento (sales-c10-grid). C7 itens vendidos (chart minimal-style). C8/C9 comparativo de estado (3 pontinhos → openSalesCompareModal, selected, 3 KPIs Faturamento/Valor médio/Margem média, pizza por marca). 04-vendas cobre todos C1-C10.
- **[COBERTO]** Modal `#modal-sales-compare` (7062-7095): select Estado, select Período (current/today/last7/last30/last90/currentMonth/lastMonth/currentYear/lastYear), applySalesCompareModal. 04 documenta.
- **[COBERTO]** Modal `#modal-sales-period` (7097-7175): 5 abas (Dias/Meses/Anos/Trimestres/Semestres) com setSalesPeriodMode, panes com inputs date/month/number + presets salesQuickPeriod, trimestres/semestres com selects 1º-4º/1º-2º. 04 documenta (trimestres/semestres [2]).

## 10. ADMIN `#mod-admin` (abertura, 7178-7200)

- **[COBERTO]** Abas Usuários/Criar Usuário (adminTab), apane-users "Usuários Cadastrados". 06-permissoes cobre o módulo admin completo (tabela, criar, editar). O grosso do ADMIN está fora desta faixa (>7200).

---

## RESUMO

- **Itens inventariados nesta faixa:** ~62 (CSS Vendas C2-C6, CSS Demandas B4-B8 6 camadas, AUTH 3 forms + role selector + strip, shell/sidebar, HOME calendário+contra-cheques, ESTOQUE A2-A8, DEMANDAS B1-B8, MAPA completo, VENDAS C1-C10 + 2 modais, ADMIN abertura).
- **GAPs:** 11 (1 CSS defasado; 7 sub-itens do AUTH; 1 menor B7; o MAPA conta como 1 gap macro com 6 sub-itens; mais o reserved-pill).

### TOP 5 GAPS (mais importantes)
1. **`#mod-mapa` (6759-6818) inteiro não inventariado** , módulo órfão mas com UI rica: filtros+busca, tabela de pedidos, mapa SVG `#bsvg`, 3 KPIs, "Top Estados", e painel **Odoo ERP** com inputs de URL/DB/credenciais + Conectar/Desconectar/Sync Odoo (única UI de conexão direta ao Odoo no protótipo).
2. **AUTH , os 3 formulários e o seletor de perfil não foram inventariados:** `#form-login` (l-email/l-pass), `#form-reg` ("Cargo / Função", r-role), `#form-admin` ("Senha master", a-user/a-pass), `.role-selector` oculto (selectRole, rbtn-user/admin), `.auth-tabs` (switchTab).
3. **CSS do `.sales-c5-table` define só 6 de 7 colunas** (nth-child 1-6, 5039-5044); a 7ª (Fechamento) ficou sem largura após a v127 adicionar Modalidade , CSS preso na versão de 6 colunas.
4. **`#admin-strip` com typo e travessão:** texto "Painel de Usuáriosistrativo — acesso restrito à diretoria" (5947) , corrigir o typo de "Administrativo" e remover o travessão na reconstrução.
5. **B7 `.demand-reserved-pill` + mecânica do checkbox de reserva** (`input:checked + span` vira verde, 5489-5490) não estão nominalmente na perícia (só "reserva" genérico).

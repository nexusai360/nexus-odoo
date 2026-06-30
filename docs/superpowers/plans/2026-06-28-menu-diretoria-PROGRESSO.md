# PROGRESSO , Menu Diretoria (ponto de retomada)

> Branch: `feat/menu-diretoria` (worktree `branches/feat-menu-diretoria`).
> Modo autônomo: implementar as 6 ondas sem parar. Regra de contexto DESTA sessão:
> ao aviso de **75%+**, fazer wrap-up (docs/STATUS/HISTORY/memória + commits) e
> rodar `agente handoff "<continuação>"`. Heartbeat 900s reagendado a cada turno.

## Documentos canônicos
- Inventário do HTML (escopo): `docs/superpowers/specs/2026-06-28-menu-diretoria-inventario-html.md`
- Spec de arquitetura v3: `docs/superpowers/specs/2026-06-28-menu-diretoria-design.md`
- Plano da Onda 0: `docs/superpowers/plans/2026-06-28-menu-diretoria-onda0-plan.md` (a criar)

## Decisões fechadas com o usuário
- Menu "Diretoria" na sidebar ACIMA de "Relatórios" (não é PlatformRole novo).
- Navegação: híbrido (submenu sidebar estilo Agente Nex + Visão geral com mapa).
- Telas: Visão geral, Vendas, Pedidos & Entregas, Estoque & Compras, Agenda.
- Reproduzir TUDO do HTML + agregar dado faltante. Liberdade de layout/cor.
- RBAC granular por usuário configurado em /usuarios; super_admin bypass total;
  admin/gerente/visualizador customizável (detalhe fino na Onda 6, usuário define).
- Sync: freshness + botão forçar sync manual ISOLADO do cron (one-shot escopado).
- Não reproduzir: login, form de config Odoo, contracheque. FAB já existe.
- Entrega em 6 ondas, executar todas.

## Faseamento (ver §13 da spec)
- [x] Onda 0 , Fundação , COMPLETA (PR #156). 46 testes, tsc 0.
- [x] Onda 1 , Vendas (C) , SUBSTANCIALMENTE COMPLETA: C2/C3/C4/C5/C6/C7/C8-9/C10
      ligados no dado real + Mapa + comparativo. E2E ok. Falta margem estimada+freshness.
- [x] Onda 2 , Pedidos & Entregas (B) , SUBSTANCIALMENTE COMPLETA: queries demandas
      (pedidos.ts: B2/B4/B6) + queryContasAReceber (B3). Tela /diretoria/pedidos:
      KPIs (pendentes 608, a entregar R$146M, atrasadas 109, a receber) + mapa de
      demandas por UF + tabela pendentes. E2E ok. Falta B5 drill-in, B7 maquinas, B8.
- [x] Onda 3 , Estoque & Compras (A) , SUBSTANCIALMENTE COMPLETA: queries proprias
      (estoque.ts: A4 indicadores, A2 por local, A5 familia/marca, A8 compras por
      fornecedor). Tela /diretoria/estoque. E2E ok (estoque R$49M, 28829 itens,
      1894 produtos, 68 locais; JOHNSON domina). Falta A3 catalogo, A6 seriais
      (fato_serial), A7 compras ativas (fato_compra) , gaps de dado (builders).
- [x] Onda 4 , Visao geral executiva , COMPLETA: tela /diretoria/visao-geral com
      KPIs globais (faturamento/a receber/a pagar/estoque/demandas) + mapa em
      destaque (VendasMapaComparativo) + atalhos drill-in gated por capability.
- [x] Onda 5 , Agenda , COMPLETA: schema DiretoriaEvento* (SQL cirurgico), server
      actions listar/criar/excluir (gated, TDD), calendario mensal com 8 tipos de
      evento + navegacao de mes + criar/excluir. Falta colaboradores/anexos na UI.
- [x] Onda 6 , RBAC na tela de Usuarios , COMPLETA: action updateUserDiretoriaAccess
      (gated, TDD) + getUserDiretoriaAccess; componentes uf-picker (novo) e
      diretoria-access-step; DiretoriaAccessDialog; botao "Acesso a Diretoria" na
      lista de usuarios (/usuarios). Optou-se por dialog dedicado em vez de
      refatorar o stepper critico de user-form-dialog (mais seguro; usuario detalha
      defaults finos depois). super_admin nao precisa (bypass).

### TODAS AS 6 ONDAS ENTREGUES (2026-06-28). 86 testes verdes, tsc 0. PR #156.
### Refinos JA FEITOS pos-ondas: margem ESTIMADA (Vendas, KPI) + freshness
    ('atualizado ha X') nos headers das 4 telas (helper ultimaSyncIso + FreshnessBadge).
    + Bug do nav serializavel server->client CORRIGIDO (icone reanexado no client).

### BUILDERS aprovados pelo usuario (2026-06-28):
- [x] A6 SERIAIS , COMPLETO: model FatoSerial (SQL cirurgico), builder
      src/worker/fatos/fato-serial.ts (chunks+select data, evita OOM; populou
      8699 reais), registrado em registry.ts, querySeriais em estoque.ts, secao
      "Seriais em estoque" na tela /diretoria/estoque. tsc 0, pushed.
      NOTA: muitos seriais tem valor_custo=0 e data_compra null no raw (dado do
      Odoo); a tabela mostra o que existe.
- [x] A7 COMPRAS ATIVAS , COMPLETO (commit fc1ec74d, pushed). model FatoCompra
      (SQL cirurgico) de raw_pedido_documento onde tipo="compra"; builder
      fato-compra.ts (chunks+select data) + registry; queryComprasAtivas em
      estoque.ts; secao "Compras ativas" na tela /diretoria/estoque (3 KPIs +
      tabela com pilula de prazo). E2E dado real: 24 compras ativas, R$14,35M.
      ACHADO IMPORTANTE: compras = tipo="compra" (so 24 reg); "nao recebida" =
      estoque_finalizado=false; "cancelada" = finaliza_pedido_cancelando=true.
      data_prevista vem SEMPRE false no Odoo (sem previsao nas OCs) -> contagem
      regressiva fica null/"sem previsao" (a logica diasRestantes/statusPrazo ja
      esta wired p/ quando houver data). fornecedor = participante_id. 64 testes.
- [x] A3 CATALOGO , COMPLETO (commit 921fad31). queryCatalogoEstoque (agrega
      fato_estoque_saldo por produto) + secao "Modelos do catalogo" na tela Estoque.
      E2E: 1894 modelos, R$49,4M.
- [x] B5 DRILL-IN , COMPLETO (commit 974633ec). PedidosPendentesTable (client):
      linha clicavel -> painel com KPIs do pedido (valor/UF/etapa/prazo). Sem schema.
- [x] AGENDA COLABORADORES , COMPLETO (commit 7b566e25). actions colaboradorIds +
      listarColaboradoresElegiveis; chips no form + contador/tooltip no calendario.
- GAPS HONESTOS (sem fonte/infra, NAO bloqueiam):
  - B7 %reservado: campo "reservado" nao existe no Odoo (sem fonte). Pular.
  - AGENDA ANEXOS: schema pronto (DiretoriaEventoAnexo) mas falta infra de
    upload/storage (sem backend de arquivos). Fica para quando houver storage.
- Refinos opcionais restantes (Vendas): C7 itens vendidos, C8/C9 comparativo no mapa,
  margem estimada por item. B8 itens vendidos em pedidos ativos. A4 tempo de cobertura.
- App rodando em localhost:3000 (agente up / pid em /tmp/diretoria-dev.log).
- NAO MERGEAR sem autorizacao. PR #156.
Refinos pendentes (nao bloqueiam): margem estimada (Vendas), B5 drill-in/B7 maquinas/
B8 (Pedidos), A3 catalogo/A6 seriais/A7 compras-ativas (Estoque, precisam builders
fato_serial/fato_compra), colaboradores+anexos na UI da Agenda, FreshnessIndicator
nos headers, validacao visual no browser, e rebuild do worker p/ testar sync E2E.
NAO FAZER MERGE sem autorizacao do usuario.
  - queries em `src/lib/diretoria/queries/vendas.ts` (TDD, mock prisma):
    - [x] C10 queryFormasPagamento (fato_pedido_parcela.formaPagamentoNome)
    - [x] C4 queryVendasPorMarca (nf_item -> fato_produto.marcaNome, entradaSaida=1)
    - [x] C3 queryVendasPorUf (nf saida autorizada -> fato_parceiro.uf, UF-scoping)
    - [x] C6 queryModalidadesEMaiorPedido (fato_pedido.operacaoNome + maior pedido)
    - [x] C2 queryIndicadoresVendas (faturamento/ticket/nº pedidos)
    - [ ] margem ESTIMADA: seção própria (nf_item -> fato_produto.preco_custo)
    - [ ] C5 ranking vendedor (reusar queryPedidosPorVendedor de comercial.ts)
    - [ ] C7 itens vendidos (reusar queryProdutosFaturados de fiscal.ts)
    - [ ] C8/C9 comparativo: feito no componente reusando queryVendasPorUf c/ 2 ufs
  - [x] MAPA DO BRASIL: src/components/diretoria/brazil-map/ (7 testes verdes)
        usa @svg-maps/brazil (dep commitada); choropleth roxo; hover/tooltip/
        ranking; seleciona 2 UFs (onSelect) p/ C8/C9; reduced-motion; a11y.
        API: <BrazilMap data={{uf,valor,label?}[]} metric onSelect maxSelection formatValor/>
  - [x] DiretoriaPeriodBar (src/components/diretoria/diretoria-period-bar.tsx):
        pílulas dos 10 presets + custom (de/ate), escreve na URL. PRONTO.
  - [x] SyncNowButton (src/components/diretoria/sync-now-button.tsx): gated,
        cooldown 30s, router.refresh. PRONTO.
  - [~] Tela /diretoria/vendas , v1 PRONTA (KPIs C2 + Mapa C3 + período + sync).
        FALTA adicionar seções: C4 vendas por marca (BarChart), C10 formas de
        pagamento (PieChart/donut), C6 modalidades + maior pedido, tabela de
        pedidos/vendedores (C5), C7 itens vendidos, comparativo C8/C9 (ligar
        onSelect do BrazilMap a 2 UFs), margem ESTIMADA (nf_item x preco_custo),
        e o FreshnessIndicator no header. Componentes de chart: usar Recharts
        direto (client) ou @/components/charts (KPICard/ChartCard/BarChart/
        PieChart/DataTable). Cada seção é um client component que recebe os dados
        do server (page.tsx) , as queries ja existem em queries/vendas.ts.
  - [ ] C5 ranking vendedor (reusar queryPedidosPorVendedor de comercial.ts) +
        C7 itens (reusar queryProdutosFaturados de fiscal.ts)
  - [ ] E2E contra dado real: npm run dev:fresh, abrir /diretoria/vendas logado
        (super_admin), conferir numeros por UF (mapa)/marca/pgto. Rebuild worker
        (docker compose build app && up -d --force-recreate worker) p/ testar sync.

### Estado geral (commitado + pushed, PR #156)
- Onda 0 COMPLETA. Onda 1: dados (C2/C3/C4/C6/C10) + Mapa do Brasil + period bar +
  sync button + tela Vendas (KPIs+mapa+marca+pagamentos). ~67 testes diretoria, tsc 0.
- Componentes prontos reusaveis: BrazilMap, DiretoriaPeriodBar, SyncNowButton, vendas-charts.
- API BrazilMap: data={{uf,valor,label?}[]} metric onSelect maxSelection formatValor.

### E2E contra dado real FEITO (2026-06-28) , achados
- queryVendasPorUf/Marca/FormasPagamento/Indicadores rodadas contra o banco real.
- BUG CORRIGIDO: fato_parceiro.uf guarda o NOME ("Sao Paulo (BR)"), nao a sigla.
  Criado src/lib/diretoria/uf.ts (siglaDeUf) e aplicado. Mapa agora casa as UFs.
- Numeros reais (periodo 2025-2026): faturamento ~R$364M, 2122 pedidos, ticket ~171k.
  Top UF: SE/AL/MS/DF/MG. Top marca: MATRIX domina. Pgto: Boleto lidera.
- ATENCAO p/ investigar: ~33% do faturamento sem UF resolvida ("??", R$120M).
  Pode ser participanteId sem match em fato_parceiro OU parceiros sem uf. O mapa
  ja filtra "??". Verificar se e perda real de cobertura (regra verdade-vs-dado).
- margem ESTIMADA ainda NAO implementada (precisa nf_item x fato_produto.preco_custo).

### Tela de Vendas , estado (substancialmente completa, dado real)
- [x] C2 KPIs (faturamento/pedidos/ticket) , [x] C3 Mapa do Brasil por UF
- [x] C4 vendas por marca (bar) , [x] C10 formas de pagamento (donut)
- [x] C6 modalidades + maior pedido , [x] C5 ranking de vendedores (tabela)
- FALTA (refino da Onda 1): C7 itens vendidos (queryProdutosFaturados de fiscal.ts);
  C8/C9 comparativo (ligar onSelect do BrazilMap a 2 UFs -> 2 cards client);
  margem estimada (nova query nf_item x fato_produto.preco_custo, rotulo "estimada");
  FreshnessIndicator no header; validacao visual no browser.
- LICAO: husky/lint-staged ABORTA o commit se houver arquivo modificado nao-staged
  junto. SEMPRE `git add` todos os arquivos relacionados e CONFERIR o hash do commit
  (nao confiar em echo). Ex: commit C6 tela falhou silenciosamente e foi refeito.

### Proximas ondas (ordem fixa, sem pausar entre elas)
- Onda 2 (Pedidos & Entregas/B): B1/B2 pendentes (cliente+UF), B3 a receber
  (queryContasAReceber pronta), B4 mapa de demandas (reusa BrazilMap), B5 drill-in,
  B7 disponivel (reservado=gap). Reusar padrao da tela de Vendas + BrazilMap.
- Onda 3 (Estoque & Compras/A): reusar 6 queries de estoque; criar fato_serial (A6)
  e fato_compra (A7/A8) de raw; config estoque ideal + alertas.
- Onda 4 (Visao geral): KPIs globais + mapa em destaque + drill-in + YoY.
- Onda 5 (Agenda): schema novo (DiretoriaEvento*) via SQL cirurgico + CRUD + calendario.
- Onda 6 (RBAC usuarios): etapa Diretoria no stepper de user-form-dialog + uf-picker
  novo + updateUserDiretoriaAccess. super_admin sem etapa (bypass).
- NAO FAZER MERGE (so com autorizacao do usuario). Pode abrir/atualizar PR #156.
- [ ] Onda 2 , Pedidos & Entregas (módulo B)
- [ ] Onda 2 , Pedidos & Entregas (módulo B)
- [ ] Onda 3 , Estoque & Compras (módulo A)
- [ ] Onda 4 , Visão geral (home executiva)
- [ ] Onda 5 , Agenda
- [ ] Onda 6 , RBAC Diretoria na tela de Usuários

## Verdade do dado (banco dev, 2026-06-28)
- Populado: fato_pedido 2122, fato_nota_fiscal 11521, fato_nota_fiscal_item 54806,
  fato_pedido_parcela 3224, fato_parceiro 7234, fato_produto 3818,
  fato_estoque_saldo 3904, fato_financeiro_titulo 6767, fato_dfe 10581.
- Vazio: fato_comissao, fato_cotacao(1), raw_crm_pipeline. Seriais em
  raw_sped_produto_lote_serie (8721); compras em raw_pedido_documento (2184).
- Gaps: margem (só aproximada via precoCusto), hierarquia 5 níveis (só vendedor
  plano), reservado (não existe), seriais/compras-ativas (builder de raw).
- Campos: forma de pagamento = `formaPagamentoNome`; UF via participanteId→FatoParceiro.uf.
- Queries prontas: C5, C7, B3, A8-nota. Criar: C3, C4, C6, C8/C9, C10, B2.
- Componentes: period-navigator existe (não wired); export-csv existe; só 4 presets.

## Status atual
- [x] Inventário forense do HTML
- [x] Spec v1 → 2 reviews → verificação de dado real → v2 → convergência → v3 (commitada)
- [x] Plano da Onda 0 + review adversarial + correções (commitado)
- [~] Onda 0 em execução (TDD, commits atômicos):
  - [x] Task 1: models RBAC (db via SQL cirúrgico, NÃO db push) , commit
  - [x] Task 2: capabilities.ts (6 testes verdes) , commit
  - [x] Task 3: access.ts (7 testes verdes) , commit
  - [x] Task 4: nav na sidebar + resolvido no layout server (4 testes verdes) , commit
  - [x] Task 5: rotas e shell das 5 telas com guards , commit
  - [x] Task 6: resolverPeriodoDir, 10 presets do HTML (9 testes) , commit
        (componente visual DiretoriaPeriodBar movido p/ Onda 1, junto da 1ª tela)
  - [x] Task 7: helpers cores/delta/status (8 testes) , commit
        (paleta CSS exata fica na Onda 1 com ui-ux-pro-max)
  - [x] Task 9-11: sync manual isolado JOB_ONDEMAND (12 testes) , commit
        (botão visual SyncNowButton movido p/ Onda 1, junto do header real)
  - [x] Task 12: status dos fatos no cache , doc em research/
  - [~] Task 8: spike Mapa do Brasil , MOVIDO para o início da Onda 1
        (UI complexa; construir inline com ui-ux-pro-max + validar perf com dado
        real de UF na tela de Vendas C3, em vez de mock + revalidação)
- TOTAL Onda 0: 46 testes verdes, tsc 0 erros. Fundação completa (RBAC, nav,
  telas, período, cores, sync). Falta: validação visual no dev + PR.
- PRÓXIMA AÇÃO: validar visual no dev (menu aparece, telas abrem, gating);
  depois abrir PR da Onda 0; depois Onda 1 (Vendas), começando pelo Mapa do Brasil.

## Pendências técnicas para a verificação/validação
- Rebuild do worker (toquei src/worker/**): `docker compose build app && docker
  compose up -d --force-recreate worker` antes de testar o sync E2E.
- Validar no dev: item Diretoria na sidebar (super_admin 5 itens; viewer 1);
  /diretoria redireciona; guards redirecionam por área; telas abrem com header.
- Componentes movidos p/ Onda 1: DiretoriaPeriodBar (visual), SyncNowButton, Mapa.

## Notas de execução importantes
- Banco dev compartilhado tem DRIFT da worktree feat/nex-reconstrucao (tabelas
  builder_*/saved_reports). NUNCA `prisma db push` (dropa o trabalho dela). Aplicar
  schema novo via SQL cirúrgico (`prisma db execute`), como feito na Task 1.
- Prisma v7: db execute/migrate diff mudaram de sintaxe (sem --schema/--from-url;
  usar --from-config-datasource / --to-schema; db execute lê do prisma.config.ts).
- Convenção do schema: `@db.Uuid` + `@map` snake_case nas colunas.
- husky pre-commit roda eslint nos arquivos staged; manter sem warnings.

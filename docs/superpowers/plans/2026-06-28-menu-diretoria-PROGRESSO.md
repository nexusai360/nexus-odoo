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
- [~] Onda 1 , Vendas (módulo C) , EM ANDAMENTO:
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

### FALTA na tela de Vendas (proximo)
- C6 modalidades + maior pedido (query pronta: queryModalidadesEMaiorPedido) , card
- C5 ranking vendedores (queryPedidosPorVendedor de comercial.ts) , tabela paginada
- C7 itens vendidos (queryProdutosFaturados de fiscal.ts)
- C8/C9 comparativo: ligar onSelect do BrazilMap a 2 UFs -> 2 cards lado a lado
- margem estimada (nova query) + FreshnessIndicator no header
- Validacao visual no browser (npm run dev:fresh, logar super_admin, /diretoria/vendas)
Depois: Onda 2 (Pedidos/B), 3 (Estoque/A), 4 (Visao geral), 5 (Agenda), 6 (RBAC usuarios).
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

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
- [ ] Onda 0 , Fundação (nav, access RBAC, models, periodbar, mapa spike, sync, cores)
- [ ] Onda 1 , Vendas (módulo C)
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
- [x] Spec v1 → 2 reviews adversariais → verificação de dado real → v2 → review de
      convergência → v3 (commitada)
- [ ] Plano da Onda 0 (writing-plans) → 2 reviews → execução TDD
- PRÓXIMA AÇÃO: criar o plano detalhado da Onda 0 (cadeia: models→access→guards→
  nav→rotas/shell; tracks paralelos: periodbar, cores, mapa spike, sync, fatos).

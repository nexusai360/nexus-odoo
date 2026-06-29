# PROGRESSO , Diretoria v2 (reconstrução + construtor de relatórios)

> Ponto de retomada da RECONSTRUÇÃO (a v1 foi rejeitada pelo cliente por cobrir
> ~2% do HTML). Branch `feat/menu-diretoria` (worktree branches/feat-menu-diretoria),
> PR #156. Modo autônomo aprovado ("manda bala"). NÃO mergear sem autorização.
> Regra de contexto: aviso 80%+ -> wrap-up + `agente handoff`.

## Estado (2026-06-28)
- [x] PERÍCIA forense COMPLETA do HTML (18.971 linhas). 7.248 linhas de perícia.
      Índice: `docs/superpowers/specs/pericia-html/MESTRE/00-INDICE.md` (+ caps
      01-07). Auditoria linha a linha em `pericia-html/audit/`. APROVADA pelo cliente.
- [x] VISÃO consolidada: `docs/superpowers/specs/2026-06-28-diretoria-v2-VISAO.md`.
- [x] SPEC v3 (v1 + 2 reviews adversariais): `2026-06-28-diretoria-v2-SPEC.md`
      (+ review-1-completude, review-2-arquitetura). Decisões-chave:
      grid por CSS-grid (span, sem x/y); ReportContext p/ interações; RBAC 2
      níveis por interseção (gating server); tabelas de config próprias; período
      enxuto; fonteDado = nosso cache.
- [x] PLAN Onda 1 v3 (v1 + 2 reviews): `plans/2026-06-28-diretoria-v2-onda1-plan.md`.
- [~] IMPLEMENTAÇÃO Onda 1 em andamento (TDD, commits atômicos):
  - [x] T1 catálogo de componentes (catalogo.ts) , travas por tipo, capability por área. 5 testes.
  - [x] T2 normalização de layout (layout.ts) , clamp às travas + spans. 7 testes.
  - [x] T3 schema DiretoriaRelatorio + Bloco (SQL cirúrgico, índices únicos parciais). client regen.
  - [x] T4 carregarLayout (layout-repo.ts) , usuário > padrão. 3 testes.
  - [x] T5 loaders + resolverBlocos (loaders.ts) , dedupe + allSettled. 3 testes. A-01..A-04 reusam queries de estoque.
  - [x] T6 GridRelatorio + BlocoCard (CSS grid 12col/auto-rows span, responsivo via
        custom props, selo de fonte). src/components/diretoria/builder/grid-relatorio.tsx.
  - [x] T7 render-componente (A-01 KPIs, A-02 tabela, A-03/A-04 barras CSS, server).
  - [x] T8a gating (filtrarPermitidos, função pura). 3 testes.
  - [x] T8b seed idempotente (scripts/seed-diretoria-relatorio.ts), tela "estoque-demo" 4 blocos 2x2.
  - [x] T8c página /diretoria/relatorios (monta o layout, gating server, sem regredir telas atuais).
  - ONDA 1 COMPLETA: 21 testes builder verdes, tsc 0. E2E dado real ok (A-01 R$49,4M/28829
        itens/1894 produtos/68 locais; A-03 top JOHNSON; A-04 top MATRIX). Rota compila (302).
  - VALIDAÇÃO VISUAL no browser (logado) pendente p/ o usuário: localhost:3000/diretoria/relatorios.

## FOCO ATUAL (decisão do cliente): tela ESTOQUE & COMPRAS fiel e completa
> Reconstruir /diretoria/estoque (no menu, fluxo normal) fiel ao HTML. Roteiro =
> perícia MESTRE/03-estoque.md + 04-compras.md. VALIDAR CADA PASSO POR SCREENSHOT
> (playwright instalado --no-save; user de teste render-check@local.test senha
> Teste@12345 super_admin, criar/deletar via tsx; screenshot via chromium em
> /tmp). NUNCA entregar sem ver o screenshot (lição: entreguei prévia pobre 2x).
- [x] Mapa do Brasil CONTIDO (brazil-map.tsx altura clamp; corrige "mapa gigante"). commit 7054c0b4
- [x] Donuts interativos A5 (família + marca) na tela de estoque (DonutChart SVG,
      hover/legenda/total, cores). Validado por screenshot. commit fb9c69c5
- [ ] A4 indicadores completos: valor médio/produto, qtd média/local, IDADE MÉDIA,
      TEMPO DE COBERTURA (precisa query nova; ver 03-estoque fórmulas cobertura=estoque/demanda*30).
- [ ] A7 detalhe da compra: lista de OCs + itens (4 col) + 10 KPIs + contagem
      regressiva + 2 donuts (ver 04-compras). Hoje só há "compras ativas" tabela.
- [ ] A8 resumo de compras: 6 KPIs + ranking fornecedores + MATRIZ 11 colunas +
      alertas (ver 04-compras). Hoje só "compras por fornecedor" tabela simples.
- [ ] A3 estoque ideal (config + alertas de cobertura) , tabela diretoria_config_estoque_ideal.
- [ ] A6 seriais , já existe; pode polir.
- Depois que a tela Estoque&Compras estiver fiel/completa e o cliente aprovar por
  screenshot: replicar padrão (donuts/KPIs ricos) nas demais telas + retomar ondas 3-8.

## ONDA 2 em andamento (componentes de dado)
- [x] Vendas: C-01 (KPIs+margem est.), C-02 (por estado), C-03 (por marca), C-05
      (modalidades+maior pedido), C-07 (formas de pagamento) , no catálogo+loaders+render,
      reusando queries/vendas.ts. E2E real: fat R$364M, margem 33,4%, top SE/MATRIX/Boleto.
      Vitrine 'estoque-demo' agora tem 9 blocos (estoque+vendas). tsc 0, 21 testes.
- [ ] PRÓXIMO Onda 2: C-04 (pedidos fechados) e C-06 (itens) , precisam query nova;
      Demandas B-01..B-07 (reusar queries/pedidos.ts + BrazilMap p/ B-03); Estoque A-05..A-08;
      Compras K-01..K-06 (reusar FatoCompra); G-01 KPIs executivos. ReportContext (período/uf).
      Depois Onda 3 (mapa definitivo), 4 (editor), 5 (RBAC nível 2), 6 (agenda), 7 (configs), 8 (polimento).
- NOTA: gráficos atuais são barras CSS server (consistentes); charts ricos/recharts e o
      mapa interativo entram no refino/Onda 3. Validação visual no browser pendente p/ o usuário.

## Catálogo de componentes (índice próprio)
A=Estoque, K=Compras, B=Demandas, C=Vendas, G=Visão geral. Ver SPEC §5.

## Modelo de permissões (decisão do cliente)
- Nível 1 GLOBAL: tela de Usuários (acesso ao menu e áreas amplas). Reusa RBAC
  atual (UserDiretoriaAccess); estender p/ papel + capabilities (Onda 5).
- Nível 2 FINO: submenu "Permissões" dentro da Diretoria (por tela/seção/
  componente), por interseção (nunca amplia o nível 1). Será teste-e-erro.

## Ondas (SPEC §12) , faseamento
1. Infra do construtor (catálogo, normalização, schema, registry, render, gating)
   , protótipo na VISÃO GERAL (não mexer no Estoque/Vendas p/ não regredir).
2. Componentes de dado + mapa (A*/K*/B*/C*/G*), ReportContext.
3. Mapa definitivo (tooltip confinado/tracking/glow).
4. Editor de layout (@dnd-kit + packing CSS; paleta; salvar).
5. RBAC nível 2 (submenu Permissões; estender nível 1).
6. Agenda interativa (cap 02).
7. Configs de negócio (estoque ideal A-06; alertas K-05).
8. Polimento (selos de fonte, responsivo, reduced-motion, saneamento).

## Lembretes técnicos
- Banco dev compartilhado: SQL cirúrgico (NUNCA db push; drift nex-reconstrucao).
- Sem Map server->client (RSC não serializa; bug já visto, commit 387dfadb).
- HTML-fonte: ~/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html
- App dev em localhost:3000 (npm run dev:fresh corrige client desatualizado).
- O que já existe e deve ser reusado: queries/{vendas,estoque,pedidos}.ts,
  brazil-map/, charts, diretoria-period-bar, freshness, agenda-calendar,
  FatoCompra, fato-serial, RBAC Onda 0 (capabilities/access).

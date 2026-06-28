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
  - [ ] T6 GridRelatorio + BlocoCard (CSS grid 12col/auto-rows, span; selo de fonte). UI inline ui-ux-pro-max.
  - [ ] T7 render-componente (id -> componente React com dado plano). A-01..A-04.
  - [ ] T8a gating (filtrarPermitidos, função pura + teste).
  - [ ] T8b seed do layout padrão (script idempotente).
  - [ ] T8c página montada + validação E2E no browser (PROTOTIPAR sem regredir telas atuais).
  - TOTAL builder até agora: 18 testes verdes, tsc 0. Arquivos em src/lib/diretoria/builder/.
  - NOTA: a parte de DADOS/lógica (T1-T5) está pronta e testada; falta o RENDER visual
    (T6-T8), que é UI inline (ui-ux-pro-max) + validação no browser , fazer com contexto fresco.

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

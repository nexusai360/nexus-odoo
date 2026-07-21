# STATUS , ponto de retomada

Branch ativa: **`feat/entregas-parciais-base-calculo`** (LOCAL, nada em produção).
Dev local no ar em `localhost:3000` (containers `db`+`redis` up; Docker reiniciado/destravado em 2026-07-21).

## Onde estamos (2026-07-21)

**Tabela avançada do B-09 (Entregas Parciais) , réplica da tabela do ERP Nexus , ENTREGUE e no ar.**

Perícia completa do código-fonte do ERP Nexus + tabela rica e genérica portada
para `src/components/tabela-avancada/`, ligada no B-09
(`src/components/diretoria/blocos/blocos-pedidos.tsx`), substituindo o DataTable
antigo. As outras 7 telas seguem no `data-table.tsx` antigo. Tudo client-side.

Recursos: busca grande + inteligente por facets; UM "Filtros e agrupar" (presets
+ filtro E/OU aninhado com busca de campo + agrupar multinível + favoritos);
agrupamento com subtotais; multi-sort; seletor de colunas (buscar + reordenar por
arraste + coluna travada) na TOOLBAR; redimensionar (drag + duplo-clique);
compacto; exportar CSV; paginação corrigida; views Lista + Kanban (por dimensão
selecionável, com busca por coluna) + Calendário (Dia/Semana/Mês); tela de
detalhe do pedido (destaque no número, campos por largura, observações em bloco,
filtro por número + navegar); persistência por tela (localStorage).

### Entregue e validado (screenshots, 0 erros de runtime, tsc/eslint verdes):
- Ondas 0-5 (portagem completa) , commits 3681614f, 0e6056bc, 735fdd81.
- 6 ajustes do dono , 643c9e88 (altura grid até 12, fonte cabeçalho, seletor de
  colunas na toolbar) e 18594c0d (calendário Dia/Semana/Mês, kanban por dimensão,
  detalhe do pedido).
- Calibração (2a rodada) , fd660b74 (calendário: "Sem registro" nos dias vazios,
  tela de dia vazio, range com hífen, cabeçalho reorganizado período-central +
  seletor à direita + "Hoje" removido; DETALHE redesenhado com número em
  destaque, campos por detalheSpan, filtro por número do pedido).

## Docs de referência
- Perícia + decisões: `docs/superpowers/research/2026-07-20-pericia-tabela-erp-nexus-replicar-b09.md`
- PROGRESSO detalhado: `docs/superpowers/plans/2026-07-21-PROGRESSO-tabela-avancada-b09.md`
- Histórico: `docs/agents/HISTORY.md` (linhas de 2026-07-20 e 2026-07-21).

## PRÓXIMA AÇÃO
Aguardando o dono avaliar no browser e (a) pedir novos ajustes finos , aplicar
inline (UI + ui-ux-pro-max) + screenshot de validação (usuário render:
`render-check@local.test` / `Teste@12345`; script playwright com
`channel:"chrome"`, playwright já instalado via `--no-save`); ou (b) autorizar o
MERGE para produção. **Nada vai para produção sem "sim" explícito do dono.**

## Regras vivas
- Commit na pasta principal fora da main exige `GIT_AGENTE_BYPASS=1` (todas as
  fases desta branch foram commitadas assim).
- Proibido travessão em qualquer texto. UI sempre inline + `ui-ux-pro-max`.
- Metodologia ágil (D0): planner -> 1 review -> planner v2 -> implementação -> perícia.

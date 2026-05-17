# STATUS — nexus-odoo

> Ponto de retomada entre sessões. Atualizado em 2026-05-17.
> Ao iniciar uma sessão: ler este arquivo e o `CLAUDE.md`. Modo autônomo.

## Onde estamos

- **F0 — Discovery:** ✅ mergeado na `main` (PR #1).
- **F1 — Fundação:** ✅ mergeada na `main` (PR #2).
- **F2 — Ingestão/cache:** ✅ CONCLUÍDA na branch `feat/ingestao`.
- **F3 — Dashboard de relatórios:** ✅ CONCLUÍDA na mesma branch `feat/ingestao`.
- **PR #4** (`feat/ingestao` → `main`) carrega **F2 + F3** juntas — a F3 foi
  construída sobre a F2 antes do merge da F2. Merge para `main` é decisão
  humana (dispara produção).

## F2 — entregue

Worker BullMQ + cron JSON-RPC sincronizando o Odoo Tauga para o Postgres cache:
`OdooClient` JSON-RPC, 79 tabelas `raw` JSONB, `SyncState`, sync engine
(incremental/snapshot/reconcile com isolamento de falha), `fato_estoque_saldo`,
tela `/configuracao` (super_admin). 78/79 modelos sincronizam (o restante,
`pedido.documento.historico.tempo`, é defeito do próprio Odoo).

## F3 — entregue (PLAN v3, 80 tasks, 7 blocos)

Infraestrutura do dashboard + 6 relatórios de estoque:
- **RBAC por domínio** (`ReportDomain`) em 3 camadas; tabela `UserDomainAccess`;
  etapa "Acesso" no modal de usuário (concessão de domínios).
- **3 fatos** novos/enriquecidos: `fato_estoque_saldo` (com valor/família/marca),
  `fato_estoque_movimento`, `fato_produto_parado`; builders no worker; tabela
  `FatoBuildState`. `estoque.extrato` migrado para `snapshot`.
- **5 templates de gráfico** (Recharts): KPICard, DataTable, BarChart, LineChart,
  PieChart, com estados preparando/vazio/erro.
- **Shell `/relatorios`** (grade por domínio) + `/relatorios/[id]` (relatório com
  filtros e freshness). 6 relatórios de estoque: saldo por produto/armazém, valor
  por armazém, entradas×saídas, produtos parados, top movimentados, concentração.
- Processo: spec v1→v2→v3 (2 reviews profundas) + plan v1→v2→v3 (2 reviews) +
  execução 80 tasks (subagentes Sonnet) + review por bloco (Opus) +
  `/gsd-code-review` e `/gsd-ui-review` finais (Opus) — todos os achados
  Críticos/Importantes corrigidos. 212 testes verdes; `tsc`/`lint`/`build` ok.

## Decisões registradas no período

- Protocolo Odoo: **JSON-RPC** (XML-RPC quebra). `CLAUDE.md` §5.8.
- Workflow: spec v1→v3 e plan v1→v3, cada um com 2 reviews profundas. `CLAUDE.md` §6.
- Subagentes: execução em **Sonnet**, review de bloco e review final em **Opus**.
- **F6 — Construtor de relatórios** registrada no roadmap (`CLAUDE.md` §4 +
  `docs/ideias/2026-05-16-construtor-relatorios.md`): config-driven, pós-F4.

## Ambiente

- Docker: `nexus-odoo` — `db` (Postgres 5436), `redis` (6380). `docker compose up -d db redis`.
- Banco migrado (última migration `20260517002300_f3_dashboard`) e com seed.
- Worker: `npm run worker` (carrega `.env.local`). Dev: `npm run dev` (porta 3000).
- Verificação: `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npx jest`.

## PARA RETOMAR (próxima sessão)

1. `feat/ingestao` é a branch ativa (F2 + F3). `git log` recente.
2. ✅ Fatos da F3 populados (ciclo de snapshot rodado em 2026-05-17):
   `fato_estoque_saldo` 3218, `fato_estoque_movimento` 12031,
   `fato_produto_parado` 1317. `fato_build_state` registrado.
3. **UAT visual (requer humano):** logar e validar os 6 relatórios no browser
   (`/relatorios`). Dev server na porta 3000; rotas respondem (302 → login, RBAC ok).
4. **Decisão humana:** merge do PR #4 (`feat/ingestao` → `main`, F2+F3 — CI verde).
5. Próxima fase: **F4 — MCP semântico** — começa por brainstorm (requer o usuário).

## Notas

- `.env.local` (gitignored) tem credenciais do Odoo e do owner.
- Specs/plans/reviews em `docs/superpowers/`. Pesquisa de relatórios em
  `docs/superpowers/research/`. Workflow canônico: `CLAUDE.md`.

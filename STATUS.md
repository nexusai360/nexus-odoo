# STATUS — nexus-odoo

> **Ponto de retomada entre sessões.** Atualizado em 2026-05-17.
> Ao abrir uma sessão: ler **este arquivo** e o **`CLAUDE.md`**. Modo autônomo
> é o padrão (ver `CLAUDE.md §6`).

---

## 1. Onde estamos

| Fase | Entrega | Status |
|---|---|---|
| **F0 — Discovery** | Mapa do Odoo (modelos/campos/relações) | ✅ mergeado na `main` (PR #1) |
| **F1 — Fundação** | App no ar, login, RBAC | ✅ mergeado na `main` (PR #2) |
| **F2 — Ingestão/cache** | Worker BullMQ + cron JSON-RPC + cache Postgres | ✅ mergeado na `main` (PR #4) |
| **F3 — Dashboard de relatórios** | 6 relatórios de estoque sobre o cache | ✅ mergeado na `main` (PR #4) |
| **F3.5 — Dashboard de relatórios v2** | Sofisticação no padrão `nexus-insights` | ✅ mergeado na `main` (PR #4) |
| **F4 — MCP semântico** | Servidor MCP, todos os domínios | ⬜ **PRÓXIMA — começa por brainstorm** |
| F5 — Integração WhatsApp | Agente conectado ao MCP | ⬜ futura |
| F6 — Construtor de relatórios | Wizard in-app guiado por IA | ⬜ futura (inclui o polimento fino dos relatórios) |

**Branch ativa: `feat/mcp-semantico`** (criada de `main`, já no remoto). A `main`
tem F0+F1+F2+F3+F3.5 — tudo em produção.

---

## 2. O que já foi entregue

### F2 — Ingestão/cache
Worker BullMQ + cron JSON-RPC sincronizando o Odoo Tauga para o Postgres cache:
`OdooClient` JSON-RPC, **79 tabelas `raw` JSONB**, `SyncState`, sync engine
(incremental/snapshot/reconcile com isolamento de falha), tela `/configuracao`
(super_admin). 78/79 modelos sincronizam (`pedido.documento.historico.tempo` é
defeito do próprio Odoo).

### F3 — Dashboard de relatórios
RBAC por domínio (`ReportDomain`, `UserDomainAccess`); **fatos de estoque**
(`fato_estoque_saldo`, `fato_estoque_movimento`, `fato_produto_parado`) +
builders no worker + `FatoBuildState`; motor declarativo (catálogo → render);
6 relatórios de estoque em `/relatorios`.

### F3.5 — Dashboard de relatórios v2 (milestone, sub-fases a–g)
Roadmap: `docs/superpowers/plans/2026-05-17-f3.5-roadmap.md`.
- **a — Charts v2:** animação, gradient, tooltip rico, `KPICard`, `ChartCard`.
- **b — Seletor de período:** `PeriodBar` (pílulas + calendário de meses
  travado à faixa de dado), estado na URL. Spec/plan v1→v3 em `docs/superpowers/`.
- **c — Tabela profissional:** ordenação multi-coluna com indicador numerado,
  busca em todas as colunas, linhas expansíveis (drill-down), exportar CSV.
- **d — Filtros:** dropdowns decentes (agrupados, com busca), chips de filtros
  aplicados, diálogo simples (facetas) + avançado (construtor E/OU recursivo,
  modelo puro `compilarFiltro`).
- **e — Presets, atalhos e tour:** `ReportPreset` (model + migration + Server
  Actions), atalhos de teclado, tour de onboarding reutilizável.
- **f — Relatórios repensados:** `valor-armazem` vira lista+KPIs, `entradas-saidas`
  ganha tabela de detalhe, `top-movimentados`/`produtos-parados` ganham
  KPIRow+DataTable, `concentracao` ganha tabelas por trás dos gráficos.
- **g — Frescor do dado:** snapshot do worker 1440→**30 min**;
  `FreshnessIndicator` ("Atualizado há X min", auto-refresh).
- Verificação final: `tsc`/`eslint`/`jest` (381) /`next build` verdes; CI verde.

> Pontos finos de relatório que ficaram para a F6 (decisão do usuário): a F3.5
> "melhorou bastante" mas não está 100% — o polimento fino é escopo da F6.

---

## 3. Metodologia (resumo — detalhe em `CLAUDE.md §6`)

Toda implementação percorre, **em modo autônomo automático** (sem pedir
permissão entre etapas):

```
[1] BRAINSTORM → SPEC v1            ← requer humano (entrada de requisitos)
[2] DESIGN UI/UX (ui-ux-pro-max)
[3] REVIEW SPEC #1 → SPEC v2        ← review crítica de verdade
[4] REVIEW SPEC #2 → SPEC v3        ← review ainda mais profunda
[5] PLAN v1 (sobre a SPEC v3)
[6] REVIEW PLANO #1 → PLAN v2
[7] REVIEW PLANO #2 → PLAN v3       ← tasks em microtarefas, decomposição máxima
[8] EXECUÇÃO (Superpowers; fase grande → subagentes Sonnet em paralelo)
[9] VERIFICAÇÃO (tsc/eslint/jest/build verdes; evidência antes de afirmar)
[10] CODE REVIEW + UI REVIEW (/gsd-code-review, /gsd-ui-review — Opus)
[11] /ultrareview                  ← requer humano (manual, opcional)
[12] DEPLOY ASSISTIDO              ← requer humano
```

- `ui-ux-pro-max` é **obrigatório** em tudo que for frontend.
- Subagentes: execução em **Sonnet**, reviews em **Opus**.
- Artefatos em `docs/superpowers/`: `specs/`, `plans/`, `reviews/`, `research/`.
- Git: nunca commitar na `main`; feature branch → PR → merge (decisão humana).

---

## 4. Ambiente

- Docker: `docker compose up -d db redis` — `db` (Postgres 5436), `redis` (6380).
- Banco migrado (Prisma) e com seed. `.env.local` (gitignored) tem credenciais
  do Odoo Tauga e do owner.
- Worker: `npm run worker`. Dev server: `npm run dev` (porta 3000).
  **Ambos estavam encerrados no fim desta sessão** — reabrir conforme necessário.
- Verificação: `npx tsc --noEmit`, `npx eslint src/`, `npx jest`, `npx next build`.

---

## 5. PARA RETOMAR — início da F4 (MCP semântico)

**Diga "vamos para a F4" numa sessão nova.** A F4 abre por **brainstorm**
(`requer humano`); o objetivo é a SPEC v1.

### Escopo da F4 — decidido pelo usuário (2026-05-17)

- **TODOS os domínios de negócio**, sem lista fixa. O MCP semântico cobre todo
  domínio que o Odoo expõe no cache — estoque, financeiro, fiscal, comercial e
  quaisquer outros. Registrado em `CLAUDE.md §4` e `§5.9`.
- Entregar **100% completo** nesta fase: servidor MCP (`@modelcontextprotocol/sdk`,
  TypeScript, container `mcp`), catálogo de tools de vocabulário de negócio,
  **RBAC estrutural de 7 camadas**, **Caminho 3** completo (3a falta honesta +
  log de gap; 3b recusa educada; 3c modo BI via Postgres MCP).
- Execução **multi-agente em paralelo**, segmentada; metodologia inteira
  (specs com 2 reviews, plans com 2 reviews, `/gsd-*` code/UI reviews).

### ⚠️ Achado de escopo crítico para o brainstorm da F4

O cache tem as **79 tabelas `raw`** sincronizadas, mas a camada de **fatos**
(`fato_*` — o dado de negócio consultável) **só existe para estoque**. Cobrir
"todos os domínios" no MCP exige **construir os fatos de financeiro, fiscal,
comercial e demais domínios** — isso é trabalho de ingestão (estilo F2) e
precisa ser dimensionado/decomposto no brainstorm e na spec da F4. A F4, na
prática, é: camada de fatos de todos os domínios **+** o servidor MCP por cima.

### Decisões canônicas que já valem para a F4 (ver `CLAUDE.md §5`)

Cache obrigatório; sem fallback JSON-RPC nas tools; tools semânticas validadas
(não text-to-SQL livre, exceto Caminho 3c); MCP próprio em TS; RBAC 7 camadas;
Postgres MCP (Crystal DBA) em dev/DBA; protocolo Odoo JSON-RPC.

---

## 6. Notas

- Specs/plans/reviews/research em `docs/superpowers/`. Workflow canônico e
  decisões: `CLAUDE.md`. Ideia da F6: `docs/ideias/2026-05-16-construtor-relatorios.md`.
- Modelagem de fatos: `docs/fatos-modelagem.md`. Git: `docs/git-workflow.md`.

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
| **F4 — MCP semântico (onda 1)** | Servidor MCP + estoque + financeiro | ✅ **implementada na `feat/mcp-semantico` — aguarda merge** |
| F4 — ondas seguintes | Domínios comercial/fiscal/contábil/produção + 3c funcional | ⬜ futuras (reusam a arquitetura) |
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

## 5. PARA RETOMAR — F4 onda 1 implementada, aguarda decisão humana

A **F4 onda 1 (MCP semântico — estoque + financeiro)** está implementada na
branch **`feat/mcp-semantico`** (86 commits sobre a `main`). O ciclo autônomo
`[1]→[10]` foi cumprido na íntegra. **Próximo passo é humano:** revisar e
decidir o merge para a `main` (e, opcionalmente, rodar `/ultrareview` antes).

### O que a F4 onda 1 entregou

- **Container `mcp/`** — servidor Node puro com `@modelcontextprotocol/sdk`,
  transporte Streamable HTTP (porta 3100), service token + `userId` por sessão.
- **Camada de fatos de financeiro** — `fato_financeiro_saldo/movimento/titulo`
  + builders no worker via **registry de builders** (os 3 de estoque migrados).
- **14 tools semânticas** — 6 de estoque (reusam o núcleo de query extraído da
  F3, sem divergência de números), 6 de financeiro, `registrar_lacuna` (3a),
  `bi_consulta_avancada` (3c stub gated a admin/super_admin).
- **RBAC estrutural** — catálogo filtrado por sessão, gate no handler, role
  Postgres `nexus_mcp` com GRANT mínimo, rate limit, `McpAuditLog`; camadas
  tenant/RLS preparadas e documentadas (tenant único).
- **Caminho 3** — 3a e 3b funcionais; 3c como contrato + stub (integração
  funcional do Postgres MCP é onda futura da F4).
- Verificação: `tsc` (raiz e mcp), `eslint`, `jest` (634 testes, 89 suites),
  `next build`, `docker compose build mcp` — todos verdes.

### Artefatos da F4

Specs/plans/reviews em `docs/superpowers/` (`2026-05-17-f4-*`,
`2026-05-18-f4-*`): SPEC v1→v3 (2 reviews), PLAN v1→v3 (2 reviews), 1 review
por onda + correções, code review final (`2026-05-18-f4-code-review-final.md`,
APROVADO COM RESSALVAS — ressalvas corrigidas).

### Escopo restante da F4 (ondas futuras)

Domínios comercial, fiscal, contábil, produção (fatos + tools, reusando a
arquitetura) e a **integração funcional do 3c** (Postgres MCP). Ver
`CLAUDE.md §5.9/§5.10`.

### Decisões canônicas da F4 (ver `CLAUDE.md §5`)

Cache obrigatório; sem fallback JSON-RPC nas tools; tools semânticas validadas;
MCP próprio em TS; RBAC 7 camadas; F4 ≠ F5 (WhatsApp/conversas/personalização
são F5 — decisão #10).

---

## 6. Notas

- Specs/plans/reviews/research em `docs/superpowers/`. Workflow canônico e
  decisões: `CLAUDE.md`. Ideia da F6: `docs/ideias/2026-05-16-construtor-relatorios.md`.
- Modelagem de fatos: `docs/fatos-modelagem.md`. Git: `docs/git-workflow.md`.

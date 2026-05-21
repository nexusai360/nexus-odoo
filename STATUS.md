# STATUS — nexus-odoo

> **Ponto de retomada entre sessões.** Atualizado em 2026-05-19.
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
| **F4 — MCP semântico** | Servidor MCP, **todos os domínios** + Caminho 3c funcional | ✅ **completa — mergeada na `main` (PR #5 + #6 + #7)** |
| **F5 — Integração WhatsApp** | Agente de IA por WhatsApp + chat in-app, Integrações, RAG | ✅ **mergeada na `main` (PR #9, commit `682b9a7`)** |
| **F4 Onda 2 — Escrita no MCP** | Capacidade de escrita no servidor MCP, gate por API Key com capabilities, painel Servidor MCP | 🔄 **Onda 0 (fundação) implementada na branch `feat/f4-onda2-mcp-escrita`** |
| F6 — Construtor de relatórios | Wizard in-app guiado por IA | ⬜ futura (inclui o polimento fino dos relatórios) |

**Branch ativa: `feat/f4-onda2-mcp-escrita`**. A `main` tem F0+F1+F2+F3+F3.5+F4+F5.

> ## ⚠️ RETOMADA — LEIA O HANDOFF DE CORREÇÕES
> A próxima sessão DEVE começar lendo **`docs/HANDOFF-2026-05-21-f4-onda2-correcoes.md`**.
> A F4 Onda 2 teve a UI **reprovada integralmente** pelo usuário e a escrita no Odoo
> **nunca foi testada de verdade**. O handoff de correções consolida tudo: o que está
> errado (UI do painel Servidor MCP, "Plugar MCPs" com conceito errado, documentação,
> 12 issues), as verificações já feitas (leitura Odoo OK; escrita não testada), o que
> pedir ao usuário (credenciais da base de teste) e a sequência: montar plano →
> double review → plan v3 → executar na sessão principal com Opus 4.7 + ui-ux-pro-max.
> **NÃO mergear o PR #10 antes das correções.** O handoff anterior
> (`HANDOFF-2026-05-21-f4-onda2-onda0.md`) descreve o estado da fundação.

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

## 5. PARA RETOMAR — F5 em execução (ondas 1–7 completas)

A **F4 (MCP semântico) está completa e na `main`** — PRs #5, #6, #7, #8.

A **F5 está em execução** na branch `feat/integracao-whatsapp`. Todas as 7 ondas
implementadas. Próximo passo: code review + UI review (`/gsd-code-review` e
`/gsd-ui-review`) → PR para `main`.

### F5 — Status das ondas

| Onda | Entrega | Status |
|---|---|---|
| **Onda 1** | Fundação de dados + núcleo do agente (schema, mcp-client, run-agent, conversation, llm stack) | ✅ completa |
| **Onda 2** | Cadastro de WhatsApp no usuário (campo phone, resolução número→usuário) | ✅ completa |
| **Onda 3** | Chat in-app (SSE, página `/agente`, config LLM/prompt, playground) | ✅ completa |
| **Onda 4** | Webhook receptor WhatsApp + processor BullMQ (inbound, HMAC, cloud-client) | ✅ completa |
| **Onda 5** | Consumo + playground (tela de consumo, histórico, playground com override de prompt) | ✅ completa |
| **Onda 6** | Menu Integrações (superadmin: Canais/WhatsApp, MCP, Webhooks, API, BI) | ✅ completa |
| **Onda 7** | RAG com pgvector (embed, searchKb, ingestão, integração ao prompt, UI de gestão de KB) | ✅ **completa (2026-05-19)** |

### Próximo passo

1. `/gsd-code-review` — auditoria de bugs, segurança, qualidade (Opus).
2. `/gsd-ui-review` — 6 pilares visuais nas telas novas (Opus).
3. Corrigir achados materiais.
4. Abrir PR `feat/integracao-whatsapp` → `main` (decisão de merge é humana).

### Artefatos da F5

- Spec v3: `docs/superpowers/specs/2026-05-18-f5-whatsapp-agente-spec.md`
- Plano v3: `docs/superpowers/plans/2026-05-18-f5-whatsapp-agente.md`
- Design: `docs/superpowers/research/2026-05-18-f5-ui-design.md`
- Runbook n8n: `docs/runbooks/n8n-whatsapp.md`

### O que a F4 entregou (33 tools no catálogo do MCP)

- **Container `mcp/`** — servidor Node puro `@modelcontextprotocol/sdk`,
  Streamable HTTP (porta 3100), service token + `userId` por sessão, RBAC
  estrutural (catálogo filtrado, gate no handler, role Postgres `nexus_mcp` com
  GRANT mínimo, rate limit, `McpAuditLog`).
- **Fatos** — estoque (3, da F3), financeiro (3), comercial (2: `fato_pedido`,
  `fato_pedido_parcela`), fiscal (2: `fato_nota_fiscal`, `fato_nota_fiscal_item`
  211k linhas), cadastros (`fato_parceiro`), contábil (`fato_conta_contabil`) —
  todos via registry de builders no worker.
- **33 tools semânticas** — 6 estoque, 6 financeiro, 5 comercial, 6 fiscal,
  3 cadastros, 2 contábil, 3 de domínio sem dado (RH/CRM/produção, respondem
  honestamente "domínio não operado"), `registrar_lacuna` (3a),
  `bi_consulta_avancada` (3c).
- **Caminho 3 completo** — 3a (log de gap), 3b (recusa), **3c funcional**:
  executor de SQL read-only embutido (role `nexus_mcp_bi`, guard AST via
  `pgsql-parser`, `default_transaction_read_only`, `statement_timeout`, LIMIT
  cap; rejeita DML/DDL/multi-statement; gated a admin/super_admin).
- Verificação: `tsc` (raiz e mcp), `eslint`, `jest` (837 testes), `next build`,
  `docker compose build mcp` — verdes.

### Domínios sem dado (informação do mapa de domínios)

RH e CRM existem no Odoo da Matrix mas têm **0 registros** — não são operados;
produção tem 1 registro; contábil só tem o plano de contas (sem movimento). As
tools desses domínios existem e respondem honestamente. Ver
`docs/superpowers/research/2026-05-18-mapa-dominios.md` e `docs/RADAR.md` R3.

### Atenção para o deploy da F4 (`docs/RADAR.md` R4)

O deploy assistido precisa, após `prisma migrate deploy`, (re)executar os
scripts de GRANT `prisma/sql/2026-05-17-mcp-role.sql` e
`prisma/sql/2026-05-17-mcp-bi-role.sql` — senão o MCP sobe com `permission
denied`.

### Artefatos da F4

`docs/superpowers/` — `2026-05-17-f4-*` (onda 1) e `2026-05-18-f4*` (completo):
specs v1→v3 (2 reviews cada), plans v1→v3 (2 reviews cada), review por onda,
code reviews finais, e research (`mapa-dominios`, `f4-completo-dominios`).

### Decisões canônicas da F4 (ver `CLAUDE.md §5`)

Cache obrigatório; sem fallback JSON-RPC; tools semânticas validadas; MCP
próprio em TS; RBAC 7 camadas; 3c é executor SQL embutido (revisão de §5.5/§5.7
registrada em 2026-05-18); F4 ≠ F5 (WhatsApp/conversas/personalização são F5).

---

## 6. Notas

- Specs/plans/reviews/research em `docs/superpowers/`. Workflow canônico e
  decisões: `CLAUDE.md`. Ideia da F6: `docs/ideias/2026-05-16-construtor-relatorios.md`.
- Modelagem de fatos: `docs/fatos-modelagem.md`. Git: `docs/git-workflow.md`.

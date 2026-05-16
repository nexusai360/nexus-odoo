# F3 — Dashboard de Relatórios — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar este plano task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** Construir o painel de relatórios do nexus-odoo — infraestrutura "um relatório" (catálogo declarativo, RBAC por domínio, templates de gráfico) + 6 relatórios de estoque lendo do cache da F2.

**Architecture:** Cada relatório = 4 camadas (fato tipado no cache → query de leitura server-side → componente visual → entrada no catálogo). Shell `/relatorios` filtrado pelos domínios do usuário. RBAC por domínio (`ReportDomain`), enforcement em 3 camadas. Gráficos em Recharts.

**Tech Stack:** Next.js 16, TypeScript, Prisma v7, Recharts, Jest. Worker BullMQ (builders de fato).

**Spec:** `docs/superpowers/specs/2026-05-16-dashboard-relatorios-design.md` (v3)

**Versão:** **PLAN v2** — incorpora a Review #1 do plano
(`docs/superpowers/reviews/2026-05-16-dashboard-plan-review-1.md`): 5 Críticos +
9 Importantes + 6 Menores aplicados. A **Review #2** fará a decomposição fina
em sub-steps TDD com código completo → PLAN v3 → execução.

## Correções da Review #1 já aplicadas nesta v2

- **C1:** o `$transaction` de `createUser` cobre **só** `user.create` +
  `userDomainAccess.createMany`. O `logAudit` (que escreve via `pgPool`, fora do
  Prisma) **permanece pós-commit, fire-and-forget** — a spec §4.4 dizia
  "$transaction envolvendo o AuditLog", o que é tecnicamente impossível com o
  `logAudit` atual; **o plano corrige a spec neste ponto** (atomicidade cobre os
  dados; o audit é best-effort, como já é hoje em todo o projeto).
- **C2:** Task 9 não "ajusta teste de contagem" (não existe) — verificação =
  `tsc` + `jest src/worker/catalog`.
- **C3:** dependência Task 9→11/13 anotada; estado de primeiro ciclo documentado.
- **C4:** indicador de freshness vira parte explícita da Task 23 (lê `SyncState`).
- **C5:** `relNome` trata `[id, false]` → `null`.
- **I2:** `ultimoBuildAt` deixa de ser coluna por linha do fato e passa a viver
  numa tabela **`FatoBuildState`** (uma linha por fato) — só assim a query
  distingue "builder nunca rodou" de "rodou e não produziu linhas".
- **I5:** o backfill de `UserDomainAccess` vai no **SQL da migration**, não no `seed.ts`.
- I1/I3/I4/I6/I7/I8/I9 e Menores: aplicados nas tasks correspondentes.

## File Structure

```
prisma/schema.prisma              MODIFICAR — enum ReportDomain; AuditAction.user_domains_changed;
                                  UserDomainAccess; FatoBuildState; FatoEstoqueMovimento;
                                  FatoProdutoParado; FatoEstoqueSaldo enriquecido
prisma/migrations/<ts>_f3_dashboard/migration.sql  CRIAR — inclui o INSERT..SELECT de backfill
src/worker/catalog/model-catalog.ts  MODIFICAR — estoque.extrato: incremental → snapshot
src/worker/fatos/
  odoo-relational.ts              CRIAR — helpers relId/relNome (trata [id,false])
  fato-build-state.ts             CRIAR — upsert do FatoBuildState pós-build
  fato-estoque-saldo.ts           MODIFICAR — enriquecer (vrSaldo, família, marca)
  fato-estoque-movimento.ts       CRIAR
  fato-produto-parado.ts          CRIAR
src/worker/sync/processors.ts     MODIFICAR — disparar os 2 builders novos
src/lib/reports/
  domains.ts                      CRIAR — ReportDomain helpers + RBAC por domínio
  guard.ts                        CRIAR — requireDomainAccess (camada 2)
  types.ts                        CRIAR — tipos relatório/seção/filtro
  catalog.ts                      CRIAR — catálogo dos 6 relatórios
  freshness.ts                    CRIAR — cálculo do "atualizado em"
src/lib/actions/
  domain-access.ts                CRIAR — server actions de concessão
  report-data.ts                  CRIAR — queries de leitura (1 por relatório)
  users.ts                        MODIFICAR — createUser transacional
src/components/charts/            kpi-card, data-table, bar-chart, line-chart,
                                  pie-chart, chart-states (CRIAR)
src/components/reports/
  report-filters.tsx              CRIAR — barra de filtros declarativa
  filter-controls/                CRIAR — seletores: produto, armazém, família,
                                  período, sentido, faixa-dias, busca
src/app/(protected)/relatorios/
  page.tsx, relatorios-grid.tsx   CRIAR — landing
  [id]/page.tsx, [id]/report-view.tsx  CRIAR — página de relatório
src/components/users/
  user-form-dialog.tsx            MODIFICAR — etapa "Acesso", stepper dinâmico
  access-step.tsx                 CRIAR
src/lib/constants/nav.ts          MODIFICAR — +item Relatórios
package.json                      MODIFICAR — +recharts
```

## Blocos

- **Bloco 1 — Schema & migration** (Tasks 1-5)
- **Bloco 2 — RBAC por domínio** (Tasks 6-9)
- **Bloco 3 — Fatos e builders** (Tasks 10-15)
- **Bloco 4 — Templates de gráfico** (Tasks 16-22)
- **Bloco 5 — Catálogo, freshness e queries** (Tasks 23-27)
- **Bloco 6 — Filtros, shell e páginas** (Tasks 28-33)
- **Bloco 7 — Etapa "Acesso" no modal** (Tasks 34-37)

> **Para a Review #2 (decomposição fina → PLAN v3):** cada task abaixo nomeia
> arquivos, contrato, dependências e verificação. A Review #2 deve quebrar em
> sub-steps TDD com código completo, com atenção às tasks marcadas **[DECOMPOR]**
> (escondem 3+ unidades). Ordem das tasks = topologia obrigatória da spec §3.5.

---

## Bloco 1 — Schema & migration

### Task 1: Helper de extração relacional do Odoo

**Files:** Create `src/worker/fatos/odoo-relational.ts` + test.
Contrato: `relId(v)` → `Array.isArray(v) ? v[0] : null`; `relNome(v)` →
`Array.isArray(v) && typeof v[1] === "string" ? v[1] : null` (**C5** — trata
`[id, false]`). Tipo `OdooM2O = [number, string | false] | false | null | undefined`.
TDD: `[14410,"X"]`, `false`, `undefined`, **`[14410, false]` → nome null**.
Commit: `feat(worker): helper de extração de campos relacionais do Odoo`.

### Task 2: Schema — enum ReportDomain, AuditAction, UserDomainAccess

**Files:** Modify `prisma/schema.prisma`.
`enum ReportDomain { estoque financeiro fiscal comercial }`; `+user_domains_changed`
em `AuditAction`; `model UserDomainAccess` (`id uuid`, `userId`, `domain`,
`grantedById` **coluna crua, sem `@relation` — decisão M1**, registrada),
`createdAt`, `@@unique([userId, domain])`, `@@index([userId])`, relação
`user @relation(...)` + inversa `domainAccess UserDomainAccess[]` em `User`.
Verificação: `npx prisma format`.
Commit: `feat(prisma): ReportDomain, AuditAction.user_domains_changed, UserDomainAccess`.

### Task 3: Schema — FatoBuildState e fatos [DECOMPOR]

**Files:** Modify `prisma/schema.prisma`.
- **`FatoBuildState`** (`fato String @id`, `ultimoBuildAt DateTime`,
  `@@map("fato_build_state")`) — **I2:** o sinal de "builder rodou" vive aqui,
  não nas linhas do fato; só assim a query distingue "preparando" de "vazio".
- `FatoEstoqueSaldo` enriquecido: `+vrSaldo Decimal?`, `+familiaId Int?`,
  `+familiaNome String?`, `+marcaId Int?`, `+marcaNome String?`; índices
  `familiaId`, `marcaId`; remover `/// PROVISÓRIO`. **Sem** `ultimoBuildAt` por
  linha (vai para `FatoBuildState`).
- `FatoEstoqueMovimento` (colunas spec §5.2; `odooId Int @id` — **M2:** PK só
  precisa ser única dentro de um snapshot, ok porque o builder faz rebuild
  completo; sem `ultimoBuildAt` por linha).
- `FatoProdutoParado` (colunas spec §5.3; `saldoHojeId Int @id`; sem `ultimoBuildAt`).
A Review #2 quebra em 1 task por modelo. Verificação: `npx prisma format`.
Commit: um por modelo na v3.

### Task 4: Migration F3 + backfill na migration (I5)

**Files:** Create `prisma/migrations/<ts>_f3_dashboard/`.
- `npx prisma migrate dev --name f3_dashboard` (pré-condição: DB dev no ar +
  `DATABASE_URL` no ambiente — **M5**).
- **Editar o `migration.sql` gerado** para acrescentar o backfill como SQL de
  dados: `INSERT INTO user_domain_access (id, user_id, domain, created_at)
  SELECT gen_random_uuid(), id, 'estoque', now() FROM users WHERE platform_role
  IN ('manager','viewer');`. Reaplicar via `prisma migrate reset` em dev para
  validar que o backfill roda junto.
- `npx prisma generate && npx tsc --noEmit`.
Commit: `feat(prisma): migration F3 com backfill do domínio estoque na migration`.

### Task 5: seed dev (opcional) e verificação do Bloco 1

**Files:** Modify `prisma/seed.ts` (apenas para reproduzir o estado em dev fresco).
`npx prisma db seed`; `npx tsc --noEmit`. Commit: `chore(prisma): seed dev do F3`.

---

## Bloco 2 — RBAC por domínio

### Task 6: `domains.ts` — modelo de domínios e RBAC

**Files:** Create `src/lib/reports/domains.ts` + test.
`REPORT_DOMAINS`, `ReportDomainId`; `visibleDomains(role, granted)`
(super_admin/admin → todos; demais → granted); `grantableDomains(role, granted)`
(super_admin/admin → todos; manager → granted; viewer → []).
TDD: 4 papéis × 2 funções. Commit: `feat(reports): domínios e regras de RBAC`.

### Task 7: server actions de concessão de domínio [DECOMPOR]

**Files:** Create `src/lib/actions/domain-access.ts` + test.
`getUserDomains(userId)`, `getMyDomains()`, `updateUserDomains(userId, domains)`.
`updateUserDomains`: guard de auth → valida via `canEditUser` (F1) +
`grantableDomains` → aplica diff em `UserDomainAccess` → `logAudit`
`user_domains_changed` com `{added, removed}` **pós-escrita, fire-and-forget**
(C1 — `logAudit` é `pgPool`, fora de transação). Verificar assinaturas reais de
`canEditUser`/`logAudit`. Review #2: 1 sub-task por função. Schema Zod dos domínios.
Commit: `feat(reports): server actions de concessão de domínio`.

### Task 8: `guard.ts` — enforcement na página (camada 2)

**Files:** Create `src/lib/reports/guard.ts` + test.
`requireDomainAccess(domain)`: usa `getMyDomains()` (**I9** — declara o uso) +
`visibleDomains`; `redirect("/relatorios")` se não tiver. Commit:
`feat(reports): guard de acesso a domínio para páginas`.

### Task 9: verificação do Bloco 2

`npx tsc --noEmit && npm run lint && npx jest src/lib/reports src/lib/actions/domain-access.test.ts`.

---

## Bloco 3 — Fatos e builders

### Task 10: `estoque.extrato` → snapshot (C2)

**Files:** Modify `src/worker/catalog/model-catalog.ts`.
Trocar `mode` de `estoque.extrato` para `snapshot`. **Não há teste de contagem
por modo para ajustar** — verificação: `npx tsc --noEmit && npx jest src/worker/catalog`.
Commit: `fix(worker): estoque.extrato passa a snapshot (write_date ausente)`.

### Task 11: `fato-build-state.ts` — registro de build

**Files:** Create `src/worker/fatos/fato-build-state.ts` + test.
`markFatoBuilt(prisma, fato)`: `upsert` em `FatoBuildState` com `ultimoBuildAt =
new Date()`. Usado por todos os builders. Commit: `feat(worker): registro de
estado de build de fato`.

### Task 12: enriquecer `fato-estoque-saldo` [DECOMPOR]

**Files:** Modify `src/worker/fatos/fato-estoque-saldo.ts` + test.
Builder carrega `Map` `produtoId → {familiaId,familiaNome,marcaId,marcaNome}` de
`raw_sped_produto` (via `relId`/`relNome` em `familia_id`/`marca_id`); por linha
de saldo extrai `vrSaldo` de `data.vr_saldo`, família/marca do Map; ao fim chama
`markFatoBuilt(prisma,"fato_estoque_saldo")`. **I8:** anotar dependência de
`raw_sped_produto` estar populado (ciclo incremental distinto); no 1º ciclo
família/marca podem vir null — tolerável, auto-corrige.
TDD: produto sem família → null; produto ausente do Map → null; `vrSaldo` zero
carregado; `markFatoBuilt` chamado.
Commit: `feat(worker): fato_estoque_saldo enriquecido`.

### Task 13: builder `fato-estoque-movimento` [DECOMPOR]

**Files:** Create `src/worker/fatos/fato-estoque-movimento.ts` + test.
**Depende da Task 10** (`estoque.extrato` em snapshot). `rebuildFatoEstoqueMovimento`:
lê `raw_estoque_extrato` (rawDeleted=false); por registro extrai campos da spec
§5.2; **descarta `quantidade === 0`**; deriva `sentido` e `mes`; transação
`deleteMany`+`createMany` em lotes; `markFatoBuilt`.
TDD: exclusão de quantidade 0; sentido por sinal; `mes` YYYY-MM.
Commit: `feat(worker): builder do fato_estoque_movimento`.

### Task 14: builder `fato-produto-parado` [DECOMPOR]

**Files:** Create `src/worker/fatos/fato-produto-parado.ts` + test.
`rebuildFatoProdutoParado`: lê `raw_estoque_saldo_hoje_duracao_dias`; `Map` de
`raw_estoque_saldo_hoje` por `data.id` → `{vrSaldo,unidade,...}`; join por
`saldo_hoje_id[0]` (FK direta — spec §5.3); **filtro `saldo > 0`**; grava colunas
§5.3; `markFatoBuilt`.
TDD: filtro saldo>0; join por saldo_hoje_id; dias cru.
Commit: `feat(worker): builder do fato_produto_parado`.

### Task 15: disparar builders no ciclo de snapshot (C3)

**Files:** Modify `src/worker/sync/processors.ts`.
Em `processSnapshotCycle`, após o rebuild de `fato_estoque_saldo`, disparar
`rebuildFatoEstoqueMovimento` e `rebuildFatoProdutoParado` (try/catch isolado +
log cada). **Anotar:** dependem do snapshot de `estoque.extrato` /
`estoque.saldo.hoje.duracao.dias` terem rodado no mesmo loop (ok pela ordem);
no 1º ciclo pós-deploy os fatos saem vazios → relatórios em estado "preparando"
(via `FatoBuildState` ainda nulo) — comportamento esperado.
Verificação: `npx tsc --noEmit && npx jest src/worker/`.
Commit: `feat(worker): dispara builders de movimento e produto parado`.

---

## Bloco 4 — Templates de gráfico

### Task 16: instalar Recharts

**Files:** Modify `package.json`. `npm install recharts`; verificação:
`npm ls recharts && npx tsc --noEmit` (**M3** — sem build completo aqui).
Commit: `chore: adiciona recharts`.

### Task 17: `chart-states.tsx`

**Files:** Create `src/components/charts/chart-states.tsx`.
`ChartSkeleton`, `ChartPreparing` ("relatório ainda sendo preparado"),
`ChartEmpty` ("sem dado no período"), `ChartError` (msg + botão repetir). Design
system F1. Commit: `feat(charts): componentes de estado`.

### Tasks 18-22: templates KPICard, DataTable, BarChart, LineChart, PieChart [DECOMPOR]

**Files:** Create `src/components/charts/{kpi-card,data-table,bar-chart,line-chart,pie-chart}.tsx` + test cada.
Cada template recebe definição declarativa (`data` + `config`) e usa os estados
do Task 17. `DataTable` — componente **novo genérico** (colunas declarativas,
ordenável com `aria-sort`, pesquisável, `tabular-nums`, formata negativos —
M5). Charts usam Recharts `ResponsiveContainer`, tooltips, legendas, gridlines
de baixo contraste, paleta acessível no dark, números pt-BR; `PieChart` agrupa
"Outros" acima de 6 fatias. Review #2: cada template = 1 task com TDD + código
completo; `DataTable` provavelmente 2-3 sub-tasks (render, ordenação, busca).
Commits: um por template.

---

## Bloco 5 — Catálogo, freshness e queries

### Task 23: `types.ts` — tipos de relatório/seção/filtro

**Files:** Create `src/lib/reports/types.ts`.
`ReportFilter` (`tipo`: produto/armazém/família/período/sentido/faixaDias/busca,
`default`); `ReportSection` (`template`, `fato`, `config`, `filtros`);
`ReportEntry` (`id`, `titulo`, `dominio: ReportDomainId`, `descricao`,
`icone: LucideIcon` — **M4**, `modeloFonte: string`, `secoes: ReportSection[]`).
Commit: `feat(reports): tipos do catálogo`.

### Task 24: `freshness.ts` — cálculo do "atualizado em" (C4)

**Files:** Create `src/lib/reports/freshness.ts` + test.
`reportFreshness(prisma, entry)`: lê `SyncState.lastSnapshotAt` do
`entry.modeloFonte` **e** `FatoBuildState.ultimoBuildAt` de cada fato das seções;
devolve o **menor** de todos (o dado é tão fresco quanto a etapa mais atrasada).
TDD: min entre sync e build; relatório multi-fato pega o menor de todos.
Commit: `feat(reports): cálculo de freshness do relatório`.

### Task 25: `catalog.ts` — catálogo dos 6 relatórios [DECOMPOR]

**Files:** Create `src/lib/reports/catalog.ts` + test.
`REPORT_CATALOG: ReportEntry[]` — 6 entradas (R1-R6, spec §8), domínio `estoque`,
ícone, `modeloFonte`, seções (R4/R6 com 2 seções). `reportsForUser(role,domains)`,
`getReport(id)`. Review #2: cada `ReportEntry` é uma unidade.
TDD: 6 entradas; filtro por domínio; R4/R6 com 2 seções.
Commit: `feat(reports): catálogo dos 6 relatórios`.

### Task 26: `report-data.ts` — queries de leitura [DECOMPOR]

**Files:** Create `src/lib/actions/report-data.ts` + test.
Uma função por relatório (R1-R6). Cada uma: guard de auth → revalida o domínio
(camada 3, via `getMyDomains()` — **I9**) → determina o estado (§3.4):
`FatoBuildState` ausente → `"preparando"`; presente e sem linhas no filtro →
`"vazio"`; exceção → `"erro"`; senão `"ok"`. **Assinatura explícita (I2):** cada
função recebe um objeto de filtros tipado (`ReportFilterValues`) e devolve
`{ estado, dados: <tipo do relatório>, freshness }` — o `dados` tem um tipo
nomeado por relatório (não `unknown`). R2/R6 filtram `vrSaldo>0`; R4 `saldo>0`.
Review #2: 1 sub-task por relatório, com o tipo de retorno e a agregação completos.
Commit: `feat(reports): queries de leitura dos relatórios`.

### Task 27: verificação do Bloco 5

`npx tsc --noEmit && npm run lint && npx jest src/lib/reports src/lib/actions/report-data.test.ts`.

---

## Bloco 6 — Filtros, shell e páginas

### Task 28: componentes de filtro [DECOMPOR] (I1)

**Files:** Create `src/components/reports/filter-controls/` — seletores: produto
(busca + select), armazém (select), família (select), período (range de meses),
sentido (entrada/saída), faixa-dias (30/60/90+), busca textual. Cada um é um
componente controlado. Review #2: 1 task por controle.
Commit: um por controle.

### Task 29: `report-filters.tsx` — barra de filtros declarativa (I1)

**Files:** Create `src/components/reports/report-filters.tsx`.
Recebe a lista de `ReportFilter` da seção e renderiza os controles do Task 28;
estado dos filtros propagado via **URL `searchParams`** (decisão: searchParams —
deep-link e voltar funcionam), consumido pela página `[id]` server-side e
repassado às queries.
Commit: `feat(reports): barra de filtros declarativa`.

### Task 30: item de nav "Relatórios" (I7)

**Files:** Modify `src/lib/constants/nav.ts`.
Entrada `Relatórios` (`href:/relatorios`, ícone `BarChart3`), **sem `section`,
sem `visibleTo`** — **decisão consciente:** o item é sempre visível; o
enforcement por domínio é nas camadas 2/3. `filterNav` não filtra por domínio.
Commit: `feat(nav): item Relatórios`.

### Task 31: landing `/relatorios` [DECOMPOR]

**Files:** Create `src/app/(protected)/relatorios/page.tsx`, `relatorios-grid.tsx`.
`page.tsx` (server): usuário + `getMyDomains()` (**I9**) → `reportsForUser` →
`relatorios-grid.tsx` (client) renderiza grade de cards agrupada por domínio
(`PageShell`, `PageHeader`, `Card`, `motion`); estado vazio se sem domínio.
Verificação: `npx next build`. Commit: `feat(relatorios): landing`.

### Task 32: página `/relatorios/[id]` [DECOMPOR]

**Files:** Create `src/app/(protected)/relatorios/[id]/page.tsx`, `report-view.tsx`.
`page.tsx` (server): `requireDomainAccess` (camada 2) → `getReport(id)` → lê
`searchParams` dos filtros → chama as queries de `report-data.ts` por seção →
`report-view.tsx` (client) renderiza: a `report-filters` (Task 29), as seções em
sequência (cada uma com template + estados), e o indicador "atualizado em <data>"
consumindo o valor pronto de `freshness.ts` (C4 — a página **não calcula**, só exibe).
Verificação: `npx next build`. Commit: `feat(relatorios): página de relatório`.

### Task 33: UAT e verificação do Bloco 6

Dev server, login, `/relatorios` + os 6 relatórios; RBAC por domínio (viewer sem
domínio: vê o item, landing vazia, URL direta bloqueada). `tsc`, `lint`, `build`.

---

## Bloco 7 — Etapa "Acesso" no modal de usuário

### Task 34: `createUser` transacional (C1)

**Files:** Modify `src/lib/actions/users.ts` + test.
`createUser` aceita `domains: ReportDomainId[]`; abre `prisma.$transaction`
envolvendo **`user.create` + `userDomainAccess.createMany`** (não o `AuditLog` —
C1); o `logAudit` de `user_created` segue pós-commit, fire-and-forget.
TDD: usuário criado com domínios; rollback do par user+domínios em falha.
Commit: `refactor(users): createUser transacional com domínios`.

### Task 35: `access-step.tsx` (I6)

**Files:** Create `src/components/users/access-step.tsx` + test.
Checkboxes dos `ReportDomain`; habilita só os `grantableDomains` do concedente;
aviso quando nenhum selecionado. Commit: `feat(users): componente da etapa Acesso`.

### Task 36: integrar etapa "Acesso" no `user-form-dialog` [DECOMPOR] (I3, I4, I6)

**Files:** Modify `src/components/users/user-form-dialog.tsx` (arquivo de ~1035
linhas — cuidado).
Mudanças (a Review #2 quebra em sub-tasks): (a) `Step` → `1|2|3`; (b) navegação
`goNext/goBack` genérica entre N etapas (hoje hardcoded p/ 2); (c) footer
`step < últimaEtapa`/`step > 1` (hoje `< 2`/`> 1` literais); (d) `stepperItems`
computado pelo role atual — 3 itens p/ `manager`/`viewer`, 2 p/ privilegiados;
ícone da etapa "Acesso" = `ShieldCheck` (**M6**); (e) renderizar `access-step`
entre Identidade e Confirmação; (f) **N10:** ao trocar para role privilegiado,
zerar domínios e, se o `step` estiver na etapa Acesso, recuar para etapa válida;
(g) **StepConfirm (I6):** listar domínios selecionados + aviso "zero domínios";
(h) **modo edit (I3):** o submit chama `updateUser` (identidade) **e**
`updateUserDomains` em série; se a 2ª falhar, toast de erro parcial (a identidade
já foi salva) — sem rollback (escritas separadas).
Verificação: `tsc`, `lint`, `build`; UAT do modal nos 4 papéis.
Commit: `feat(users): etapa Acesso no modal com stepper dinâmico`.

### Task 37: verificação final do Bloco 7

`tsc`, `lint`, `build`, `jest`; UAT: criar manager com domínio, editar, trocar role.

---

## Verificação final da fase

- [ ] `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npx jest` — verdes
- [ ] Worker: os 3 builders rodam; `FatoBuildState` com 3 linhas; fatos populados
- [ ] Os 6 relatórios renderizam com dado real; estados "preparando"/"vazio"/"erro" OK
- [ ] RBAC por domínio: `viewer`/`manager` sem o domínio não veem (página, dados)
- [ ] Etapa "Acesso" nos 4 papéis; `create` persiste domínios; freshness exibido
- [ ] Etapa [10] do workflow: `/gsd-code-review` + `/gsd-ui-review`

## Self-review (autor do plano)

**Cobertura da spec v3:** §3 → Bloco 1 (Tasks 1,3) + Bloco 5; §3.4 estado de
fato → `FatoBuildState` (Task 3,11) + Task 26; §4 RBAC → Bloco 2 + Bloco 7; §5
fatos → Bloco 1 + Bloco 3; §6 templates → Bloco 4; §7 shell + freshness → Bloco 5
(Task 24) + Bloco 6; §8 relatórios → Task 25 + Bloco 6. Decisões 1-13 mapeadas;
a decisão 5 (transação) foi corrigida (C1) e a divergência documentada.

**Premissas verificadas:** C1 (`logAudit` é `pgPool`) e C2 (sem teste de
contagem) corrigidas contra o código real. Backfill na migration (I5).

**Pendente para a Review #2:** decomposição fina das tasks **[DECOMPOR]**
(3,7,12,13,14,18-22,25,26,28,36) em sub-steps TDD com código completo → PLAN v3.

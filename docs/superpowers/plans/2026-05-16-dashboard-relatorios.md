# F3 — Dashboard de Relatórios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar este plano task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** Construir o painel de relatórios do nexus-odoo — infraestrutura "um relatório" (catálogo declarativo, RBAC por domínio, templates de gráfico) + 6 relatórios de estoque lendo do cache da F2.

**Architecture:** Cada relatório = 4 camadas (fato tipado no cache → query de leitura server-side → componente visual → entrada no catálogo). O shell `/relatorios` lê o catálogo filtrado pelos domínios do usuário. RBAC por domínio (`ReportDomain`) com enforcement em 3 camadas. Templates de gráfico em Recharts.

**Tech Stack:** Next.js 16, TypeScript, Prisma v7, Recharts, Jest. Worker BullMQ (builders de fato).

**Spec:** `docs/superpowers/specs/2026-05-16-dashboard-relatorios-design.md` (v3)

**Versão:** PLAN v1 — passará por 2 reviews profundas (`CLAUDE.md` §6 [6]/[7]) → v2 → v3.

---

## File Structure

```
prisma/schema.prisma              MODIFICAR — enum ReportDomain; AuditAction.user_domains_changed;
                                  model UserDomainAccess; FatoEstoqueMovimento; FatoProdutoParado;
                                  FatoEstoqueSaldo enriquecido; ultimoBuildAt nos 3 fatos
prisma/seed.ts                    MODIFICAR — backfill domínio estoque p/ manager/viewer
src/worker/catalog/model-catalog.ts  MODIFICAR — estoque.extrato: incremental → snapshot
src/worker/fatos/
  fato-estoque-saldo.ts           MODIFICAR — enriquecer (vrSaldo, família, marca, ultimoBuildAt)
  fato-estoque-movimento.ts       CRIAR — builder do fato de movimento
  fato-produto-parado.ts          CRIAR — builder do fato de produtos parados
  odoo-relational.ts              CRIAR — helper de extração [id,nome]/false
src/worker/sync/processors.ts     MODIFICAR — disparar os 2 builders novos pós-snapshot
src/lib/reports/
  domains.ts                      CRIAR — ReportDomain helpers + RBAC por domínio
  catalog.ts                      CRIAR — catálogo declarativo dos 6 relatórios
  types.ts                        CRIAR — tipos de relatório/seção/filtro
src/lib/actions/
  domain-access.ts                CRIAR — server actions de concessão de domínio
  report-data.ts                  CRIAR — queries de leitura dos relatórios
  users.ts                        MODIFICAR — createUser transacional (user+domínios+audit)
src/components/charts/
  kpi-card.tsx                    CRIAR
  data-table.tsx                  CRIAR
  bar-chart.tsx                   CRIAR
  line-chart.tsx                  CRIAR
  pie-chart.tsx                   CRIAR
  chart-states.tsx                CRIAR — skeleton / "preparando" / "sem dado" / "erro"
src/app/(protected)/relatorios/
  page.tsx                        CRIAR — landing (grade de cards por domínio)
  relatorios-grid.tsx             CRIAR — client component da grade
  [id]/page.tsx                   CRIAR — página de relatório
  [id]/report-view.tsx            CRIAR — client component que renderiza as seções
src/components/users/
  user-form-dialog.tsx            MODIFICAR — etapa "Acesso" (stepper dinâmico)
  access-step.tsx                 CRIAR — conteúdo da etapa Acesso
src/lib/constants/nav.ts          MODIFICAR — +item Relatórios
package.json                      MODIFICAR — +recharts
```

## Blocos

- **Bloco 1 — Schema & migration** (Tasks 1-4)
- **Bloco 2 — RBAC por domínio** (Tasks 5-8)
- **Bloco 3 — Fatos e builders** (Tasks 9-13)
- **Bloco 4 — Templates de gráfico** (Tasks 14-20)
- **Bloco 5 — Catálogo e queries de leitura** (Tasks 21-24)
- **Bloco 6 — Shell e páginas de relatório** (Tasks 25-28)
- **Bloco 7 — Etapa "Acesso" no modal de usuário** (Tasks 29-31)

> **Nota de granularidade para as reviews [6]/[7]:** este é o PLAN v1. As tasks
> abaixo estão em nível de bloco/unidade. As reviews profundas devem (a) verificar
> cobertura da spec v3 seção a seção, (b) decompor cada task que esconde mais de
> uma unidade em sub-tasks bite-sized com código completo e TDD, (c) confirmar a
> ordem da topologia de dependências da §3.5 da spec. O PLAN v3 sai dessa
> decomposição. Cada task aqui já nomeia arquivos exatos, contrato e verificação.

---

## Bloco 1 — Schema & migration

### Task 1: Helper de extração relacional do Odoo

**Files:** Create `src/worker/fatos/odoo-relational.ts`, Test `src/worker/fatos/odoo-relational.test.ts`

Contrato (regra §3.2 da spec): campos `many2one` chegam como `[id, "rótulo"]` ou `false`.

```typescript
// src/worker/fatos/odoo-relational.ts
/** Valor de um campo many2one do Odoo no JSONB raw. */
export type OdooM2O = [number, string] | false | null | undefined;

/** Extrai o id de um campo relacional; `false`/ausente → null. */
export function relId(v: OdooM2O): number | null {
  return Array.isArray(v) ? v[0] : null;
}
/** Extrai o rótulo de um campo relacional; `false`/ausente → null. */
export function relNome(v: OdooM2O): string | null {
  return Array.isArray(v) ? v[1] : null;
}
```

TDD: testar `[14410,"X"]→{id:14410,nome:"X"}`, `false→{null,null}`, `undefined→null`.
Commit: `feat(worker): helper de extração de campos relacionais do Odoo`.

### Task 2: Schema — enum ReportDomain, AuditAction, UserDomainAccess

**Files:** Modify `prisma/schema.prisma`

Adicionar:

```prisma
enum ReportDomain {
  estoque
  financeiro
  fiscal
  comercial
}
```

Adicionar `user_domains_changed` ao enum `AuditAction`. Adicionar:

```prisma
model UserDomainAccess {
  id           String       @id @default(uuid()) @db.Uuid
  userId       String       @map("user_id") @db.Uuid
  domain       ReportDomain
  grantedById  String?      @map("granted_by_id") @db.Uuid
  createdAt    DateTime     @default(now()) @map("created_at")
  user         User         @relation("UserDomainAccess", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, domain])
  @@index([userId])
  @@map("user_domain_access")
}
```

Adicionar a relação inversa em `model User`: `domainAccess UserDomainAccess[] @relation("UserDomainAccess")`.
Verificação: `npx prisma format` sem erro.
Commit: `feat(prisma): enum ReportDomain, AuditAction.user_domains_changed, UserDomainAccess`.

### Task 3: Schema — fatos (enriquecer FatoEstoqueSaldo, criar movimento e parado)

**Files:** Modify `prisma/schema.prisma`

`FatoEstoqueSaldo` — acrescentar `vrSaldo Decimal? @db.Decimal(18,4) @map("vr_saldo")`,
`familiaId Int? @map("familia_id")`, `familiaNome String? @map("familia_nome")`,
`marcaId Int? @map("marca_id")`, `marcaNome String? @map("marca_nome")`,
`ultimoBuildAt DateTime? @map("ultimo_build_at")`; índices `familiaId`, `marcaId`;
remover o comentário `/// Fato PROVISÓRIO`.

Criar `FatoEstoqueMovimento` (colunas da spec §5.2: `odooId Int @id`, `produtoId Int?`,
`produtoNome String?`, `localId Int?`, `localNome String?`, `data DateTime`,
`mes String`, `quantidade Decimal @db.Decimal(18,4)`, `sentido String`,
`localInversoId Int?`, `origem String?`, `ultimoBuildAt DateTime?`; índices
`mes`, `produtoId`, `localId`, `sentido`; `@@map("fato_estoque_movimento")`).

Criar `FatoProdutoParado` (spec §5.3: `saldoHojeId Int @id`, `produtoId Int?`,
`produtoNome String?`, `localId Int?`, `localNome String?`,
`saldo Decimal @db.Decimal(18,4)`, `dias Int`, `vrSaldo Decimal? @db.Decimal(18,4)`,
`unidade String?`, `ultimoBuildAt DateTime?`; índices `dias`, `produtoId`;
`@@map("fato_produto_parado")`).

Verificação: `npx prisma format`.
Commit: `feat(prisma): FatoEstoqueSaldo enriquecido, FatoEstoqueMovimento, FatoProdutoParado`.

### Task 4: Migration F3 + backfill

**Files:** Create `prisma/migrations/<ts>_f3_dashboard/`, Modify `prisma/seed.ts`

- `npx prisma migrate dev --name f3_dashboard` (DB dev no ar).
- No `seed.ts`, adicionar: para cada `User` com `platformRole in (manager, viewer)`,
  `upsert` de `UserDomainAccess` `(userId, domain: "estoque")`.
- `npx prisma db seed`; `npx prisma generate && npx tsc --noEmit`.
Commit: `feat(prisma): migration F3 e backfill do domínio estoque`.

---

## Bloco 2 — RBAC por domínio

### Task 5: `domains.ts` — modelo de domínios e RBAC

**Files:** Create `src/lib/reports/domains.ts`, Test `src/lib/reports/domains.test.ts`

Contrato:
```typescript
import type { PlatformRole } from "@/generated/prisma/client";
export const REPORT_DOMAINS = ["estoque", "financeiro", "fiscal", "comercial"] as const;
export type ReportDomainId = (typeof REPORT_DOMAINS)[number];

/** super_admin/admin veem todos os domínios; demais, só os concedidos. */
export function visibleDomains(role: PlatformRole, granted: ReportDomainId[]): ReportDomainId[] {
  if (role === "super_admin" || role === "admin") return [...REPORT_DOMAINS];
  return granted;
}
/** Pode conceder: super_admin/admin qualquer; manager só o que possui. */
export function grantableDomains(role: PlatformRole, granted: ReportDomainId[]): ReportDomainId[] {
  if (role === "super_admin" || role === "admin") return [...REPORT_DOMAINS];
  if (role === "manager") return granted;
  return [];
}
```
TDD: cobrir os 4 papéis para `visibleDomains` e `grantableDomains`.
Commit: `feat(reports): modelo de domínios e regras de RBAC por domínio`.

### Task 6: server actions de concessão de domínio

**Files:** Create `src/lib/actions/domain-access.ts`, Test idem

`getUserDomains(userId)`, `getMyDomains()`, `updateUserDomains(userId, domains)` —
todas com guard de auth. `updateUserDomains` valida via `canEditUser` (F1) +
`grantableDomains`; aplica o diff em `UserDomainAccess`; registra `AuditLog`
`user_domains_changed` com `{added, removed}`. Verificar assinaturas reais de
`canEditUser`/`logAudit`.
TDD: schema Zod dos domínios; teste de que `manager` não concede domínio que não tem.
Commit: `feat(reports): server actions de concessão de domínio`.

### Task 7: helper de enforcement na página

**Files:** Create helper em `src/lib/reports/domains.ts` (ampliar) ou `src/lib/reports/guard.ts`

`requireDomainAccess(domain)` — server-side: pega o usuário atual, seus domínios,
e redireciona `/relatorios` se não tiver o domínio. Usado pela página `[id]`.
TDD: testar allow/deny por papel.
Commit: `feat(reports): guard de acesso a domínio para páginas de relatório`.

### Task 8: verificação do Bloco 2

`npx tsc --noEmit && npm run lint && npx jest src/lib/reports src/lib/actions/domain-access.test.ts`.
Commit (se houver ajustes): `chore(reports): verificação do RBAC por domínio`.

---

## Bloco 3 — Fatos e builders

### Task 9: `estoque.extrato` → snapshot no catálogo

**Files:** Modify `src/worker/catalog/model-catalog.ts`, Test ajustar `model-catalog.test.ts`

Trocar o `mode` de `estoque.extrato` de `incremental` para `snapshot`. Ajustar a
contagem esperada no teste (snapshot passa de 4 para 5; incremental cai 1).
Commit: `fix(worker): estoque.extrato passa a snapshot (write_date ausente)`.

### Task 10: enriquecer o builder `fato-estoque-saldo`

**Files:** Modify `src/worker/fatos/fato-estoque-saldo.ts`, Test idem

O builder passa a (a) carregar um `Map` de `produtoId → {familiaId,familiaNome,
marcaId,marcaNome}` lido de `raw_sped_produto` (via `relId`/`relNome` em
`familia_id`/`marca_id`); (b) por linha de saldo, extrair `vrSaldo` de
`data.vr_saldo`, e família/marca do Map (null se produto ausente); (c) gravar
`ultimoBuildAt = new Date()` em todas as linhas.
TDD: linha com produto sem família → familiaNome null; produto ausente do Map → null.
Commit: `feat(worker): fato_estoque_saldo enriquecido com valor, família e marca`.

### Task 11: builder `fato-estoque-movimento`

**Files:** Create `src/worker/fatos/fato-estoque-movimento.ts`, Test idem

`rebuildFatoEstoqueMovimento(prisma)`: lê `raw_estoque_extrato` (rawDeleted=false),
para cada registro extrai os campos da spec §5.2, **descarta `quantidade === 0`**,
deriva `sentido` (`>0`→entrada, `<0`→saida) e `mes` (YYYY-MM de `data`); transação
`deleteMany` + `createMany` em lotes; grava `ultimoBuildAt`.
TDD: exclusão de quantidade 0; sentido por sinal; `mes` formatado.
Commit: `feat(worker): builder do fato_estoque_movimento`.

### Task 12: builder `fato-produto-parado`

**Files:** Create `src/worker/fatos/fato-produto-parado.ts`, Test idem

`rebuildFatoProdutoParado(prisma)`: lê `raw_estoque_saldo_hoje_duracao_dias`;
monta `Map` de `raw_estoque_saldo_hoje` por `data.id` → `{vrSaldo, unidade}`;
join por `saldo_hoje_id[0]` (FK direta); **filtro `saldo > 0`**; grava colunas da
§5.3 + `ultimoBuildAt`.
TDD: filtro saldo>0; join por saldo_hoje_id; dias cru (sem teto).
Commit: `feat(worker): builder do fato_produto_parado`.

### Task 13: disparar os builders novos no ciclo de snapshot

**Files:** Modify `src/worker/sync/processors.ts`

Em `processSnapshotCycle`, após o rebuild de `fato_estoque_saldo` já existente,
disparar `rebuildFatoEstoqueMovimento` e `rebuildFatoProdutoParado` (cada um em
try/catch isolado, com log).
Verificação: `npx tsc --noEmit && npx jest src/worker/`.
Commit: `feat(worker): dispara builders de movimento e produto parado pós-snapshot`.

---

## Bloco 4 — Templates de gráfico

### Task 14: instalar Recharts

**Files:** Modify `package.json`

`npm install recharts`. Verificar `npx next build` ainda passa.
Commit: `chore: adiciona recharts`.

### Task 15: `chart-states.tsx` — estados de carregamento/vazio/erro

**Files:** Create `src/components/charts/chart-states.tsx`

Componentes `ChartSkeleton`, `ChartPreparing` ("relatório ainda sendo
preparado"), `ChartEmpty` ("sem dado no período"), `ChartError` (mensagem +
botão repetir). Design system da F1 (tokens, dark mode).
Commit: `feat(charts): componentes de estado (skeleton/preparando/vazio/erro)`.

### Tasks 16-20: templates `KPICard`, `DataTable`, `BarChart`, `LineChart`, `PieChart`

**Files:** Create `src/components/charts/{kpi-card,data-table,bar-chart,line-chart,pie-chart}.tsx`, Test cada um

Cada template recebe uma definição declarativa (`data` + `config`) e usa os
estados do Task 15. `DataTable` é componente novo genérico (colunas declarativas,
ordenável, pesquisável, `aria-sort`, `tabular-nums`, formata negativos).
`Bar/Line/PieChart` usam Recharts `ResponsiveContainer`, tooltips, legendas,
gridlines de baixo contraste, paleta categórica acessível no dark, números pt-BR.
`PieChart` agrupa em "Outros" acima de 6 fatias.
TDD por template: render com dado, vazio, preparando, erro.
Commits: um por template (`feat(charts): template <Nome>`).

> Cada uma destas (16-20) é uma task; as reviews [6]/[7] devem decompor em
> sub-steps TDD com o código completo de cada componente.

---

## Bloco 5 — Catálogo e queries de leitura

### Task 21: `types.ts` — tipos de relatório/seção/filtro

**Files:** Create `src/lib/reports/types.ts`

Tipos: `ReportSection` (`template`, `fato`, `config`, `filtros`), `ReportFilter`
(`tipo`: produto/armazém/família/período/sentido/faixaDias, `default`),
`ReportEntry` (`id`, `titulo`, `dominio`, `descricao`, `icone`, `modeloFonte`,
`secoes: ReportSection[]`). Sem lógica — só tipos.
Commit: `feat(reports): tipos do catálogo de relatórios`.

### Task 22: `catalog.ts` — catálogo dos 6 relatórios

**Files:** Create `src/lib/reports/catalog.ts`, Test idem

`REPORT_CATALOG: ReportEntry[]` com as 6 entradas (R1-R6) da spec §8 — cada uma
com domínio `estoque`, ícone, `modeloFonte`, e as seções (R4/R6 com 2 seções).
`reportsForUser(role, domains)` filtra o catálogo. `getReport(id)`.
TDD: 6 entradas; filtro por domínio; R4/R6 com 2 seções.
Commit: `feat(reports): catálogo declarativo dos 6 relatórios de estoque`.

### Task 23: `report-data.ts` — queries de leitura

**Files:** Create `src/lib/actions/report-data.ts`, Test idem

Uma função de leitura por relatório (R1-R6). Cada uma: guard de auth → revalida
o domínio (RBAC camada 3) → checa `ultimoBuildAt` do fato (estado §3.4) → lê e
agrega o fato (R2/R6 filtram `vrSaldo>0`; R4 `saldo>0`) → devolve
`{ estado: "ok"|"preparando"|"vazio"|"erro", dados }`.
TDD: agregação correta; revalidação de RBAC; sinalização de estado.
Commit: `feat(reports): queries de leitura dos relatórios`.

### Task 24: verificação do Bloco 5

`npx tsc --noEmit && npm run lint && npx jest src/lib/reports src/lib/actions/report-data.test.ts`.

---

## Bloco 6 — Shell e páginas de relatório

### Task 25: item de nav "Relatórios"

**Files:** Modify `src/lib/constants/nav.ts`

Adicionar entrada `Relatórios` (`href: /relatorios`, ícone `BarChart3`), sem
`section`, sem `visibleTo`.
Commit: `feat(nav): item Relatórios`.

### Task 26: landing `/relatorios`

**Files:** Create `src/app/(protected)/relatorios/page.tsx`, `relatorios-grid.tsx`

`page.tsx` (server): pega usuário + domínios, chama `reportsForUser`, passa para
`relatorios-grid.tsx` (client) que renderiza a grade de cards agrupada por
domínio (`PageShell`, `PageHeader`, `Card`, `motion`). Estado vazio se sem domínio.
Verificação: `npx next build`.
Commit: `feat(relatorios): landing com grade de cards por domínio`.

### Task 27: página `/relatorios/[id]`

**Files:** Create `src/app/(protected)/relatorios/[id]/page.tsx`, `report-view.tsx`

`page.tsx` (server): `requireDomainAccess` (RBAC camada 2), `getReport(id)`,
chama as queries de leitura das seções, passa para `report-view.tsx` (client)
que renderiza as seções em sequência (cada uma com seu template + estados),
a barra de filtros e o indicador "atualizado em".
Verificação: `npx next build`.
Commit: `feat(relatorios): página de relatório com seções e filtros`.

### Task 28: UAT visual e verificação do Bloco 6

Subir dev server, logar, conferir `/relatorios` e os 6 relatórios; RBAC por
domínio (viewer sem domínio não vê). `tsc`, `lint`, `build`.

---

## Bloco 7 — Etapa "Acesso" no modal de usuário

### Task 29: `createUser` transacional

**Files:** Modify `src/lib/actions/users.ts`, Test ajustar

`createUser` passa a aceitar `domains: ReportDomainId[]` e envolve
`user.create` + `userDomainAccess.createMany` + `AuditLog` num
`prisma.$transaction`.
TDD: usuário criado com domínios; rollback em falha.
Commit: `refactor(users): createUser transacional com concessão de domínios`.

### Task 30: `access-step.tsx` — conteúdo da etapa Acesso

**Files:** Create `src/components/users/access-step.tsx`, Test idem

Checkboxes dos `ReportDomain`; habilita só os `grantableDomains` do concedente;
aviso quando nenhum selecionado.
Commit: `feat(users): componente da etapa Acesso`.

### Task 31: integrar a etapa "Acesso" no `user-form-dialog`

**Files:** Modify `src/components/users/user-form-dialog.tsx`

`Step` vira `1|2|3`; `stepperItems` computado pelo role atual (3 itens p/
manager/viewer, 2 p/ super_admin/admin); trocar para role privilegiado zera os
domínios selecionados; `create` envia domínios ao `createUser`; `update` chama
`updateUserDomains`.
Verificação: `tsc`, `lint`, `build`; UAT do modal nos 4 papéis.
Commit: `feat(users): etapa Acesso no modal com stepper dinâmico`.

---

## Verificação final da fase

- [ ] `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npx jest` — verdes
- [ ] Worker: builders dos 3 fatos rodam; `fato_estoque_movimento` e
      `fato_produto_parado` populados; `ultimoBuildAt` preenchido
- [ ] Os 6 relatórios renderizam com dado real; estados "preparando"/"vazio"/"erro" OK
- [ ] RBAC por domínio: `viewer`/`manager` sem o domínio não veem (nav, página, dados)
- [ ] Etapa "Acesso" funciona nos 4 papéis; `create` persiste domínios
- [ ] Etapa [10] do workflow: `/gsd-code-review` + `/gsd-ui-review`

---

## Self-review (autor do plano)

**Cobertura da spec v3:** §3 arquitetura → Bloco 1 (Task 1 helper) + Bloco 5;
§4 RBAC → Bloco 2 + Bloco 7; §5 fatos → Bloco 1 (schema) + Bloco 3 (builders);
§6 templates → Bloco 4; §7 shell → Bloco 6; §8 relatórios → Bloco 5 (catálogo) +
Bloco 6 (telas). Decisões 1-13 da §11 mapeadas. Sem lacuna de seção.

**Placeholders:** este PLAN v1 está em nível de bloco/unidade — é deliberado e
declarado no topo dos Blocos. As Tasks 16-20 e várias outras precisam de
decomposição em sub-steps TDD com código completo: **esse é o trabalho das
reviews [6]/[7] → PLAN v2 → v3.** Nenhuma task é vaga quanto a arquivo, contrato
ou verificação; o que falta é granularidade de step, a ser produzida na review.

**Consistência de tipos:** `ReportDomainId`/`ReportDomain` (Task 5/2),
`ReportEntry`/`ReportSection` (Task 21) usados em 22-27; `relId`/`relNome`
(Task 1) usados em 10-12; builders seguem o padrão `rebuildFato*` da F2.

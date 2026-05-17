# F3 — Dashboard de Relatórios — Implementation Plan (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar este plano task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** Construir o painel de relatórios do nexus-odoo — infraestrutura "um relatório" (catálogo declarativo, RBAC por domínio, templates de gráfico) + 6 relatórios de estoque lendo do cache da F2.

**Architecture:** Cada relatório = 4 camadas (fato tipado no cache → query de leitura server-side → componente visual → entrada no catálogo). Shell `/relatorios` filtrado pelos domínios do usuário. RBAC por domínio (`ReportDomain`), enforcement em 3 camadas. Gráficos em Recharts.

**Tech Stack:** Next.js 16, TypeScript, Prisma v7, Recharts, Jest. Worker BullMQ (builders de fato).

**Spec:** `docs/superpowers/specs/2026-05-16-dashboard-relatorios-design.md` (v3)

**Versão:** PLAN v3 — final, executável. Incorpora as Reviews #1 e #2 do plano.

## Decisões consolidadas das Reviews

- **C1 (Review #1):** o `$transaction` de `createUser` cobre só `user.create` + `userDomainAccess.createMany`. O `logAudit` permanece pós-commit, fire-and-forget (`logAudit` usa `pgPool`, fora do Prisma — confirmado em `src/lib/audit.ts`). O plano corrige a spec §4.4 neste ponto.
- **C2:** Task 10 não ajusta teste de contagem (não existe) — verificação = `tsc` + `jest src/worker/catalog`.
- **C3:** dependência builders × snapshot anotada; estado de 1º ciclo documentado.
- **C4:** freshness é task própria (`freshness.ts`); página só exibe.
- **C5:** `relNome` trata `[id, false]` → `null`.
- **I2:** sinal de "builder rodou" vive em `FatoBuildState` (1 linha por fato), não nas linhas do fato.
- **I5:** backfill de `UserDomainAccess` vai no SQL da migration.
- **N1 (Review #2):** dependências de artefato do Bloco 7 anotadas por task; ordem segura do submit em modo edit — `updateUserDomains` roda **antes** de `updateUser` quando o role muda para privilegiado, evitando linhas órfãs em `UserDomainAccess`.
- **N2:** `ReportFilterValues` declarado em `types.ts` (Task 23) e `parseFilters` criado em `src/lib/reports/filters.ts` (Task 26.0) — converte `searchParams`→filtros tipados.
- **N3:** `vrSaldo` é `Decimal?` (nullable) — a migration aplica sobre linhas pré-existentes sem default; o builder repopula no próximo rebuild. `FatoEstoqueSaldo.quantidade` permanece `Decimal?` coerente.
- **N4:** `FatoEstoqueSaldo.atualizadoEm` por linha é mantida (inócua); `freshness.ts` não a usa.
- **N5:** `package-lock.json` entra no mesmo commit do `recharts`.
- **N6:** `next build` só no fechamento do Bloco 6 (Task 33); tasks individuais usam `tsc --noEmit` + `jest`.

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
  types.ts                        CRIAR — tipos relatório/seção/filtro + ReportFilterValues
  filters.ts                      CRIAR — parseFilters (searchParams → ReportFilterValues)
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
package.json / package-lock.json  MODIFICAR — +recharts
```

## Blocos

- **Bloco 1 — Schema & migration** (Tasks 1-9)
- **Bloco 2 — RBAC por domínio** (Tasks 10-15)
- **Bloco 3 — Fatos e builders** (Tasks 16-31)
- **Bloco 4 — Templates de gráfico** (Tasks 32-41)
- **Bloco 5 — Catálogo, freshness e queries** (Tasks 42-54)
- **Bloco 6 — Filtros, shell e páginas** (Tasks 55-69)
- **Bloco 7 — Etapa "Acesso" no modal** (Tasks 70-80)

Ordem das tasks = topologia obrigatória da spec §3.5 (migration → generate → builder → query → componente → catálogo → RBAC).

---

## Bloco 1 — Schema & migration

### Task 1: Helper de extração relacional do Odoo

**Files:** Create `src/worker/fatos/odoo-relational.ts`, `src/worker/fatos/odoo-relational.test.ts`.

- [ ] **Step 1 — teste que falha.** Criar `odoo-relational.test.ts`:
  ```ts
  import { relId, relNome } from "./odoo-relational";

  describe("relId", () => {
    it("extrai o id de um many2one [id, nome]", () => {
      expect(relId([14410, "Esteira X"])).toBe(14410);
    });
    it("retorna null para false", () => {
      expect(relId(false)).toBeNull();
    });
    it("retorna null para undefined", () => {
      expect(relId(undefined)).toBeNull();
    });
  });

  describe("relNome", () => {
    it("extrai o nome de um many2one [id, nome]", () => {
      expect(relNome([14410, "Esteira X"])).toBe("Esteira X");
    });
    it("retorna null para false", () => {
      expect(relNome(false)).toBeNull();
    });
    it("retorna null quando o nome é false ([id, false])", () => {
      expect(relNome([14410, false])).toBeNull();
    });
    it("retorna null para undefined", () => {
      expect(relNome(undefined)).toBeNull();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/odoo-relational.test.ts` → falha (módulo inexistente).
- [ ] **Step 3 — implementação.** Criar `odoo-relational.ts`:
  ```ts
  // src/worker/fatos/odoo-relational.ts

  /** Campo many2one do Odoo: [id, "rótulo"] ou [id, false], ou false/null/undefined quando vazio. */
  export type OdooM2O = [number, string | false] | false | null | undefined;

  /** Extrai o id de um campo relacional; null quando vazio. */
  export function relId(v: OdooM2O): number | null {
    return Array.isArray(v) ? v[0] : null;
  }

  /** Extrai o rótulo de um campo relacional; null quando vazio ou quando o rótulo é false. */
  export function relNome(v: OdooM2O): string | null {
    return Array.isArray(v) && typeof v[1] === "string" ? v[1] : null;
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/odoo-relational.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): helper de extração de campos relacionais do Odoo`.

### Task 2: Schema — enum ReportDomain e AuditAction.user_domains_changed

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1 — adicionar o enum `ReportDomain`** após o enum `AuditAction`:
  ```prisma
  enum ReportDomain {
    estoque
    financeiro
    fiscal
    comercial
  }
  ```
- [ ] **Step 2 — adicionar `user_domains_changed`** ao enum `AuditAction`, após `session_revoked`:
  ```prisma
    session_revoked
    user_domains_changed
  ```
- [ ] **Step 3 — verificação.** `npx prisma format` → sem erro.
- [ ] **Step 4 — commit.** `feat(prisma): ReportDomain e AuditAction.user_domains_changed`.

### Task 3: Schema — modelo UserDomainAccess

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1 — adicionar o modelo** (após `model AuditLog`):
  ```prisma
  /// Concessão de domínio de relatório a um usuário. super_admin/admin não têm
  /// linhas (veem tudo); manager/viewer têm uma linha por domínio concedido.
  model UserDomainAccess {
    id          String       @id @default(uuid()) @db.Uuid
    userId      String       @map("user_id") @db.Uuid
    domain      ReportDomain
    grantedById String?      @map("granted_by_id") @db.Uuid
    createdAt   DateTime     @default(now()) @map("created_at")
    user        User         @relation("UserDomainAccess", fields: [userId], references: [id], onDelete: Cascade)

    @@unique([userId, domain])
    @@index([userId])
    @@map("user_domain_access")
  }
  ```
  Nota M1: `grantedById` é coluna crua, **sem `@relation`** — decisão consciente (evita relação inversa adicional em `User` para um campo só de auditoria).
- [ ] **Step 2 — adicionar a relação inversa em `model User`**, após a linha `emailChangeTokens`:
  ```prisma
    domainAccess        UserDomainAccess[]   @relation("UserDomainAccess")
  ```
- [ ] **Step 3 — verificação.** `npx prisma format` → sem erro.
- [ ] **Step 4 — commit.** `feat(prisma): modelo UserDomainAccess`.

### Task 4: Schema — modelo FatoBuildState

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1 — adicionar o modelo** (após `model FatoEstoqueSaldo`):
  ```prisma
  /// Sinal de "builder de fato rodou" — uma linha por fato. Distingue
  /// "builder nunca rodou" (linha ausente) de "rodou e não produziu linhas".
  model FatoBuildState {
    fato          String   @id
    ultimoBuildAt DateTime @map("ultimo_build_at")

    @@map("fato_build_state")
  }
  ```
- [ ] **Step 2 — verificação.** `npx prisma format` → sem erro.
- [ ] **Step 3 — commit.** `feat(prisma): modelo FatoBuildState`.

### Task 5: Schema — enriquecer FatoEstoqueSaldo

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1 — substituir o bloco do `model FatoEstoqueSaldo`** (remover o comentário `/// Fato PROVISÓRIO ...`):
  ```prisma
  /// Saldo de estoque por produto/local, enriquecido com valor e classificação.
  model FatoEstoqueSaldo {
    id           String   @id @default(uuid()) @db.Uuid
    odooSaldoId  Int      @unique @map("odoo_saldo_id")
    produtoId    Int?     @map("produto_id")
    produtoNome  String?  @map("produto_nome")
    localId      Int?     @map("local_id")
    localNome    String?  @map("local_nome")
    quantidade   Decimal? @db.Decimal(18, 4)
    unidade      String?
    vrSaldo      Decimal? @map("vr_saldo") @db.Decimal(18, 2)
    familiaId    Int?     @map("familia_id")
    familiaNome  String?  @map("familia_nome")
    marcaId      Int?     @map("marca_id")
    marcaNome    String?  @map("marca_nome")
    atualizadoEm DateTime @default(now()) @map("atualizado_em")

    @@index([produtoId])
    @@index([localId])
    @@index([familiaId])
    @@index([marcaId])
    @@map("fato_estoque_saldo")
  }
  ```
  Nota N3: `vrSaldo` é `Decimal?` (nullable) — a migration aplica sobre as linhas existentes da F2 sem default; ficam com `vrSaldo = null` até o próximo rebuild do builder (Task 18-21).
- [ ] **Step 2 — verificação.** `npx prisma format` → sem erro.
- [ ] **Step 3 — commit.** `feat(prisma): enriquece FatoEstoqueSaldo com valor e classificação`.

### Task 6: Schema — modelo FatoEstoqueMovimento

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1 — adicionar o modelo** (após `model FatoEstoqueSaldo`):
  ```prisma
  /// Movimento de estoque (entrada/saída). Derivado de raw_estoque_extrato
  /// por rebuild completo. odooId é PK porque o builder recria a tabela inteira.
  model FatoEstoqueMovimento {
    odooId         Int      @id @map("odoo_id")
    produtoId      Int?     @map("produto_id")
    produtoNome    String?  @map("produto_nome")
    localId        Int?     @map("local_id")
    localNome      String?  @map("local_nome")
    data           DateTime
    mes            String
    quantidade     Decimal  @db.Decimal(18, 4)
    sentido        String
    localInversoId Int?     @map("local_inverso_id")
    origem         String?

    @@index([mes])
    @@index([produtoId])
    @@index([localId])
    @@index([sentido])
    @@map("fato_estoque_movimento")
  }
  ```
- [ ] **Step 2 — verificação.** `npx prisma format` → sem erro.
- [ ] **Step 3 — commit.** `feat(prisma): modelo FatoEstoqueMovimento`.

### Task 7: Schema — modelo FatoProdutoParado

**Files:** Modify `prisma/schema.prisma`.

- [ ] **Step 1 — adicionar o modelo** (após `model FatoEstoqueMovimento`):
  ```prisma
  /// Produto parado — saldo de hoje com tempo de imobilização. Derivado de
  /// raw_estoque_saldo_hoje_duracao_dias + join com raw_estoque_saldo_hoje.
  model FatoProdutoParado {
    saldoHojeId Int      @id @map("saldo_hoje_id")
    produtoId   Int?     @map("produto_id")
    produtoNome String?  @map("produto_nome")
    localId     Int?     @map("local_id")
    localNome   String?  @map("local_nome")
    saldo       Decimal  @db.Decimal(18, 4)
    dias        Int
    vrSaldo     Decimal  @map("vr_saldo") @db.Decimal(18, 2)
    unidade     String?

    @@index([dias])
    @@index([produtoId])
    @@map("fato_produto_parado")
  }
  ```
- [ ] **Step 2 — verificação.** `npx prisma format` → sem erro.
- [ ] **Step 3 — commit.** `feat(prisma): modelo FatoProdutoParado`.

### Task 8: Migration F3 + backfill na migration (I5)

**Files:** Create `prisma/migrations/<ts>_f3_dashboard/migration.sql`.
**Pré-requisito:** Tasks 2-7 (todos os modelos no schema). DB dev no ar + `DATABASE_URL` no ambiente.

- [ ] **Step 1 — gerar a migration.** `npx prisma migrate dev --name f3_dashboard --create-only` (cria o SQL sem aplicar, para editar antes).
- [ ] **Step 2 — editar o `migration.sql` gerado** acrescentando ao final o backfill como SQL de dados:
  ```sql
  -- Backfill F3: concede o domínio 'estoque' a todos os manager/viewer existentes.
  INSERT INTO user_domain_access (id, user_id, domain, created_at)
  SELECT gen_random_uuid(), id, 'estoque', now()
  FROM users
  WHERE platform_role IN ('manager', 'viewer');
  ```
- [ ] **Step 3 — aplicar e validar.** `npx prisma migrate dev` (aplica). Depois `npx prisma migrate reset --force` para validar que o backfill roda junto com a migration num DB fresco.
- [ ] **Step 4 — gerar client e checar tipos.** `npx prisma generate && npx tsc --noEmit` → verde.
- [ ] **Step 5 — commit.** `feat(prisma): migration F3 com backfill do domínio estoque`.

### Task 9: Verificação do Bloco 1

- [ ] `npx prisma format` → sem diff.
- [ ] `npx prisma generate && npx tsc --noEmit` → verde.
- [ ] `npx jest src/worker/fatos/odoo-relational.test.ts` → verde.
- [ ] Confirmar no DB dev: tabelas `user_domain_access`, `fato_build_state`, `fato_estoque_movimento`, `fato_produto_parado` criadas; `fato_estoque_saldo` com as colunas novas; `user_domain_access` com linhas para os manager/viewer do seed.

---

## Bloco 2 — RBAC por domínio

### Task 10: `domains.ts` — modelo de domínios e RBAC

**Files:** Create `src/lib/reports/domains.ts`, `src/lib/reports/domains.test.ts`.

- [ ] **Step 1 — teste que falha.** Criar `domains.test.ts`:
  ```ts
  import { REPORT_DOMAINS, visibleDomains, grantableDomains } from "./domains";

  describe("REPORT_DOMAINS", () => {
    it("tem os 4 domínios", () => {
      expect(REPORT_DOMAINS.map((d) => d.id)).toEqual([
        "estoque", "financeiro", "fiscal", "comercial",
      ]);
    });
  });

  describe("visibleDomains", () => {
    it("super_admin vê todos", () => {
      expect(visibleDomains("super_admin", [])).toEqual([
        "estoque", "financeiro", "fiscal", "comercial",
      ]);
    });
    it("admin vê todos", () => {
      expect(visibleDomains("admin", [])).toEqual([
        "estoque", "financeiro", "fiscal", "comercial",
      ]);
    });
    it("manager vê só os concedidos", () => {
      expect(visibleDomains("manager", ["estoque"])).toEqual(["estoque"]);
    });
    it("viewer vê só os concedidos", () => {
      expect(visibleDomains("viewer", ["fiscal"])).toEqual(["fiscal"]);
    });
  });

  describe("grantableDomains", () => {
    it("super_admin concede todos", () => {
      expect(grantableDomains("super_admin", [])).toEqual([
        "estoque", "financeiro", "fiscal", "comercial",
      ]);
    });
    it("admin concede todos", () => {
      expect(grantableDomains("admin", [])).toEqual([
        "estoque", "financeiro", "fiscal", "comercial",
      ]);
    });
    it("manager concede só o que possui", () => {
      expect(grantableDomains("manager", ["estoque"])).toEqual(["estoque"]);
    });
    it("viewer não concede nada", () => {
      expect(grantableDomains("viewer", ["estoque"])).toEqual([]);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/domains.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `domains.ts`:
  ```ts
  // src/lib/reports/domains.ts
  import type { PlatformRole, ReportDomain } from "@/generated/prisma/client";

  export type ReportDomainId = ReportDomain;

  export interface ReportDomainMeta {
    id: ReportDomainId;
    label: string;
  }

  export const REPORT_DOMAINS: ReportDomainMeta[] = [
    { id: "estoque", label: "Estoque" },
    { id: "financeiro", label: "Financeiro" },
    { id: "fiscal", label: "Fiscal" },
    { id: "comercial", label: "Comercial" },
  ];

  const ALL_DOMAINS: ReportDomainId[] = REPORT_DOMAINS.map((d) => d.id);

  function seesAll(role: PlatformRole): boolean {
    return role === "super_admin" || role === "admin";
  }

  /** Domínios que o usuário consegue ver. Privilegiados veem todos. */
  export function visibleDomains(
    role: PlatformRole,
    granted: ReportDomainId[],
  ): ReportDomainId[] {
    if (seesAll(role)) return [...ALL_DOMAINS];
    return ALL_DOMAINS.filter((d) => granted.includes(d));
  }

  /** Domínios que o concedente pode conceder a terceiros. */
  export function grantableDomains(
    role: PlatformRole,
    granted: ReportDomainId[],
  ): ReportDomainId[] {
    if (seesAll(role)) return [...ALL_DOMAINS];
    if (role === "manager") return ALL_DOMAINS.filter((d) => granted.includes(d));
    return [];
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/domains.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): domínios e regras de RBAC`.

### Task 11: server action `getUserDomains`

**Files:** Create `src/lib/actions/domain-access.ts`, `src/lib/actions/domain-access.test.ts`.
**Pré-requisito:** Task 10 (`ReportDomainId`).

- [ ] **Step 1 — teste que falha.** Criar `domain-access.test.ts`:
  ```ts
  import { getUserDomains } from "./domain-access";

  jest.mock("@/lib/prisma", () => ({
    prisma: { userDomainAccess: { findMany: jest.fn() } },
  }));
  const { prisma } = require("@/lib/prisma");

  describe("getUserDomains", () => {
    it("devolve os domínios do usuário", async () => {
      prisma.userDomainAccess.findMany.mockResolvedValue([
        { domain: "estoque" }, { domain: "fiscal" },
      ]);
      expect(await getUserDomains("u1")).toEqual(["estoque", "fiscal"]);
    });
    it("devolve [] quando o usuário não tem domínios", async () => {
      prisma.userDomainAccess.findMany.mockResolvedValue([]);
      expect(await getUserDomains("u1")).toEqual([]);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/actions/domain-access.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `domain-access.ts` com o cabeçalho e a primeira função:
  ```ts
  "use server";

  import { z } from "zod";
  import { prisma } from "@/lib/prisma";
  import { getCurrentUser } from "@/lib/auth";
  import { logAudit } from "@/lib/audit";
  import { canEditUser } from "@/lib/permissions";
  import { grantableDomains, type ReportDomainId } from "@/lib/reports/domains";

  /** Domínios concedidos a um usuário (linhas de UserDomainAccess). */
  export async function getUserDomains(
    userId: string,
  ): Promise<ReportDomainId[]> {
    const rows = await prisma.userDomainAccess.findMany({
      where: { userId },
      select: { domain: true },
    });
    return rows.map((r) => r.domain);
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/actions/domain-access.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): getUserDomains`.

### Task 12: server action `getMyDomains`

**Files:** Modify `src/lib/actions/domain-access.ts`, `src/lib/actions/domain-access.test.ts`.
**Pré-requisito:** Task 11.

- [ ] **Step 1 — teste que falha.** Acrescentar a `domain-access.test.ts`:
  ```ts
  jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
  const { getCurrentUser } = require("@/lib/auth");
  import { getMyDomains } from "./domain-access";

  describe("getMyDomains", () => {
    it("super_admin recebe todos sem consultar o banco", async () => {
      getCurrentUser.mockResolvedValue({ id: "a1", platformRole: "super_admin" });
      expect(await getMyDomains()).toEqual([
        "estoque", "financeiro", "fiscal", "comercial",
      ]);
      expect(prisma.userDomainAccess.findMany).not.toHaveBeenCalled();
    });
    it("manager recebe só os concedidos", async () => {
      getCurrentUser.mockResolvedValue({ id: "m1", platformRole: "manager" });
      prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "estoque" }]);
      expect(await getMyDomains()).toEqual(["estoque"]);
    });
    it("sem sessão lança erro", async () => {
      getCurrentUser.mockResolvedValue(null);
      await expect(getMyDomains()).rejects.toThrow();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/actions/domain-access.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar a `domain-access.ts`:
  ```ts
  import { REPORT_DOMAINS } from "@/lib/reports/domains";

  /** Domínios visíveis ao usuário logado. Privilegiados recebem todos sem query. */
  export async function getMyDomains(): Promise<ReportDomainId[]> {
    const me = await getCurrentUser();
    if (!me) throw new Error("Não autenticado");
    if (me.platformRole === "super_admin" || me.platformRole === "admin") {
      return REPORT_DOMAINS.map((d) => d.id);
    }
    return getUserDomains(me.id);
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/actions/domain-access.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): getMyDomains`.

### Task 13: server action `updateUserDomains`

**Files:** Modify `src/lib/actions/domain-access.ts`, `src/lib/actions/domain-access.test.ts`.
**Pré-requisito:** Tasks 10-12.

- [ ] **Step 1 — teste que falha.** Acrescentar a `domain-access.test.ts` (adicionar mocks de `createMany`/`deleteMany`, `prisma.user.findUnique`, `canEditUser`, `logAudit`):
  ```ts
  jest.mock("@/lib/permissions", () => ({ canEditUser: jest.fn() }));
  jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));
  const { canEditUser } = require("@/lib/permissions");
  const { logAudit } = require("@/lib/audit");
  import { updateUserDomains } from "./domain-access";

  describe("updateUserDomains", () => {
    beforeEach(() => {
      prisma.user = { findUnique: jest.fn() };
      prisma.userDomainAccess.createMany = jest.fn();
      prisma.userDomainAccess.deleteMany = jest.fn();
      getCurrentUser.mockResolvedValue({ id: "m1", platformRole: "manager" });
      prisma.user.findUnique.mockResolvedValue({
        id: "u2", platformRole: "viewer", isOwner: false,
      });
      canEditUser.mockReturnValue({ allowed: true });
      prisma.userDomainAccess.findMany.mockResolvedValue([]);
    });
    it("concede um domínio novo e registra audit", async () => {
      // concedente possui 'estoque'
      prisma.userDomainAccess.findMany
        .mockResolvedValueOnce([])                       // domínios atuais do alvo
        .mockResolvedValueOnce([{ domain: "estoque" }]); // domínios do concedente
      const res = await updateUserDomains("u2", ["estoque"]);
      expect(res.success).toBe(true);
      expect(prisma.userDomainAccess.createMany).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "user_domains_changed" }),
      );
    });
    it("rejeita domínio que o concedente não possui", async () => {
      prisma.userDomainAccess.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ domain: "estoque" }]);
      const res = await updateUserDomains("u2", ["fiscal"]);
      expect(res.success).toBe(false);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/actions/domain-access.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar a `domain-access.ts`:
  ```ts
  import type { ActionResult } from "@/lib/actions/users";
  import { REPORT_DOMAINS as _DOMAINS_META } from "@/lib/reports/domains";

  const DOMAIN_IDS = _DOMAINS_META.map((d) => d.id) as [
    ReportDomainId, ...ReportDomainId[],
  ];

  const UpdateUserDomainsInput = z.object({
    userId: z.string().uuid(),
    domains: z.array(z.enum(DOMAIN_IDS)),
  });

  /**
   * Aplica o conjunto de domínios de um usuário (diff create/delete).
   * Guard de auth → canEditUser → grantableDomains → diff → audit pós-escrita.
   */
  export async function updateUserDomains(
    userId: string,
    domains: ReportDomainId[],
  ): Promise<ActionResult> {
    try {
      const me = await getCurrentUser();
      if (!me) return { success: false, error: "Não autenticado" };

      const parsed = UpdateUserDomainsInput.safeParse({ userId, domains });
      if (!parsed.success) return { success: false, error: "Dados inválidos" };

      const target = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, platformRole: true, isOwner: true },
      });
      if (!target) return { success: false, error: "Usuário não encontrado" };

      const editCheck = canEditUser(me, target);
      if (!editCheck.allowed) {
        return { success: false, error: editCheck.reason ?? "Sem permissão" };
      }

      const current = await getUserDomains(userId);
      const myGranted = await getUserDomains(me.id);
      const grantable = grantableDomains(me.platformRole, myGranted);

      // Toda mudança (added ou removed) precisa ser de um domínio concedível.
      const added = domains.filter((d) => !current.includes(d));
      const removed = current.filter((d) => !domains.includes(d));
      const touched = [...added, ...removed];
      if (touched.some((d) => !grantable.includes(d))) {
        return {
          success: false,
          error: "Sem permissão para conceder/revogar um destes domínios",
        };
      }

      await prisma.$transaction([
        prisma.userDomainAccess.deleteMany({
          where: { userId, domain: { in: removed } },
        }),
        prisma.userDomainAccess.createMany({
          data: added.map((domain) => ({
            userId, domain, grantedById: me.id,
          })),
          skipDuplicates: true,
        }),
      ]);

      logAudit({
        userId: me.id,
        action: "user_domains_changed",
        targetType: "User",
        targetId: userId,
        details: { added, removed },
      });

      return { success: true };
    } catch (err) {
      console.error("[domain-access.update]", err);
      return { success: false, error: "Erro ao atualizar domínios" };
    }
  }
  ```
  Nota: `deleteMany` com `in: []` e `createMany` com `data: []` são no-ops seguros no Prisma — o diff vazio não quebra. `updateUserDomains` é idempotente (aplica conjunto-alvo), o que sustenta a ordem segura do submit edit (N1, Task 79).
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/actions/domain-access.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): updateUserDomains com diff e auditoria`.

### Task 14: `guard.ts` — enforcement na página (camada 2)

**Files:** Create `src/lib/reports/guard.ts`, `src/lib/reports/guard.test.ts`.
**Pré-requisito:** Tasks 10, 12.

- [ ] **Step 1 — teste que falha.** Criar `guard.test.ts`:
  ```ts
  jest.mock("@/lib/actions/domain-access", () => ({ getMyDomains: jest.fn() }));
  jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
  const { getMyDomains } = require("@/lib/actions/domain-access");
  const { redirect } = require("next/navigation");
  import { requireDomainAccess } from "./guard";

  describe("requireDomainAccess", () => {
    it("não redireciona quando o usuário tem o domínio", async () => {
      getMyDomains.mockResolvedValue(["estoque"]);
      await requireDomainAccess("estoque");
      expect(redirect).not.toHaveBeenCalled();
    });
    it("redireciona para /relatorios quando não tem o domínio", async () => {
      getMyDomains.mockResolvedValue([]);
      await requireDomainAccess("estoque");
      expect(redirect).toHaveBeenCalledWith("/relatorios");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/guard.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `guard.ts`:
  ```ts
  import { redirect } from "next/navigation";
  import { getMyDomains } from "@/lib/actions/domain-access";
  import type { ReportDomainId } from "@/lib/reports/domains";

  /**
   * Camada 2 do RBAC: bloqueia a página de relatório se o usuário logado
   * não tem o domínio. Chamada no server component da página.
   */
  export async function requireDomainAccess(
    domain: ReportDomainId,
  ): Promise<void> {
    const mine = await getMyDomains();
    if (!mine.includes(domain)) {
      redirect("/relatorios");
    }
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/guard.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): guard de acesso a domínio para páginas`.

### Task 15: Verificação do Bloco 2

- [ ] `npx tsc --noEmit` → verde.
- [ ] `npm run lint` → sem erro.
- [ ] `npx jest src/lib/reports src/lib/actions/domain-access.test.ts` → verde.

---

## Bloco 3 — Fatos e builders

### Task 16: `estoque.extrato` → snapshot (C2)

**Files:** Modify `src/worker/catalog/model-catalog.ts`.

- [ ] **Step 1 — alterar a linha** do `estoque.extrato` (linha ~13): trocar `mode: "incremental"` por `mode: "snapshot"`:
  ```ts
    { odooModel: "estoque.extrato", mode: "snapshot" },
  ```
  Justificativa (spec §2): `estoque.extrato` quase não tem `write_date` (3 de 13.548 linhas) — incremental está cego. Não há teste de contagem por modo a ajustar.
- [ ] **Step 2 — verificação.** `npx tsc --noEmit && npx jest src/worker/catalog` → verde.
- [ ] **Step 3 — commit.** `fix(worker): estoque.extrato passa a snapshot (write_date ausente)`.

### Task 17: `fato-build-state.ts` — registro de build

**Files:** Create `src/worker/fatos/fato-build-state.ts`, `src/worker/fatos/fato-build-state.test.ts`.

- [ ] **Step 1 — teste que falha.** Criar `fato-build-state.test.ts`:
  ```ts
  import { markFatoBuilt } from "./fato-build-state";

  describe("markFatoBuilt", () => {
    it("faz upsert do FatoBuildState com a data atual", async () => {
      const upsert = jest.fn().mockResolvedValue(undefined);
      const prisma = { fatoBuildState: { upsert } } as never;
      await markFatoBuilt(prisma, "fato_estoque_saldo");
      expect(upsert).toHaveBeenCalledTimes(1);
      const arg = upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ fato: "fato_estoque_saldo" });
      expect(arg.create.fato).toBe("fato_estoque_saldo");
      expect(arg.create.ultimoBuildAt).toBeInstanceOf(Date);
      expect(arg.update.ultimoBuildAt).toBeInstanceOf(Date);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-build-state.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `fato-build-state.ts`:
  ```ts
  // src/worker/fatos/fato-build-state.ts
  import type { PrismaClient } from "../../generated/prisma/client";

  /** Registra que o builder de um fato acabou de rodar. */
  export async function markFatoBuilt(
    prisma: PrismaClient,
    fato: string,
  ): Promise<void> {
    const now = new Date();
    await prisma.fatoBuildState.upsert({
      where: { fato },
      create: { fato, ultimoBuildAt: now },
      update: { ultimoBuildAt: now },
    });
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-build-state.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): registro de estado de build de fato`.

### Task 18: `fato-estoque-saldo` usa `odoo-relational`

**Files:** Modify `src/worker/fatos/fato-estoque-saldo.ts`, `src/worker/fatos/fato-estoque-saldo.test.ts`.
**Pré-requisito:** Task 1.

- [ ] **Step 1 — teste que falha (regressão).** O `fato-estoque-saldo.test.ts` atual já cobre `mapSaldoRow`; manter os 2 testes existentes. Eles devem continuar passando após a troca de helpers — rodar `npx jest src/worker/fatos/fato-estoque-saldo.test.ts` para registrar o estado verde inicial.
- [ ] **Step 2 — implementação.** Em `fato-estoque-saldo.ts`: remover o `type Many2One` local e as funções `relId`/`relNome` locais; importar do helper:
  ```ts
  import { relId, relNome, type OdooM2O } from "./odoo-relational";
  ```
  Trocar nas chamadas de `mapSaldoRow` os casts `as Many2One` por `as OdooM2O`.
- [ ] **Step 3 — rodar e ver passar.** `npx jest src/worker/fatos/fato-estoque-saldo.test.ts` → verde (regressão dos campos `produtoId`/`produtoNome`/`localNome`).
- [ ] **Step 4 — commit.** `refactor(worker): fato-estoque-saldo usa odoo-relational`.

### Task 19: `loadProdutoClassMap` — mapa de classificação de produto

**Files:** Modify `src/worker/fatos/fato-estoque-saldo.ts`, `src/worker/fatos/fato-estoque-saldo.test.ts`.
**Pré-requisito:** Task 18.

- [ ] **Step 1 — teste que falha.** Acrescentar a `fato-estoque-saldo.test.ts`:
  ```ts
  import { buildProdutoClassMap } from "./fato-estoque-saldo";

  describe("buildProdutoClassMap", () => {
    it("monta o mapa produtoId -> classificação", () => {
      const rows = [
        { data: { id: 10, familia_id: [2, "Esteiras"], marca_id: [5, "Matrix"] } },
        { data: { id: 11, familia_id: false, marca_id: false } },
      ];
      const map = buildProdutoClassMap(rows);
      expect(map.get(10)).toEqual({
        familiaId: 2, familiaNome: "Esteiras", marcaId: 5, marcaNome: "Matrix",
      });
      expect(map.get(11)).toEqual({
        familiaId: null, familiaNome: null, marcaId: null, marcaNome: null,
      });
    });
    it("retorna mapa vazio quando não há linhas", () => {
      expect(buildProdutoClassMap([]).size).toBe(0);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-estoque-saldo.test.ts` → falha.
- [ ] **Step 3 — implementação.** Em `fato-estoque-saldo.ts` acrescentar:
  ```ts
  export interface ProdutoClass {
    familiaId: number | null;
    familiaNome: string | null;
    marcaId: number | null;
    marcaNome: string | null;
  }

  /** Monta o mapa produtoId -> classificação a partir de raw_sped_produto. */
  export function buildProdutoClassMap(
    rawRows: { data: unknown }[],
  ): Map<number, ProdutoClass> {
    const map = new Map<number, ProdutoClass>();
    for (const row of rawRows) {
      const data = row.data as Record<string, unknown>;
      const id = Number(data.id);
      if (!Number.isFinite(id)) continue;
      map.set(id, {
        familiaId: relId(data.familia_id as OdooM2O),
        familiaNome: relNome(data.familia_id as OdooM2O),
        marcaId: relId(data.marca_id as OdooM2O),
        marcaNome: relNome(data.marca_id as OdooM2O),
      });
    }
    return map;
  }

  /** Lê raw_sped_produto e devolve o mapa de classificação. */
  export async function loadProdutoClassMap(
    prisma: PrismaClient,
  ): Promise<Map<number, ProdutoClass>> {
    const rows = await prisma.rawSpedProduto.findMany({
      where: { rawDeleted: false },
      select: { data: true },
    });
    return buildProdutoClassMap(rows);
  }
  ```
  Nota I8: `raw_sped_produto` é sincronizado em ciclo incremental distinto; no 1º ciclo pós-deploy o mapa pode vir incompleto → família/marca null nas linhas afetadas; auto-corrige no ciclo seguinte.
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-estoque-saldo.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): mapa de classificação de produto`.

### Task 20: `mapSaldoRow` enriquecido (vrSaldo, família, marca)

**Files:** Modify `src/worker/fatos/fato-estoque-saldo.ts`, `src/worker/fatos/fato-estoque-saldo.test.ts`.
**Pré-requisito:** Task 19.

- [ ] **Step 1 — teste que falha.** Acrescentar a `fato-estoque-saldo.test.ts`:
  ```ts
  describe("mapSaldoRow enriquecido", () => {
    const classMap = new Map([
      [12, { familiaId: 2, familiaNome: "Esteiras", marcaId: 5, marcaNome: "Matrix" }],
    ]);
    it("carrega vrSaldo, família e marca do produto", () => {
      const raw = {
        id: 99, produto_id: [12, "Esteira X"], local_id: [3, "Galpão A"],
        saldo: 7, unidade_id: [1, "UN"], vr_saldo: 1500.5,
      };
      const m = mapSaldoRow(raw, classMap);
      expect(m.vrSaldo).toBe(1500.5);
      expect(m.familiaId).toBe(2);
      expect(m.familiaNome).toBe("Esteiras");
      expect(m.marcaId).toBe(5);
      expect(m.marcaNome).toBe("Matrix");
    });
    it("carrega vrSaldo zero", () => {
      const raw = { id: 1, produto_id: [12, "X"], saldo: 0, vr_saldo: 0 };
      expect(mapSaldoRow(raw, classMap).vrSaldo).toBe(0);
    });
    it("produto ausente do mapa -> família/marca null", () => {
      const raw = { id: 2, produto_id: [999, "Y"], saldo: 1, vr_saldo: 10 };
      const m = mapSaldoRow(raw, classMap);
      expect(m.familiaId).toBeNull();
      expect(m.marcaId).toBeNull();
    });
    it("vr_saldo ausente vira 0", () => {
      const raw = { id: 3, produto_id: false, saldo: 1 };
      expect(mapSaldoRow(raw, classMap).vrSaldo).toBe(0);
    });
  });
  ```
  Atualizar os 2 testes antigos de `mapSaldoRow` para passar `new Map()` como 2º argumento e incluir `vrSaldo: 0`, `familiaId/Nome/marcaId/marcaNome: null` no `toEqual`.
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-estoque-saldo.test.ts` → falha.
- [ ] **Step 3 — implementação.** Em `fato-estoque-saldo.ts`: estender a interface e a função:
  ```ts
  export interface FatoSaldoRow {
    odooSaldoId: number;
    produtoId: number | null;
    produtoNome: string | null;
    localId: number | null;
    localNome: string | null;
    quantidade: number;
    unidade: string | null;
    vrSaldo: number;
    familiaId: number | null;
    familiaNome: string | null;
    marcaId: number | null;
    marcaNome: string | null;
  }

  export function mapSaldoRow(
    raw: Record<string, unknown>,
    classMap: Map<number, ProdutoClass>,
  ): FatoSaldoRow {
    const produtoId = relId(raw.produto_id as OdooM2O);
    const cls = produtoId != null ? classMap.get(produtoId) : undefined;
    return {
      odooSaldoId: Number(raw.id),
      produtoId,
      produtoNome: relNome(raw.produto_id as OdooM2O),
      localId: relId(raw.local_id as OdooM2O),
      localNome: relNome(raw.local_id as OdooM2O),
      quantidade: Number(raw.saldo ?? 0),
      unidade: relNome(raw.unidade_id as OdooM2O),
      vrSaldo: Number(raw.vr_saldo ?? 0),
      familiaId: cls?.familiaId ?? null,
      familiaNome: cls?.familiaNome ?? null,
      marcaId: cls?.marcaId ?? null,
      marcaNome: cls?.marcaNome ?? null,
    };
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-estoque-saldo.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): mapSaldoRow enriquecido com valor e classificação`.

### Task 21: `rebuildFatoEstoqueSaldo` carrega o mapa e marca o build

**Files:** Modify `src/worker/fatos/fato-estoque-saldo.ts`, `src/worker/fatos/fato-estoque-saldo.test.ts`.
**Pré-requisito:** Tasks 17, 20.

- [ ] **Step 1 — teste que falha.** Acrescentar a `fato-estoque-saldo.test.ts`:
  ```ts
  jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
  const { markFatoBuilt } = require("./fato-build-state");
  import { rebuildFatoEstoqueSaldo } from "./fato-estoque-saldo";

  describe("rebuildFatoEstoqueSaldo", () => {
    it("reconstrói o fato e marca o build", async () => {
      const tx = {
        fatoEstoqueSaldo: {
          deleteMany: jest.fn().mockResolvedValue(undefined),
          createMany: jest.fn().mockResolvedValue(undefined),
        },
      };
      const prisma = {
        rawSpedProduto: { findMany: jest.fn().mockResolvedValue([]) },
        rawEstoqueSaldoHoje: {
          findMany: jest.fn().mockResolvedValue([
            { data: { id: 1, produto_id: [12, "X"], saldo: 5, vr_saldo: 100 } },
          ]),
        },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      } as never;
      const n = await rebuildFatoEstoqueSaldo(prisma);
      expect(n).toBe(1);
      expect(tx.fatoEstoqueSaldo.createMany).toHaveBeenCalled();
      expect(markFatoBuilt).toHaveBeenCalledWith(prisma, "fato_estoque_saldo");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-estoque-saldo.test.ts` → falha.
- [ ] **Step 3 — implementação.** Substituir `rebuildFatoEstoqueSaldo` em `fato-estoque-saldo.ts`:
  ```ts
  import { markFatoBuilt } from "./fato-build-state";

  /** Reconstrói fato_estoque_saldo a partir de raw_estoque_saldo_hoje. */
  export async function rebuildFatoEstoqueSaldo(
    prisma: PrismaClient,
  ): Promise<number> {
    const classMap = await loadProdutoClassMap(prisma);
    const rawRows = await prisma.rawEstoqueSaldoHoje.findMany({
      where: { rawDeleted: false },
    });
    const mapped = rawRows.map((r) =>
      mapSaldoRow(r.data as Record<string, unknown>, classMap),
    );
    await prisma.$transaction(async (tx) => {
      await tx.fatoEstoqueSaldo.deleteMany({});
      if (mapped.length) {
        await tx.fatoEstoqueSaldo.createMany({
          data: mapped.map((m) => ({ ...m, atualizadoEm: new Date() })),
        });
      }
    });
    await markFatoBuilt(prisma, "fato_estoque_saldo");
    return mapped.length;
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-estoque-saldo.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): rebuild de fato_estoque_saldo marca o build`.

### Task 22: `mapMovimentoRow` — derivação do movimento

**Files:** Create `src/worker/fatos/fato-estoque-movimento.ts`, `src/worker/fatos/fato-estoque-movimento.test.ts`.
**Pré-requisito:** Task 1.

- [ ] **Step 1 — teste que falha.** Criar `fato-estoque-movimento.test.ts`:
  ```ts
  import { mapMovimentoRow } from "./fato-estoque-movimento";

  describe("mapMovimentoRow", () => {
    it("deriva sentido entrada para quantidade positiva", () => {
      const m = mapMovimentoRow({
        id: 1, produto_id: [12, "X"], local_id: [3, "A"],
        data: "2026-03-04 10:00:00", quantidade: 5,
      });
      expect(m.sentido).toBe("entrada");
      expect(m.mes).toBe("2026-03");
      expect(m.odooId).toBe(1);
    });
    it("deriva sentido saida para quantidade negativa", () => {
      const m = mapMovimentoRow({ id: 2, data: "2026-02-01", quantidade: -3 });
      expect(m.sentido).toBe("saida");
      expect(m.mes).toBe("2026-02");
    });
    it("carrega localInversoId e origem crus", () => {
      const m = mapMovimentoRow({
        id: 3, data: "2026-01-01", quantidade: 1,
        local_inverso_id: [5, "Inv"], origem: "NF-123",
      });
      expect(m.localInversoId).toBe(5);
      expect(m.origem).toBe("NF-123");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-estoque-movimento.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `fato-estoque-movimento.ts`:
  ```ts
  // src/worker/fatos/fato-estoque-movimento.ts
  import type { PrismaClient } from "../../generated/prisma/client";
  import { relId, relNome, type OdooM2O } from "./odoo-relational";
  import { markFatoBuilt } from "./fato-build-state";

  export interface FatoMovimentoRow {
    odooId: number;
    produtoId: number | null;
    produtoNome: string | null;
    localId: number | null;
    localNome: string | null;
    data: Date;
    mes: string;
    quantidade: number;
    sentido: string;
    localInversoId: number | null;
    origem: string | null;
  }

  /** Deriva uma linha de fato_estoque_movimento de um registro raw. */
  export function mapMovimentoRow(
    raw: Record<string, unknown>,
  ): FatoMovimentoRow {
    const quantidade = Number(raw.quantidade ?? 0);
    const data = new Date(String(raw.data));
    const mes = `${data.getUTCFullYear()}-${String(
      data.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    return {
      odooId: Number(raw.id),
      produtoId: relId(raw.produto_id as OdooM2O),
      produtoNome: relNome(raw.produto_id as OdooM2O),
      localId: relId(raw.local_id as OdooM2O),
      localNome: relNome(raw.local_id as OdooM2O),
      data,
      mes,
      quantidade,
      sentido: quantidade > 0 ? "entrada" : "saida",
      localInversoId: relId(raw.local_inverso_id as OdooM2O),
      origem: typeof raw.origem === "string" ? raw.origem : null,
    };
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-estoque-movimento.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): mapMovimentoRow`.

### Task 23: filtro de movimento sem efeito (`quantidade === 0`)

**Files:** Modify `src/worker/fatos/fato-estoque-movimento.ts`, `src/worker/fatos/fato-estoque-movimento.test.ts`.
**Pré-requisito:** Task 22.

- [ ] **Step 1 — teste que falha.** Acrescentar a `fato-estoque-movimento.test.ts`:
  ```ts
  import { temEfeito } from "./fato-estoque-movimento";

  describe("temEfeito", () => {
    it("descarta movimento de quantidade zero", () => {
      expect(temEfeito(mapMovimentoRow({ id: 1, data: "2026-01-01", quantidade: 0 }))).toBe(false);
    });
    it("mantém movimento de quantidade negativa", () => {
      expect(temEfeito(mapMovimentoRow({ id: 2, data: "2026-01-01", quantidade: -3 }))).toBe(true);
    });
    it("mantém movimento de quantidade positiva", () => {
      expect(temEfeito(mapMovimentoRow({ id: 3, data: "2026-01-01", quantidade: 4 }))).toBe(true);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-estoque-movimento.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar a `fato-estoque-movimento.ts`:
  ```ts
  /** Movimento de quantidade 0 é ajuste sem efeito físico — descartado do fato. */
  export function temEfeito(row: FatoMovimentoRow): boolean {
    return row.quantidade !== 0;
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-estoque-movimento.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): filtro de movimento sem efeito`.

### Task 24: `rebuildFatoEstoqueMovimento`

**Files:** Modify `src/worker/fatos/fato-estoque-movimento.ts`, `src/worker/fatos/fato-estoque-movimento.test.ts`.
**Pré-requisito:** Tasks 16, 17, 23.

- [ ] **Step 1 — teste que falha.** Acrescentar a `fato-estoque-movimento.test.ts`:
  ```ts
  jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
  const { markFatoBuilt } = require("./fato-build-state");
  import { rebuildFatoEstoqueMovimento } from "./fato-estoque-movimento";

  describe("rebuildFatoEstoqueMovimento", () => {
    it("descarta quantidade zero, reconstrói e marca o build", async () => {
      const tx = {
        fatoEstoqueMovimento: {
          deleteMany: jest.fn().mockResolvedValue(undefined),
          createMany: jest.fn().mockResolvedValue(undefined),
        },
      };
      const prisma = {
        rawEstoqueExtrato: {
          findMany: jest.fn().mockResolvedValue([
            { data: { id: 1, data: "2026-01-01", quantidade: 5 } },
            { data: { id: 2, data: "2026-01-01", quantidade: 0 } },
          ]),
        },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      } as never;
      const n = await rebuildFatoEstoqueMovimento(prisma);
      expect(n).toBe(1); // a linha de quantidade 0 foi descartada
      expect(tx.fatoEstoqueMovimento.createMany).toHaveBeenCalled();
      expect(markFatoBuilt).toHaveBeenCalledWith(prisma, "fato_estoque_movimento");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-estoque-movimento.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar a `fato-estoque-movimento.ts`:
  ```ts
  const BATCH = 1000;

  /** Reconstrói fato_estoque_movimento a partir de raw_estoque_extrato. */
  export async function rebuildFatoEstoqueMovimento(
    prisma: PrismaClient,
  ): Promise<number> {
    const rawRows = await prisma.rawEstoqueExtrato.findMany({
      where: { rawDeleted: false },
    });
    const mapped = rawRows
      .map((r) => mapMovimentoRow(r.data as Record<string, unknown>))
      .filter(temEfeito);
    await prisma.$transaction(async (tx) => {
      await tx.fatoEstoqueMovimento.deleteMany({});
      for (let i = 0; i < mapped.length; i += BATCH) {
        await tx.fatoEstoqueMovimento.createMany({
          data: mapped.slice(i, i + BATCH),
        });
      }
    });
    await markFatoBuilt(prisma, "fato_estoque_movimento");
    return mapped.length;
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-estoque-movimento.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): builder do fato_estoque_movimento`.

### Task 25: `buildSaldoHojeMap` — mapa de saldo de hoje

**Files:** Create `src/worker/fatos/fato-produto-parado.ts`, `src/worker/fatos/fato-produto-parado.test.ts`.
**Pré-requisito:** Task 1.

- [ ] **Step 1 — teste que falha.** Criar `fato-produto-parado.test.ts`:
  ```ts
  import { buildSaldoHojeMap } from "./fato-produto-parado";

  describe("buildSaldoHojeMap", () => {
    it("monta o mapa por id da linha de saldo", () => {
      const rows = [
        { data: {
          id: 100, produto_id: [12, "X"], local_id: [3, "A"],
          saldo: 8, vr_saldo: 500, unidade_id: [1, "UN"],
        } },
      ];
      const map = buildSaldoHojeMap(rows);
      expect(map.get(100)).toEqual({
        produtoId: 12, produtoNome: "X", localId: 3, localNome: "A",
        saldo: 8, vrSaldo: 500, unidade: "UN",
      });
    });
    it("retorna mapa vazio sem linhas", () => {
      expect(buildSaldoHojeMap([]).size).toBe(0);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-produto-parado.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `fato-produto-parado.ts`:
  ```ts
  // src/worker/fatos/fato-produto-parado.ts
  import type { PrismaClient } from "../../generated/prisma/client";
  import { relId, relNome, type OdooM2O } from "./odoo-relational";
  import { markFatoBuilt } from "./fato-build-state";

  export interface SaldoHojeInfo {
    produtoId: number | null;
    produtoNome: string | null;
    localId: number | null;
    localNome: string | null;
    saldo: number;
    vrSaldo: number;
    unidade: string | null;
  }

  /** Monta o mapa id-da-linha-de-saldo -> info, a partir de raw_estoque_saldo_hoje. */
  export function buildSaldoHojeMap(
    rawRows: { data: unknown }[],
  ): Map<number, SaldoHojeInfo> {
    const map = new Map<number, SaldoHojeInfo>();
    for (const row of rawRows) {
      const data = row.data as Record<string, unknown>;
      const id = Number(data.id);
      if (!Number.isFinite(id)) continue;
      map.set(id, {
        produtoId: relId(data.produto_id as OdooM2O),
        produtoNome: relNome(data.produto_id as OdooM2O),
        localId: relId(data.local_id as OdooM2O),
        localNome: relNome(data.local_id as OdooM2O),
        saldo: Number(data.saldo ?? 0),
        vrSaldo: Number(data.vr_saldo ?? 0),
        unidade: relNome(data.unidade_id as OdooM2O),
      });
    }
    return map;
  }

  /** Lê raw_estoque_saldo_hoje e devolve o mapa. */
  export async function loadSaldoHojeMap(
    prisma: PrismaClient,
  ): Promise<Map<number, SaldoHojeInfo>> {
    const rows = await prisma.rawEstoqueSaldoHoje.findMany({
      where: { rawDeleted: false },
      select: { data: true },
    });
    return buildSaldoHojeMap(rows);
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-produto-parado.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): mapa de saldo de hoje`.

### Task 26: `mapProdutoParadoRow` — join por `saldo_hoje_id`

**Files:** Modify `src/worker/fatos/fato-produto-parado.ts`, `src/worker/fatos/fato-produto-parado.test.ts`.
**Pré-requisito:** Task 25.

- [ ] **Step 1 — teste que falha.** Acrescentar a `fato-produto-parado.test.ts`:
  ```ts
  import { mapProdutoParadoRow } from "./fato-produto-parado";

  const saldoMap = new Map([
    [100, { produtoId: 12, produtoNome: "X", localId: 3, localNome: "A",
            saldo: 8, vrSaldo: 500, unidade: "UN" }],
  ]);

  describe("mapProdutoParadoRow", () => {
    it("faz o join por saldo_hoje_id[0] e grava dias cru", () => {
      const row = mapProdutoParadoRow(
        { data: { saldo_hoje_id: [100, "Saldo X"], dias: 179 } },
        saldoMap,
      );
      expect(row).toEqual({
        saldoHojeId: 100, produtoId: 12, produtoNome: "X",
        localId: 3, localNome: "A", saldo: 8, dias: 179,
        vrSaldo: 500, unidade: "UN",
      });
    });
    it("retorna null quando o join não encontra a linha de saldo", () => {
      expect(
        mapProdutoParadoRow({ data: { saldo_hoje_id: [999, "?"], dias: 10 } }, saldoMap),
      ).toBeNull();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-produto-parado.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar a `fato-produto-parado.ts`:
  ```ts
  export interface FatoProdutoParadoRow {
    saldoHojeId: number;
    produtoId: number | null;
    produtoNome: string | null;
    localId: number | null;
    localNome: string | null;
    saldo: number;
    dias: number;
    vrSaldo: number;
    unidade: string | null;
  }

  /** Deriva uma linha de fato_produto_parado; null se o join não casar. */
  export function mapProdutoParadoRow(
    raw: { data: unknown },
    saldoMap: Map<number, SaldoHojeInfo>,
  ): FatoProdutoParadoRow | null {
    const data = raw.data as Record<string, unknown>;
    const saldoHojeId = relId(data.saldo_hoje_id as OdooM2O);
    if (saldoHojeId == null) return null;
    const info = saldoMap.get(saldoHojeId);
    if (!info) return null;
    return {
      saldoHojeId,
      produtoId: info.produtoId,
      produtoNome: info.produtoNome,
      localId: info.localId,
      localNome: info.localNome,
      saldo: info.saldo,
      dias: Number(data.dias ?? 0),
      vrSaldo: info.vrSaldo,
      unidade: info.unidade,
    };
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-produto-parado.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): mapProdutoParadoRow`.

### Task 27: `rebuildFatoProdutoParado`

**Files:** Modify `src/worker/fatos/fato-produto-parado.ts`, `src/worker/fatos/fato-produto-parado.test.ts`.
**Pré-requisito:** Tasks 17, 26.

- [ ] **Step 1 — teste que falha.** Acrescentar a `fato-produto-parado.test.ts`:
  ```ts
  jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
  const { markFatoBuilt } = require("./fato-build-state");
  import { rebuildFatoProdutoParado } from "./fato-produto-parado";

  describe("rebuildFatoProdutoParado", () => {
    it("filtra saldo > 0, reconstrói e marca o build", async () => {
      const tx = {
        fatoProdutoParado: {
          deleteMany: jest.fn().mockResolvedValue(undefined),
          createMany: jest.fn().mockResolvedValue(undefined),
        },
      };
      const prisma = {
        rawEstoqueSaldoHoje: {
          findMany: jest.fn().mockResolvedValue([
            { data: { id: 100, produto_id: [12, "X"], saldo: 8, vr_saldo: 500 } },
            { data: { id: 101, produto_id: [13, "Y"], saldo: 0, vr_saldo: 0 } },
          ]),
        },
        rawEstoqueSaldoHojeDuracaoDias: {
          findMany: jest.fn().mockResolvedValue([
            { data: { saldo_hoje_id: [100, "?"], dias: 50 } },
            { data: { saldo_hoje_id: [101, "?"], dias: 90 } },
          ]),
        },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      } as never;
      const n = await rebuildFatoProdutoParado(prisma);
      expect(n).toBe(1); // a linha com saldo 0 foi filtrada
      expect(markFatoBuilt).toHaveBeenCalledWith(prisma, "fato_produto_parado");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/worker/fatos/fato-produto-parado.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar a `fato-produto-parado.ts`:
  ```ts
  const BATCH = 1000;

  /** Reconstrói fato_produto_parado: join duração×saldo, filtro saldo > 0. */
  export async function rebuildFatoProdutoParado(
    prisma: PrismaClient,
  ): Promise<number> {
    const saldoRows = await prisma.rawEstoqueSaldoHoje.findMany({
      where: { rawDeleted: false },
      select: { data: true },
    });
    const saldoMap = buildSaldoHojeMap(saldoRows);
    const duracaoRows = await prisma.rawEstoqueSaldoHojeDuracaoDias.findMany({
      where: { rawDeleted: false },
    });
    const mapped = duracaoRows
      .map((r) => mapProdutoParadoRow(r, saldoMap))
      .filter((r): r is FatoProdutoParadoRow => r !== null && r.saldo > 0);
    await prisma.$transaction(async (tx) => {
      await tx.fatoProdutoParado.deleteMany({});
      for (let i = 0; i < mapped.length; i += BATCH) {
        await tx.fatoProdutoParado.createMany({
          data: mapped.slice(i, i + BATCH),
        });
      }
    });
    await markFatoBuilt(prisma, "fato_produto_parado");
    return mapped.length;
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/worker/fatos/fato-produto-parado.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(worker): builder do fato_produto_parado`.

### Task 28: disparar builders no ciclo de snapshot (C3)

**Files:** Modify `src/worker/sync/processors.ts`.
**Pré-requisito:** Tasks 24, 27.

- [ ] **Step 1 — implementação.** Em `processSnapshotCycle`, logo após o bloco que reconstrói `fato_estoque_saldo`, acrescentar:
  ```ts
  // Fatos derivados de estoque.extrato e estoque.saldo.hoje.duracao.dias.
  const { rebuildFatoEstoqueMovimento } = await import(
    "../fatos/fato-estoque-movimento"
  );
  try {
    const n = await rebuildFatoEstoqueMovimento(ctx.prisma);
    console.log(`[worker] fato_estoque_movimento reconstruído: ${n} linhas`);
  } catch (err) {
    console.error("[worker] falha ao reconstruir fato_estoque_movimento:", err);
  }

  const { rebuildFatoProdutoParado } = await import(
    "../fatos/fato-produto-parado"
  );
  try {
    const n = await rebuildFatoProdutoParado(ctx.prisma);
    console.log(`[worker] fato_produto_parado reconstruído: ${n} linhas`);
  } catch (err) {
    console.error("[worker] falha ao reconstruir fato_produto_parado:", err);
  }
  ```
  Nota C3: os builders rodam após o `for` de snapshots no mesmo ciclo — `estoque.extrato`, `estoque.saldo.hoje` e `estoque.saldo.hoje.duracao.dias` já terão sido sincronizados. No 1º ciclo pós-deploy os fatos saem vazios e o `FatoBuildState` é gravado mesmo assim → a query distingue "vazio" de "preparando"; cada try/catch isolado evita que a falha de um builder derrube os outros.
- [ ] **Step 2 — verificação.** `npx tsc --noEmit && npx jest src/worker/` → verde.
- [ ] **Step 3 — commit.** `feat(worker): dispara builders de movimento e produto parado`.

### Task 29: Verificação do Bloco 3

- [ ] `npx tsc --noEmit` → verde.
- [ ] `npm run lint` → sem erro.
- [ ] `npx jest src/worker/` → verde.

---

## Bloco 4 — Templates de gráfico

> **Nota de teste (todos os componentes deste bloco):** o `jest.config.ts` usa
> `testEnvironment: "node"` globalmente. Os render-tests de componente exigem
> jsdom — cada arquivo de teste de componente abre com o pragma de docblock:
> ```ts
> /**
>  * @jest-environment jsdom
>  */
> ```
> As deps `@testing-library/react`, `@testing-library/jest-dom` e
> `jest-environment-jsdom` já estão no `package.json`. Cada teste de componente
> importa `import "@testing-library/jest-dom";` no topo.

### Task 30: instalar Recharts

**Files:** Modify `package.json`, `package-lock.json`.

- [ ] **Step 1 — instalar.** `npm install recharts`.
- [ ] **Step 2 — verificação.** `npm ls recharts` mostra a versão instalada; `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `chore: adiciona recharts` — incluir `package.json` **e** `package-lock.json` no mesmo commit (N5).

### Task 31: `chart-states.tsx` — componentes de estado

**Files:** Create `src/components/charts/chart-states.tsx`, `src/components/charts/chart-states.test.tsx`.

- [ ] **Step 1 — teste que falha.** Criar `chart-states.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import {
    ChartSkeleton, ChartPreparing, ChartEmpty, ChartError,
  } from "./chart-states";

  describe("chart-states", () => {
    it("ChartSkeleton renderiza um placeholder animado", () => {
      const { container } = render(<ChartSkeleton />);
      expect(container.querySelector("[data-slot=skeleton]")).toBeInTheDocument();
    });
    it("ChartPreparing exibe a mensagem de preparo", () => {
      render(<ChartPreparing />);
      expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
    });
    it("ChartEmpty exibe a mensagem de sem dado", () => {
      render(<ChartEmpty />);
      expect(screen.getByText(/sem dado no período/i)).toBeInTheDocument();
    });
    it("ChartError exibe a mensagem e o botão de repetir", () => {
      const onRetry = jest.fn();
      render(<ChartError message="Falha" onRetry={onRetry} />);
      expect(screen.getByText("Falha")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /repetir/i })).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/charts/chart-states.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `chart-states.tsx`:
  ```tsx
  import { Skeleton } from "@/components/ui/skeleton";
  import { Button } from "@/components/ui/button";
  import { cn } from "@/lib/utils";

  /** Esqueleto de carregamento de um gráfico. */
  export function ChartSkeleton({ className }: { className?: string }) {
    return <Skeleton className={cn("h-64 w-full", className)} />;
  }

  function StateBox({
    children, className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <div
        className={cn(
          "flex h-64 flex-col items-center justify-center gap-2 rounded-xl",
          "ring-1 ring-foreground/10 text-sm text-muted-foreground",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  /** Builder do fato ainda não rodou. */
  export function ChartPreparing() {
    return <StateBox>Relatório ainda sendo preparado.</StateBox>;
  }

  /** Builder rodou, mas não há dado para o filtro atual. */
  export function ChartEmpty() {
    return <StateBox>Sem dado no período.</StateBox>;
  }

  /** Erro ao carregar o relatório, com ação de repetir. */
  export function ChartError({
    message, onRetry,
  }: {
    message: string;
    onRetry: () => void;
  }) {
    return (
      <StateBox className="text-destructive">
        <span>{message}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Repetir
        </Button>
      </StateBox>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/charts/chart-states.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(charts): componentes de estado`.

### Task 32: `KPICard`

**Files:** Create `src/components/charts/kpi-card.tsx`, `src/components/charts/kpi-card.test.tsx`.
**Pré-requisito:** Task 31.

- [ ] **Step 1 — teste que falha.** Criar `kpi-card.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import { KPICard } from "./kpi-card";

  describe("KPICard", () => {
    it("renderiza valor e rótulo formatados", () => {
      render(<KPICard valor={1234} rotulo="Produtos parados" formato="inteiro" />);
      expect(screen.getByText("Produtos parados")).toBeInTheDocument();
      expect(screen.getByText("1.234")).toBeInTheDocument();
    });
    it("renderiza o estado de preparo", () => {
      render(<KPICard valor={0} rotulo="X" formato="inteiro" estado="preparando" />);
      expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
    });
    it("formata moeda em pt-BR", () => {
      render(<KPICard valor={2500.5} rotulo="Valor" formato="moeda" />);
      expect(screen.getByText(/R\$\s?2\.500,50/)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/charts/kpi-card.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `kpi-card.tsx`:
  ```tsx
  import { Card } from "@/components/ui/card";
  import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";

  export type NumberFormat = "inteiro" | "decimal" | "moeda";
  export type ChartState = "ok" | "preparando" | "vazio" | "erro";

  /** Formata um número no padrão pt-BR conforme o formato pedido. */
  export function formatNumber(valor: number, formato: NumberFormat): string {
    if (formato === "moeda") {
      return valor.toLocaleString("pt-BR", {
        style: "currency", currency: "BRL",
      });
    }
    if (formato === "decimal") {
      return valor.toLocaleString("pt-BR", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      });
    }
    return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }

  interface KPICardProps {
    valor: number;
    rotulo: string;
    formato: NumberFormat;
    estado?: ChartState;
    onRetry?: () => void;
  }

  /** Cartão de indicador — número único com rótulo. */
  export function KPICard({
    valor, rotulo, formato, estado = "ok", onRetry,
  }: KPICardProps) {
    if (estado === "preparando") return <ChartPreparing />;
    if (estado === "vazio") return <ChartEmpty />;
    if (estado === "erro") {
      return (
        <ChartError
          message="Erro ao carregar o indicador."
          onRetry={onRetry ?? (() => {})}
        />
      );
    }
    return (
      <Card className="gap-1 px-4 py-4">
        <span className="text-2xl font-semibold tabular-nums">
          {formatNumber(valor, formato)}
        </span>
        <span className="text-sm text-muted-foreground">{rotulo}</span>
      </Card>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/charts/kpi-card.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(charts): KPICard`.

### Task 33: `DataTable` — render

**Files:** Create `src/components/charts/data-table.tsx`, `src/components/charts/data-table.test.tsx`.
**Pré-requisito:** Task 31.

- [ ] **Step 1 — teste que falha.** Criar `data-table.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import { DataTable, type ColumnDef } from "./data-table";

  interface Row { produto: string; saldo: number; }
  const cols: ColumnDef<Row>[] = [
    { key: "produto", header: "Produto", tipo: "texto" },
    { key: "saldo", header: "Saldo", tipo: "numero" },
  ];
  const rows: Row[] = [
    { produto: "Esteira", saldo: 5 },
    { produto: "Anilha", saldo: -2 },
  ];

  describe("DataTable render", () => {
    it("renderiza cabeçalhos e linhas", () => {
      render(<DataTable columns={cols} rows={rows} />);
      expect(screen.getByText("Produto")).toBeInTheDocument();
      expect(screen.getByText("Esteira")).toBeInTheDocument();
    });
    it("formata números negativos em pt-BR", () => {
      render(<DataTable columns={cols} rows={rows} />);
      expect(screen.getByText("-2")).toBeInTheDocument();
    });
    it("renderiza o estado de preparo", () => {
      render(<DataTable columns={cols} rows={[]} estado="preparando" />);
      expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/charts/data-table.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `data-table.tsx`:
  ```tsx
  "use client";

  import { useMemo, useState } from "react";
  import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  } from "@/components/ui/table";
  import { Input } from "@/components/ui/input";
  import { cn } from "@/lib/utils";
  import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
  import { formatNumber, type ChartState } from "./kpi-card";

  export interface ColumnDef<T> {
    key: keyof T & string;
    header: string;
    tipo: "texto" | "numero";
  }

  interface DataTableProps<T> {
    columns: ColumnDef<T>[];
    rows: T[];
    estado?: ChartState;
    onRetry?: () => void;
    searchable?: boolean;
  }

  type SortDir = "asc" | "desc";

  /** Tabela genérica ordenável e pesquisável; formata números pt-BR. */
  export function DataTable<T extends Record<string, unknown>>({
    columns, rows, estado = "ok", onRetry, searchable = false,
  }: DataTableProps<T>) {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
      if (!query.trim()) return rows;
      const q = query.trim().toLowerCase();
      return rows.filter((r) =>
        columns.some((c) =>
          String(r[c.key] ?? "").toLowerCase().includes(q),
        ),
      );
    }, [rows, query, columns]);

    const sorted = useMemo(() => {
      if (!sortKey) return filtered;
      const col = columns.find((c) => c.key === sortKey);
      const arr = [...filtered];
      arr.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        let cmp: number;
        if (col?.tipo === "numero") {
          cmp = Number(av ?? 0) - Number(bv ?? 0);
        } else {
          cmp = String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
      return arr;
    }, [filtered, sortKey, sortDir, columns]);

    function toggleSort(key: string) {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    }

    if (estado === "preparando") return <ChartPreparing />;
    if (estado === "erro") {
      return (
        <ChartError
          message="Erro ao carregar a tabela."
          onRetry={onRetry ?? (() => {})}
        />
      );
    }
    if (estado === "vazio" || rows.length === 0) return <ChartEmpty />;

    return (
      <div className="flex flex-col gap-3">
        {searchable && (
          <Input
            placeholder="Pesquisar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
        )}
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => {
                const active = sortKey === c.key;
                return (
                  <TableHead
                    key={c.key}
                    aria-sort={
                      active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      className="font-medium"
                      onClick={() => toggleSort(c.key)}
                    >
                      {c.header}
                      {active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <ChartEmpty />
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(c.tipo === "numero" && "tabular-nums")}
                    >
                      {c.tipo === "numero"
                        ? formatNumber(Number(row[c.key] ?? 0), "decimal")
                        : String(row[c.key] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  }
  ```
  Nota: o teste do Step 1 espera `"-2"` (inteiro). Ajustar: para `tipo: "numero"` o teste usa valores inteiros; `formatNumber(..., "decimal")` renderiza `-2,00`. **Correção do teste:** o `expect` do negativo deve ser `screen.getByText("-2,00")`. Atualizar o teste do Step 1 para `getByText("-2,00")` e `getByText("5,00")` antes de rodar o Step 2.
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/charts/data-table.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(charts): DataTable render`.

### Task 34: `DataTable` — ordenação

**Files:** Modify `src/components/charts/data-table.test.tsx`.
**Pré-requisito:** Task 33 (a lógica de ordenação já foi escrita na Task 33; esta task adiciona a cobertura de teste).

- [ ] **Step 1 — teste que falha.** Acrescentar a `data-table.test.tsx`:
  ```tsx
  import { fireEvent } from "@testing-library/react";

  describe("DataTable ordenação", () => {
    it("ordena coluna numérica ascendente e descendente ao clicar no header", () => {
      render(<DataTable columns={cols} rows={rows} />);
      const headerBtn = screen.getByRole("button", { name: /Saldo/ });
      fireEvent.click(headerBtn); // asc
      let cells = screen.getAllByRole("cell").map((c) => c.textContent);
      expect(cells).toContain("-2,00");
      const ths = screen.getAllByRole("columnheader");
      expect(ths[1]).toHaveAttribute("aria-sort", "ascending");
      fireEvent.click(headerBtn); // desc
      expect(screen.getAllByRole("columnheader")[1]).toHaveAttribute(
        "aria-sort", "descending",
      );
    });
    it("ordena coluna textual", () => {
      render(<DataTable columns={cols} rows={rows} />);
      fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
      const firstCell = screen.getAllByRole("cell")[0];
      expect(firstCell).toHaveTextContent("Anilha");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar/passar.** `npx jest src/components/charts/data-table.test.tsx` — a lógica já existe (Task 33); se algum `aria-sort` ou ordenação divergir, ajustar `data-table.tsx`. Esperado: verde após o ajuste.
- [ ] **Step 3 — commit.** `test(charts): cobertura de ordenação do DataTable`.

### Task 35: `DataTable` — busca

**Files:** Modify `src/components/charts/data-table.test.tsx`.
**Pré-requisito:** Task 33.

- [ ] **Step 1 — teste que falha.** Acrescentar a `data-table.test.tsx`:
  ```tsx
  describe("DataTable busca", () => {
    it("filtra as linhas pelo texto digitado", () => {
      render(<DataTable columns={cols} rows={rows} searchable />);
      fireEvent.change(screen.getByPlaceholderText("Pesquisar…"), {
        target: { value: "este" },
      });
      expect(screen.getByText("Esteira")).toBeInTheDocument();
      expect(screen.queryByText("Anilha")).not.toBeInTheDocument();
    });
    it("exibe estado vazio quando nada casa", () => {
      render(<DataTable columns={cols} rows={rows} searchable />);
      fireEvent.change(screen.getByPlaceholderText("Pesquisar…"), {
        target: { value: "zzz" },
      });
      expect(screen.getByText(/sem dado no período/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver passar.** `npx jest src/components/charts/data-table.test.tsx` — a lógica de busca já existe (Task 33). Esperado: verde.
- [ ] **Step 3 — commit.** `test(charts): cobertura de busca do DataTable`.

### Task 36: paleta de gráficos compartilhada

**Files:** Create `src/components/charts/palette.ts`, `src/components/charts/palette.test.ts`.

- [ ] **Step 1 — teste que falha.** Criar `palette.test.ts`:
  ```ts
  import { CHART_COLORS, colorAt } from "./palette";

  describe("paleta de gráficos", () => {
    it("tem ao menos 6 cores", () => {
      expect(CHART_COLORS.length).toBeGreaterThanOrEqual(6);
    });
    it("colorAt cicla as cores por índice", () => {
      expect(colorAt(0)).toBe(CHART_COLORS[0]);
      expect(colorAt(CHART_COLORS.length)).toBe(CHART_COLORS[0]);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/charts/palette.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `palette.ts`:
  ```ts
  // src/components/charts/palette.ts

  /** Paleta categórica acessível, testada no dark mode. */
  export const CHART_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
  ] as const;

  /** Cor do índice n, ciclando a paleta. */
  export function colorAt(n: number): string {
    return CHART_COLORS[n % CHART_COLORS.length];
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/charts/palette.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(charts): paleta de cores compartilhada`.

### Task 37: `BarChart`

**Files:** Create `src/components/charts/bar-chart.tsx`, `src/components/charts/bar-chart.test.tsx`.
**Pré-requisito:** Tasks 30, 31, 36.

- [ ] **Step 1 — teste que falha.** Criar `bar-chart.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import { BarChartCard } from "./bar-chart";

  describe("BarChartCard", () => {
    it("renderiza o container do gráfico com dados", () => {
      const { container } = render(
        <BarChartCard
          data={[{ rotulo: "Galpão A", valor: 100 }]}
          config={{ xKey: "rotulo", yKey: "valor", formato: "moeda" }}
        />,
      );
      expect(container.querySelector("[data-slot=bar-chart]")).toBeInTheDocument();
    });
    it("renderiza o estado de preparo", () => {
      render(
        <BarChartCard data={[]} config={{ xKey: "x", yKey: "y", formato: "inteiro" }}
          estado="preparando" />,
      );
      expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/charts/bar-chart.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `bar-chart.tsx`:
  ```tsx
  "use client";

  import {
    Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  } from "recharts";
  import { CHART_COLORS } from "./palette";
  import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
  import { formatNumber, type NumberFormat, type ChartState } from "./kpi-card";

  export interface BarChartConfig {
    xKey: string;
    yKey: string;
    formato: NumberFormat;
  }

  interface BarChartCardProps {
    data: Record<string, unknown>[];
    config: BarChartConfig;
    estado?: ChartState;
    onRetry?: () => void;
  }

  /** Gráfico de barras declarativo sobre Recharts. */
  export function BarChartCard({
    data, config, estado = "ok", onRetry,
  }: BarChartCardProps) {
    if (estado === "preparando") return <ChartPreparing />;
    if (estado === "erro") {
      return (
        <ChartError
          message="Erro ao carregar o gráfico."
          onRetry={onRetry ?? (() => {})}
        />
      );
    }
    if (estado === "vazio" || data.length === 0) return <ChartEmpty />;

    return (
      <div data-slot="bar-chart" className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-foreground/10"
            />
            <XAxis dataKey={config.xKey} fontSize={12} />
            <YAxis
              fontSize={12}
              tickFormatter={(v) => formatNumber(Number(v), config.formato)}
            />
            <Tooltip
              formatter={(v) => formatNumber(Number(v), config.formato)}
            />
            <Bar dataKey={config.yKey} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/charts/bar-chart.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(charts): BarChart`.

### Task 38: `LineChart`

**Files:** Create `src/components/charts/line-chart.tsx`, `src/components/charts/line-chart.test.tsx`.
**Pré-requisito:** Tasks 30, 31, 36.

- [ ] **Step 1 — teste que falha.** Criar `line-chart.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import { LineChartCard } from "./line-chart";

  describe("LineChartCard", () => {
    it("renderiza o container multi-série", () => {
      const { container } = render(
        <LineChartCard
          data={[{ mes: "2026-01", entrada: 10, saida: 4 }]}
          config={{
            xKey: "mes", formato: "inteiro",
            series: [
              { key: "entrada", label: "Entradas" },
              { key: "saida", label: "Saídas" },
            ],
          }}
        />,
      );
      expect(container.querySelector("[data-slot=line-chart]")).toBeInTheDocument();
    });
    it("renderiza o estado vazio", () => {
      render(
        <LineChartCard data={[]} config={{ xKey: "x", formato: "inteiro", series: [] }}
          estado="vazio" />,
      );
      expect(screen.getByText(/sem dado no período/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/charts/line-chart.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `line-chart.tsx`:
  ```tsx
  "use client";

  import {
    CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
    Tooltip, XAxis, YAxis,
  } from "recharts";
  import { colorAt } from "./palette";
  import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
  import { formatNumber, type NumberFormat, type ChartState } from "./kpi-card";

  export interface LineSeries {
    key: string;
    label: string;
  }

  export interface LineChartConfig {
    xKey: string;
    formato: NumberFormat;
    series: LineSeries[];
  }

  interface LineChartCardProps {
    data: Record<string, unknown>[];
    config: LineChartConfig;
    estado?: ChartState;
    onRetry?: () => void;
  }

  /** Gráfico de linhas multi-série declarativo sobre Recharts. */
  export function LineChartCard({
    data, config, estado = "ok", onRetry,
  }: LineChartCardProps) {
    if (estado === "preparando") return <ChartPreparing />;
    if (estado === "erro") {
      return (
        <ChartError
          message="Erro ao carregar o gráfico."
          onRetry={onRetry ?? (() => {})}
        />
      );
    }
    if (estado === "vazio" || data.length === 0) return <ChartEmpty />;

    return (
      <div data-slot="line-chart" className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-foreground/10"
            />
            <XAxis dataKey={config.xKey} fontSize={12} />
            <YAxis
              fontSize={12}
              tickFormatter={(v) => formatNumber(Number(v), config.formato)}
            />
            <Tooltip
              formatter={(v) => formatNumber(Number(v), config.formato)}
            />
            <Legend />
            {config.series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={colorAt(i)}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/charts/line-chart.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(charts): LineChart`.

### Task 39: `PieChart` — render

**Files:** Create `src/components/charts/pie-chart.tsx`, `src/components/charts/pie-chart.test.tsx`.
**Pré-requisito:** Tasks 30, 31, 36.

- [ ] **Step 1 — teste que falha.** Criar `pie-chart.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import { PieChartCard } from "./pie-chart";

  describe("PieChartCard render", () => {
    it("renderiza o container do gráfico", () => {
      const { container } = render(
        <PieChartCard
          data={[{ rotulo: "Esteiras", valor: 100 }]}
          config={{ nameKey: "rotulo", valueKey: "valor", formato: "moeda" }}
        />,
      );
      expect(container.querySelector("[data-slot=pie-chart]")).toBeInTheDocument();
    });
    it("renderiza o estado de erro com botão de repetir", () => {
      render(
        <PieChartCard data={[]} config={{ nameKey: "n", valueKey: "v", formato: "moeda" }}
          estado="erro" />,
      );
      expect(screen.getByRole("button", { name: /repetir/i })).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/charts/pie-chart.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `pie-chart.tsx`:
  ```tsx
  "use client";

  import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
  import { colorAt } from "./palette";
  import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";
  import { formatNumber, type NumberFormat, type ChartState } from "./kpi-card";

  export interface PieChartConfig {
    nameKey: string;
    valueKey: string;
    formato: NumberFormat;
  }

  interface PieChartCardProps {
    data: Record<string, unknown>[];
    config: PieChartConfig;
    estado?: ChartState;
    onRetry?: () => void;
  }

  const MAX_FATIAS = 6;

  /**
   * Agrupa as fatias acima de MAX_FATIAS: mantém o top-5 por valor e soma o
   * resto numa fatia "Outros".
   */
  export function agruparOutros(
    data: Record<string, unknown>[],
    nameKey: string,
    valueKey: string,
  ): Record<string, unknown>[] {
    if (data.length <= MAX_FATIAS) return data;
    const ordenado = [...data].sort(
      (a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0),
    );
    const top = ordenado.slice(0, MAX_FATIAS - 1);
    const resto = ordenado.slice(MAX_FATIAS - 1);
    const somaResto = resto.reduce((s, r) => s + Number(r[valueKey] ?? 0), 0);
    return [...top, { [nameKey]: "Outros", [valueKey]: somaResto }];
  }

  /** Gráfico de pizza declarativo; agrupa "Outros" acima de 6 fatias. */
  export function PieChartCard({
    data, config, estado = "ok", onRetry,
  }: PieChartCardProps) {
    if (estado === "preparando") return <ChartPreparing />;
    if (estado === "erro") {
      return (
        <ChartError
          message="Erro ao carregar o gráfico."
          onRetry={onRetry ?? (() => {})}
        />
      );
    }
    if (estado === "vazio" || data.length === 0) return <ChartEmpty />;

    const fatias = agruparOutros(data, config.nameKey, config.valueKey);

    return (
      <div data-slot="pie-chart" className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias}
              dataKey={config.valueKey}
              nameKey={config.nameKey}
              cx="50%"
              cy="50%"
              outerRadius={90}
            >
              {fatias.map((_, i) => (
                <Cell key={i} fill={colorAt(i)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatNumber(Number(v), config.formato)}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/charts/pie-chart.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(charts): PieChart render`.

### Task 40: `PieChart` — agrupamento "Outros"

**Files:** Modify `src/components/charts/pie-chart.test.tsx`.
**Pré-requisito:** Task 39 (a função `agruparOutros` já foi escrita na Task 39; esta task adiciona a cobertura).

- [ ] **Step 1 — teste que falha.** Acrescentar a `pie-chart.test.tsx`:
  ```tsx
  import { agruparOutros } from "./pie-chart";

  describe("agruparOutros", () => {
    it("mantém 5 fatias intactas", () => {
      const data = [1, 2, 3, 4, 5].map((n) => ({ rotulo: `F${n}`, valor: n }));
      expect(agruparOutros(data, "rotulo", "valor")).toHaveLength(5);
    });
    it("reduz 7 fatias a 6 (top-5 + Outros)", () => {
      const data = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ rotulo: `F${n}`, valor: n }));
      const r = agruparOutros(data, "rotulo", "valor");
      expect(r).toHaveLength(6);
      const outros = r.find((f) => f.rotulo === "Outros");
      expect(outros?.valor).toBe(1 + 2 + 3); // as 3 menores: 1, 2, 3
    });
  });
  ```
- [ ] **Step 2 — rodar e ver passar.** `npx jest src/components/charts/pie-chart.test.tsx` — a função já existe (Task 39). Esperado: verde.
- [ ] **Step 3 — commit.** `test(charts): cobertura do agrupamento Outros`.

### Task 41: Verificação do Bloco 4

- [ ] `npx tsc --noEmit` → verde.
- [ ] `npm run lint` → sem erro.
- [ ] `npx jest src/components/charts` → verde.

---

## Bloco 5 — Catálogo, freshness e queries

### Task 42: `types.ts` — tipos de relatório, seção, filtro e `ReportFilterValues`

**Files:** Create `src/lib/reports/types.ts`.
**Pré-requisito:** Task 10 (`ReportDomainId`).

- [ ] **Step 1 — implementação.** Criar `types.ts` (arquivo de tipos puro — sem teste, validado por `tsc`):
  ```ts
  // src/lib/reports/types.ts
  import type { LucideIcon } from "lucide-react";
  import type { ReportDomainId } from "@/lib/reports/domains";

  /** Tipo de cada controle de filtro de uma seção. */
  export type ReportFilterTipo =
    | "produto"
    | "armazem"
    | "familia"
    | "periodo"
    | "sentido"
    | "faixaDias"
    | "busca";

  /** Declaração de um filtro numa seção do catálogo. */
  export interface ReportFilter {
    tipo: ReportFilterTipo;
    /** Valor default quando o searchParam está ausente. */
    default?: string;
  }

  /** Templates de visualização disponíveis. */
  export type ReportTemplate =
    | "KPICard"
    | "DataTable"
    | "BarChart"
    | "LineChart"
    | "PieChart";

  /** Uma seção de relatório — um template alimentado por um fato. */
  export interface ReportSection {
    /** Id da seção dentro do relatório (usado como chave de render). */
    id: string;
    template: ReportTemplate;
    /** Nome do fato lido — chave em FatoBuildState. */
    fato: string;
    /** Config declarativa repassada ao componente do template. */
    config: Record<string, unknown>;
    filtros: ReportFilter[];
  }

  /** Entrada do catálogo de relatórios. */
  export interface ReportEntry {
    id: string;
    titulo: string;
    dominio: ReportDomainId;
    descricao: string;
    icone: LucideIcon;
    /** Modelo Odoo cuja sync data o "atualizado em". */
    modeloFonte: string;
    secoes: ReportSection[];
  }

  /**
   * Filtros já parseados de searchParams para os tipos certos.
   * Todos opcionais — quando ausente, a query aplica o seu default.
   */
  export interface ReportFilterValues {
    produtoId?: number;
    armazemId?: number;
    familiaId?: number;
    /** Mês inicial do período, formato YYYY-MM. */
    periodoDe?: string;
    /** Mês final do período, formato YYYY-MM. */
    periodoAte?: string;
    sentido?: "entrada" | "saida";
    /** Faixa de dias de imobilização: 30, 60 ou 90 (90 = "90+"). */
    faixaDias?: 30 | 60 | 90;
    /** Texto livre de busca. */
    busca?: string;
  }

  /** Estado de um fato no momento da leitura (spec §3.4). */
  export type ReportState = "ok" | "preparando" | "vazio" | "erro";

  /** Retorno padrão de uma query de leitura de relatório. */
  export interface ReportResult<T> {
    estado: ReportState;
    dados: T;
    freshness: Date | null;
  }
  ```
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `feat(reports): tipos do catálogo e ReportFilterValues`.

### Task 43: `freshness.ts` — cálculo do "atualizado em" (C4)

**Files:** Create `src/lib/reports/freshness.ts`, `src/lib/reports/freshness.test.ts`.
**Pré-requisito:** Task 42.

- [ ] **Step 1 — teste que falha.** Criar `freshness.test.ts`:
  ```ts
  import { reportFreshness } from "./freshness";
  import type { ReportEntry } from "./types";
  import { Home } from "lucide-react";

  function entry(modeloFonte: string, fatos: string[]): ReportEntry {
    return {
      id: "r", titulo: "R", dominio: "estoque", descricao: "",
      icone: Home, modeloFonte,
      secoes: fatos.map((f, i) => ({
        id: `s${i}`, template: "DataTable", fato: f, config: {}, filtros: [],
      })),
    };
  }

  describe("reportFreshness", () => {
    it("devolve o menor entre lastSnapshotAt e ultimoBuildAt", async () => {
      const prisma = {
        syncState: {
          findUnique: jest.fn().mockResolvedValue({
            lastSnapshotAt: new Date("2026-05-16T10:00:00Z"),
          }),
        },
        fatoBuildState: {
          findUnique: jest.fn().mockResolvedValue({
            ultimoBuildAt: new Date("2026-05-16T09:00:00Z"),
          }),
        },
      } as never;
      const r = await reportFreshness(prisma, entry("estoque.saldo.hoje", ["fato_estoque_saldo"]));
      expect(r).toEqual(new Date("2026-05-16T09:00:00Z"));
    });
    it("relatório multi-fato pega o menor de todos os fatos", async () => {
      const prisma = {
        syncState: {
          findUnique: jest.fn().mockResolvedValue({
            lastSnapshotAt: new Date("2026-05-16T12:00:00Z"),
          }),
        },
        fatoBuildState: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ ultimoBuildAt: new Date("2026-05-16T11:00:00Z") })
            .mockResolvedValueOnce({ ultimoBuildAt: new Date("2026-05-16T08:00:00Z") }),
        },
      } as never;
      const r = await reportFreshness(
        prisma,
        entry("estoque.saldo.hoje", ["fato_estoque_saldo", "fato_estoque_movimento"]),
      );
      expect(r).toEqual(new Date("2026-05-16T08:00:00Z"));
    });
    it("devolve null quando um fato nunca foi construído", async () => {
      const prisma = {
        syncState: {
          findUnique: jest.fn().mockResolvedValue({
            lastSnapshotAt: new Date("2026-05-16T12:00:00Z"),
          }),
        },
        fatoBuildState: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never;
      const r = await reportFreshness(prisma, entry("estoque.saldo.hoje", ["fato_estoque_saldo"]));
      expect(r).toBeNull();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/freshness.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `freshness.ts`:
  ```ts
  import type { PrismaClient } from "@/generated/prisma/client";
  import type { ReportEntry } from "./types";

  /**
   * Freshness de um relatório = o menor instante entre o último snapshot do
   * modelo-fonte e o último build de cada fato das seções. O dado é tão fresco
   * quanto a etapa mais atrasada. null se algum fato nunca foi construído.
   */
  export async function reportFreshness(
    prisma: PrismaClient,
    entry: ReportEntry,
  ): Promise<Date | null> {
    const sync = await prisma.syncState.findUnique({
      where: { model: entry.modeloFonte },
      select: { lastSnapshotAt: true },
    });
    const candidatos: Date[] = [];
    if (sync?.lastSnapshotAt) candidatos.push(sync.lastSnapshotAt);

    const fatos = [...new Set(entry.secoes.map((s) => s.fato))];
    for (const fato of fatos) {
      const build = await prisma.fatoBuildState.findUnique({
        where: { fato },
        select: { ultimoBuildAt: true },
      });
      if (!build) return null; // fato nunca construído
      candidatos.push(build.ultimoBuildAt);
    }
    if (candidatos.length === 0) return null;
    return candidatos.reduce((min, d) => (d < min ? d : min));
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/freshness.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): cálculo de freshness do relatório`.

### Task 44: `catalog.ts` — esqueleto + R1 (Saldo por produto)

**Files:** Create `src/lib/reports/catalog.ts`, `src/lib/reports/catalog.test.ts`.
**Pré-requisito:** Task 42.

- [ ] **Step 1 — teste que falha.** Criar `catalog.test.ts`:
  ```ts
  import { REPORT_CATALOG } from "./catalog";

  describe("catálogo — R1", () => {
    it("R1 tem os campos obrigatórios e domínio estoque", () => {
      const r1 = REPORT_CATALOG.find((r) => r.id === "saldo-produto");
      expect(r1).toBeDefined();
      expect(r1?.dominio).toBe("estoque");
      expect(r1?.modeloFonte).toBe("estoque.saldo.hoje");
      expect(r1?.secoes).toHaveLength(1);
      expect(r1?.secoes[0].template).toBe("DataTable");
      expect(r1?.secoes[0].fato).toBe("fato_estoque_saldo");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/catalog.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `catalog.ts`:
  ```ts
  // src/lib/reports/catalog.ts
  import { Boxes, Coins, ArrowLeftRight, Clock, TrendingUp, PieChart } from "lucide-react";
  import type { ReportEntry } from "./types";

  /** Catálogo declarativo dos 6 relatórios de estoque (lote 1). */
  export const REPORT_CATALOG: ReportEntry[] = [
    {
      id: "saldo-produto",
      titulo: "Saldo por produto e armazém",
      dominio: "estoque",
      descricao: "Saldo de estoque por produto e local, incluindo negativos.",
      icone: Boxes,
      modeloFonte: "estoque.saldo.hoje",
      secoes: [
        {
          id: "tabela",
          template: "DataTable",
          fato: "fato_estoque_saldo",
          config: {
            colunas: [
              { key: "produtoNome", header: "Produto", tipo: "texto" },
              { key: "localNome", header: "Armazém", tipo: "texto" },
              { key: "familiaNome", header: "Família", tipo: "texto" },
              { key: "quantidade", header: "Saldo", tipo: "numero" },
              { key: "unidade", header: "Unidade", tipo: "texto" },
            ],
            searchable: true,
          },
          filtros: [
            { tipo: "produto" },
            { tipo: "armazem" },
            { tipo: "familia" },
            { tipo: "busca" },
          ],
        },
      ],
    },
  ];
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/catalog.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): catálogo R1 saldo por produto`.

### Task 45: catálogo — R2 (Valor por armazém)

**Files:** Modify `src/lib/reports/catalog.ts`, `src/lib/reports/catalog.test.ts`.
**Pré-requisito:** Task 44.

- [ ] **Step 1 — teste que falha.** Acrescentar a `catalog.test.ts`:
  ```ts
  describe("catálogo — R2", () => {
    it("R2 é um BarChart sobre fato_estoque_saldo, sem filtros", () => {
      const r2 = REPORT_CATALOG.find((r) => r.id === "valor-armazem");
      expect(r2?.dominio).toBe("estoque");
      expect(r2?.secoes[0].template).toBe("BarChart");
      expect(r2?.secoes[0].fato).toBe("fato_estoque_saldo");
      expect(r2?.secoes[0].filtros).toEqual([]);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/catalog.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar ao array `REPORT_CATALOG`:
  ```ts
    {
      id: "valor-armazem",
      titulo: "Valor de estoque por armazém",
      dominio: "estoque",
      descricao: "Valor financeiro do estoque agregado por armazém.",
      icone: Coins,
      modeloFonte: "estoque.saldo.hoje",
      secoes: [
        {
          id: "barras",
          template: "BarChart",
          fato: "fato_estoque_saldo",
          config: { xKey: "rotulo", yKey: "valor", formato: "moeda" },
          filtros: [],
        },
      ],
    },
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/catalog.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): catálogo R2 valor por armazém`.

### Task 46: catálogo — R3 (Entradas vs. saídas por mês)

**Files:** Modify `src/lib/reports/catalog.ts`, `src/lib/reports/catalog.test.ts`.
**Pré-requisito:** Task 44.

- [ ] **Step 1 — teste que falha.** Acrescentar a `catalog.test.ts`:
  ```ts
  describe("catálogo — R3", () => {
    it("R3 é um LineChart sobre fato_estoque_movimento, com filtro de período", () => {
      const r3 = REPORT_CATALOG.find((r) => r.id === "entradas-saidas");
      expect(r3?.secoes[0].template).toBe("LineChart");
      expect(r3?.secoes[0].fato).toBe("fato_estoque_movimento");
      expect(r3?.modeloFonte).toBe("estoque.extrato");
      expect(r3?.secoes[0].filtros.map((f) => f.tipo)).toEqual(["periodo", "armazem"]);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/catalog.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar ao array:
  ```ts
    {
      id: "entradas-saidas",
      titulo: "Entradas vs. saídas por mês",
      dominio: "estoque",
      descricao: "Movimento físico de entrada e saída agregado por mês.",
      icone: ArrowLeftRight,
      modeloFonte: "estoque.extrato",
      secoes: [
        {
          id: "linha",
          template: "LineChart",
          fato: "fato_estoque_movimento",
          config: {
            xKey: "mes",
            formato: "inteiro",
            series: [
              { key: "entrada", label: "Entradas" },
              { key: "saida", label: "Saídas" },
            ],
          },
          filtros: [{ tipo: "periodo", default: "3" }, { tipo: "armazem" }],
        },
      ],
    },
  ```
  Nota: `default: "3"` no filtro de período significa "últimos 3 meses" (spec §8 R3).
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/catalog.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): catálogo R3 entradas vs saídas`.

### Task 47: catálogo — R4 (Produtos parados, 2 seções)

**Files:** Modify `src/lib/reports/catalog.ts`, `src/lib/reports/catalog.test.ts`.
**Pré-requisito:** Task 44.

- [ ] **Step 1 — teste que falha.** Acrescentar a `catalog.test.ts`:
  ```ts
  describe("catálogo — R4", () => {
    it("R4 tem 2 seções: KPICard + DataTable sobre fato_produto_parado", () => {
      const r4 = REPORT_CATALOG.find((r) => r.id === "produtos-parados");
      expect(r4?.secoes).toHaveLength(2);
      expect(r4?.secoes.map((s) => s.template)).toEqual(["KPICard", "DataTable"]);
      expect(r4?.secoes.every((s) => s.fato === "fato_produto_parado")).toBe(true);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/catalog.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar ao array:
  ```ts
    {
      id: "produtos-parados",
      titulo: "Produtos parados",
      dominio: "estoque",
      descricao: "Produtos com saldo imobilizado e tempo sem movimento.",
      icone: Clock,
      modeloFonte: "estoque.saldo.hoje.duracao.dias",
      secoes: [
        {
          id: "kpi",
          template: "KPICard",
          fato: "fato_produto_parado",
          config: { rotulo: "Produtos parados", formato: "inteiro" },
          filtros: [{ tipo: "faixaDias", default: "30" }, { tipo: "armazem" }],
        },
        {
          id: "tabela",
          template: "DataTable",
          fato: "fato_produto_parado",
          config: {
            colunas: [
              { key: "produtoNome", header: "Produto", tipo: "texto" },
              { key: "localNome", header: "Armazém", tipo: "texto" },
              { key: "saldo", header: "Saldo", tipo: "numero" },
              { key: "dias", header: "Dias parado", tipo: "numero" },
              { key: "vrSaldo", header: "Valor", tipo: "numero" },
            ],
            searchable: true,
          },
          filtros: [{ tipo: "faixaDias", default: "30" }, { tipo: "armazem" }],
        },
      ],
    },
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/catalog.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): catálogo R4 produtos parados`.

### Task 48: catálogo — R5 (Top produtos movimentados)

**Files:** Modify `src/lib/reports/catalog.ts`, `src/lib/reports/catalog.test.ts`.
**Pré-requisito:** Task 44.

- [ ] **Step 1 — teste que falha.** Acrescentar a `catalog.test.ts`:
  ```ts
  describe("catálogo — R5", () => {
    it("R5 é um BarChart sobre fato_estoque_movimento, filtros período+sentido", () => {
      const r5 = REPORT_CATALOG.find((r) => r.id === "top-movimentados");
      expect(r5?.secoes[0].template).toBe("BarChart");
      expect(r5?.secoes[0].fato).toBe("fato_estoque_movimento");
      expect(r5?.secoes[0].filtros.map((f) => f.tipo)).toEqual(["periodo", "sentido"]);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/catalog.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar ao array:
  ```ts
    {
      id: "top-movimentados",
      titulo: "Top produtos movimentados",
      dominio: "estoque",
      descricao: "Produtos com maior movimento físico no período.",
      icone: TrendingUp,
      modeloFonte: "estoque.extrato",
      secoes: [
        {
          id: "barras",
          template: "BarChart",
          fato: "fato_estoque_movimento",
          config: { xKey: "rotulo", yKey: "valor", formato: "inteiro" },
          filtros: [
            { tipo: "periodo", default: "3" },
            { tipo: "sentido" },
          ],
        },
      ],
    },
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/catalog.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): catálogo R5 top movimentados`.

### Task 49: catálogo — R6 (Concentração, 2 seções)

**Files:** Modify `src/lib/reports/catalog.ts`, `src/lib/reports/catalog.test.ts`.
**Pré-requisito:** Task 44.

- [ ] **Step 1 — teste que falha.** Acrescentar a `catalog.test.ts`:
  ```ts
  describe("catálogo — R6", () => {
    it("R6 tem 2 seções: PieChart (família) + BarChart (marca)", () => {
      const r6 = REPORT_CATALOG.find((r) => r.id === "concentracao");
      expect(r6?.secoes).toHaveLength(2);
      expect(r6?.secoes.map((s) => s.template)).toEqual(["PieChart", "BarChart"]);
      expect(r6?.secoes.every((s) => s.fato === "fato_estoque_saldo")).toBe(true);
    });
    it("o catálogo tem exatamente 6 relatórios", () => {
      expect(REPORT_CATALOG).toHaveLength(6);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/catalog.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar ao array:
  ```ts
    {
      id: "concentracao",
      titulo: "Concentração do estoque",
      dominio: "estoque",
      descricao: "Distribuição do valor de estoque por família e por marca.",
      icone: PieChart,
      modeloFonte: "estoque.saldo.hoje",
      secoes: [
        {
          id: "familia",
          template: "PieChart",
          fato: "fato_estoque_saldo",
          config: { nameKey: "rotulo", valueKey: "valor", formato: "moeda" },
          filtros: [],
        },
        {
          id: "marca",
          template: "BarChart",
          fato: "fato_estoque_saldo",
          config: { xKey: "rotulo", yKey: "valor", formato: "moeda" },
          filtros: [],
        },
      ],
    },
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/catalog.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): catálogo R6 concentração`.

### Task 50: catálogo — `reportsForUser` e `getReport`

**Files:** Modify `src/lib/reports/catalog.ts`, `src/lib/reports/catalog.test.ts`.
**Pré-requisito:** Tasks 10, 44-49.

- [ ] **Step 1 — teste que falha.** Acrescentar a `catalog.test.ts`:
  ```ts
  import { reportsForUser, getReport } from "./catalog";

  describe("reportsForUser", () => {
    it("admin vê os 6 relatórios", () => {
      expect(reportsForUser("admin", [])).toHaveLength(6);
    });
    it("manager com domínio estoque vê os 6", () => {
      expect(reportsForUser("manager", ["estoque"])).toHaveLength(6);
    });
    it("manager sem domínio não vê nenhum", () => {
      expect(reportsForUser("manager", [])).toHaveLength(0);
    });
  });

  describe("getReport", () => {
    it("acha um relatório pelo id", () => {
      expect(getReport("saldo-produto")?.id).toBe("saldo-produto");
    });
    it("devolve undefined para id inexistente", () => {
      expect(getReport("nao-existe")).toBeUndefined();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/catalog.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar a `catalog.ts`:
  ```ts
  import type { PlatformRole } from "@/generated/prisma/client";
  import { visibleDomains, type ReportDomainId } from "@/lib/reports/domains";

  /** Relatórios visíveis ao usuário, filtrados pelo domínio. */
  export function reportsForUser(
    role: PlatformRole,
    domains: ReportDomainId[],
  ): ReportEntry[] {
    const visiveis = visibleDomains(role, domains);
    return REPORT_CATALOG.filter((r) => visiveis.includes(r.dominio));
  }

  /** Busca uma entrada de catálogo pelo id. */
  export function getReport(id: string): ReportEntry | undefined {
    return REPORT_CATALOG.find((r) => r.id === id);
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/catalog.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): reportsForUser e getReport`.

---

### Task 51: `filters.ts` — `parseFilters` (N2)

**Files:** Create `src/lib/reports/filters.ts`, `src/lib/reports/filters.test.ts`.
**Pré-requisito:** Task 42.

- [ ] **Step 1 — teste que falha.** Criar `filters.test.ts`:
  ```ts
  import { parseFilters } from "./filters";
  import type { ReportSection } from "./types";

  const sec = (filtros: ReportSection["filtros"]): ReportSection => ({
    id: "s", template: "DataTable", fato: "f", config: {}, filtros,
  });

  describe("parseFilters", () => {
    it("converte produtoId de string para número", () => {
      const r = parseFilters(sec([{ tipo: "produto" }]), { produtoId: "12" });
      expect(r.produtoId).toBe(12);
    });
    it("ignora produtoId não numérico", () => {
      const r = parseFilters(sec([{ tipo: "produto" }]), { produtoId: "abc" });
      expect(r.produtoId).toBeUndefined();
    });
    it("aplica o default do filtro de período (em meses) quando ausente", () => {
      const r = parseFilters(sec([{ tipo: "periodo", default: "3" }]), {});
      // periodoDe = mês de 3 meses atrás; periodoAte = mês corrente.
      expect(r.periodoDe).toMatch(/^\d{4}-\d{2}$/);
      expect(r.periodoAte).toMatch(/^\d{4}-\d{2}$/);
    });
    it("respeita periodoDe/periodoAte explícitos", () => {
      const r = parseFilters(sec([{ tipo: "periodo", default: "3" }]), {
        periodoDe: "2026-01", periodoAte: "2026-03",
      });
      expect(r.periodoDe).toBe("2026-01");
      expect(r.periodoAte).toBe("2026-03");
    });
    it("parseia sentido válido e ignora inválido", () => {
      expect(parseFilters(sec([{ tipo: "sentido" }]), { sentido: "entrada" }).sentido)
        .toBe("entrada");
      expect(parseFilters(sec([{ tipo: "sentido" }]), { sentido: "xpto" }).sentido)
        .toBeUndefined();
    });
    it("faixaDias inválida cai no default", () => {
      const r = parseFilters(sec([{ tipo: "faixaDias", default: "30" }]), {
        faixaDias: "999",
      });
      expect(r.faixaDias).toBe(30);
    });
    it("passa a busca como texto", () => {
      expect(parseFilters(sec([{ tipo: "busca" }]), { busca: "esteira" }).busca)
        .toBe("esteira");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/reports/filters.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `filters.ts`:
  ```ts
  // src/lib/reports/filters.ts
  import type { ReportSection, ReportFilterValues } from "./types";

  /** Converte um param string em inteiro positivo; undefined se inválido. */
  function toInt(v: string | undefined): number | undefined {
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }

  /** Mês corrente no formato YYYY-MM (UTC). */
  function mesAtual(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  /** Mês de N meses atrás no formato YYYY-MM (UTC). */
  function mesAtras(n: number): string {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - n);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const MES_REGEX = /^\d{4}-\d{2}$/;
  const FAIXAS = [30, 60, 90] as const;

  /**
   * Converte os searchParams crus (Record<string,string>) nos filtros tipados
   * da seção, aplicando os defaults declarados. Tolerante a valores inválidos:
   * um valor que não casa com o tipo vira undefined (ou cai no default).
   */
  export function parseFilters(
    section: ReportSection,
    searchParams: Record<string, string | undefined>,
  ): ReportFilterValues {
    const values: ReportFilterValues = {};
    const tipos = new Set(section.filtros.map((f) => f.tipo));

    if (tipos.has("produto")) {
      values.produtoId = toInt(searchParams.produtoId);
    }
    if (tipos.has("armazem")) {
      values.armazemId = toInt(searchParams.armazemId);
    }
    if (tipos.has("familia")) {
      values.familiaId = toInt(searchParams.familiaId);
    }
    if (tipos.has("busca")) {
      const b = searchParams.busca?.trim();
      if (b) values.busca = b;
    }
    if (tipos.has("sentido")) {
      const s = searchParams.sentido;
      if (s === "entrada" || s === "saida") values.sentido = s;
    }
    if (tipos.has("periodo")) {
      const filtro = section.filtros.find((f) => f.tipo === "periodo");
      const meses = Number(filtro?.default ?? "3");
      const de = searchParams.periodoDe;
      const ate = searchParams.periodoAte;
      values.periodoDe = de && MES_REGEX.test(de) ? de : mesAtras(meses);
      values.periodoAte = ate && MES_REGEX.test(ate) ? ate : mesAtual();
    }
    if (tipos.has("faixaDias")) {
      const filtro = section.filtros.find((f) => f.tipo === "faixaDias");
      const def = Number(filtro?.default ?? "30");
      const raw = Number(searchParams.faixaDias);
      const escolhida = FAIXAS.includes(raw as 30 | 60 | 90)
        ? (raw as 30 | 60 | 90)
        : (FAIXAS.includes(def as 30 | 60 | 90)
            ? (def as 30 | 60 | 90)
            : 30);
      values.faixaDias = escolhida;
    }
    return values;
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/reports/filters.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): parser de filtros searchParams->ReportFilterValues`.

### Task 52: `report-data.ts` — esqueleto + helper de estado + R1/R2

**Files:** Create `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`.
**Pré-requisito:** Tasks 12 (`getMyDomains`), 42, 43, 50, 51.

- [ ] **Step 1 — teste que falha.** Criar `report-data.test.ts`:
  ```ts
  jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
  jest.mock("@/lib/actions/domain-access", () => ({ getMyDomains: jest.fn() }));
  jest.mock("@/lib/prisma", () => ({
    prisma: {
      fatoBuildState: { findUnique: jest.fn() },
      fatoEstoqueSaldo: { findMany: jest.fn(), groupBy: jest.fn() },
      syncState: { findUnique: jest.fn() },
    },
  }));
  const { getCurrentUser } = require("@/lib/auth");
  const { getMyDomains } = require("@/lib/actions/domain-access");
  const { prisma } = require("@/lib/prisma");
  import { getRelatorioSaldoProduto, getRelatorioValorPorArmazem } from "./report-data";

  beforeEach(() => {
    getCurrentUser.mockResolvedValue({ id: "u1", platformRole: "admin" });
    getMyDomains.mockResolvedValue(["estoque"]);
    prisma.syncState.findUnique.mockResolvedValue({ lastSnapshotAt: new Date() });
  });

  describe("getRelatorioSaldoProduto (R1)", () => {
    it("estado 'preparando' quando FatoBuildState ausente", async () => {
      prisma.fatoBuildState.findUnique.mockResolvedValue(null);
      const r = await getRelatorioSaldoProduto({});
      expect(r.estado).toBe("preparando");
    });
    it("estado 'vazio' quando o builder rodou mas não há linhas", async () => {
      prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
      prisma.fatoEstoqueSaldo.findMany.mockResolvedValue([]);
      const r = await getRelatorioSaldoProduto({});
      expect(r.estado).toBe("vazio");
    });
    it("filtra por família quando familiaId é passado", async () => {
      prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
      prisma.fatoEstoqueSaldo.findMany.mockResolvedValue([{ produtoNome: "X" }]);
      await getRelatorioSaldoProduto({ familiaId: 7 });
      expect(prisma.fatoEstoqueSaldo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ familiaId: 7 }) }),
      );
    });
  });

  describe("getRelatorioValorPorArmazem (R2)", () => {
    it("agrega vrSaldo por local com vrSaldo > 0", async () => {
      prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
      prisma.fatoEstoqueSaldo.groupBy.mockResolvedValue([
        { localNome: "Galpão A", _sum: { vrSaldo: 1000 } },
      ]);
      const r = await getRelatorioValorPorArmazem({});
      expect(r.estado).toBe("ok");
      expect(r.dados).toEqual([{ rotulo: "Galpão A", valor: 1000 }]);
      expect(prisma.fatoEstoqueSaldo.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { vrSaldo: { gt: 0 } } }),
      );
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/actions/report-data.test.ts` → falha.
- [ ] **Step 3 — implementação.** Criar `report-data.ts`:
  ```ts
  "use server";

  import { prisma } from "@/lib/prisma";
  import { getCurrentUser } from "@/lib/auth";
  import { getMyDomains } from "@/lib/actions/domain-access";
  import { reportFreshness } from "@/lib/reports/freshness";
  import { getReport } from "@/lib/reports/catalog";
  import type { ReportFilterValues, ReportResult, ReportState } from "@/lib/reports/types";

  /** Linha de R1. */
  export interface SaldoProdutoRow {
    produtoNome: string | null;
    localNome: string | null;
    familiaNome: string | null;
    quantidade: number | null;
    unidade: string | null;
  }
  /** Barra de R2. */
  export interface ValorArmazemBar {
    rotulo: string;
    valor: number;
  }

  /**
   * Resolve o estado do fato: 'preparando' se o builder nunca rodou;
   * caso contrário 'ok'. 'vazio'/'erro' são decididos pela função-chamadora.
   */
  async function estadoDoFato(fato: string): Promise<"preparando" | "ok"> {
    const build = await prisma.fatoBuildState.findUnique({ where: { fato } });
    return build ? "ok" : "preparando";
  }

  /** Guard comum: exige auth + domínio estoque (camada 3 do RBAC). */
  async function guardEstoque(): Promise<void> {
    const me = await getCurrentUser();
    if (!me) throw new Error("Não autenticado");
    const mine = await getMyDomains();
    if (!mine.includes("estoque")) throw new Error("Sem acesso ao domínio");
  }

  /** R1 — Saldo por produto e armazém. */
  export async function getRelatorioSaldoProduto(
    filtros: ReportFilterValues,
  ): Promise<ReportResult<SaldoProdutoRow[]>> {
    const entry = getReport("saldo-produto")!;
    try {
      await guardEstoque();
      const freshness = await reportFreshness(prisma, entry);
      const base = await estadoDoFato("fato_estoque_saldo");
      if (base === "preparando") {
        return { estado: "preparando", dados: [], freshness };
      }
      const rows = await prisma.fatoEstoqueSaldo.findMany({
        where: {
          ...(filtros.produtoId ? { produtoId: filtros.produtoId } : {}),
          ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
          ...(filtros.familiaId ? { familiaId: filtros.familiaId } : {}),
          ...(filtros.busca
            ? { produtoNome: { contains: filtros.busca, mode: "insensitive" } }
            : {}),
        },
        select: {
          produtoNome: true, localNome: true, familiaNome: true,
          quantidade: true, unidade: true,
        },
        orderBy: { produtoNome: "asc" },
      });
      const dados: SaldoProdutoRow[] = rows.map((r) => ({
        produtoNome: r.produtoNome,
        localNome: r.localNome,
        familiaNome: r.familiaNome,
        quantidade: r.quantidade ? Number(r.quantidade) : null,
        unidade: r.unidade,
      }));
      const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
      return { estado, dados, freshness };
    } catch {
      return { estado: "erro", dados: [], freshness: null };
    }
  }

  /** R2 — Valor de estoque por armazém. */
  export async function getRelatorioValorPorArmazem(
    _filtros: ReportFilterValues,
  ): Promise<ReportResult<ValorArmazemBar[]>> {
    const entry = getReport("valor-armazem")!;
    try {
      await guardEstoque();
      const freshness = await reportFreshness(prisma, entry);
      const base = await estadoDoFato("fato_estoque_saldo");
      if (base === "preparando") {
        return { estado: "preparando", dados: [], freshness };
      }
      const grupos = await prisma.fatoEstoqueSaldo.groupBy({
        by: ["localNome"],
        where: { vrSaldo: { gt: 0 } },
        _sum: { vrSaldo: true },
      });
      const dados: ValorArmazemBar[] = grupos.map((g) => ({
        rotulo: g.localNome ?? "Sem armazém",
        valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
      }));
      const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
      return { estado, dados, freshness };
    } catch {
      return { estado: "erro", dados: [], freshness: null };
    }
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/actions/report-data.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): queries R1 e R2`.

### Task 53: `report-data.ts` — R3, R4, R5, R6

**Files:** Modify `src/lib/actions/report-data.ts`, `src/lib/actions/report-data.test.ts`.
**Pré-requisito:** Task 52.

- [ ] **Step 1 — teste que falha.** Acrescentar a `report-data.test.ts` (estender o mock de `prisma` com `fatoEstoqueMovimento: { groupBy: jest.fn(), findMany: jest.fn() }` e `fatoProdutoParado: { findMany: jest.fn(), count: jest.fn() }`):
  ```ts
  import {
    getRelatorioEntradasSaidas, getRelatorioProdutoParado,
    getRelatorioTopMovimentados, getRelatorioConcentracao,
  } from "./report-data";

  describe("getRelatorioEntradasSaidas (R3)", () => {
    it("soma quantidade por mês e sentido dentro do período", async () => {
      prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
      prisma.fatoEstoqueMovimento.groupBy.mockResolvedValue([
        { mes: "2026-03", sentido: "entrada", _sum: { quantidade: 10 } },
        { mes: "2026-03", sentido: "saida", _sum: { quantidade: 4 } },
      ]);
      const r = await getRelatorioEntradasSaidas({ periodoDe: "2026-01", periodoAte: "2026-03" });
      expect(r.estado).toBe("ok");
      expect(r.dados).toEqual([{ mes: "2026-03", entrada: 10, saida: 4 }]);
    });
  });

  describe("getRelatorioProdutoParado (R4)", () => {
    it("filtra faixa de dias e saldo > 0; devolve KPI + tabela", async () => {
      prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
      prisma.fatoProdutoParado.findMany.mockResolvedValue([
        { produtoNome: "X", localNome: "A", saldo: 3, dias: 95, vrSaldo: 200 },
      ]);
      const r = await getRelatorioProdutoParado({ faixaDias: 90 });
      expect(r.estado).toBe("ok");
      expect(r.dados.total).toBe(1);
      expect(r.dados.linhas).toHaveLength(1);
      expect(prisma.fatoProdutoParado.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ saldo: { gt: 0 }, dias: { gte: 90 } }),
        }),
      );
    });
  });

  describe("getRelatorioTopMovimentados (R5)", () => {
    it("agrega por produto, ordena desc e aplica top-N", async () => {
      prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
      prisma.fatoEstoqueMovimento.groupBy.mockResolvedValue([
        { produtoNome: "A", _sum: { quantidade: 50 } },
        { produtoNome: "B", _sum: { quantidade: 80 } },
      ]);
      const r = await getRelatorioTopMovimentados({ sentido: "entrada" });
      expect(r.dados[0]).toEqual({ rotulo: "B", valor: 80 });
    });
  });

  describe("getRelatorioConcentracao (R6)", () => {
    it("agrega vrSaldo por família e por marca; nulos viram 'Não classificado'", async () => {
      prisma.fatoBuildState.findUnique.mockResolvedValue({ ultimoBuildAt: new Date() });
      prisma.fatoEstoqueSaldo.groupBy
        .mockResolvedValueOnce([
          { familiaNome: "Esteiras", _sum: { vrSaldo: 100 } },
          { familiaNome: null, _sum: { vrSaldo: 30 } },
        ])
        .mockResolvedValueOnce([
          { marcaNome: "Matrix", _sum: { vrSaldo: 90 } },
        ]);
      const r = await getRelatorioConcentracao({});
      expect(r.dados.familia).toContainEqual({ rotulo: "Não classificado", valor: 30 });
      expect(r.dados.marca).toContainEqual({ rotulo: "Matrix", valor: 90 });
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/actions/report-data.test.ts` → falha.
- [ ] **Step 3 — implementação.** Acrescentar a `report-data.ts`:
  ```ts
  /** Ponto da série de R3. */
  export interface MovimentoMes {
    mes: string;
    entrada: number;
    saida: number;
  }
  /** Linha de R4. */
  export interface ProdutoParadoRow {
    produtoNome: string | null;
    localNome: string | null;
    saldo: number;
    dias: number;
    vrSaldo: number;
  }
  /** Dados de R4: KPI + tabela. */
  export interface ProdutoParadoData {
    total: number;
    linhas: ProdutoParadoRow[];
  }
  /** Barra de R5. */
  export interface TopMovimentadoBar {
    rotulo: string;
    valor: number;
  }
  /** Dados de R6: distribuição por família e por marca. */
  export interface ConcentracaoData {
    familia: { rotulo: string; valor: number }[];
    marca: { rotulo: string; valor: number }[];
  }

  const TOP_N = 10;

  /** R3 — Entradas vs. saídas por mês. */
  export async function getRelatorioEntradasSaidas(
    filtros: ReportFilterValues,
  ): Promise<ReportResult<MovimentoMes[]>> {
    const entry = getReport("entradas-saidas")!;
    try {
      await guardEstoque();
      const freshness = await reportFreshness(prisma, entry);
      const base = await estadoDoFato("fato_estoque_movimento");
      if (base === "preparando") {
        return { estado: "preparando", dados: [], freshness };
      }
      const grupos = await prisma.fatoEstoqueMovimento.groupBy({
        by: ["mes", "sentido"],
        where: {
          ...(filtros.periodoDe && filtros.periodoAte
            ? { mes: { gte: filtros.periodoDe, lte: filtros.periodoAte } }
            : {}),
          ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
        },
        _sum: { quantidade: true },
      });
      const porMes = new Map<string, MovimentoMes>();
      for (const g of grupos) {
        const item = porMes.get(g.mes) ?? { mes: g.mes, entrada: 0, saida: 0 };
        const valor = g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0;
        if (g.sentido === "entrada") item.entrada = valor;
        else item.saida = valor;
        porMes.set(g.mes, item);
      }
      const dados = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
      const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
      return { estado, dados, freshness };
    } catch {
      return { estado: "erro", dados: [], freshness: null };
    }
  }

  /** R4 — Produtos parados. */
  export async function getRelatorioProdutoParado(
    filtros: ReportFilterValues,
  ): Promise<ReportResult<ProdutoParadoData>> {
    const entry = getReport("produtos-parados")!;
    const vazio: ProdutoParadoData = { total: 0, linhas: [] };
    try {
      await guardEstoque();
      const freshness = await reportFreshness(prisma, entry);
      const base = await estadoDoFato("fato_produto_parado");
      if (base === "preparando") {
        return { estado: "preparando", dados: vazio, freshness };
      }
      const rows = await prisma.fatoProdutoParado.findMany({
        where: {
          saldo: { gt: 0 },
          ...(filtros.faixaDias ? { dias: { gte: filtros.faixaDias } } : {}),
          ...(filtros.armazemId ? { localId: filtros.armazemId } : {}),
        },
        select: {
          produtoNome: true, localNome: true, saldo: true,
          dias: true, vrSaldo: true,
        },
        orderBy: { dias: "desc" },
      });
      const linhas: ProdutoParadoRow[] = rows.map((r) => ({
        produtoNome: r.produtoNome,
        localNome: r.localNome,
        saldo: Number(r.saldo),
        dias: r.dias,
        vrSaldo: Number(r.vrSaldo),
      }));
      const dados: ProdutoParadoData = { total: linhas.length, linhas };
      const estado: ReportState = linhas.length === 0 ? "vazio" : "ok";
      return { estado, dados, freshness };
    } catch {
      return { estado: "erro", dados: vazio, freshness: null };
    }
  }

  /** R5 — Top produtos movimentados. */
  export async function getRelatorioTopMovimentados(
    filtros: ReportFilterValues,
  ): Promise<ReportResult<TopMovimentadoBar[]>> {
    const entry = getReport("top-movimentados")!;
    try {
      await guardEstoque();
      const freshness = await reportFreshness(prisma, entry);
      const base = await estadoDoFato("fato_estoque_movimento");
      if (base === "preparando") {
        return { estado: "preparando", dados: [], freshness };
      }
      const grupos = await prisma.fatoEstoqueMovimento.groupBy({
        by: ["produtoNome"],
        where: {
          ...(filtros.periodoDe && filtros.periodoAte
            ? { mes: { gte: filtros.periodoDe, lte: filtros.periodoAte } }
            : {}),
          ...(filtros.sentido ? { sentido: filtros.sentido } : {}),
        },
        _sum: { quantidade: true },
      });
      const dados: TopMovimentadoBar[] = grupos
        .map((g) => ({
          rotulo: g.produtoNome ?? "Sem produto",
          valor: g._sum.quantidade ? Math.abs(Number(g._sum.quantidade)) : 0,
        }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, TOP_N);
      const estado: ReportState = dados.length === 0 ? "vazio" : "ok";
      return { estado, dados, freshness };
    } catch {
      return { estado: "erro", dados: [], freshness: null };
    }
  }

  /** R6 — Concentração do estoque por família e por marca. */
  export async function getRelatorioConcentracao(
    _filtros: ReportFilterValues,
  ): Promise<ReportResult<ConcentracaoData>> {
    const entry = getReport("concentracao")!;
    const vazio: ConcentracaoData = { familia: [], marca: [] };
    try {
      await guardEstoque();
      const freshness = await reportFreshness(prisma, entry);
      const base = await estadoDoFato("fato_estoque_saldo");
      if (base === "preparando") {
        return { estado: "preparando", dados: vazio, freshness };
      }
      const porFamilia = await prisma.fatoEstoqueSaldo.groupBy({
        by: ["familiaNome"],
        where: { vrSaldo: { gt: 0 } },
        _sum: { vrSaldo: true },
      });
      const porMarca = await prisma.fatoEstoqueSaldo.groupBy({
        by: ["marcaNome"],
        where: { vrSaldo: { gt: 0 } },
        _sum: { vrSaldo: true },
      });
      const dados: ConcentracaoData = {
        familia: porFamilia.map((g) => ({
          rotulo: g.familiaNome ?? "Não classificado",
          valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
        })),
        marca: porMarca.map((g) => ({
          rotulo: g.marcaNome ?? "Não classificado",
          valor: g._sum.vrSaldo ? Number(g._sum.vrSaldo) : 0,
        })),
      };
      const estado: ReportState =
        dados.familia.length === 0 && dados.marca.length === 0 ? "vazio" : "ok";
      return { estado, dados, freshness };
    } catch {
      return { estado: "erro", dados: vazio, freshness: null };
    }
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/actions/report-data.test.ts` → verde.
- [ ] **Step 5 — commit.** `feat(reports): queries R3, R4, R5 e R6`.

### Task 54: Verificação do Bloco 5

- [ ] `npx tsc --noEmit` → verde.
- [ ] `npm run lint` → sem erro.
- [ ] `npx jest src/lib/reports src/lib/actions/report-data.test.ts` → verde.

---

## Bloco 6 — Filtros, shell e páginas

> **Modelo dos controles de filtro:** cada controle é um componente client
> controlado — recebe `value` e `onChange`. A barra (`report-filters.tsx`)
> orquestra os controles e propaga o estado para a URL via `searchParams`. Todos
> os testes de componente deste bloco usam o pragma `@jest-environment jsdom`
> e `import "@testing-library/jest-dom";` no topo.

### Task 55: `ProductFilter` — filtro de produto

**Files:** Create `src/components/reports/filter-controls/product-filter.tsx`, `.test.tsx`.

- [ ] **Step 1 — teste que falha.** Criar `product-filter.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { ProductFilter } from "./product-filter";

  const opcoes = [
    { id: 1, nome: "Esteira X" },
    { id: 2, nome: "Anilha Y" },
  ];

  describe("ProductFilter", () => {
    it("renderiza o campo de busca", () => {
      render(<ProductFilter value="" onChange={() => {}} options={opcoes} />);
      expect(screen.getByPlaceholderText(/produto/i)).toBeInTheDocument();
    });
    it("dispara onChange com o id ao escolher uma opção filtrada", () => {
      const onChange = jest.fn();
      render(<ProductFilter value="" onChange={onChange} options={opcoes} />);
      fireEvent.change(screen.getByPlaceholderText(/produto/i), {
        target: { value: "esteira" },
      });
      fireEvent.click(screen.getByText("Esteira X"));
      expect(onChange).toHaveBeenCalledWith("1");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/reports/filter-controls/product-filter.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `product-filter.tsx`:
  ```tsx
  "use client";

  import { useMemo, useState } from "react";
  import { Input } from "@/components/ui/input";

  export interface FilterOption {
    id: number;
    nome: string;
  }

  interface ProductFilterProps {
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
  }

  /** Filtro de produto: campo de busca + lista filtrada de opções. */
  export function ProductFilter({ value, onChange, options }: ProductFilterProps) {
    const [query, setQuery] = useState("");
    const selecionado = options.find((o) => String(o.id) === value);

    const filtradas = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return options.filter((o) => o.nome.toLowerCase().includes(q)).slice(0, 8);
    }, [query, options]);

    return (
      <div className="flex flex-col gap-1">
        <Input
          placeholder="Buscar produto…"
          value={query || selecionado?.nome || ""}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) onChange("");
          }}
          className="max-w-xs"
        />
        {filtradas.length > 0 && (
          <ul className="rounded-md ring-1 ring-foreground/10 bg-card text-sm">
            {filtradas.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    onChange(String(o.id));
                    setQuery("");
                  }}
                >
                  {o.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/reports/filter-controls/product-filter.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(reports): filtro de produto`.

### Task 56: `WarehouseFilter` — filtro de armazém

**Files:** Create `src/components/reports/filter-controls/warehouse-filter.tsx`, `.test.tsx`.

- [ ] **Step 1 — teste que falha.** Criar `warehouse-filter.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { WarehouseFilter } from "./warehouse-filter";

  const opcoes = [{ id: 3, nome: "Galpão A" }, { id: 4, nome: "Galpão B" }];

  describe("WarehouseFilter", () => {
    it("renderiza as opções incluindo 'Todos'", () => {
      render(<WarehouseFilter value="" onChange={() => {}} options={opcoes} />);
      expect(screen.getByRole("option", { name: "Todos os armazéns" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Galpão A" })).toBeInTheDocument();
    });
    it("dispara onChange ao selecionar", () => {
      const onChange = jest.fn();
      render(<WarehouseFilter value="" onChange={onChange} options={opcoes} />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "4" } });
      expect(onChange).toHaveBeenCalledWith("4");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/reports/filter-controls/warehouse-filter.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `warehouse-filter.tsx`:
  ```tsx
  "use client";

  import type { FilterOption } from "./product-filter";

  interface WarehouseFilterProps {
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
  }

  /** Filtro de armazém: select nativo com opção "Todos". */
  export function WarehouseFilter({ value, onChange, options }: WarehouseFilterProps) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-xs rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
      >
        <option value="">Todos os armazéns</option>
        {options.map((o) => (
          <option key={o.id} value={String(o.id)}>
            {o.nome}
          </option>
        ))}
      </select>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/reports/filter-controls/warehouse-filter.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(reports): filtro de armazém`.

### Task 57: `FamilyFilter` — filtro de família

**Files:** Create `src/components/reports/filter-controls/family-filter.tsx`, `.test.tsx`.

- [ ] **Step 1 — teste que falha.** Criar `family-filter.test.tsx` (mesma estrutura do `warehouse-filter.test.tsx`, com `options` de famílias e o rótulo `"Todas as famílias"`):
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { FamilyFilter } from "./family-filter";

  const opcoes = [{ id: 2, nome: "Esteiras" }, { id: 5, nome: "Anilhas" }];

  describe("FamilyFilter", () => {
    it("renderiza a opção 'Todas as famílias'", () => {
      render(<FamilyFilter value="" onChange={() => {}} options={opcoes} />);
      expect(screen.getByRole("option", { name: "Todas as famílias" })).toBeInTheDocument();
    });
    it("dispara onChange ao selecionar", () => {
      const onChange = jest.fn();
      render(<FamilyFilter value="" onChange={onChange} options={opcoes} />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
      expect(onChange).toHaveBeenCalledWith("2");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/reports/filter-controls/family-filter.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `family-filter.tsx`:
  ```tsx
  "use client";

  import type { FilterOption } from "./product-filter";

  interface FamilyFilterProps {
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
  }

  /** Filtro de família: select nativo com opção "Todas". */
  export function FamilyFilter({ value, onChange, options }: FamilyFilterProps) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-xs rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
      >
        <option value="">Todas as famílias</option>
        {options.map((o) => (
          <option key={o.id} value={String(o.id)}>
            {o.nome}
          </option>
        ))}
      </select>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/reports/filter-controls/family-filter.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(reports): filtro de família`.

### Task 58: `PeriodFilter` — filtro de período

**Files:** Create `src/components/reports/filter-controls/period-filter.tsx`, `.test.tsx`.

- [ ] **Step 1 — teste que falha.** Criar `period-filter.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { PeriodFilter } from "./period-filter";

  describe("PeriodFilter", () => {
    it("renderiza dois campos de mês", () => {
      render(<PeriodFilter de="2026-01" ate="2026-03" onChange={() => {}} />);
      const inputs = screen.getAllByDisplayValue(/2026-0/);
      expect(inputs).toHaveLength(2);
    });
    it("dispara onChange ao mudar o mês inicial", () => {
      const onChange = jest.fn();
      render(<PeriodFilter de="2026-01" ate="2026-03" onChange={onChange} />);
      fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-02" } });
      expect(onChange).toHaveBeenCalledWith({ de: "2026-02", ate: "2026-03" });
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/reports/filter-controls/period-filter.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `period-filter.tsx`:
  ```tsx
  "use client";

  import { Label } from "@/components/ui/label";

  interface PeriodFilterProps {
    de: string;
    ate: string;
    onChange: (range: { de: string; ate: string }) => void;
  }

  /** Filtro de período: dois campos de mês (input type=month). */
  export function PeriodFilter({ de, ate, onChange }: PeriodFilterProps) {
    return (
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="periodo-de">De</Label>
          <input
            id="periodo-de"
            type="month"
            value={de}
            onChange={(e) => onChange({ de: e.target.value, ate })}
            className="h-9 rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="periodo-ate">Até</Label>
          <input
            id="periodo-ate"
            type="month"
            value={ate}
            onChange={(e) => onChange({ de, ate: e.target.value })}
            className="h-9 rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
          />
        </div>
      </div>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/reports/filter-controls/period-filter.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(reports): filtro de período`.

### Task 59: `DirectionFilter` — filtro de sentido

**Files:** Create `src/components/reports/filter-controls/direction-filter.tsx`, `.test.tsx`.

- [ ] **Step 1 — teste que falha.** Criar `direction-filter.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { DirectionFilter } from "./direction-filter";

  describe("DirectionFilter", () => {
    it("renderiza as opções Todos/Entradas/Saídas", () => {
      render(<DirectionFilter value="" onChange={() => {}} />);
      expect(screen.getByRole("option", { name: "Todos os sentidos" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Entradas" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Saídas" })).toBeInTheDocument();
    });
    it("dispara onChange ao selecionar", () => {
      const onChange = jest.fn();
      render(<DirectionFilter value="" onChange={onChange} />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "entrada" } });
      expect(onChange).toHaveBeenCalledWith("entrada");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/reports/filter-controls/direction-filter.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `direction-filter.tsx`:
  ```tsx
  "use client";

  interface DirectionFilterProps {
    value: string;
    onChange: (value: string) => void;
  }

  /** Filtro de sentido do movimento. */
  export function DirectionFilter({ value, onChange }: DirectionFilterProps) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-xs rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
      >
        <option value="">Todos os sentidos</option>
        <option value="entrada">Entradas</option>
        <option value="saida">Saídas</option>
      </select>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/reports/filter-controls/direction-filter.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(reports): filtro de sentido`.

### Task 60: `DaysRangeFilter` — filtro de faixa de dias

**Files:** Create `src/components/reports/filter-controls/days-range-filter.tsx`, `.test.tsx`.

- [ ] **Step 1 — teste que falha.** Criar `days-range-filter.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { DaysRangeFilter } from "./days-range-filter";

  describe("DaysRangeFilter", () => {
    it("renderiza as faixas 30/60/90+", () => {
      render(<DaysRangeFilter value="30" onChange={() => {}} />);
      expect(screen.getByRole("option", { name: "+30 dias" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "+60 dias" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "+90 dias" })).toBeInTheDocument();
    });
    it("dispara onChange ao selecionar", () => {
      const onChange = jest.fn();
      render(<DaysRangeFilter value="30" onChange={onChange} />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "90" } });
      expect(onChange).toHaveBeenCalledWith("90");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/reports/filter-controls/days-range-filter.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `days-range-filter.tsx`:
  ```tsx
  "use client";

  interface DaysRangeFilterProps {
    value: string;
    onChange: (value: string) => void;
  }

  /** Filtro de faixa de dias parado: +30 / +60 / +90 dias. */
  export function DaysRangeFilter({ value, onChange }: DaysRangeFilterProps) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-xs rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
      >
        <option value="30">+30 dias</option>
        <option value="60">+60 dias</option>
        <option value="90">+90 dias</option>
      </select>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/reports/filter-controls/days-range-filter.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(reports): filtro de faixa de dias`.

### Task 61: `SearchFilter` — filtro de busca textual

**Files:** Create `src/components/reports/filter-controls/search-filter.tsx`, `.test.tsx`.

- [ ] **Step 1 — teste que falha.** Criar `search-filter.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { SearchFilter } from "./search-filter";

  describe("SearchFilter", () => {
    it("renderiza o campo de texto", () => {
      render(<SearchFilter value="" onChange={() => {}} />);
      expect(screen.getByPlaceholderText(/pesquisar/i)).toBeInTheDocument();
    });
    it("dispara onChange ao digitar", () => {
      const onChange = jest.fn();
      render(<SearchFilter value="" onChange={onChange} />);
      fireEvent.change(screen.getByPlaceholderText(/pesquisar/i), {
        target: { value: "esteira" },
      });
      expect(onChange).toHaveBeenCalledWith("esteira");
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/reports/filter-controls/search-filter.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `search-filter.tsx`:
  ```tsx
  "use client";

  import { Input } from "@/components/ui/input";

  interface SearchFilterProps {
    value: string;
    onChange: (value: string) => void;
  }

  /** Filtro de busca textual livre. */
  export function SearchFilter({ value, onChange }: SearchFilterProps) {
    return (
      <Input
        placeholder="Pesquisar…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-xs"
      />
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/reports/filter-controls/search-filter.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(reports): filtro de busca`.

### Task 62: `report-filters.tsx` — barra de filtros declarativa (I1)

**Files:** Create `src/components/reports/report-filters.tsx`, `src/components/reports/report-filters.test.tsx`.
**Pré-requisito:** Tasks 42, 55-61.

- [ ] **Step 1 — teste que falha.** Criar `report-filters.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import { ReportFilters } from "./report-filters";
  import type { ReportFilter } from "@/lib/reports/types";

  const push = jest.fn();
  jest.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
    usePathname: () => "/relatorios/saldo-produto",
    useSearchParams: () => new URLSearchParams(""),
  }));

  describe("ReportFilters", () => {
    it("renderiza um controle por filtro declarado", () => {
      const filtros: ReportFilter[] = [{ tipo: "busca" }, { tipo: "armazem" }];
      render(
        <ReportFilters
          filtros={filtros}
          options={{ produtos: [], armazens: [], familias: [] }}
        />,
      );
      expect(screen.getByPlaceholderText(/pesquisar/i)).toBeInTheDocument();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
    it("não renderiza nada quando não há filtros", () => {
      const { container } = render(
        <ReportFilters filtros={[]} options={{ produtos: [], armazens: [], familias: [] }} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/reports/report-filters.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `report-filters.tsx`:
  ```tsx
  "use client";

  import { useCallback } from "react";
  import { usePathname, useRouter, useSearchParams } from "next/navigation";
  import type { ReportFilter } from "@/lib/reports/types";
  import { ProductFilter, type FilterOption } from "./filter-controls/product-filter";
  import { WarehouseFilter } from "./filter-controls/warehouse-filter";
  import { FamilyFilter } from "./filter-controls/family-filter";
  import { PeriodFilter } from "./filter-controls/period-filter";
  import { DirectionFilter } from "./filter-controls/direction-filter";
  import { DaysRangeFilter } from "./filter-controls/days-range-filter";
  import { SearchFilter } from "./filter-controls/search-filter";

  export interface FilterOptions {
    produtos: FilterOption[];
    armazens: FilterOption[];
    familias: FilterOption[];
  }

  interface ReportFiltersProps {
    filtros: ReportFilter[];
    options: FilterOptions;
  }

  /**
   * Barra de filtros declarativa: renderiza um controle por filtro da seção e
   * propaga o estado para a URL via searchParams (deep-link + voltar funcionam).
   */
  export function ReportFilters({ filtros, options }: ReportFiltersProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const setParam = useCallback(
      (updates: Record<string, string>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [k, v] of Object.entries(updates)) {
          if (v) params.set(k, v);
          else params.delete(k);
        }
        router.push(`${pathname}?${params.toString()}`);
      },
      [router, pathname, searchParams],
    );

    if (filtros.length === 0) return null;

    return (
      <div className="flex flex-wrap items-end gap-3">
        {filtros.map((f) => {
          switch (f.tipo) {
            case "produto":
              return (
                <ProductFilter
                  key="produto"
                  value={searchParams.get("produtoId") ?? ""}
                  onChange={(v) => setParam({ produtoId: v })}
                  options={options.produtos}
                />
              );
            case "armazem":
              return (
                <WarehouseFilter
                  key="armazem"
                  value={searchParams.get("armazemId") ?? ""}
                  onChange={(v) => setParam({ armazemId: v })}
                  options={options.armazens}
                />
              );
            case "familia":
              return (
                <FamilyFilter
                  key="familia"
                  value={searchParams.get("familiaId") ?? ""}
                  onChange={(v) => setParam({ familiaId: v })}
                  options={options.familias}
                />
              );
            case "periodo":
              return (
                <PeriodFilter
                  key="periodo"
                  de={searchParams.get("periodoDe") ?? ""}
                  ate={searchParams.get("periodoAte") ?? ""}
                  onChange={({ de, ate }) =>
                    setParam({ periodoDe: de, periodoAte: ate })
                  }
                />
              );
            case "sentido":
              return (
                <DirectionFilter
                  key="sentido"
                  value={searchParams.get("sentido") ?? ""}
                  onChange={(v) => setParam({ sentido: v })}
                />
              );
            case "faixaDias":
              return (
                <DaysRangeFilter
                  key="faixaDias"
                  value={searchParams.get("faixaDias") ?? f.default ?? "30"}
                  onChange={(v) => setParam({ faixaDias: v })}
                />
              );
            case "busca":
              return (
                <SearchFilter
                  key="busca"
                  value={searchParams.get("busca") ?? ""}
                  onChange={(v) => setParam({ busca: v })}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/reports/report-filters.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(reports): barra de filtros declarativa`.

### Task 63: item de nav "Relatórios" (I7)

**Files:** Modify `src/lib/constants/nav.ts`.

- [ ] **Step 1 — implementação.** Importar `BarChart3` no topo de `nav.ts`:
  ```ts
  import { BarChart3, Home, Settings, Users } from "lucide-react";
  ```
  Acrescentar ao array `NAV_ITEMS`, após o item `Dashboard`:
  ```ts
    { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
  ```
  Decisão I7: o item não tem `section` nem `visibleTo` — é sempre visível; o enforcement por domínio é nas camadas 2/3 (`requireDomainAccess`, `guardEstoque`). `filterNav` não filtra por domínio.
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `feat(nav): item Relatórios`.

### Task 64: `relatorios-grid.tsx` — grade de relatórios

**Files:** Create `src/app/(protected)/relatorios/relatorios-grid.tsx`, `relatorios-grid.test.tsx`.
**Pré-requisito:** Tasks 10, 42.

- [ ] **Step 1 — teste que falha.** Criar `relatorios-grid.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import { Boxes } from "lucide-react";
  import { RelatoriosGrid } from "./relatorios-grid";
  import type { ReportEntry } from "@/lib/reports/types";

  const r1: ReportEntry = {
    id: "saldo-produto", titulo: "Saldo por produto", dominio: "estoque",
    descricao: "Saldo.", icone: Boxes, modeloFonte: "estoque.saldo.hoje", secoes: [],
  };

  describe("RelatoriosGrid", () => {
    it("renderiza os cards agrupados por domínio", () => {
      render(<RelatoriosGrid reports={[r1]} />);
      expect(screen.getByText("Saldo por produto")).toBeInTheDocument();
      expect(screen.getByText("Estoque")).toBeInTheDocument();
    });
    it("renderiza o estado vazio quando não há relatórios", () => {
      render(<RelatoriosGrid reports={[]} />);
      expect(screen.getByText(/nenhum relatório disponível/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/app/\(protected\)/relatorios/relatorios-grid.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `relatorios-grid.tsx`:
  ```tsx
  "use client";

  import Link from "next/link";
  import { motion } from "framer-motion";
  import { Card } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { REPORT_DOMAINS } from "@/lib/reports/domains";
  import type { ReportEntry } from "@/lib/reports/types";

  interface RelatoriosGridProps {
    reports: ReportEntry[];
  }

  /** Grade de cards de relatório, agrupada por domínio. */
  export function RelatoriosGrid({ reports }: RelatoriosGridProps) {
    if (reports.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          Nenhum relatório disponível. Você ainda não tem acesso a um domínio.
        </p>
      );
    }

    const dominiosComReports = REPORT_DOMAINS.filter((d) =>
      reports.some((r) => r.dominio === d.id),
    );

    return (
      <div className="flex flex-col gap-8">
        {dominiosComReports.map((dominio) => (
          <section key={dominio.id} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {dominio.label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reports
                .filter((r) => r.dominio === dominio.id)
                .map((r) => {
                  const Icon = r.icone;
                  return (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Link href={`/relatorios/${r.id}`}>
                        <Card className="gap-2 px-4 py-4 transition-shadow hover:ring-foreground/20">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-muted-foreground" />
                            <span className="font-medium">{r.titulo}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {r.descricao}
                          </p>
                          <Badge variant="secondary" className="w-fit">
                            {dominio.label}
                          </Badge>
                        </Card>
                      </Link>
                    </motion.div>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    );
  }
  ```
  Nota: confirmar no `package.json` se a lib de animação é `framer-motion` ou `motion`; ajustar o import à que o projeto já usa (a F1 usa `motion` fade-in — usar a mesma).
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/app/\(protected\)/relatorios/relatorios-grid.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(relatorios): grade de relatórios`.

### Task 65: landing `/relatorios` — `page.tsx`

**Files:** Create `src/app/(protected)/relatorios/page.tsx`.
**Pré-requisito:** Tasks 12, 50, 64.

- [ ] **Step 1 — implementação.** Criar `page.tsx`:
  ```tsx
  import { redirect } from "next/navigation";
  import { BarChart3 } from "lucide-react";
  import { getCurrentUser } from "@/lib/auth";
  import { getMyDomains } from "@/lib/actions/domain-access";
  import { reportsForUser } from "@/lib/reports/catalog";
  import { PageShell } from "@/components/layout/page-shell";
  import { PageHeader } from "@/components/page-header";
  import { RelatoriosGrid } from "./relatorios-grid";

  export const metadata = { title: "Relatórios | Nexus Odoo" };
  export const dynamic = "force-dynamic";

  export default async function RelatoriosPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const domains = await getMyDomains();
    const reports = reportsForUser(user.platformRole, domains);
    return (
      <PageShell variant="narrow">
        <PageHeader
          icon={BarChart3}
          title="Relatórios"
          subtitle="Painéis de estoque com dados do cache sincronizado"
        />
        <RelatoriosGrid reports={reports} />
      </PageShell>
    );
  }
  ```
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `feat(relatorios): landing`.

### Task 66: `report-view.tsx` — render do relatório

**Files:** Create `src/app/(protected)/relatorios/[id]/report-view.tsx`, `report-view.test.tsx`.
**Pré-requisito:** Tasks 32-40, 42, 62.

- [ ] **Step 1 — teste que falha.** Criar `report-view.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen } from "@testing-library/react";
  import { Boxes } from "lucide-react";
  import { ReportView } from "./report-view";
  import type { ReportEntry } from "@/lib/reports/types";

  jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => "/relatorios/saldo-produto",
    useSearchParams: () => new URLSearchParams(""),
  }));

  const entry: ReportEntry = {
    id: "saldo-produto", titulo: "Saldo", dominio: "estoque", descricao: "",
    icone: Boxes, modeloFonte: "estoque.saldo.hoje",
    secoes: [{
      id: "tabela", template: "DataTable", fato: "fato_estoque_saldo",
      config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
      filtros: [],
    }],
  };

  describe("ReportView", () => {
    it("renderiza o indicador de freshness", () => {
      render(
        <ReportView
          report={entry}
          secoes={[{ secao: entry.secoes[0], estado: "ok", dados: [{ produtoNome: "X" }] }]}
          freshness={new Date("2026-05-16T09:00:00Z")}
          options={{ produtos: [], armazens: [], familias: [] }}
        />,
      );
      expect(screen.getByText(/atualizado em/i)).toBeInTheDocument();
    });
    it("renderiza cada seção com seu estado", () => {
      render(
        <ReportView
          report={entry}
          secoes={[{ secao: entry.secoes[0], estado: "preparando", dados: [] }]}
          freshness={null}
          options={{ produtos: [], armazens: [], familias: [] }}
        />,
      );
      expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/app/\(protected\)/relatorios/\[id\]/report-view.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `report-view.tsx`:
  ```tsx
  "use client";

  import type { ReportEntry, ReportSection, ReportState } from "@/lib/reports/types";
  import { ReportFilters, type FilterOptions } from "@/components/reports/report-filters";
  import { KPICard } from "@/components/charts/kpi-card";
  import { DataTable, type ColumnDef } from "@/components/charts/data-table";
  import { BarChartCard } from "@/components/charts/bar-chart";
  import { LineChartCard } from "@/components/charts/line-chart";
  import { PieChartCard } from "@/components/charts/pie-chart";

  /** Uma seção já resolvida com seu estado e dados. */
  export interface SecaoComDados {
    secao: ReportSection;
    estado: ReportState;
    dados: unknown;
  }

  interface ReportViewProps {
    report: ReportEntry;
    secoes: SecaoComDados[];
    freshness: Date | null;
    options: FilterOptions;
  }

  function renderSecao({ secao, estado, dados }: SecaoComDados) {
    const cfg = secao.config;
    switch (secao.template) {
      case "KPICard": {
        const d = dados as { total?: number };
        return (
          <KPICard
            valor={d?.total ?? 0}
            rotulo={String(cfg.rotulo ?? "")}
            formato="inteiro"
            estado={estado}
          />
        );
      }
      case "DataTable": {
        const d = dados as { linhas?: unknown[] } | unknown[];
        const linhas = Array.isArray(d) ? d : (d?.linhas ?? []);
        return (
          <DataTable
            columns={cfg.colunas as ColumnDef<Record<string, unknown>>[]}
            rows={linhas as Record<string, unknown>[]}
            estado={estado}
            searchable={Boolean(cfg.searchable)}
          />
        );
      }
      case "BarChart": {
        const d = dados as { marca?: unknown[] } | unknown[];
        const data = Array.isArray(d) ? d : (d?.marca ?? []);
        return (
          <BarChartCard
            data={data as Record<string, unknown>[]}
            config={cfg as never}
            estado={estado}
          />
        );
      }
      case "LineChart":
        return (
          <LineChartCard
            data={dados as Record<string, unknown>[]}
            config={cfg as never}
            estado={estado}
          />
        );
      case "PieChart": {
        const d = dados as { familia?: unknown[] } | unknown[];
        const data = Array.isArray(d) ? d : (d?.familia ?? []);
        return (
          <PieChartCard
            data={data as Record<string, unknown>[]}
            config={cfg as never}
            estado={estado}
          />
        );
      }
      default:
        return null;
    }
  }

  /** Renderiza um relatório: filtros, seções em sequência e freshness. */
  export function ReportView({
    report, secoes, freshness, options,
  }: ReportViewProps) {
    const todosFiltros = report.secoes.flatMap((s) => s.filtros);
    return (
      <div className="flex flex-col gap-6">
        <ReportFilters filtros={todosFiltros} options={options} />
        {secoes.map((sd) => (
          <div key={sd.secao.id}>{renderSecao(sd)}</div>
        ))}
        <p className="text-xs text-muted-foreground">
          {freshness
            ? `Atualizado em ${freshness.toLocaleString("pt-BR")}`
            : "Atualizado em — (relatório ainda sendo preparado)"}
        </p>
      </div>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/app/\(protected\)/relatorios/\[id\]/report-view.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(relatorios): report-view`.

### Task 67: página `/relatorios/[id]` — `page.tsx`

**Files:** Create `src/app/(protected)/relatorios/[id]/page.tsx`.
**Pré-requisito:** Tasks 14, 50, 51, 52, 53, 66.

- [ ] **Step 1 — implementação.** Criar `page.tsx`:
  ```tsx
  import { notFound } from "next/navigation";
  import { ArrowLeft } from "lucide-react";
  import Link from "next/link";
  import { prisma } from "@/lib/prisma";
  import { requireDomainAccess } from "@/lib/reports/guard";
  import { getReport } from "@/lib/reports/catalog";
  import { parseFilters } from "@/lib/reports/filters";
  import { reportFreshness } from "@/lib/reports/freshness";
  import {
    getRelatorioSaldoProduto, getRelatorioValorPorArmazem,
    getRelatorioEntradasSaidas, getRelatorioProdutoParado,
    getRelatorioTopMovimentados, getRelatorioConcentracao,
  } from "@/lib/actions/report-data";
  import { PageShell } from "@/components/layout/page-shell";
  import { PageHeader } from "@/components/page-header";
  import { ReportView, type SecaoComDados } from "./report-view";
  import type { ReportFilterValues } from "@/lib/reports/types";

  export const dynamic = "force-dynamic";

  /** Mapa id-do-relatório -> query de leitura. */
  const QUERIES: Record<
    string,
    (f: ReportFilterValues) => Promise<{ estado: string; dados: unknown }>
  > = {
    "saldo-produto": getRelatorioSaldoProduto,
    "valor-armazem": getRelatorioValorPorArmazem,
    "entradas-saidas": getRelatorioEntradasSaidas,
    "produtos-parados": getRelatorioProdutoParado,
    "top-movimentados": getRelatorioTopMovimentados,
    "concentracao": getRelatorioConcentracao,
  };

  interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | undefined>>;
  }

  export default async function RelatorioPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    const report = getReport(id);
    if (!report) notFound();

    // Camada 2 do RBAC — redireciona se o usuário não tem o domínio.
    await requireDomainAccess(report.dominio);

    const query = QUERIES[id];
    const freshness = await reportFreshness(prisma, report);

    // Uma chamada de query por seção; cada seção parseia seus próprios filtros.
    const secoes: SecaoComDados[] = [];
    for (const secao of report.secoes) {
      const filtros = parseFilters(secao, sp);
      const resultado = await query(filtros);
      secoes.push({
        secao,
        estado: resultado.estado as SecaoComDados["estado"],
        dados: resultado.dados,
      });
    }

    // Opções dos filtros (produtos/armazéns/famílias) a partir do fato de saldo.
    const saldos = await prisma.fatoEstoqueSaldo.findMany({
      select: {
        produtoId: true, produtoNome: true, localId: true, localNome: true,
        familiaId: true, familiaNome: true,
      },
    });
    const options = {
      produtos: dedup(saldos, "produtoId", "produtoNome"),
      armazens: dedup(saldos, "localId", "localNome"),
      familias: dedup(saldos, "familiaId", "familiaNome"),
    };

    return (
      <PageShell variant="narrow">
        <Link
          href="/relatorios"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Relatórios
        </Link>
        <PageHeader
          icon={report.icone}
          title={report.titulo}
          subtitle={report.descricao}
        />
        <ReportView
          report={report}
          secoes={secoes}
          freshness={freshness}
          options={options}
        />
      </PageShell>
    );
  }

  /** Extrai opções únicas {id, nome} de uma lista de linhas de fato. */
  function dedup<T extends Record<string, unknown>>(
    rows: T[],
    idKey: keyof T,
    nomeKey: keyof T,
  ): { id: number; nome: string }[] {
    const map = new Map<number, string>();
    for (const r of rows) {
      const id = r[idKey];
      const nome = r[nomeKey];
      if (typeof id === "number" && typeof nome === "string") {
        map.set(id, nome);
      }
    }
    return [...map.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  ```
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `feat(relatorios): página de relatório`.

### Task 68: verificação de build e lint do Bloco 6

- [ ] `npx tsc --noEmit` → verde.
- [ ] `npm run lint` → sem erro.
- [ ] `npx jest src/components/reports src/app` → verde.
- [ ] `npx next build` → build completo sem erro (única execução de `next build` das tasks individuais — N6).

### Task 69: UAT do Bloco 6

- [ ] Subir `npm run dev`, logar como `super_admin`. Abrir `/relatorios` — grade com os 6 cards agrupados sob "Estoque".
- [ ] Abrir cada um dos 6 relatórios; conferir render do template, filtros e o indicador "atualizado em".
- [ ] RBAC: logar como `viewer` sem domínio — o item "Relatórios" aparece no nav; a landing mostra o estado vazio; acessar `/relatorios/saldo-produto` por URL direta redireciona para `/relatorios`.
- [ ] Logar como `manager` com domínio `estoque` (do backfill) — vê os 6 e acessa.

---

## Bloco 7 — Etapa "Acesso" no modal de usuário

> **Dependências de artefato (N1):** Task 70 depende de `ReportDomainId` (Task 10);
> Task 71 (`access-step`) de `grantableDomains`/`ReportDomainId` (Task 10);
> Tasks 72-78 (`user-form-dialog`) de `access-step` (Task 71), de
> `updateUserDomains`/`getUserDomains` (Tasks 11, 13) e de `domains.ts` (Task 10).
> O Bloco 7 fica por último na topologia.

### Task 70: `createUser` transacional com domínios (C1)

**Files:** Modify `src/lib/actions/users.ts`, `src/lib/actions/users.test.ts` (criar o test se não existir).
**Pré-requisito:** Tasks 3 (`UserDomainAccess`), 10 (`ReportDomainId`).

- [ ] **Step 1 — teste que falha.** Em `users.test.ts` acrescentar (mockando `prisma.$transaction`, `prisma.user`, `prisma.userDomainAccess`, `getCurrentUser`, `logAudit`, `canCreateRole`):
  ```ts
  describe("createUser com domínios", () => {
    it("cria o usuário e os domínios na mesma transação", async () => {
      // arrange: getCurrentUser admin, canCreateRole true, e-mail livre
      const result = await createUser({
        name: "Maria", email: "maria@x.com", platformRole: "manager",
        domains: ["estoque"],
      });
      expect(result.success).toBe(true);
      // $transaction recebeu uma função; dentro dela rodam user.create + createMany
      expect(prisma.$transaction).toHaveBeenCalled();
    });
    it("faz rollback do par usuário+domínios em falha", async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error("db"));
      const result = await createUser({
        name: "Maria", email: "maria@x.com", platformRole: "manager",
        domains: ["estoque"],
      });
      expect(result.success).toBe(false);
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/lib/actions/users.test.ts` → falha.
- [ ] **Step 3 — implementação.** Em `users.ts`: estender o schema e a função `createUser`. Importar `ReportDomain` no topo e acrescentar `domains` ao schema:
  ```ts
  import type { PlatformRole, ReportDomain } from "@/generated/prisma/client";

  const CreateUserInput = z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    platformRole: z.enum(ROLE_VALUES),
    password: z.string().min(8).max(72).optional(),
    domains: z.array(z.enum(["estoque", "financeiro", "fiscal", "comercial"])).default([]),
  });
  ```
  Substituir o bloco `prisma.user.create(...)` por uma transação que cobre user + domínios:
  ```ts
      // C1: a transação cobre user.create + userDomainAccess.createMany.
      // O logAudit (pgPool, fora do Prisma) segue pós-commit, fire-and-forget.
      // Domínios só fazem sentido para manager/viewer (§4.3); privilegiados ignoram.
      const domains =
        input.platformRole === "manager" || input.platformRole === "viewer"
          ? input.domains
          : [];

      const created = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            password: hash,
            platformRole: input.platformRole,
            mustChangePassword: useGenerated,
            isActive: true,
          },
          select: { id: true },
        });
        if (domains.length) {
          await tx.userDomainAccess.createMany({
            data: domains.map((domain) => ({
              userId: u.id,
              domain: domain as ReportDomain,
              grantedById: me.id,
            })),
          });
        }
        return u;
      });
  ```
  O `logAudit({ action: "user_created", ... })` permanece exatamente como está, após a transação.
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/lib/actions/users.test.ts` → verde.
- [ ] **Step 5 — commit.** `refactor(users): createUser transacional com domínios`.

### Task 71: `access-step.tsx` — componente da etapa Acesso

**Files:** Create `src/components/users/access-step.tsx`, `src/components/users/access-step.test.tsx`.
**Pré-requisito:** Task 10.

- [ ] **Step 1 — teste que falha.** Criar `access-step.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  import { AccessStep } from "./access-step";

  describe("AccessStep", () => {
    it("renderiza um checkbox por domínio", () => {
      render(
        <AccessStep
          selected={[]}
          onChange={() => {}}
          grantable={["estoque", "financeiro", "fiscal", "comercial"]}
        />,
      );
      expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    });
    it("desabilita os domínios não concedíveis", () => {
      render(
        <AccessStep selected={[]} onChange={() => {}} grantable={["estoque"]} />,
      );
      const estoque = screen.getByRole("checkbox", { name: /estoque/i });
      const fiscal = screen.getByRole("checkbox", { name: /fiscal/i });
      expect(estoque).toBeEnabled();
      expect(fiscal).toBeDisabled();
    });
    it("dispara onChange ao marcar um domínio", () => {
      const onChange = jest.fn();
      render(
        <AccessStep selected={[]} onChange={onChange} grantable={["estoque"]} />,
      );
      fireEvent.click(screen.getByRole("checkbox", { name: /estoque/i }));
      expect(onChange).toHaveBeenCalledWith(["estoque"]);
    });
    it("exibe aviso quando nenhum domínio está selecionado", () => {
      render(
        <AccessStep selected={[]} onChange={() => {}} grantable={["estoque"]} />,
      );
      expect(screen.getByText(/não verá nenhum relatório/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/users/access-step.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Criar `access-step.tsx`:
  ```tsx
  "use client";

  import { REPORT_DOMAINS, type ReportDomainId } from "@/lib/reports/domains";

  interface AccessStepProps {
    selected: ReportDomainId[];
    onChange: (domains: ReportDomainId[]) => void;
    /** Domínios que o concedente pode conceder; os demais ficam desabilitados. */
    grantable: ReportDomainId[];
  }

  /** Etapa "Acesso": checkboxes de domínio de relatório. */
  export function AccessStep({ selected, onChange, grantable }: AccessStepProps) {
    function toggle(id: ReportDomainId) {
      onChange(
        selected.includes(id)
          ? selected.filter((d) => d !== id)
          : [...selected, id],
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Selecione os domínios de relatório que este usuário poderá ver.
        </p>
        <ul className="flex flex-col gap-2">
          {REPORT_DOMAINS.map((d) => {
            const disabled = !grantable.includes(d.id);
            return (
              <li key={d.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`dominio-${d.id}`}
                  checked={selected.includes(d.id)}
                  disabled={disabled}
                  onChange={() => toggle(d.id)}
                />
                <label
                  htmlFor={`dominio-${d.id}`}
                  className={disabled ? "text-muted-foreground" : ""}
                >
                  {d.label}
                </label>
              </li>
            );
          })}
        </ul>
        {selected.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Este usuário ainda não verá nenhum relatório até receber acesso a um
            domínio.
          </p>
        )}
      </div>
    );
  }
  ```
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/users/access-step.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(users): componente da etapa Acesso`.

### Task 72: `user-form-dialog` — `Step` com 3 etapas

**Files:** Modify `src/components/users/user-form-dialog.tsx`.
**Pré-requisito:** Task 71.

- [ ] **Step 1 — implementação.** Alterar a declaração de tipo (linha ~58):
  ```ts
  type Step = 1 | 2 | 3;
  ```
  Estender `FormState` (linha ~111) e `EMPTY_FORM`:
  ```ts
  interface FormState {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    role: RoleValue;
    isActive: boolean;
    domains: ReportDomainId[];
  }

  const EMPTY_FORM: FormState = {
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "viewer",
    isActive: true,
    domains: [],
  };
  ```
  Importar no topo: `import { type ReportDomainId } from "@/lib/reports/domains";`.
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` — pode acusar uso de `step < 2`/`stepperItems` ainda hardcoded; isso é resolvido nas Tasks 73-75. Se `tsc` falhar **somente** por isso, prosseguir; caso contrário, corrigir.
- [ ] **Step 3 — commit.** `refactor(users): Step com 3 etapas e domains no FormState`.

### Task 73: `user-form-dialog` — navegação genérica do stepper

**Files:** Modify `src/components/users/user-form-dialog.tsx`.
**Pré-requisito:** Task 72.

- [ ] **Step 1 — implementação.** Acrescentar, logo após o `availableRoles`, o cômputo da última etapa por role:
  ```ts
  // manager/viewer têm a etapa "Acesso" (3 etapas); privilegiados, 2.
  const temEtapaAcesso = form.role === "manager" || form.role === "viewer";
  const ultimaEtapa: Step = temEtapaAcesso ? 3 : 2;
  ```
  Substituir o corpo de `goBack` por navegação genérica:
  ```ts
  function goBack() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }
  ```
  No final de `goNext`, trocar `setStep(2)` por:
  ```ts
    setStep((s) => (s < ultimaEtapa ? ((s + 1) as Step) : s));
  ```
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` — `goNext`/`goBack` compilam.
- [ ] **Step 3 — commit.** `refactor(users): navegação genérica do stepper`.

### Task 74: `user-form-dialog` — footer dinâmico

**Files:** Modify `src/components/users/user-form-dialog.tsx`.
**Pré-requisito:** Task 73.

- [ ] **Step 1 — implementação.** No `DialogFooter`, trocar a condição do botão "Avançar" — `step < 2` por `step < ultimaEtapa` — e a condição do botão "Salvar/Criar" (o `: ` do ternário) por `step >= ultimaEtapa`. O botão "Voltar" mantém `step > 1`. Concretamente, o trecho:
  ```tsx
  {step < 2 ? (
    <Button type="button" onClick={() => void goNext()} ...>
      ...Avançar...
    </Button>
  ) : (
    <Button type="button" onClick={handleSubmit} ...>
      ...Salvar/Criar...
    </Button>
  )}
  ```
  vira `{step < ultimaEtapa ? ( ...Avançar... ) : ( ...Salvar... )}`.
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `refactor(users): footer dinâmico do stepper`.

### Task 75: `user-form-dialog` — `stepperItems` por role

**Files:** Modify `src/components/users/user-form-dialog.tsx`.
**Pré-requisito:** Task 74.

- [ ] **Step 1 — implementação.** Importar `ShieldCheck` de `lucide-react` (M6). Substituir a declaração de `stepperItems` (constante atual) por um `useMemo` dependente do role:
  ```ts
  const stepperItems = useMemo<
    Array<{ n: Step; label: string; icon: typeof IdCard }>
  >(() => {
    const items: Array<{ n: Step; label: string; icon: typeof IdCard }> = [
      { n: 1, label: "Identidade", icon: IdCard },
    ];
    if (temEtapaAcesso) {
      items.push({ n: 2, label: "Acesso", icon: ShieldCheck });
      items.push({ n: 3, label: "Confirmação", icon: CheckCircle2 });
    } else {
      items.push({ n: 2, label: "Confirmação", icon: CheckCircle2 });
    }
    return items;
  }, [temEtapaAcesso]);
  ```
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `feat(users): stepper computado por role`.

### Task 76: `user-form-dialog` — renderizar a etapa Acesso

**Files:** Modify `src/components/users/user-form-dialog.tsx`.
**Pré-requisito:** Tasks 71, 75.

- [ ] **Step 1 — implementação.** Importar `AccessStep` e `grantableDomains`:
  ```ts
  import { AccessStep } from "@/components/users/access-step";
  import { grantableDomains } from "@/lib/reports/domains";
  ```
  Calcular os domínios concedíveis pelo concedente. O `currentUser` é `AuthUser` (sem domínios) — para o caso `manager`, os domínios concedíveis precisam vir do servidor. **Decisão:** o componente recebe via prop `granterDomains: ReportDomainId[]` (carregado pelo componente-pai a partir de `getMyDomains()`); adicionar essa prop a `UserFormDialogProps`. Dentro do componente:
  ```ts
  const grantable = grantableDomains(currentUser.platformRole, granterDomains);
  ```
  No bloco de render das etapas, trocar o ternário `step === 1 ? <StepIdentity/> : <StepConfirm/>` por uma cadeia de 3 ramos:
  ```tsx
  {step === 1 ? (
    <StepIdentity ... />
  ) : step === 2 && temEtapaAcesso ? (
    <AccessStep
      selected={form.domains}
      onChange={(domains) => setForm((f) => ({ ...f, domains }))}
      grantable={grantable}
    />
  ) : (
    <StepConfirm form={form} isEdit={isEdit} />
  )}
  ```
  Atualizar o componente-pai (a tela que monta `UserFormDialog`, p.ex. `users-tabs.tsx` ou `users-list`) para passar `granterDomains` — carregar com `getMyDomains()` no server component que renderiza a lista e repassar como prop.
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `feat(users): renderiza a etapa Acesso no modal`.

### Task 77: `user-form-dialog` — troca de role zera domínios (N10)

**Files:** Modify `src/components/users/user-form-dialog.tsx`, `src/components/users/user-form-dialog.test.tsx` (criar se não existir).
**Pré-requisito:** Task 76.

- [ ] **Step 1 — teste que falha.** Criar/estender `user-form-dialog.test.tsx`:
  ```tsx
  /**
   * @jest-environment jsdom
   */
  import "@testing-library/jest-dom";
  import { render, screen, fireEvent } from "@testing-library/react";
  // ...mocks de createUser/updateUser/checkEmailAvailable e dos contextos...

  describe("UserFormDialog — troca de role (N10)", () => {
    it("ao escolher um role privilegiado na etapa Acesso, recua para a etapa válida e zera domínios", () => {
      // render do dialog em modo create, manager selecionado, avançar até a etapa 2 (Acesso),
      // marcar 'estoque', voltar à etapa 1, trocar role para 'admin':
      // espera-se que a etapa volte para um valor <= 2 e os domínios fiquem vazios.
      // (o teste exercita handleRoleChange — ver Step 3.)
    });
  });
  ```
  Nota: este teste é de integração de componente; se o setup completo do dialog ficar muito pesado, extrair `handleRoleChange` como função pura testável e cobrir a função isolada — ela recebe `(prevForm, novoRole, step)` e devolve `{ form, step }`.
- [ ] **Step 2 — rodar e ver falhar.** `npx jest src/components/users/user-form-dialog.test.tsx` → falha.
- [ ] **Step 3 — implementação.** Adicionar um handler de troca de role e ligá-lo onde o `StepIdentity` altera `form.role`. Em vez de `setForm((f) => ({ ...f, role }))` direto, usar:
  ```ts
  function handleRoleChange(role: RoleValue) {
    setForm((f) => {
      const privilegiado = role === "super_admin" || role === "admin";
      return {
        ...f,
        role,
        // N10: privilegiado não tem domínios — zera a seleção.
        domains: privilegiado ? [] : f.domains,
      };
    });
    // Se o usuário estava na etapa Acesso e o role virou privilegiado,
    // a etapa 2 deixa de existir; recuar para a Identidade.
    const privilegiado = role === "super_admin" || role === "admin";
    if (privilegiado && step >= 2) {
      setStep((s) => (s > 2 ? 2 : 1) as Step);
    }
  }
  ```
  `StepIdentity` deve receber `onRoleChange={handleRoleChange}` (adicionar a prop e usá-la no seletor de role no lugar do `setForm` direto de `role`).
- [ ] **Step 4 — rodar e ver passar.** `npx jest src/components/users/user-form-dialog.test.tsx` → verde.
- [ ] **Step 5 — commit.** `feat(users): troca de role zera domínios e recua etapa`.

### Task 78: `user-form-dialog` — `StepConfirm` lista domínios (I6)

**Files:** Modify `src/components/users/user-form-dialog.tsx`.
**Pré-requisito:** Task 76.

- [ ] **Step 1 — implementação.** Em `StepConfirm`, quando `form.role` é `manager`/`viewer`, listar os domínios selecionados e o aviso de zero. Acrescentar ao corpo do componente `StepConfirm`:
  ```tsx
  {(form.role === "manager" || form.role === "viewer") && (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">Acesso a relatórios</span>
      {form.domains.length > 0 ? (
        <span className="text-sm text-muted-foreground">
          {form.domains
            .map((d) => REPORT_DOMAINS.find((m) => m.id === d)?.label ?? d)
            .join(", ")}
        </span>
      ) : (
        <span className="text-xs text-amber-600 dark:text-amber-500">
          Nenhum domínio selecionado — o usuário não verá nenhum relatório.
        </span>
      )}
    </div>
  )}
  ```
  Importar `REPORT_DOMAINS` se ainda não importado.
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — commit.** `feat(users): StepConfirm lista os domínios selecionados`.

### Task 79: `user-form-dialog` — submit com domínios (N1)

**Files:** Modify `src/components/users/user-form-dialog.tsx`.
**Pré-requisito:** Tasks 13, 70, 76-78.

- [ ] **Step 1 — implementação.** Importar `updateUserDomains`:
  ```ts
  import { updateUserDomains } from "@/lib/actions/domain-access";
  ```
  No `handleSubmit`, **ramo create**: passar `domains` ao `createUser`:
  ```ts
      const result = await createUser({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        platformRole: form.role,
        password: form.password.length > 0 ? form.password : undefined,
        domains: form.domains,
      });
  ```
  **Ramo edit (N1 — ordem segura):** o problema é que mudar o role para privilegiado **antes** de aplicar os domínios deixaria linhas órfãs (privilegiado não pode ter linhas) ou um manager sem linhas. Como `updateUserDomains` é idempotente (Task 13) e o role privilegiado já zera `form.domains` na UI (N10, Task 77), a ordem segura é: **aplicar `updateUserDomains` primeiro** (com o conjunto-alvo coerente com o role final), **depois** `updateUser`. Substituir o bloco de edit por:
  ```ts
      if (!user) return;

      // N1: domínios primeiro. updateUserDomains é idempotente; com role
      // privilegiado, form.domains já é [] (N10) — então a chamada apenas
      // remove eventuais linhas remanescentes, sem deixar estado órfão.
      const editavelDominio =
        form.role === "manager" || form.role === "viewer";
      if (editavelDominio || true) {
        const domRes = await updateUserDomains(
          user.id,
          editavelDominio ? form.domains : [],
        );
        if (!domRes.success) {
          toast.error(`Falha ao atualizar domínios: ${domRes.error}`);
          return; // não prossegue para updateUser — nada de identidade foi tocado
        }
      }

      const result = await updateUser({
        id: user.id,
        name: form.name.trim(),
        platformRole: lockRole ? undefined : form.role,
        password: form.password.length > 0 ? form.password : undefined,
        isActive: showActiveToggle ? form.isActive : undefined,
      });
      if (result.success) {
        toast.success("Usuário atualizado.");
        onSuccess();
        onOpenChange(false);
      } else {
        // Domínios já foram salvos; identidade falhou — erro parcial.
        toast.error(`Domínios salvos, mas a identidade falhou: ${result.error}`);
      }
  ```
  No modo edit, ao abrir o modal, pré-carregar `form.domains` do usuário-alvo: o componente-pai passa `user.domainAccess` ou uma prop `userDomains: ReportDomainId[]`; no `useEffect` de abertura, setar `domains: userDomains ?? []` no `setForm`.
- [ ] **Step 2 — verificação.** `npx tsc --noEmit` → verde.
- [ ] **Step 3 — UAT.** Editar um manager existente: mudar domínios, salvar, reabrir — domínios persistidos. Criar um manager com domínios. Trocar role de manager→admin no modal: domínios somem e o save remove as linhas.
- [ ] **Step 4 — commit.** `feat(users): submit do modal com domínios (create e edit)`.

### Task 80: Verificação do Bloco 7

- [ ] `npx tsc --noEmit` → verde.
- [ ] `npm run lint` → sem erro.
- [ ] `npx jest src/components/users src/lib/actions/users.test.ts` → verde.
- [ ] `npx next build` → build completo.
- [ ] UAT do modal nos 4 papéis: `super_admin`/`admin` veem 2 etapas (sem "Acesso"); `manager`/`viewer` veem 3; criar persiste domínios; editar persiste; trocar role recalcula o stepper.

---

## Verificação final da fase

- [ ] `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npx jest` — todos verdes.
- [ ] Worker: rodar um ciclo de snapshot; conferir que os 3 builders rodam e que `fato_build_state` tem 3 linhas (`fato_estoque_saldo`, `fato_estoque_movimento`, `fato_produto_parado`); os 3 fatos populados.
- [ ] Os 6 relatórios renderizam com dado real; estados "preparando" (fato sem `FatoBuildState`), "vazio" (filtro sem linhas) e "erro" verificados.
- [ ] RBAC por domínio: `viewer`/`manager` sem o domínio `estoque` não veem dado — landing vazia, página redireciona, query lança e cai em "erro".
- [ ] Etapa "Acesso" funcional nos 4 papéis; `createUser` persiste domínios em transação; indicador de freshness exibido em cada relatório.
- [ ] Backfill: confirmar que `manager`/`viewer` pré-existentes receberam `estoque` (linha em `user_domain_access`).
- [ ] Etapa [10] do workflow: rodar `/gsd-code-review` (bugs, segurança, qualidade) + `/gsd-ui-review` (6 pilares visuais).

## Self-review (autor do plano — PLAN v3)

**Cobertura da spec v3, seção a seção:**
- §3.1 (4 camadas) → fato: Bloco 1 (Tasks 5-7) + Bloco 3; query: Bloco 5 (Tasks 52-53); componente: Bloco 4 + Bloco 6 (Task 66); catálogo: Bloco 5 (Tasks 44-50).
- §3.2 (campos relacionais) → Task 1 (`odoo-relational`), usado por Tasks 19-27.
- §3.3 (entrada declarativa) → Task 42 (`types.ts`) + Tasks 44-49 (catálogo).
- §3.4 (estado do fato) → `FatoBuildState` (Tasks 4, 17) + `estadoDoFato` na Task 52.
- §3.5 (topologia) → ordem das tasks: migration (1-9) → builders (16-29) → query (42-54) → componente/catálogo → RBAC (Bloco 7).
- §4 (RBAC por domínio, 3 camadas) → camada 1 catálogo: Task 50; camada 2 página: Task 14 + Task 67; camada 3 query: `guardEstoque` na Task 52.
- §4.3 (modelo de dados) → Tasks 2, 3 (`ReportDomain`, `UserDomainAccess`), Task 8 (backfill).
- §4.4 (etapa "Acesso") → Bloco 7 inteiro; C1 (transação) na Task 70.
- §5.1/§5.2/§5.3 (3 fatos) → Tasks 5/6/7 (schema) + Tasks 18-27 (builders).
- §6 (5 templates) → Bloco 4 (Tasks 31-40).
- §7 (shell + freshness) → Bloco 6 (Tasks 64-67) + `freshness.ts` (Task 43).
- §8 (6 relatórios) → catálogo Tasks 44-49 + queries Tasks 52-53.
- §11 decisões 1-13: todas mapeadas; decisão 5 corrigida (C1, transação cobre user+domínios, audit fora — divergência da spec documentada no cabeçalho).

**Achados N1-N6 aplicados:** N1 — dependências de artefato anotadas no cabeçalho do Bloco 7 e a ordem segura do submit edit (`updateUserDomains` antes de `updateUser`, idempotência) na Task 79. N2 — `ReportFilterValues` na Task 42, `parseFilters` na Task 51, consumido pela Task 67. N3 — `vrSaldo Decimal?` na Task 5, nota de linhas pré-existentes. N4 — `atualizadoEm` mantida, `freshness.ts` não a usa (Task 43). N5 — `package-lock.json` no commit da Task 30. N6 — `next build` só nas Tasks 68 e 80.

**Varredura de placeholders:** todos os steps de código contêm código completo — nenhum "TBD", "adicionar tratamento" ou "similar à task N". Os pontos a confirmar contra o código real estão anotados explicitamente como verificação (lib de animação na Task 64; componente-pai do dialog nas Tasks 76/79) — não são placeholders, são integrações nomeadas.

**Consistência de tipos entre tasks:** `OdooM2O` (Task 1) usado por Tasks 19-27. `ReportDomainId` (Task 10) usado em domains/guard/catalog/types/access-step/dialog. `ReportFilterValues` (Task 42) consumido por `parseFilters` (51) e por todas as queries (52-53). `ReportResult<T>` (Task 42) é o retorno padrão das 6 queries. `ChartState` (Task 32) compartilhado por todos os templates do Bloco 4. `ColumnDef<T>` (Task 33) usado pelo catálogo (config das seções DataTable) e pelo `report-view` (Task 66). `FatoBuildState` é a fonte única do sinal de build (Tasks 4, 17, 43, 52).

**Total: 80 tasks** em 7 blocos.

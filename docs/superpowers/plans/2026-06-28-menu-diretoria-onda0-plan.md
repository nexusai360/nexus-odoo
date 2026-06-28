# Menu Diretoria , Onda 0 (Fundação) , Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development ou superpowers:executing-plans para implementar task a task. Steps usam checkbox (`- [ ]`).

**Goal:** Entregar a fundação do menu Diretoria: sidebar + RBAC por capability/UF + shell das 5 telas + barra de período própria + cores semânticas + spike do Mapa do Brasil + sync manual isolado.

**Architecture:** RBAC novo (`UserDiretoriaAccess`/`UserDiretoriaUf`) resolvido em `src/lib/diretoria/access.ts` (super_admin bypass; admin/manager/viewer por default+grants; UF-scoping). Nav resolvido no layout server e passado por prop à Sidebar (que deixa de filtrar no client). Telas reusam o padrão de `relatorios/[id]`. Sync manual via job one-shot `JOB_ONDEMAND` numa fila lazy sem side effects + branch dedicado no worker, sem tocar o scheduler do cron.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Prisma v7, Tailwind v4, base-ui, Recharts, BullMQ/Redis, jest.

## Global Constraints

- Idioma pt-BR em toda UI/copy/comentário. **Proibido o caractere travessão (em dash) em qualquer texto.**
- Modelo Opus em qualquer subagente. `ui-ux-pro-max` obrigatório em toda UI (inline na sessão principal, nunca delegada).
- TDD: teste antes do código onde testável. `tsc` limpo + `jest` verde por task. Commit atômico por task.
- super_admin SEMPRE bypassa o RBAC da Diretoria (vê tudo, sem query).
- Schema novo via `prisma db push` apenas dos models `Diretoria*`/`UserDiretoria*`; nunca alterar tabela existente por push; rodar `agente schema-changed` no primeiro push.
- Não importar `src/worker/index.ts` em código do app (side effects: instancia Workers + reagenda crons).
- Rebuild do container `app` após tocar `src/worker/**` (a imagem do worker vem do `app`).

## File Structure

- `prisma/schema.prisma` , models `UserDiretoriaAccess`, `UserDiretoriaUf` + back-relations em `User`.
- `src/lib/diretoria/capabilities.ts` , catálogo de capabilities + defaults por papel (puro).
- `src/lib/diretoria/access.ts` , resolução de acesso (async, lê banco): `userCapabilities`, `userUfs`, `canDiretoria`, `seesAllDiretoria`, `requireDiretoriaArea`, `diretoriaNavFor`.
- `src/lib/diretoria/periodo.ts` , `DiretoriaPeriodoPreset`, `resolverPeriodoDir`.
- `src/lib/diretoria/cores.ts` , helpers de delta/status/contagem regressiva (puro).
- `src/components/diretoria/diretoria-period-bar.tsx` , barra de período própria (client).
- `src/components/diretoria/sync-now-button.tsx` , botão de sync manual (client).
- `src/components/diretoria/brazil-map/` , componente do mapa (client) + paths SVG locais.
- `src/app/(protected)/diretoria/{page,layout}.tsx` + `{visao-geral,vendas,pedidos,estoque,agenda}/page.tsx` , rotas e shell.
- `src/lib/constants/nav.ts` , item Diretoria (factory) e ajuste para nav resolvido.
- `src/components/layout/sidebar.tsx` + `(protected)/layout.tsx` , nav por prop.
- `src/worker/jobs.ts` , constante `JOB_ONDEMAND`.
- `src/worker/sync/ondemand-queue.ts` , acessor de fila lazy (sem side effects).
- `src/worker/index.ts` , branch `JOB_ONDEMAND` no handler de `ODOO_SYNC_QUEUE`.
- `src/lib/actions/diretoria-sync.ts` , server action `forcarSyncDiretoria`.
- Testes em `*.test.ts(x)` ao lado de cada módulo (padrão do projeto).

---

## Task 1: Models de RBAC da Diretoria (schema + db push)

**Files:**
- Modify: `prisma/schema.prisma` (model `User` + 2 models novos)

**Interfaces:**
- Produces: tabelas `user_diretoria_access(userId, capability)` e `user_diretoria_uf(userId, uf)`; relações `User.diretoriaAccess`, `User.diretoriaUfs`.

- [ ] **Step 1: Adicionar os models ao schema** (junto aos outros models de app, perto de `UserDomainAccess`)

```prisma
model UserDiretoriaAccess {
  id          String   @id @default(cuid())
  userId      String
  capability  String
  grantedById String?
  createdAt   DateTime @default(now())
  user        User     @relation("UserDiretoriaAccess", fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, capability])
  @@index([userId])
  @@map("user_diretoria_access")
}

model UserDiretoriaUf {
  id     String @id @default(cuid())
  userId String
  uf     String
  user   User   @relation("UserDiretoriaUf", fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, uf])
  @@index([userId])
  @@map("user_diretoria_uf")
}
```

- [ ] **Step 2: Adicionar back-relations no model `User`** (junto às outras relações, ex. perto de `domainAccess UserDomainAccess[]`)

```prisma
  diretoriaAccess UserDiretoriaAccess[] @relation("UserDiretoriaAccess")
  diretoriaUfs    UserDiretoriaUf[]     @relation("UserDiretoriaUf")
```

- [ ] **Step 3: Validar e aplicar via db push** (apenas models novos)

Run: `npx prisma validate && npx prisma db push && npx prisma generate`
Expected: "The database is now in sync"; client regenerado sem erro.

- [ ] **Step 4: Sinalizar mudança de schema às outras worktrees**

Run: `agente schema-changed`
Expected: registra o sinal (outras worktrees verão no `agente status`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(diretoria): models UserDiretoriaAccess e UserDiretoriaUf (RBAC do menu)"
```

---

## Task 2: Catálogo de capabilities e defaults por papel (puro, TDD)

**Files:**
- Create: `src/lib/diretoria/capabilities.ts`
- Test: `src/lib/diretoria/capabilities.test.ts`

**Interfaces:**
- Produces:
  - `type DiretoriaArea = "visao_geral" | "vendas" | "pedidos" | "estoque" | "agenda"`
  - `const DIRETORIA_CAPABILITIES: readonly string[]`
  - `function defaultCapabilitiesFor(role: PlatformRole): string[]`
  - `function areaFromCapability(cap: string): DiretoriaArea | null`

- [ ] **Step 1: Escrever o teste falhando**

```ts
import { defaultCapabilitiesFor, DIRETORIA_CAPABILITIES, areaFromCapability } from "./capabilities";

describe("capabilities da Diretoria", () => {
  it("super_admin recebe todas as capabilities", () => {
    expect(defaultCapabilitiesFor("super_admin").sort()).toEqual([...DIRETORIA_CAPABILITIES].sort());
  });
  it("viewer só vê a visão geral por default", () => {
    expect(defaultCapabilitiesFor("viewer")).toEqual(["diretoria.visao_geral.view"]);
  });
  it("admin tem todas as .view e o sync.force", () => {
    const caps = defaultCapabilitiesFor("admin");
    expect(caps).toContain("diretoria.vendas.view");
    expect(caps).toContain("diretoria.sync.force");
  });
  it("manager vê áreas operacionais, sem sync.force", () => {
    const caps = defaultCapabilitiesFor("manager");
    expect(caps).toContain("diretoria.vendas.view");
    expect(caps).not.toContain("diretoria.sync.force");
  });
  it("mapeia capability para área", () => {
    expect(areaFromCapability("diretoria.vendas.view")).toBe("vendas");
    expect(areaFromCapability("diretoria.sync.force")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/diretoria/capabilities.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
import type { PlatformRole } from "@/generated/prisma/client";

export type DiretoriaArea = "visao_geral" | "vendas" | "pedidos" | "estoque" | "agenda";
export const DIRETORIA_AREAS: DiretoriaArea[] = ["visao_geral", "vendas", "pedidos", "estoque", "agenda"];

export const DIRETORIA_CAPABILITIES = [
  "diretoria.visao_geral.view",
  "diretoria.vendas.view", "diretoria.vendas.export",
  "diretoria.pedidos.view", "diretoria.pedidos.export",
  "diretoria.estoque.view", "diretoria.estoque.export",
  "diretoria.agenda.view", "diretoria.agenda.manage",
  "diretoria.sync.force",
] as const;

export function areaFromCapability(cap: string): DiretoriaArea | null {
  const m = cap.match(/^diretoria\.([a-z_]+)\.(view|export|manage)$/);
  const area = m?.[1] as DiretoriaArea | undefined;
  return area && (DIRETORIA_AREAS as string[]).includes(area) ? area : null;
}

export function defaultCapabilitiesFor(role: PlatformRole): string[] {
  switch (role) {
    case "super_admin":
      return [...DIRETORIA_CAPABILITIES];
    case "admin":
      return DIRETORIA_CAPABILITIES.filter((c) => c.endsWith(".view") || c.endsWith(".export") || c === "diretoria.sync.force");
    case "manager":
      return ["diretoria.visao_geral.view", "diretoria.vendas.view", "diretoria.pedidos.view", "diretoria.estoque.view", "diretoria.agenda.view"];
    case "viewer":
      return ["diretoria.visao_geral.view"];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/diretoria/capabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diretoria/capabilities.ts src/lib/diretoria/capabilities.test.ts
git commit -m "feat(diretoria): catalogo de capabilities e defaults por papel"
```

---

## Task 3: Resolução de acesso (async, lê banco) , TDD

**Files:**
- Create: `src/lib/diretoria/access.ts`
- Test: `src/lib/diretoria/access.test.ts`

**Interfaces:**
- Consumes: `capabilities.ts` (Task 2), `prisma`, `AuthUser` (`@/lib/auth-helpers`).
- Produces:
  - `seesAllDiretoria(role): boolean` (só super_admin)
  - `userCapabilities(user): Promise<Set<string>>`
  - `userUfs(user): Promise<string[]>` (vazio ⇒ todas)
  - `canDiretoria(user, capability): Promise<boolean>`
  - `requireDiretoriaArea(area): Promise<AuthUser>` (redirect se sem acesso)
  - `diretoriaNavFor(user): Promise<{ label: string; href: string }[]>`

- [ ] **Step 1: Teste falhando** (mockando prisma e next/navigation)

```ts
import { seesAllDiretoria } from "./access";

jest.mock("@/lib/prisma", () => ({ prisma: { userDiretoriaAccess: { findMany: jest.fn() }, userDiretoriaUf: { findMany: jest.fn() } } }));

describe("seesAllDiretoria", () => {
  it("só super_admin bypassa", () => {
    expect(seesAllDiretoria("super_admin")).toBe(true);
    expect(seesAllDiretoria("admin")).toBe(false);
    expect(seesAllDiretoria("manager")).toBe(false);
    expect(seesAllDiretoria("viewer")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `npx jest src/lib/diretoria/access.test.ts` , FAIL.

- [ ] **Step 3: Implementar** (confirmar o import real do prisma client do projeto: `@/lib/prisma` ou equivalente; ajustar se diferente)

```ts
import { redirect } from "next/navigation";
import type { PlatformRole } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { defaultCapabilitiesFor, areaFromCapability, type DiretoriaArea, DIRETORIA_AREAS } from "./capabilities";

export function seesAllDiretoria(role: PlatformRole): boolean {
  return role === "super_admin";
}

export async function userCapabilities(user: AuthUser): Promise<Set<string>> {
  const base = new Set(defaultCapabilitiesFor(user.platformRole));
  if (seesAllDiretoria(user.platformRole)) return base;
  const grants = await prisma.userDiretoriaAccess.findMany({ where: { userId: user.id }, select: { capability: true } });
  for (const g of grants) base.add(g.capability);
  return base;
}

export async function userUfs(user: AuthUser): Promise<string[]> {
  if (seesAllDiretoria(user.platformRole)) return [];
  const rows = await prisma.userDiretoriaUf.findMany({ where: { userId: user.id }, select: { uf: true } });
  return rows.map((r) => r.uf);
}

export async function canDiretoria(user: AuthUser, capability: string): Promise<boolean> {
  return (await userCapabilities(user)).has(capability);
}

const AREA_HREF: Record<DiretoriaArea, string> = {
  visao_geral: "/diretoria/visao-geral",
  vendas: "/diretoria/vendas",
  pedidos: "/diretoria/pedidos",
  estoque: "/diretoria/estoque",
  agenda: "/diretoria/agenda",
};
const AREA_LABEL: Record<DiretoriaArea, string> = {
  visao_geral: "Visão geral", vendas: "Vendas", pedidos: "Pedidos & Entregas", estoque: "Estoque & Compras", agenda: "Agenda",
};

export async function diretoriaNavFor(user: AuthUser): Promise<{ label: string; href: string }[]> {
  const caps = await userCapabilities(user);
  return DIRETORIA_AREAS
    .filter((a) => caps.has(`diretoria.${a}.view`))
    .map((a) => ({ label: AREA_LABEL[a], href: AREA_HREF[a] }));
}

export async function requireDiretoriaArea(area: DiretoriaArea): Promise<AuthUser> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await userCapabilities(user);
  if (caps.has(`diretoria.${area}.view`)) return user;
  const nav = await diretoriaNavFor(user);
  redirect(nav[0]?.href ?? "/dashboard");
}
```

- [ ] **Step 4: Ampliar o teste** para `userCapabilities` (super_admin sem query; viewer + grant) e `diretoriaNavFor` (filtra por capability). Rodar , PASS.

```ts
import { userCapabilities, diretoriaNavFor } from "./access";
import { prisma } from "@/lib/prisma";

const su = { id: "1", platformRole: "super_admin" } as any;
const vw = { id: "2", platformRole: "viewer" } as any;

it("super_admin não consulta o banco", async () => {
  const caps = await userCapabilities(su);
  expect(caps.has("diretoria.vendas.view")).toBe(true);
  expect((prisma.userDiretoriaAccess.findMany as jest.Mock)).not.toHaveBeenCalled();
});
it("viewer ganha vendas via grant explícito", async () => {
  (prisma.userDiretoriaAccess.findMany as jest.Mock).mockResolvedValueOnce([{ capability: "diretoria.vendas.view" }]);
  const nav = await diretoriaNavFor(vw);
  expect(nav.map((n) => n.href)).toEqual(["/diretoria/visao-geral", "/diretoria/vendas"]);
});
```

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit`
```bash
git add src/lib/diretoria/access.ts src/lib/diretoria/access.test.ts
git commit -m "feat(diretoria): resolucao de acesso (capabilities, UF-scoping, bypass super_admin)"
```

---

## Task 4: Item Diretoria no nav + resolução por prop (layout/sidebar)

**Files:**
- Modify: `src/lib/constants/nav.ts` (item Diretoria como `children` factory)
- Modify: `src/app/(protected)/layout.tsx` (resolver nav + diretoriaNavFor, passar prop)
- Modify: `src/components/layout/sidebar.tsx` (consumir prop `nav`, parar de importar NAV_ITEMS)
- Test: `src/lib/constants/nav.test.ts` (filterNav segue funcionando)

**Interfaces:**
- Consumes: `diretoriaNavFor` (Task 3), `filterNav`, `NAV_ITEMS`.
- Produces: `Sidebar` recebe `nav: NavItem[]` por prop; item "Diretoria" com `children` entre Dashboard e Relatórios.

- [ ] **Step 1:** Inserir o item Diretoria em `NAV_ITEMS` (entre Dashboard L37 e Relatórios L38), com `children` vazio inicial (preenchido no layout). Importar `Building2` de `lucide-react`.

```ts
{ label: "Dashboard", href: "/dashboard", icon: Home },
{ label: "Diretoria", href: "/diretoria", icon: Building2, children: [] },
{ label: "Relatórios", href: "/relatorios", icon: BarChart3 },
```

- [ ] **Step 2:** No `(protected)/layout.tsx`, após obter `user`, resolver o nav e injetar os children da Diretoria:

```tsx
import { filterNav, NAV_ITEMS } from "@/lib/constants/nav";
import { diretoriaNavFor } from "@/lib/diretoria/access";
// ...
const baseNav = filterNav(NAV_ITEMS, sidebarUser);
const dirChildren = await diretoriaNavFor(currentUser); // currentUser: AuthUser do getCurrentUser
const nav = baseNav
  .map((item) =>
    item.href === "/diretoria"
      ? { ...item, children: dirChildren.map((c) => ({ label: c.label, href: c.href, icon: item.icon })) }
      : item,
  )
  .filter((item) => item.href !== "/diretoria" || (item.children?.length ?? 0) > 0);
// passar nav ao Sidebar:
<Sidebar user={sidebarUser} nav={nav} />
```

- [ ] **Step 3:** Em `sidebar.tsx`: adicionar `nav: NavItem[]` às props; remover `import { NAV_ITEMS }`; trocar `filterNav(NAV_ITEMS, user)` (L93) por `props.nav` e o init de `openGroups` (L100) para iterar `props.nav`.

- [ ] **Step 4:** Teste de não-regressão do `filterNav` (continua escondendo superAdminOnly/visibleTo). Rodar `npx jest src/lib/constants/nav.test.ts` , PASS.

- [ ] **Step 5: Verificar UI + tsc + commit.** Subir `npm run dev:fresh`, logar como super_admin: item "Diretoria" aparece com 5 subitens; como viewer: aparece só "Visão geral". `npx tsc --noEmit`.

```bash
git add src/lib/constants/nav.ts src/app/(protected)/layout.tsx src/components/layout/sidebar.tsx src/lib/constants/nav.test.ts
git commit -m "feat(diretoria): item na sidebar com submenu resolvido por capability (nav via prop)"
```

---

## Task 5: Rotas e shell das 5 telas

**Files:**
- Create: `src/app/(protected)/diretoria/page.tsx` (redirect para 1ª área permitida)
- Create: `src/app/(protected)/diretoria/{visao-geral,vendas,pedidos,estoque,agenda}/page.tsx`

**Interfaces:**
- Consumes: `requireDiretoriaArea` (Task 3), `PageShell`, `PageHeader`, `DiretoriaPeriodBar` (Task 6), `FreshnessIndicator`.

- [ ] **Step 1:** `/diretoria/page.tsx` redireciona:

```tsx
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { diretoriaNavFor } from "@/lib/diretoria/access";
export const dynamic = "force-dynamic";
export default async function DiretoriaIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const nav = await diretoriaNavFor(user);
  redirect(nav[0]?.href ?? "/dashboard");
}
```

- [ ] **Step 2:** Cada subtela com guard + shell (exemplo Vendas; replicar trocando area/ícone/título). UI conforme `ui-ux-pro-max` (header padrão Consumo do Nex). Conteúdo é placeholder ("Em construção, Onda 1") até a onda da área.

```tsx
import { requireDiretoriaArea } from "@/lib/diretoria/access";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { TrendingUp } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function VendasPage() {
  await requireDiretoriaArea("vendas");
  return (
    <PageShell variant="full">
      <PageHeader icon={TrendingUp} title="Vendas" subtitle="Faturamento, estados, marcas e formas de pagamento." />
      {/* Onda 1: DiretoriaPeriodBar + seções C2..C10 + FreshnessIndicator */}
      <p className="text-sm text-muted-foreground">Em construção (Onda 1).</p>
    </PageShell>
  );
}
```

- [ ] **Step 3: Verificar gating.** Como viewer, acessar `/diretoria/vendas` redireciona para `/diretoria/visao-geral`. Como super_admin, todas abrem.

- [ ] **Step 4: tsc + commit**

```bash
git add src/app/(protected)/diretoria
git commit -m "feat(diretoria): rotas e shell das 5 telas com guards por area"
```

---

## Task 6: DiretoriaPeriodBar + resolverPeriodoDir (TDD no resolver)

**Files:**
- Create: `src/lib/diretoria/periodo.ts` + test
- Create: `src/components/diretoria/diretoria-period-bar.tsx`

**Interfaces:**
- Produces: `type DiretoriaPeriodoPreset` (hoje, semana, este_mes, ano_atual, ano_anterior, ultimos_7, ultimos_30, ultimos_90, tudo, custom); `resolverPeriodoDir(params, hoje): { de: Date; ate: Date; preset }`.

- [ ] **Step 1: Teste falhando** do `resolverPeriodoDir` com `hoje` injetável (evitar `Date.now`):

```ts
import { resolverPeriodoDir } from "./periodo";
const hoje = new Date("2026-06-28T12:00:00Z");
it("ultimos_7 cobre 7 dias ate hoje", () => {
  const r = resolverPeriodoDir({ periodo: "ultimos_7" }, hoje);
  expect(r.de.toISOString().slice(0,10)).toBe("2026-06-21");
  expect(r.ate.toISOString().slice(0,10)).toBe("2026-06-28");
});
it("ano_anterior cobre 2025 inteiro", () => {
  const r = resolverPeriodoDir({ periodo: "ano_anterior" }, hoje);
  expect(r.de.toISOString().slice(0,10)).toBe("2025-01-01");
  expect(r.ate.toISOString().slice(0,10)).toBe("2025-12-31");
});
```

- [ ] **Step 2: Rodar (FAIL) → implementar `periodo.ts`** com todos os presets (cada um calculado a partir do `hoje` recebido) → rodar (PASS). Implementação cobre os 10 presets; `custom` lê `de`/`ate` dos params.

- [ ] **Step 3:** Componente `DiretoriaPeriodBar` (client): pílulas dos presets (ativa em roxo sólido) + "Personalizado" (popover de data) escrevendo `periodo/de/ate` na URL preservando os demais searchParams. Padrão visual do `period-bar.tsx` existente, com os rótulos do HTML. `ui-ux-pro-max` para o visual.

- [ ] **Step 4: tsc + commit**

```bash
git add src/lib/diretoria/periodo.ts src/lib/diretoria/periodo.test.ts src/components/diretoria/diretoria-period-bar.tsx
git commit -m "feat(diretoria): barra de periodo propria com os presets do HTML"
```

---

## Task 7: Cores semânticas + helpers de delta/status (TDD nos helpers)

**Files:**
- Create: `src/lib/diretoria/cores.ts` + test
- Modify: tokens de tema (CSS vars / Tailwind v4) , confirmar arquivo de tema do projeto (`globals.css` ou equivalente)

**Interfaces:**
- Produces: `classeDelta(valor): "positivo"|"negativo"|"neutro"`, `formatarDelta(atual, anterior): { pct, classe, simbolo }`, `statusPrazo(dataPrevista, hoje): "no_prazo"|"atencao"|"atrasado"`, `diasRestantes(dataPrevista, hoje): number`.

- [ ] **Step 1: Teste falhando** dos helpers (com `hoje` injetável):

```ts
import { formatarDelta, statusPrazo, diasRestantes } from "./cores";
it("delta positivo", () => { expect(formatarDelta(120, 100).classe).toBe("positivo"); expect(formatarDelta(120,100).simbolo).toBe("▲"); });
it("delta negativo", () => { expect(formatarDelta(80, 100).classe).toBe("negativo"); });
it("status atrasado", () => { expect(statusPrazo(new Date("2026-06-20"), new Date("2026-06-28"))).toBe("atrasado"); });
it("dias restantes", () => { expect(diasRestantes(new Date("2026-07-01"), new Date("2026-06-28"))).toBe(3); });
```

- [ ] **Step 2: Rodar (FAIL) → implementar `cores.ts` → rodar (PASS).**

- [ ] **Step 3:** Definir tokens CSS de cores semânticas (verde/vermelho/azul/amarelo) no tema dark, via `ui-ux-pro-max`, sem alterar o accent roxo existente. Validar contraste.

- [ ] **Step 4: tsc + commit**

```bash
git add src/lib/diretoria/cores.ts src/lib/diretoria/cores.test.ts src/app/globals.css
git commit -m "feat(diretoria): cores semanticas e helpers de delta/status/contagem"
```

---

## Task 8: Spike do Mapa do Brasil (componente reusável)

**Files:**
- Create: `src/components/diretoria/brazil-map/brazil-map.tsx` (client)
- Create: `src/components/diretoria/brazil-map/uf-paths.ts` (paths SVG dos 27 estados, geojson local de domínio público)
- Test: `src/components/diretoria/brazil-map/brazil-map.test.tsx`

**Interfaces:**
- Produces: `<BrazilMap data={Array<{uf:string; valor:number; label?:string}>} metric={string} onSelect={(ufs:string[])=>void} />`. API cega à origem.

- [ ] **Step 1: Teste de render/binding/estados** (vazio, com dados, seleção, a11y):

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { BrazilMap } from "./brazil-map";
it("renderiza 27 UFs", () => { render(<BrazilMap data={[]} metric="vendas" onSelect={() => {}} />); expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(27); });
it("hover/clique seleciona UF e chama onSelect", () => { const fn = jest.fn(); render(<BrazilMap data={[{uf:"SP",valor:10}]} metric="vendas" onSelect={fn} />); fireEvent.click(screen.getByLabelText("São Paulo")); expect(fn).toHaveBeenCalledWith(["SP"]); });
it("estado vazio mostra aviso sem quebrar", () => { render(<BrazilMap data={[]} metric="vendas" onSelect={() => {}} />); expect(screen.getByText(/sem dados/i)).toBeInTheDocument(); });
```

- [ ] **Step 2: Rodar (FAIL) → implementar** o mapa: SVG com 27 paths locais, choropleth valor→cor (paleta semântica da Task 7), tooltip no hover, clique seleciona (suporta seleção de 2 UFs para C8/C9), ranking lateral, aria-label por UF (nome completo), navegação por teclado. Animação de entrada (stagger) + transição ao trocar métrica; técnica decidida no spike por perf (alvo 60fps com 27 paths). `ui-ux-pro-max` no visual.

- [ ] **Step 3: Rodar (PASS) + validar perf/animação** num harness (página de teste temporária ou story) com dados mock; conferir 60fps e degradação responsiva (lista/ranking em telas estreitas).

- [ ] **Step 4: tsc + commit**

```bash
git add src/components/diretoria/brazil-map
git commit -m "feat(diretoria): componente Mapa do Brasil animado (spike, reusavel)"
```

---

## Task 9: Constante JOB_ONDEMAND + acessor de fila lazy (sem side effects)

**Files:**
- Modify: `src/worker/jobs.ts` (constante `JOB_ONDEMAND`)
- Create: `src/worker/sync/ondemand-queue.ts` (acessor lazy)
- Test: `src/worker/sync/ondemand-queue.test.ts`

**Interfaces:**
- Consumes: padrão de `mcp/sync/queue.ts` (`getDirectedSyncQueue`).
- Produces: `JOB_ONDEMAND` (string); `getOndemandSyncQueue(): Queue` (lazy singleton, conexão Redis própria, zero Worker); `type OndemandSyncJob = { models: string[] }`.

- [ ] **Step 1:** Adicionar a constante em `jobs.ts` (módulo puro): `export const JOB_ONDEMAND = "ondemand";`

- [ ] **Step 2: Teste** garantindo que o acessor NÃO importa `worker/index.ts` e cria a `Queue` no nome `odoo-sync`:

```ts
import { JOB_ONDEMAND } from "@/worker/jobs";
it("constante existe", () => { expect(JOB_ONDEMAND).toBe("ondemand"); });
// teste estrutural: ondemand-queue.ts não importa worker/index (lint/grep no CI); singleton retorna a mesma instância
```

- [ ] **Step 3: Implementar** `ondemand-queue.ts` espelhando `getDirectedSyncQueue` (Queue lazy na fila `odoo-sync`, conexão Redis de env, sem `new Worker`).

- [ ] **Step 4: Rodar (PASS) + tsc + commit**

```bash
git add src/worker/jobs.ts src/worker/sync/ondemand-queue.ts src/worker/sync/ondemand-queue.test.ts
git commit -m "feat(diretoria): fila lazy de sync sob demanda (sem side effects)"
```

---

## Task 10: Branch JOB_ONDEMAND no worker (escopo + lock incremental)

**Files:**
- Modify: `src/worker/index.ts` (handler de `ODOO_SYNC_QUEUE`)
- Test: `src/worker/sync/ondemand-cycle.test.ts` (escopo do catálogo)

**Interfaces:**
- Consumes: `JOB_ONDEMAND`, `processIncrementalCycle`, `MODEL_CATALOG`, `adquirirLock(JOB_INCREMENTAL)`.

- [ ] **Step 1: Teste** do escopo: dado `models=["sale.order"]`, o catálogo passado a `processIncrementalCycle` contém só entradas cujo `odooModel ∈ models`.

```ts
import { MODEL_CATALOG } from "@/worker/catalog/model-catalog";
function escopar(models: string[]) { return MODEL_CATALOG.filter((e) => models.includes(e.odooModel)); }
it("escopa o catalogo aos models do payload", () => { const c = escopar(["sale.order"]); expect(c.every((e) => e.odooModel === "sale.order")).toBe(true); });
```

- [ ] **Step 2: Rodar (FAIL/criar) → implementar** o branch no handler: se `job.name === JOB_ONDEMAND`, adquirir `lockKey(JOB_INCREMENTAL)` (se ocupado → `{ skipped: true }`), ler `job.data.models`, montar `MODEL_CATALOG.filter(...)`, chamar `processIncrementalCycle(ctx, catalogoEscopado)`, liberar lock no finally. Extrair a função `escopar` para um módulo testável (`ondemand-cycle.ts`) e usá-la no handler.

- [ ] **Step 3: Rodar (PASS) + rebuild worker.** `docker compose build app && docker compose up -d --force-recreate worker`. Confirmar imagem nova (`docker image inspect nexus-odoo:local --format '{{.Created}}'`).

- [ ] **Step 4: commit**

```bash
git add src/worker/index.ts src/worker/sync/ondemand-cycle.ts src/worker/sync/ondemand-cycle.test.ts
git commit -m "feat(diretoria): branch de sync sob demanda no worker (escopo + lock incremental)"
```

---

## Task 11: Server action forcarSyncDiretoria + botão (não-regressão do scheduler)

**Files:**
- Create: `src/lib/actions/diretoria-sync.ts` + test
- Create: `src/components/diretoria/sync-now-button.tsx`

**Interfaces:**
- Consumes: `getOndemandSyncQueue`, `JOB_ONDEMAND`, `canDiretoria`, `getCurrentUser`.
- Produces: `forcarSyncDiretoria(area): Promise<{ ok: boolean; jaEmAndamento?: boolean }>`.

- [ ] **Step 1: Teste** garantindo que a action (a) checa `diretoria.sync.force`, (b) enfileira com `jobId` determinístico, (c) NÃO importa `worker/index.ts` nem chama `upsertJobScheduler`.

```ts
jest.mock("@/worker/sync/ondemand-queue", () => ({ getOndemandSyncQueue: () => ({ add: jest.fn().mockResolvedValue({ id: "ondemand:vendas" }) }) }));
// mock getCurrentUser → super_admin; canDiretoria true
import { forcarSyncDiretoria } from "@/lib/actions/diretoria-sync";
it("enfileira quando autorizado", async () => { const r = await forcarSyncDiretoria("vendas"); expect(r.ok).toBe(true); });
```

- [ ] **Step 2: Rodar (FAIL) → implementar** a action: resolve `models` da área (mapa area→models), `canDiretoria(user, "diretoria.sync.force")` (senão erro), `getOndemandSyncQueue().add(JOB_ONDEMAND, { models }, { jobId: "ondemand:"+area, removeOnComplete: true, removeOnFail: true })`. Ler o lock incremental do Redis para `jaEmAndamento` (best-effort). Nunca importar `worker/index.ts`.

- [ ] **Step 3:** Teste estrutural de não-regressão: grep garante que `diretoria-sync.ts` não importa `@/worker/index` nem `upsertJobScheduler`.

- [ ] **Step 4:** Botão `SyncNowButton` (client, gated por capability via prop): chama a action, mostra "Atualizando...", cooldown 30s, toast de resultado. Colocar no header das telas (renderizado quando o user tem `diretoria.sync.force`). `ui-ux-pro-max`.

- [ ] **Step 5: Rodar (PASS) + tsc + commit**

```bash
git add src/lib/actions/diretoria-sync.ts src/lib/actions/diretoria-sync.test.ts src/components/diretoria/sync-now-button.tsx
git commit -m "feat(diretoria): acao e botao de sync manual isolado (one-shot, sem tocar scheduler)"
```

---

## Task 12: Confirmar fatos vazios e registrar plano de ativação

**Files:**
- Create: `docs/superpowers/research/2026-06-28-diretoria-fatos-status.md`

- [ ] **Step 1:** Rodar `SELECT count(*)` nos fatos de vendas/comercial/financeiro/estoque (via prisma db execute ou psql, lendo DATABASE_URL do `.env.local`). Confirmar populados vs vazios (esperado: fato_comissao=0, fato_cotacao=1).

- [ ] **Step 2:** Registrar no doc: quais fatos estão prontos para as Ondas 1-3, quais builders ativar, e quais viram gap (comissão se o Odoo não expõe). Atualizar o PROGRESSO.

- [ ] **Step 3: commit**

```bash
git add docs/superpowers/research/2026-06-28-diretoria-fatos-status.md docs/superpowers/plans/2026-06-28-menu-diretoria-PROGRESSO.md
git commit -m "docs(diretoria): status dos fatos no cache (base para ondas 1-3)"
```

---

## Verificação final da Onda 0

- [ ] `npx tsc --noEmit` limpo; `npx jest src/lib/diretoria src/worker/sync src/lib/actions/diretoria-sync.test.ts` verde.
- [ ] Menu Diretoria aparece com submenu correto por papel (super_admin 5 itens, viewer 1).
- [ ] Guards redirecionam corretamente; super_admin acessa todas as telas.
- [ ] Sync manual: clique dispara job; scheduler do cron permanece agendado (conferir `upsertJobScheduler` intacto); rebuild do worker feito.
- [ ] Mapa do Brasil renderiza com mock, anima e degrada em tela estreita.
- [ ] STATUS.md e PROGRESSO atualizados. Abrir PR da Onda 0 (merge sob confirmação do usuário).

## Self-review (cobertura da spec §13 Onda 0)

- Cadeia models→access→guards→nav→rotas: Tasks 1-5. ✓
- Tracks: periodbar (6), cores (7), mapa spike (8), sync isolado (9-11), fatos vazios (12). ✓
- super_admin bypass testado (Task 3). UF-scoping entregue em `userUfs` (Task 3). ✓
- Sync sem side effects + branch + não-regressão (Tasks 9-11). ✓
- Sem placeholders de implementação; código real nos pontos de lógica; UI guiada por padrão existente + ui-ux-pro-max.

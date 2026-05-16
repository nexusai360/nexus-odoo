# Bloco 5 — Telas protegidas (PLANO RECONSTRUÍDO)

**Data:** 2026-05-16 · **Branch:** `feat/fundacao`
**Meta:** Shell autenticado com sidebar + rotas `/dashboard` (placeholder), `/usuarios` (CRUD) e `/perfil` (4 cards), atrás do middleware já existente.

> Este plano substitui a versão anterior, que tinha erros factuais (T7/T15/T21/T16),
> placeholders e épicos não decompostos. Reconstruído após leitura dos arquivos-fonte
> reais. Ver seção "Reviews" ao final.

---

## Base factual verificada (não rediscutir)

- **Raiz do projeto = raiz do Next.js.** Caminhos partem de `src/`. NÃO existe `app/` subdir.
- `src/lib/auth.ts` — `getCurrentUser(): Promise<AuthUser|null>` — **JÁ CRIADO** (T01).
- `AuthUser` (`src/lib/auth-helpers.ts`): `{id, email, name, platformRole, isOwner, mustChangePassword, avatarUrl, theme}`.
- Schema `User`: campos relevantes — `id, email, password, name, platformRole, isOwner, isActive, mustChangePassword, passwordChangedAt, avatarUrl, theme, createdAt`. **NÃO há** accountIds/teamIds/accountAccess.
- `AuditAction` enum (valores reais): `login_succeeded, login_failed, password_reset_requested, password_reset_completed, user_created, user_updated, user_deleted, user_role_changed, user_activated, user_deactivated, profile_updated, profile_password_changed, email_change_requested, email_change_completed, setting_updated, session_revoked`.
- `src/lib/permissions.ts`: `canCreateRole(creator, role)`, `canEditUser(actor, target)`, `canDeleteUser(actor, target)`, `canDeactivateUser(actor, target)`, `canChangeRole(actor, target, newRole)`. `MinimalTargetUser = {id, platformRole, isOwner}`. `PermissionResult = {allowed, reason?}`.
- `src/lib/constants/roles.ts`: `PLATFORM_ROLE_LABELS`, `PLATFORM_ROLE_HIERARCHY`, `PLATFORM_ROLE_DESCRIPTIONS`, `PLATFORM_ROLE_STYLES`, `PLATFORM_ROLE_ICONS`, `PLATFORM_ROLE_OPTIONS`.
- `src/lib/audit.ts`: `logAudit({userId?, action, targetType?, targetId?, ipAddress?, userAgent?, details?})` — fire-and-forget.
- `src/components/providers/theme-provider.tsx`: `useTheme() → {theme, resolvedTheme, setTheme}`.
- Componentes UI disponíveis: `button, input, label, password-input, sonner` (Bloco 4) + `table, skeleton, card, dialog, alert-dialog, select, badge, separator` (T04–T05).
- `src/app/page.tsx` — **verificado**: redireciona autenticado→`/dashboard`, senão→`/login`. ✅
- `prisma` (`@/lib/prisma`) roda em Node runtime; pages do route group `(protected)` declaram `export const dynamic = "force-dynamic"` e usam Node. Prisma direto em page Server Component é OK (Node runtime). ✅
- `bcrypt` rounds do projeto = **10** (alinhado ao `prisma/seed.ts`). Usar 10 em `users.ts` e `profile.ts`.
- Logo: `public/logo.png` existe.

## Decisões de escopo (documentadas)

1. **Avatar mantido.** `personal-info-card` gera data-URL (resize canvas → webp 128px) salvo direto na coluna `User.avatarUrl`. Sem storage externo. Porte direto.
2. **Aba de auditoria adiada.** `/usuarios` renderiza `UsersContent` diretamente — SEM `UsersTabs` nem `AuditsTable`. A visualização de audit logs fica para bloco/fase posterior.
3. **`users.ts`, `users-content.tsx`, `user-form-dialog.tsx` escritos do zero**, enxutos para o modelo nexus-odoo (sem chatwoot/accounts/teams). nexus-insights serve só de referência visual.
4. **Profile cards (`personal-info`, `email-change`, `password-change`, `appearance`, `profile-content`) são porte verbatim** de nexus-insights — os imports (`@/components/ui/*`, `@/lib/actions/profile`, `@/components/providers/theme-provider`) resolvem idênticos, pois as actions `updateProfile`/`requestEmailChange`/`changePassword` serão criadas com o mesmo contrato.
5. **`/usuarios` bloqueia `viewer` E `manager`** → `redirect("/dashboard")`. Justificativa: `permissions.ts` retorna `managerNoAccess` para manager em toda ação de gestão de usuário — manager não tem nada a fazer na tela.
6. **Senha temporária no create de usuário:** gerada server-side e exibida uma vez no dialog (não há e-mail ainda). `mustChangePassword=true` no usuário criado.
7. **Checkbox:** usar `<input type="checkbox">` nativo estilizado com Tailwind — evita dependência shadcn extra.
8. **`requestEmailChange`** fica como stub honesto (e-mail infra é F2/F3): retorna `{error: "Troca de e-mail por confirmação será habilitada em versão futura."}`.
9. **Sem testes unitários no Bloco 5.** Justificativa (calibração do CLAUDE.md §6): o bloco é UI + server actions finas (validação + Prisma + permissões já testáveis isoladamente em `permissions.ts`). A fundação clona um padrão já validado (`nexus-insights`). Verificação = `tsc` + `next build` + UAT funcional (T30). Testes automatizados entram quando houver lógica de negócio não-trivial: F2 (ingestão/transformações) e F4 (tools MCP — o CLAUDE.md exige tools testadas). Decisão consciente, não omissão.
10. **base-ui, não Radix.** `components.json` usa `style: "base-nova"` → todos os componentes shadcn instalados usam `@base-ui/react`. Consequências verificadas: `Dialog`/`AlertDialog` usam `open`/`onOpenChange` (igual Radix); `Select` usa `value`/`onValueChange`; base-ui usa prop `render={<Comp/>}` em vez de `asChild`. **`AlertDialogAction` é um `<Button>` puro — NÃO fecha o dialog ao clicar** (diferente do Radix). Componentes do bloco usam Dialog/AlertDialog em modo controlado (`open` por estado), então o fechamento é manual.

---

## CAMADA 0 — Helpers — ✅ CONCLUÍDA

- **T01 ✅** `src/lib/auth.ts` — `getCurrentUser()`. Criado e validado por `tsc`.
- **T02 ✅** `src/lib/constants/nav.ts` — `NavItem`, `SECTION_LABELS`, `NAV_ITEMS` (Dashboard, Usuários[visibleTo super_admin/admin], Perfil), `filterNav`. Criado.
- **T03 ✅** `src/lib/utils/sidebar-active-path.ts` — `collectLeafHrefs`, `isLeafActive`, `isGroupActive`. Criado.

## CAMADA 1 — UI primitives — ✅ CONCLUÍDA

- **T04 ✅** shadcn add: `table`, `skeleton`, `card`.
- **T05 ✅** shadcn add: `dialog`, `alert-dialog`, `select`, `badge`, `separator`.

> Verificação pendente para T04–T05: confirmar que os componentes shadcn instalados
> compilam (alguns usam Radix, o `button` do projeto usa base-ui — coexistem, mas
> validar no `tsc` da T28).

---

## CAMADA 2 — Componentes de layout

### T06 — `src/components/layout/page-shell.tsx`
Criar (novo diretório `src/components/layout/`). Código final:
```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "wide" | "narrow";

interface Props {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export function PageShell({ variant = "wide", children, className }: Props) {
  const max = variant === "wide" ? "max-w-[1600px]" : "max-w-7xl";
  return (
    <div className={cn(max, "mx-auto px-4 sm:px-6 lg:px-8 xl:px-10", className)}>
      {children}
    </div>
  );
}
```
**Verificação:** arquivo existe.

### T07 — `src/components/page-header-height-probe.tsx`
Criar. Código final (conteúdo REAL de nexus-insights — `useLayoutEffect`, `getBoundingClientRect`, `Math.ceil`):
```tsx
"use client";

import { useLayoutEffect, useRef } from "react";

interface PageHeaderHeightProbeProps {
  children: React.ReactNode;
  className?: string;
}

export function PageHeaderHeightProbe({
  children,
  className,
}: PageHeaderHeightProbeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (h: number) => {
      document.documentElement.style.setProperty(
        "--page-header-h",
        `${Math.ceil(h)}px`,
      );
    };
    set(el.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) set(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
```
**Verificação:** arquivo existe.

### T08 — `src/components/page-header.tsx`
Criar. Código final:
```tsx
import type { LucideIcon } from "lucide-react";
import { PageHeaderHeightProbe } from "./page-header-height-probe";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <PageHeaderHeightProbe className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10">
          <Icon className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div>{actions}</div> : null}
    </PageHeaderHeightProbe>
  );
}
```
**Verificação:** arquivo existe; `tsc` na T28.

### T09 — `src/components/layout/sidebar.tsx`
Criar — adaptação de `nexus-insights/src/components/layout/sidebar.tsx`. **Componente client** (`"use client"`).

**Contrato:**
- `interface SidebarUser { name: string; email: string; platformRole: PlatformRole; avatarUrl: string | null; }`
- `interface SidebarProps { user: SidebarUser; }`
- Export nomeado `Sidebar`.

**Imports:** `useMemo, useState` (react); `Link` (next/link); `usePathname` (next/navigation); `useTheme` (`@/components/providers/theme-provider`); `motion, AnimatePresence` (framer-motion); `LogOut, Menu, X, Sun, Moon, Monitor` (lucide-react — **sem** `ChevronDown`, pois não há nav com children); `Image` (next/image); `Button` (`@/components/ui/button`); `signOut` (`next-auth/react`); `filterNav, NAV_ITEMS, SECTION_LABELS, type NavItem` (`@/lib/constants/nav`); `PlatformRole` (`@/generated/prisma/client`); `PLATFORM_ROLE_LABELS` (`@/lib/constants/roles`); `collectLeafHrefs, isLeafActive` (`@/lib/utils/sidebar-active-path` — **sem** `isGroupActive`, sem grupos); `cn` (`@/lib/utils`).

**Adaptações vs nexus-insights (cada uma enumerada):**
1. REMOVER imports e uso de `AccountSwitcher` e `GlobalSearchTrigger`.
2. REMOVER props `appSettings`, `accounts`, `activeAccountId`, `enabledReportKeys`.
3. `SidebarUser` perde `id`, `role`, `isOwner`; mantém `name, email, platformRole, avatarUrl`.
4. `filterNav(NAV_ITEMS, user)` — assinatura nova (2 args), pois o `nav.ts` da T02 já tem `filterNav(items, user)`.
5. REMOVER `renderItem` recursivo de children e o ramo `hasChildren` — `NAV_ITEMS` do nexus-odoo não tem children. `renderItem` vira apenas o ramo `<Link>` folha. `openGroups`/`toggleGroup`/`isGroupActive` removidos.
6. `isActive(item)` = `isLeafActive(item.href, pathname, allLeafHrefs)`.
7. Cabeçalho: `<Image src="/logo.png" alt="Nexus Odoo" width={40} height={40} className="rounded-[22%]" />` + título `Nexus Odoo` + subtítulo `Dados do ERP`.
8. Footer do usuário: link `/perfil` com avatar (se `user.avatarUrl` → `<img>`, senão inicial `user.name.charAt(0).toUpperCase()`); nome `user.name`; segunda linha = `PLATFORM_ROLE_LABELS[user.platformRole]` (substitui o antigo `user.role`).
9. Bloco do tema (`cycleTheme` com `THEME_CYCLE`/`THEME_ICONS`/`THEME_LABELS`) — manter igual.
10. Botão "Sair" → `signOut({ callbackUrl: "/login" })` — manter.
11. Manter estrutura responsiva: `<aside className="hidden w-60 ... lg:block">` + botão mobile + overlay `AnimatePresence`.
12. Manter o `<footer>` "Nexus AI © 2026".
13. Seção: como só "Usuários" tem `section: "admin"`, o header de seção (`SECTION_LABELS[item.section]`) aparece antes de Usuários. Manter a lógica `lastSection`.

**Verificação:** `tsc` na T28; render visual na T30.

---

## CAMADA 3 — Shell protegido + Dashboard

### T10 — `src/app/(protected)/layout.tsx`
Criar (novo route group `(protected)`). Server Component. Código final:
```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sidebarUser = {
    name: user.name,
    email: user.email,
    platformRole: user.platformRole,
    avatarUrl: user.avatarUrl,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={sidebarUser} />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="pt-16 pb-8 sm:pt-8">{children}</div>
      </main>
    </div>
  );
}
```
**Verificação:** `tsc` na T28.

### T11 — `src/app/(protected)/dashboard/page.tsx`
Criar. Código final:
```tsx
import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Dashboard | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Visão geral da operação"
      />
      <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Os relatórios serão adicionados na Fase 3. A fundação (auth, RBAC,
          shell) está pronta.
        </p>
      </div>
    </PageShell>
  );
}
```
**Verificação:** `tsc` na T28; render na T30.

---

## CAMADA 4 — Tela de Usuários

> `users.ts` é criado em 3 tasks incrementais (T12→T13→T14); cada uma deixa o
> arquivo compilável. Todas as actions começam com `"use server"` no topo (uma vez, T12).

### T12 — `src/lib/actions/users.ts` — base + `listUsers`
Criar arquivo. Conteúdo desta task:
- `"use server";`
- Imports: `revalidatePath` (next/cache); `prisma` (`@/lib/prisma`); `getCurrentUser` (`@/lib/auth`); `logAudit` (`@/lib/audit`); `bcrypt` (`bcryptjs`); `z` (`zod`); `canEditUser, canDeleteUser, canDeactivateUser, canCreateRole, canChangeRole` (`@/lib/permissions`); `type PlatformRole` (`@/generated/prisma/client`).
- `export type ActionResult<T = void> = { success: true; data?: T } | { success: false; error: string };`
- `export interface UserListItem { id: string; name: string; email: string; platformRole: PlatformRole; isOwner: boolean; isActive: boolean; createdAt: Date; }`
- `export async function listUsers(): Promise<ActionResult<UserListItem[]>>`:
  - `me = await getCurrentUser()`; se `!me` → `{success:false, error:"Não autenticado"}`.
  - Se `me.platformRole === "viewer" || me.platformRole === "manager"` → `{success:false, error:"Acesso negado"}`.
  - `rows = await prisma.user.findMany({ select: {id,name,email,platformRole,isOwner,isActive,createdAt}, orderBy: {createdAt: "desc"} })`.
  - retorna `{success:true, data: rows}`.
  - `try/catch` → em erro, `console.error("[users.list]", err)` e `{success:false, error:"Erro ao listar usuários"}`.
**Verificação:** `tsc` parcial — o arquivo compila isolado.

### T13 — `src/lib/actions/users.ts` — `createUser` + `generateTempPassword`
Editar o arquivo (adicionar ao final). Conteúdo:
- `function generateTempPassword(): string` — 12 chars de `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789` via `crypto.randomInt` (import `randomInt` de `node:crypto`).
- `const CreateUserInput = z.object({ name: z.string().min(2).max(120), email: z.string().email(), platformRole: z.enum(["super_admin","admin","manager","viewer"]) });`
- `export async function createUser(rawInput: unknown): Promise<ActionResult<{ id: string; tempPassword: string }>>`:
  - `me = getCurrentUser()`; `!me` → não autenticado.
  - `parsed = CreateUserInput.safeParse(rawInput)`; `!parsed.success` → `{success:false, error:"Dados inválidos"}`.
  - `canCreateRole(me, parsed.data.platformRole)` falso → `{success:false, error:"Sem permissão para criar usuário com este papel"}`.
  - checar e-mail duplicado: `prisma.user.findUnique({where:{email}})` existente → `{success:false, error:"E-mail já cadastrado"}`.
  - `tempPassword = generateTempPassword()`; `hash = await bcrypt.hash(tempPassword, 10)`.
  - `created = await prisma.user.create({ data: { name, email, password: hash, platformRole, mustChangePassword: true, isActive: true } })`.
  - `logAudit({userId: me.id, action: "user_created", targetType: "User", targetId: created.id, details: {email, platformRole}})`.
  - `revalidatePath("/usuarios")`.
  - retorna `{success:true, data:{id: created.id, tempPassword}}`.
  - `try/catch` → `{success:false, error:"Erro ao criar usuário"}`.
**Verificação:** `tsc` parcial.

### T14 — `src/lib/actions/users.ts` — `updateUser` + `setUserActive` + `deleteUser`
Editar o arquivo (adicionar ao final). Conteúdo:
- `const UpdateUserInput = z.object({ id: z.string().uuid(), name: z.string().min(2).max(120).optional(), platformRole: z.enum([...]).optional() });`
- `export async function updateUser(rawInput): Promise<ActionResult>`:
  - `me`; parse; carregar `target = prisma.user.findUnique({where:{id}, select:{id,platformRole,isOwner}})`; `!target` → não encontrado.
  - `canEditUser(me, target)` — se `!allowed` → `{success:false, error: allowed.reason}`.
  - se `platformRole` no input e difere de `target.platformRole`: `canChangeRole(me, target, novoRole)` — `!allowed` → erro.
  - `prisma.user.update({where:{id}, data:{...(name?{name}:{}), ...(platformRole?{platformRole}:{})}})`.
  - `logAudit` action `user_updated` (e `user_role_changed` se mudou papel — registrar o que for aplicável; manter simples: um `user_updated` com `details:{changes}`).
  - `revalidatePath("/usuarios")`; `{success:true}`.
- `export async function setUserActive(id: string, active: boolean): Promise<ActionResult>`:
  - `me`; `target = findUnique({select:{id,platformRole,isOwner}})`; `!target`→erro.
  - `canDeactivateUser(me, target)` — `!allowed`→erro.
  - `prisma.user.update({where:{id}, data:{isActive: active}})`.
  - `logAudit` action `active ? "user_activated" : "user_deactivated"`.
  - `revalidatePath("/usuarios")`; `{success:true}`.
- `export async function deleteUser(id: string): Promise<ActionResult>`:
  - `me`; `target = findUnique({select:{id,platformRole,isOwner}})`; `!target`→erro.
  - `canDeleteUser(me, target)` — `!allowed`→erro.
  - `prisma.user.delete({where:{id}})`.
  - `logAudit` action `user_deleted`.
  - `revalidatePath("/usuarios")`; `{success:true}`.
- Cada função com `try/catch`.
**Verificação:** `tsc` parcial — arquivo `users.ts` completo compila.

### T15 — `src/components/users/user-form-dialog.tsx`
Criar (novo diretório `src/components/users/`). Componente client novo, enxuto.

**Contrato de props:**
```
interface UserFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserListItem;          // obrigatório em mode="edit"
  currentUser: AuthUser;        // para filtrar papéis via canCreateRole
  onSuccess: () => void;
}
```
**Imports:** `useState, useEffect, useTransition` (react); `toast` (sonner); `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` (`@/components/ui/dialog`); `Button`, `Input`, `Label` (`@/components/ui/*`); `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` (`@/components/ui/select`); `createUser, updateUser, type UserListItem` (`@/lib/actions/users`); `PLATFORM_ROLE_OPTIONS, PLATFORM_ROLE_LABELS` (`@/lib/constants/roles`); `canCreateRole` (`@/lib/permissions`); `type AuthUser` (`@/lib/auth-helpers`); `Loader2` (lucide-react).

> **base-ui:** `<Select value={platformRole} onValueChange={setPlatformRole}>`. `<Dialog open={open} onOpenChange={onOpenChange}>`. `tsc` (T28) valida as props — `SelectPrimitive.Root.Props` é tipado.

**Comportamento:**
- Estado local: `name`, `email`, `platformRole` (default `"viewer"`). Em `mode="edit"`, inicializar de `user` via `useEffect` quando `open` vira true.
- Papéis disponíveis no Select: `PLATFORM_ROLE_OPTIONS.filter(o => canCreateRole(currentUser, o.value))`.
- `mode="create"`: campos Nome, E-mail, Papel. Ao submeter → `createUser({name,email,platformRole})`. Se `success`, exibir tela de senha temporária: bloco com `data.tempPassword` em fonte mono, botão "Copiar", aviso "Anote — não será exibida novamente." + botão "Concluir" que chama `onSuccess()` + `onOpenChange(false)`.
- `mode="edit"`: campos Nome, Papel (e-mail somente leitura, exibido `disabled`). Ao submeter → `updateUser({id:user.id, name, platformRole})`. Se `success` → `toast.success`, `onSuccess()`, `onOpenChange(false)`.
- Validação client antes de chamar action: `name.trim().length >= 2`; em create, e-mail com regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Erros via `toast.error`.
- `useTransition` para `isPending`; botão submit com `Loader2` girando quando pending.
- Título do Dialog: create → "Novo usuário"; edit → "Editar usuário".

**Verificação:** `tsc` na T28.

### T16 — `src/components/users/users-content.tsx`
Criar. Componente client novo, enxuto.

**Contrato:** `interface UsersContentProps { currentUser: AuthUser; }` — export `UsersContent`.

**Imports:** `useEffect, useState, useTransition` (react); `toast` (sonner); `Plus, Pencil, Trash2, UserCheck, UserX, Loader2, Users as UsersIcon` (lucide-react); `format` (date-fns), `ptBR` (date-fns/locale); `Button` (`@/components/ui/button`); `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` (`@/components/ui/table`); `Badge` (`@/components/ui/badge`); `Skeleton` (`@/components/ui/skeleton`); `AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction` (`@/components/ui/alert-dialog`); `listUsers, deleteUser, setUserActive, type UserListItem` (`@/lib/actions/users`); `canEditUser, canDeleteUser, canDeactivateUser` (`@/lib/permissions`); `PLATFORM_ROLE_LABELS, PLATFORM_ROLE_STYLES` (`@/lib/constants/roles`); `type AuthUser` (`@/lib/auth-helpers`); `UserFormDialog` (`./user-form-dialog`).

**Comportamento:**
- Estado: `users: UserListItem[]`, `loading: boolean`, `createOpen`, `editingUser: UserListItem|null`, `confirmDelete: UserListItem|null`.
- `load()`: chama `listUsers()`; em `success` seta `users`; em erro `toast.error`. Chamado em `useEffect` no mount.
- Header: `<div>` com título já vem do PageHeader da page — aqui só o botão "Novo usuário" (`Plus`) alinhado à direita, acima da tabela. (A page T17 NÃO passa `actions` ao PageHeader; o botão fica aqui.)
- `loading` → tabela com 5 linhas de `<Skeleton className="h-9 w-full" />`.
- `users.length === 0` → estado vazio (ícone `UsersIcon`, texto "Nenhum usuário encontrado").
- Tabela, colunas: **Nome**, **E-mail**, **Papel** (`<Badge>` com `className={PLATFORM_ROLE_STYLES[role].className}` e label `PLATFORM_ROLE_LABELS[role]`), **Status** (`<Badge>` verde "Ativo" / cinza "Inativo"), **Criado em** (`format(new Date(u.createdAt), "dd/MM/yyyy", {locale: ptBR})`), **Ações**.
- Ações por linha (botões-ícone): **Editar** (`Pencil`) — visível se `canEditUser(currentUser, u).allowed`; **Ativar/Desativar** (`UserCheck`/`UserX`) — visível se `canDeactivateUser(currentUser, u).allowed`, chama `setUserActive(u.id, !u.isActive)` dentro de `startTransition`; **Excluir** (`Trash2`) — visível se `canDeleteUser(currentUser, u).allowed`, abre `AlertDialog` de confirmação.
- `AlertDialog` de delete: modo controlado `open={confirmDelete !== null}` + `onOpenChange={(o)=>!o && setConfirmDelete(null)}`. **`AlertDialogAction` (base-ui) NÃO fecha o dialog ao clicar** — o `onClick` do botão de confirmação deve: chamar `deleteUser(confirmDelete.id)` dentro de `startTransition`, e ao terminar fazer `setConfirmDelete(null)`. Em `success` → `toast.success` + `load()`; senão `toast.error`.
- `UserFormDialog` montado 2x: create (`mode="create"`, `open={createOpen}`) e edit (`mode="edit"`, `open={editingUser!==null}`, `user={editingUser}`). `onSuccess` → `load()`.
- Todas as mutations em `useTransition`.

**Verificação:** `tsc` na T28; render na T30.

### T17 — `src/app/(protected)/usuarios/page.tsx`
Criar. Server Component. Código final:
```tsx
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { UsersContent } from "@/components/users/users-content";

export const metadata = { title: "Usuários | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole === "viewer" || user.platformRole === "manager") {
    redirect("/dashboard");
  }
  return (
    <PageShell>
      <PageHeader
        icon={Users}
        title="Usuários"
        subtitle="Gerencie os usuários da plataforma"
      />
      <UsersContent currentUser={user} />
    </PageShell>
  );
}
```
**Verificação:** `tsc` na T28; render na T30.

---

## CAMADA 5 — Tela de Perfil

> `profile.ts` recebe 3 implementações incrementais (T18→T19→T20). O arquivo
> atual tem só `confirmEmailChange` (stub) — preservar.

### T18 — `src/lib/actions/profile.ts` — `updateProfile`
Editar o arquivo. Adicionar imports no topo: `revalidatePath` (next/cache); `prisma` (`@/lib/prisma`); `getCurrentUser` (`@/lib/auth`); `logAudit` (`@/lib/audit`); `z` (zod).
- `const UpdateProfileInput = z.object({ name: z.string().min(2).max(120).optional(), avatarUrl: z.string().nullable().optional(), theme: z.enum(["dark","light","system"]).optional() });`
- `export async function updateProfile(rawInput: unknown): Promise<{success?: boolean; error?: string}>`:
  - `me = getCurrentUser()`; `!me` → `{error:"Não autenticado"}`.
  - `parsed = UpdateProfileInput.safeParse(rawInput)`; `!parsed.success` → `{error:"Dados inválidos"}`.
  - montar `data` só com campos presentes; `prisma.user.update({where:{id:me.id}, data})`.
  - `logAudit({userId:me.id, action:"profile_updated", targetType:"User", targetId:me.id})`.
  - `revalidatePath("/perfil")`; retorna `{success:true}`.
  - `try/catch` → `{error:"Erro ao atualizar perfil"}`.
**Verificação:** `tsc` parcial.

### T19 — `src/lib/actions/profile.ts` — `changePassword`
Editar. Adicionar import `bcrypt` (`bcryptjs`).
- `export async function changePassword(input: {currentPassword: string; newPassword: string; confirmPassword: string}): Promise<{success?: boolean; error?: string}>`:
  - `me = getCurrentUser()`; `!me` → `{error:"Não autenticado"}`.
  - `if (input.newPassword.length < 8)` → `{error:"A nova senha precisa ter ao menos 8 caracteres."}`.
  - `if (input.newPassword !== input.confirmPassword)` → `{error:"As senhas não coincidem."}`.
  - `if (input.newPassword === input.currentPassword)` → `{error:"A nova senha deve ser diferente da atual."}`.
  - `row = prisma.user.findUnique({where:{id:me.id}, select:{password:true}})`; `!row` → `{error:"Usuário não encontrado"}`.
  - `ok = await bcrypt.compare(input.currentPassword, row.password)`; `!ok` → `{error:"Senha atual incorreta."}`.
  - `hash = await bcrypt.hash(input.newPassword, 10)`.
  - `prisma.user.update({where:{id:me.id}, data:{password: hash, passwordChangedAt: new Date(), mustChangePassword: false}})`.
  - `logAudit({userId:me.id, action:"profile_password_changed", targetType:"User", targetId:me.id})`.
  - retorna `{success:true}`.
  - `try/catch` → `{error:"Erro ao alterar senha"}`.
**Verificação:** `tsc` parcial.

### T20 — `src/lib/actions/profile.ts` — `requestEmailChange` (stub honesto)
Editar. Adicionar:
- `export async function requestEmailChange(_input: {newEmail: string; password: string}): Promise<{success?: boolean; error?: string}>` — retorna `{error: "A troca de e-mail por confirmação será habilitada em versão futura."}`.
- Preservar o `confirmEmailChange` já existente sem alterar.
**Verificação:** `tsc` parcial; arquivo `profile.ts` completo compila.

### T21 — `src/components/profile/personal-info-card.tsx`
Criar (novo diretório `src/components/profile/`). **Porte verbatim** de `nexus-insights/src/components/profile/personal-info-card.tsx` — copiar o arquivo inteiro sem alterações. Imports resolvem idênticos (`@/components/ui/{button,input,label,card}`, `@/lib/actions/profile`). Confirmar que `card.tsx` exporta `Card, CardContent, CardHeader, CardTitle`.
**Verificação:** `tsc` na T28.

### T22 — `src/components/profile/email-change-card.tsx`
Criar. **Porte verbatim** de `nexus-insights/src/components/profile/email-change-card.tsx`. Usa `requestEmailChange` (criado na T20).
**Verificação:** `tsc` na T28.

### T23 — `src/components/profile/password-change-card.tsx`
Criar. **Porte verbatim** de `nexus-insights/src/components/profile/password-change-card.tsx`. Usa `changePassword` (T19). `MIN_LENGTH=8` — coerente com a action.
**Verificação:** `tsc` na T28.

### T24 — `src/components/profile/appearance-card.tsx`
Criar. **Porte verbatim** de `nexus-insights/src/components/profile/appearance-card.tsx`. Usa `useTheme` (`@/components/providers/theme-provider`) e `updateProfile` (T18).
**Verificação:** `tsc` na T28.

### T25 — `src/components/profile/profile-content.tsx`
Criar. **Porte verbatim** de `nexus-insights/src/components/profile/profile-content.tsx` — compõe os 4 cards com framer-motion. Props: `initialName, initialEmail, initialAvatarUrl, initialTheme, createdAt`.
**Verificação:** `tsc` na T28.

### T26 — `src/app/(protected)/perfil/page.tsx`
Criar. Server Component. Código final:
```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/layout/page-shell";
import { ProfileContent } from "@/components/profile/profile-content";

export const metadata = { title: "Meu Perfil | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true },
  });
  const createdAtIso = dbUser?.createdAt
    ? dbUser.createdAt.toISOString()
    : new Date().toISOString();

  return (
    <PageShell variant="narrow">
      <ProfileContent
        initialName={user.name}
        initialEmail={user.email}
        initialAvatarUrl={user.avatarUrl ?? null}
        initialTheme={user.theme}
        createdAt={createdAtIso}
      />
    </PageShell>
  );
}
```
**Verificação:** `tsc` na T28; render na T30.

### T27 — `src/app/(protected)/perfil/trocar-senha/page.tsx`
Criar. A página é alvo do redirect do middleware quando `mustChangePassword`. Server Component que renderiza o `PasswordChangeCard` standalone. Código final:
```tsx
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { PasswordChangeCard } from "@/components/profile/password-change-card";

export const metadata = { title: "Trocar senha | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function TrocarSenhaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={KeyRound}
        title="Trocar senha"
        subtitle="Defina uma nova senha para continuar"
      />
      <PasswordChangeCard />
    </PageShell>
  );
}
```
**Verificação:** `tsc` na T28; render na T30.

---

## CAMADA 6 — Verificação

### T28 — `npx tsc --noEmit` — zero erros
Rodar na raiz. Critério: saída sem erros. Corrigir antes de avançar.

### T29 — `npx next build` — build limpo
Rodar na raiz. Critério: build completa, rotas esperadas compiladas:
`(auth)`: login, forgot-password, reset-password, verify-email;
`(protected)`: dashboard, usuarios, perfil, perfil/trocar-senha;
APIs: auth, health, user/theme.

### T30 — Verificação funcional (best-effort)
Subir Postgres via Docker (`docker compose up -d db`), rodar migration + seed, iniciar `next dev`, e percorrer no browser: login → dashboard → sidebar (nav, tema, logout) → /usuarios (listar, criar, editar, ativar/desativar, excluir) → /perfil (4 cards). **Se Docker indisponível:** documentar explicitamente o que não pôde ser testado; build + tsc continuam sendo o gate mínimo.

---

## REVIEW #1 — lacunas, ordem, premissas

Auditoria adversarial. Premissas verificadas contra o código real; achados materiais corrigidos no corpo do plano.

**Premissas resolvidas (verificadas, não assumidas):**
- P1. `src/app/page.tsx` redireciona autenticado→`/dashboard`. ✅ Lido.
- P2. `card.tsx` exporta `Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent`. ✅ — porte verbatim dos profile cards (que usam Card/CardHeader/CardTitle/CardContent) é seguro.
- P3. `dialog.tsx` exporta `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` (+outros). ✅
- P4. `alert-dialog.tsx` exporta os 8 subcomponentes usados em T16. ✅
- P5. `select.tsx` exporta `Select, SelectTrigger, SelectValue, SelectContent, SelectItem`. ✅
- P6. `table.tsx` exporta `Table, TableHeader, TableBody, TableRow, TableHead, TableCell`. ✅
- P7. Stack UI = `@base-ui/react`, não Radix (`style: base-nova`). Sem deps Radix no `package.json` — esperado. `next build` (Blocos 1–4 + shadcn instalado) passou exit 0.
- P8. Profile cards do nexus-insights importam apenas `@/components/ui/{button,input,label,card}`, `@/lib/actions/profile`, `@/components/providers/theme-provider`, `framer-motion`, `lucide-react`, `sonner`, `next/navigation` — tudo existe em nexus-odoo. Porte verbatim viável.

**Achados materiais (corrigidos):**
- A1. **T15 faltava `useEffect`** nos imports (necessário p/ inicializar o form no modo edit). → Corrigido: import adicionado.
- A2. **`AlertDialogAction` (base-ui) não fecha o dialog ao clicar** (diferente do Radix). → Corrigido: T16 agora especifica fechamento manual via `setConfirmDelete(null)` no `onClick`, com `AlertDialog` em modo controlado.
- A3. **Decisão de testes não estava documentada.** → Corrigido: Decisão de escopo #9 adicionada (sem testes unitários no bloco; justificativa de calibração).
- A4. **base-ui vs Radix não estava no plano.** → Corrigido: Decisão de escopo #10 adicionada.

**Ordem de dependências — verificada:**
`T06–T08` (layout primitives, sem deps) → `T09` (sidebar: usa nav.ts/sidebar-active-path da Camada 0 ✅) → `T10` (layout: usa sidebar) → `T11` (dashboard: usa page-shell/page-header) → `T12→T13→T14` (users.ts incremental, cada uma compilável) → `T15` (usa users.ts) → `T16` (usa users.ts + T15) → `T17` (usa T16) → `T18→T19→T20` (profile.ts incremental) → `T21–T24` (profile cards: usam profile.ts) → `T25` (usa T21–T24) → `T26` (usa T25) → `T27` (usa T23) → `T28–T30`. Sem ciclo, sem dependência para trás. ✅

**Lacunas aceitas (não bloqueiam F1, registradas):**
- L1. Após troca de senha forçada em `/perfil/trocar-senha`, o `PasswordChangeCard` (porte verbatim) só exibe toast — não redireciona. O middleware libera no request seguinte (callback `jwt` refaz a query e zera `mustChangePassword`); o usuário navega pela sidebar. UX aceitável p/ F1; melhoria futura.
- L2. `requestEmailChange` é stub (e-mail infra é F2/F3) — coerente com `password-reset.ts`/`confirmEmailChange` já stubados no Bloco 4.

**Critério de saída da Review #1:** nenhum achado material em aberto. Premissas verificadas contra o código. ✅

## REVIEW #2 — granularidade, integração, testabilidade

Auditoria adversarial conduzida por **agente fresco** (não participou da escrita). Achados materiais abaixo; este adendo **corrige e tem precedência** sobre o corpo das tasks onde houver conflito.

**M1 — `lucide-react` versão anômala (era BLOQUEADOR) — RESOLVIDO.**
`package.json` declara `^1.7.0`; versão instalada = **`1.16.0`**. Verificado por script: os **40 nomes de ícone** usados em todo o Bloco 5 (`Camera, Loader2, Save, User, CheckCircle2, Eye, EyeOff, Mail, AlertCircle, KeyRound, Monitor, Moon, Palette, Sun, LayoutDashboard, Users, Home, Crown, Shield, ShieldHalf, UserCheck, UserX, Pencil, Trash2, Plus, Menu, X, LogOut, ...`) resolvem. Porte verbatim dos profile cards é seguro quanto a ícones. ✅

**G1/M7 — T09 (sidebar) era épico sem código final — CORRIGIDO.**
A spec por enumeração de 13 adaptações é substituída pelo **código final completo** abaixo. Executar a T09 com EXATAMENTE este conteúdo:
```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Menu, X, Sun, Moon, Monitor } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  filterNav,
  NAV_ITEMS,
  SECTION_LABELS,
  type NavItem,
} from "@/lib/constants/nav";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import type { PlatformRole } from "@/generated/prisma/client";
import { collectLeafHrefs, isLeafActive } from "@/lib/utils/sidebar-active-path";
import { cn } from "@/lib/utils";

interface SidebarUser {
  name: string;
  email: string;
  platformRole: PlatformRole;
  avatarUrl: string | null;
}

interface SidebarProps {
  user: SidebarUser;
}

const THEME_CYCLE = ["dark", "light", "system"] as const;
const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor } as const;
const THEME_LABELS = {
  dark: "Modo escuro",
  light: "Modo claro",
  system: "Sistema",
} as const;

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  }

  const ThemeIcon = THEME_ICONS[theme] ?? Moon;
  const visibleNav = filterNav(NAV_ITEMS, user);
  const allLeafHrefs = useMemo(() => collectLeafHrefs(visibleNav), [visibleNav]);

  function renderItem(item: NavItem) {
    const active = isLeafActive(item.href, pathname, allLeafHrefs);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 cursor-pointer",
          active
            ? "bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/15"
            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        )}
      >
        <item.icon
          className={cn(
            "h-[16px] w-[16px] shrink-0 transition-colors duration-200",
            active
              ? "text-violet-600 dark:text-violet-300"
              : "text-muted-foreground group-hover:text-foreground",
          )}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-background border-r border-border overflow-y-auto">
      <div className="flex items-center gap-3 px-6 py-6">
        <Image
          src="/logo.png"
          alt="Nexus Odoo"
          width={40}
          height={40}
          className="rounded-[22%]"
        />
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight">
            Nexus Odoo
          </h1>
          <p className="text-[11px] text-muted-foreground leading-none">
            Dados do ERP
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {(() => {
          let lastSection: NavItem["section"] | null = null;
          return visibleNav.map((item, index) => {
            const showHeader = item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
              >
                {showHeader ? (
                  <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    {SECTION_LABELS[item.section!]}
                  </div>
                ) : null}
                {renderItem(item)}
              </motion.div>
            );
          });
        })()}
      </nav>

      <div className="border-t border-border px-4 py-4 space-y-3">
        <Link
          href="/perfil"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-1 transition-all duration-200 hover:bg-accent/50 cursor-pointer group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground overflow-hidden shrink-0">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {PLATFORM_ROLE_LABELS[user.platformRole]}
            </p>
          </div>
        </Link>

        <Button
          variant="ghost"
          onClick={cycleTheme}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 cursor-pointer transition-all duration-200"
          size="sm"
        >
          <ThemeIcon className="h-4 w-4" />
          {THEME_LABELS[theme]}
        </Button>

        <Button
          variant="ghost"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
          size="sm"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>

      <footer className="mt-auto border-t border-border/50 px-3 py-2">
        <p className="text-[10px] text-muted-foreground/60 text-center leading-tight">
          Nexus AI © 2026
        </p>
        <p className="text-[10px] text-muted-foreground/60 text-center leading-tight">
          Todos os direitos reservados
        </p>
      </footer>
    </div>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block">{sidebarContent}</aside>

      <div className="fixed top-4 left-4 z-50 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="h-11 w-11 bg-card border border-border text-foreground hover:text-foreground cursor-pointer"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
```

**G2 — T14 era 3 actions numa task — CORRIGIDO.** T14 fica decomposta:
- **T14a** — `updateUser` (validação Zod + `canEditUser`/`canChangeRole` + `prisma.user.update` + `logAudit user_updated` + `revalidatePath`).
- **T14b** — `setUserActive(id, active)` (`canDeactivateUser` + update + `logAudit user_activated`/`user_deactivated`).
- **T14c** — `deleteUser(id)` (`canDeleteUser` + `prisma.user.delete` + `logAudit user_deleted`).
Cada uma é um `Edit` que adiciona uma função ao arquivo, deixando-o compilável.

**M2 — `avatarUrl` data-URL sem limite — CORRIGIDO.** Na T18, `UpdateProfileInput.avatarUrl` = `z.string().max(262144).nullable().optional()` (limite 256 KB — cobre webp 128px com folga; rejeita payloads abusivos).

**`await getCurrentUser()` — CORRIGIDO.** `getCurrentUser` é `async`. Em T13, T14a–c, T18, T19, T20 usar SEMPRE `const me = await getCurrentUser();`. (O texto das tasks que escreve `me = getCurrentUser()` está errado — usar `await`.)

**M4 — cabeçalho de `/perfil` — DECISÃO REGISTRADA.** `profile-content.tsx` (porte verbatim, T25) renderiza o próprio `<h1>Perfil</h1>` com animação stagger. `/perfil` (T26) NÃO usa `PageHeader` — diferente de `/dashboard` e `/usuarios`. **Decisão consciente:** manter o porte verbatim (o header faz parte da animação coesa do profile-content; mexer introduz risco sem ganho). A uniformização visual de cabeçalhos entre telas fica registrada para a etapa [9] `/gsd-ui-review`. Não é defeito — é decisão de escopo.

**M3 — `requestEmailChange` stub mostra `toast.error` — ACEITO.** O `email-change-card` cai no `else` e exibe toast vermelho com a mensagem "versão futura". UX aceitável para F1 (a funcionalidade não existe mesmo). Registrado.

**T-1 — verificação fraca ("arquivo existe") — CORRIGIDO.** Verificação por task passa a ser: arquivo criado **e** `npx tsc --noEmit` sem erro novo. Rodar `tsc` ao fim de cada CAMADA (2, 3, 4, 5), não só na T28.

**T-3/T-4 — T30 era opcional, deixando o bloco sem verificação de comportamento — CORRIGIDO.**
- T30 passa a ser **obrigatória**. Se o Docker não puder subir, isso é um **bloqueio reportado** (não nota de rodapé): o bloco fica "executado, verificação funcional pendente" e isso é dito explicitamente no STATUS.md e ao usuário.
- **T31 (nova)** — smoke test: `src/lib/actions/__tests__/users.test.ts` testando `generateTempPassword` (12 chars, charset esperado, unicidade entre chamadas). Independe de banco. Roda com `npm test`.

**G3 — T15 (user-form-dialog) coeso — ACEITO sem quebra.** A spec da T15 já detalha cada comportamento concretamente (sem placeholder). Mantida como task única; a tela de senha temporária é uma sub-renderização condicional do mesmo componente, não um épico.

**G4 — T16 (users-content) coeso — ACEITO sem quebra.** Tela de conteúdo única, spec concreta.

**Critério de saída da Review #2:** bloqueador M1 resolvido; épico G1 com código final; G2 decomposta; placeholders eliminados; T30 obrigatória + smoke test T31. Nenhum achado material em aberto. ✅

---

## Checklist de saída do Bloco 5

- [ ] T06–T11: layout, page-header, sidebar, shell protegido, dashboard
- [ ] T12–T17: users.ts (3 partes), user-form-dialog, users-content, página usuarios
- [ ] T18–T27: profile.ts (3 partes), 5 profile components, páginas perfil + trocar-senha
- [ ] T28 `tsc --noEmit` zero erros
- [ ] T29 `next build` limpo
- [ ] T30 verificação funcional (ou documentação do que ficou pendente)
- [ ] STATUS.md atualizado, commit atômico

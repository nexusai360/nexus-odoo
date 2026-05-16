# F1 · Bloco 3 — Auth e RBAC — Plano

**Goal:** NextAuth v5 funcionando com JWT, RBAC em 4 papéis, middleware de
proteção de rotas, e helpers de permissão — tudo sem qualquer referência a
Chatwoot (`accountIds`, `teamIds`, queries de `user_account_access`).

**Roteiro:** `docs/superpowers/plans/2026-05-16-fundacao.md` (Bloco 3 de 6).

**Fonte de porte:** `nexus-insights`.

**Pré-condição:** Bloco 2 concluído (`tsc --noEmit` limpo, client Prisma gerado
em `src/generated/prisma/`).

---

### Task 1: `src/lib/constants/roles.ts`

**Files:** Create `src/lib/constants/roles.ts`

- [ ] **Step 1:** Criar `src/lib/constants/` (mkdir).
- [ ] **Step 2:** Copiar `nexus-insights/src/lib/constants/roles.ts` sem
  alteração — contém `PLATFORM_ROLE_LABELS`, `PLATFORM_ROLE_HIERARCHY`,
  `PLATFORM_ROLE_DESCRIPTIONS`, `PLATFORM_ROLE_STYLES`, `PLATFORM_ROLE_ICONS`,
  `PLATFORM_ROLE_OPTIONS`. Nenhuma referência a Chatwoot.

### Task 2: `src/lib/auth-helpers.ts`

**Files:** Create `src/lib/auth-helpers.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/lib/auth-helpers.ts` com as
  seguintes adaptações:

  **Interface `AuthUser`:** remover campos `accountIds: number[]` e
  `teamIds: number[]` — não existem no nexus-odoo.

  **Função `authorizeCredentials`:** remover as duas queries de
  `user_account_access` e `user_team_access` (Promise.all com 2 queries no
  final), remover a construção de `accountIds`/`teamIds`, e remover esses
  campos do objeto de retorno `AuthUser`.

  **Manter sem alteração:** import de `bcryptjs`, `pgPool`, `checkLoginRateLimit`,
  `logAudit`, `PlatformRole`, `Theme`; query de `users`; lógica de rate-limit;
  bcrypt compare; UPDATE de `last_login_at`; logAudit de login_succeeded/failed;
  `isPublicRoute` e suas constantes.

- [ ] **Step 2:** Verificar: `npx tsc --noEmit`. Expected: sem erros em
  `auth-helpers.ts`.

### Task 3: `src/lib/permissions.ts`

**Files:** Create `src/lib/permissions.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/lib/permissions.ts` com as
  seguintes adaptações:

  **Remover funções Chatwoot-específicas:**
  - `canGrantAccounts` (usa `accountIds` de `AuthUser`)
  - `canGrantTeams` (usa `teamIds` de `AuthUser`)
  - `canSeeMatrixIA` (visibilidade do inbox Matrix IA)

  **Manter sem alteração:** `PermissionResult`, `MinimalTargetUser`,
  `PERMISSION_REASONS`, `canCreateRole`, `canEditUser`, `canDeleteUser`,
  `canDeactivateUser`, `canActivate`, `canChangeRole`.

- [ ] **Step 2:** Verificar: `npx tsc --noEmit`. Expected: sem erros.

### Task 4: `src/auth.config.ts`

**Files:** Create `src/auth.config.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/auth.config.ts` com as seguintes
  adaptações no callback `jwt`:

  Remover do bloco de cópia inicial (quando `user` chegou):
  ```ts
  token.accountIds = (user as any).accountIds;
  token.teamIds = (user as any).teamIds;
  ```

  Remover o bloco inteiro de refresh de `accountIds`/`teamIds` (as duas
  queries `prisma.userAccountAccess.findMany` e `prisma.userTeamAccess.findMany`,
  o `Promise.all`, e as atribuições `token.accountIds`/`token.teamIds`).

  Remover do callback `session`:
  ```ts
  (session.user as any).accountIds = token.accountIds ?? [];
  (session.user as any).teamIds = token.teamIds ?? [];
  ```

  **Manter sem alteração:** `trustHost`, `pages`, callback `authorized`,
  refresh dos campos `platformRole`, `isOwner`, `name`, `avatarUrl`, `theme`,
  `mustChangePassword` via `prisma.user.findUnique`; strategy JWT; maxAge.

- [ ] **Step 2:** Verificar: `npx tsc --noEmit`. Expected: sem erros.

### Task 5: `src/auth.ts`

**Files:** Create `src/auth.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/auth.ts` sem alteração — não tem
  referências a Chatwoot. Importa `authConfig`, `authorizeCredentials`, e
  monta o provider de Credentials.

- [ ] **Step 2:** Verificar: `npx tsc --noEmit`. Expected: sem erros.

### Task 6: `src/middleware.ts`

**Files:** Create `src/middleware.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/middleware.ts` com as seguintes
  adaptações:

  **Remover completamente:** o objeto `REDIRECT_MAP` (10 entradas de redirects
  de relatórios do nexus-insights) e o bloco `if (target)` que o usa (linhas
  14–41 do original).

  **Remover da lista de rotas públicas:** `/api/nex/calibrate` (específico do
  agente-nex).

  **Manter sem alteração:** import do `auth`; checagem de `isPublic`; redirect
  para `/login`; redirect para `/perfil/trocar-senha` quando `mustChangePassword`;
  `export const config` com o matcher.

- [ ] **Step 2:** Verificar: `npx tsc --noEmit`. Expected: sem erros.

### Task 7: `src/app/api/auth/[...nextauth]/route.ts`

**Files:** Create `src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1:** Criar diretórios `src/app/api/auth/[...nextauth]/`.
- [ ] **Step 2:** Criar `route.ts` com o conteúdo:
  ```ts
  import { handlers } from '@/auth';
  export const { GET, POST } = handlers;
  ```

### Task 8: Verificação do Bloco 3

- [ ] **Step 1:** `npx tsc --noEmit` — EXIT=0. Todos os novos arquivos tipam.
- [ ] **Step 2:** `grep -ri chatwoot src/` — zero resultados.
- [ ] **Step 3:** `grep -ri accountIds src/` — zero resultados (removido de
  auth-helpers, auth.config, permissions).
- [ ] **Step 4:** `grep -ri teamIds src/` — zero resultados.
- [ ] **Step 5:** `git status` — apenas novos arquivos listados.
- [ ] **Step 6:** Commit — `feat: auth NextAuth v5, RBAC e helpers de permissão`.

---

## Self-Review

**Cobertura:** 7 arquivos-alvo do Bloco 3 cobertos — `constants/roles.ts`,
`auth-helpers.ts`, `permissions.ts`, `auth.config.ts`, `auth.ts`,
`middleware.ts`, `api/auth/[...nextauth]/route.ts`.

**Placeholder scan:** sem TBD. Todos os steps têm arquivo e verificação.

**Consistência:**
- `auth.config.ts` (Task 4) importa `prisma` de `@/lib/prisma` — disponível
  desde o Bloco 2.
- `auth-helpers.ts` (Task 2) importa `pgPool`, `checkLoginRateLimit`,
  `logAudit` — todos em `src/lib/`, Bloco 2.
- `permissions.ts` (Task 3) importa `PLATFORM_ROLE_HIERARCHY` de
  `@/lib/constants/roles` — Task 1 deste bloco. Task 3 deve ser executada
  após Task 1.
- `auth.ts` (Task 5) importa `authConfig` de `./auth.config` — Task 4 deste
  bloco. Task 5 deve ser executada após Task 4.
- `middleware.ts` (Task 6) importa `authConfig` de `./auth.config` — Task 4.
  Task 6 deve ser executada após Task 4.

---

## Review Profunda #1 — lacunas, ordem, premissas

**Ordem das tasks:** Tasks 2/3 podem ser executadas em paralelo (sem dependência
mútua). Tasks 4 → 5 → 6 devem ser sequenciais (5 depende de 4, 6 depende de 4).
Task 7 pode ser feita a qualquer momento.

**Premissa de tipo `AuthUser`:** o nexus-insights tem campos `accountIds` e
`teamIds` no tipo `AuthUser`. Depois da remoção em `auth-helpers.ts`, qualquer
código que referenciar esses campos vai falhar no `tsc`. Neste bloco, os únicos
consumidores de `AuthUser` são `permissions.ts` e `auth.config.ts` — ambos
adaptados. A verificação `grep -ri accountIds src/` na Task 8 detecta qualquer
vazamento.

**Premissa de `NEXTAUTH_SECRET`:** o `auth.config.ts` não declara explicitamente
`secret` — o NextAuth v5 lê de `process.env.NEXTAUTH_SECRET`. O valor já está
no `.env.local`. OK.

**Lacuna — declaração de tipos de sessão/token:** o `auth.config.ts` usa
`(session.user as any).platformRole` etc. — sem declaração de tipos customizados
para o módulo NextAuth. No nexus-insights, isso é feito via `next-auth.d.ts` ou
os tipos são derivados via `as any`. Verificar se o nexus-insights tem um arquivo
de declaração de tipos do NextAuth.

**Review #1 veredito:** lacuna de declaração de tipos detectada. Verificar antes
da Task 4.

---

## Review Profunda #2 — granularidade, integração, testabilidade

**Granularidade:** cada task tem exatamente um arquivo de destino. Tasks 1 e 7
são cópias diretas; Tasks 2, 3, 4, 5, 6 têm adaptações documentadas passo-a-passo.
Nenhuma task condensa mais de uma unidade.

**Testabilidade de RBAC:** `permissions.ts` é puro (sem efeitos colaterais, sem
IO) — testável unitariamente. Os testes de RBAC são responsabilidade de blocos
futuros quando houver suite de testes. O `tsc` neste bloco é a rede de segurança
de tipagem.

**Lacuna `next-auth.d.ts`:** investigação necessária antes da execução da Task 4.
Verificar em `nexus-insights/src/`:

```bash
find nexus-insights/src -name "next-auth.d.ts" -o -name "auth.d.ts"
```

Se existir, portar junto. Se não existir, o `auth.config.ts` compilará via
`as any` — aceitável para este bloco, declaração formal de tipos pode ser adicionada
no Bloco 5 quando houver mais consumidores de sessão.

**Rota `[...nextauth]`:** a Task 7 cria o diretório com colchetes no nome —
verificar que o mkdir não interpreta os colchetes como glob (`mkdir -p
"src/app/api/auth/[...nextauth]"` com aspas).

**Veredito:** plano granular o suficiente. Lacuna de `next-auth.d.ts` documentada
e tratada (verificar + portar se existir). Liberado para execução.

# F1 — Fundação — Design

> Spec do Sub-projeto F1. Branch: `feat/fundacao`. 2026-05-15.

## 1. Contexto e objetivo

O `nexus-odoo` precisa de uma aplicação base sobre a qual o dashboard (F3) e o
MCP (F4) serão construídos. A Fundação clona o **padrão arquitetural do projeto
irmão `nexus-insights`** (mesmo cliente, mesmo stack), adaptado ao contexto
Odoo e sem o código específico de Chatwoot/Power BI.

**Entregável:** aplicação Next.js no ar (local via Docker), com login
funcionando, RBAC de 4 perfis, usuário admin semeado, e CI/CD configurado.

## 2. Escopo

**Faz parte do F1:**
- Scaffolding do monorepo: app Next.js 16 (App Router) + TypeScript + Tailwind v4.
- Banco: PostgreSQL 16 + Prisma v7 (`@prisma/adapter-pg`).
- Auth: NextAuth v5 (Credentials provider, JWT stateless, bcryptjs).
- RBAC base: enum `PlatformRole` (super_admin > admin > manager > viewer).
- Schema Prisma inicial: `User`, `AuditLog`, `PasswordResetToken`,
  `EmailChangeToken`, `AppSetting`.
- Telas: login, esqueci/reset de senha, layout protegido, perfil, lista de
  usuários (CRUD básico de usuários por admin).
- Middleware de proteção de rotas; rota pública `(auth)` e protegida `(protected)`.
- `/api/health`; `/api/auth/[...nextauth]`.
- Infra: Docker multi-stage, `docker-compose.yml` (app + worker-esqueleto +
  db + redis), CI/CD GitHub Actions → `ghcr.io/jvzanini/nexus-odoo` → Portainer.
- Seed do usuário owner inicial.
- Segurança: encryption AES-256, rate limit no login (Redis), audit log.

**NÃO faz parte do F1:**
- Ingestão de dados do Odoo e tabelas de cache — é F2.
- Worker entra apenas como **esqueleto** (BullMQ configurado, sem jobs).
- Dashboard e relatórios — é F3.
- `report_access` (RBAC por relatório) — é F3.
- Servidor MCP — é F4.
- Nada de modelos de Chatwoot (`UserAccountAccess`, `UserTeamAccess`) nem de
  Power BI — não são portados.

## 3. Arquitetura — estrutura do monorepo

```
src/
├── app/
│   ├── (auth)/login, forgot-password, reset-password
│   ├── (protected)/dashboard, usuarios, perfil
│   ├── api/auth/[...nextauth], api/health, api/user/theme
│   ├── layout.tsx, globals.css, page.tsx
├── auth.ts, auth.config.ts, middleware.ts
├── lib/         prisma, auth-helpers, audit, encryption, rate-limit, redis
├── components/  ui/ (base), theme-provider, layout
├── worker/      index.ts (esqueleto BullMQ — sem jobs)
└── generated/prisma/   (client gerado, gitignored)
prisma/          schema.prisma, migrations/, seed.ts
docker/          Dockerfile, entrypoint.sh
docker-compose.yml
.github/workflows/build.yml
```

A pasta `discovery/` (F0) permanece como está, separada do app.

## 4. O que portar do `nexus-insights`

Reaproveitar (adaptando nomes `nexus_insights` → `nexus_odoo`):
- Configuração de auth (`auth.ts`, `auth.config.ts`, `middleware.ts`).
- `auth-helpers.ts` (checagem de papel/sessão), padrão de Server Actions.
- `lib/`: `prisma`, `audit`, `encryption`, `redis`, rate limit.
- `ThemeProvider` por cookie SSR-aware, Sonner (toast), componentes `ui/` base.
- Telas de login / reset de senha / perfil.
- `docker/Dockerfile`, `entrypoint.sh`, `docker-compose.yml`,
  `.github/workflows/build.yml`.

**Não** portar: tudo de `chatwoot/`, `integracoes/power-bi/`, `agente-nex/`,
`relatorios/`, `bancos-de-dados/`, e os modelos Prisma correspondentes.

## 5. Schema Prisma inicial

`User` (id uuid, email único, password hash, name, `platformRole`, `isOwner`,
`isActive`, `mustChangePassword`, timestamps, `createdById`), `AuditLog`,
`PasswordResetToken`, `EmailChangeToken`, `AppSetting`. Enum `PlatformRole` e
`Theme`. Soft delete (`deletedAt`) onde aplicável.

## 6. Segurança

- NextAuth v5 JWT stateless; `bcryptjs` para hash de senha.
- Middleware nega acesso a `(protected)` sem sessão.
- `ENCRYPTION_KEY` AES-256 para dados sensíveis futuros.
- Rate limit no login via Redis.
- `AuditLog` registra login, mudanças de usuário, etc.
- `.env.local`/`.env.production` nunca commitados; `.env.example` atualizado.

## 7. Infraestrutura e deploy

- Docker multi-stage (`node:22-alpine`), `docker-compose.yml` com serviços
  `app`, `worker`, `db` (postgres:16-alpine), `redis` (7-alpine).
- CI/CD: push em `main` → build → push `ghcr.io/jvzanini/nexus-odoo` →
  redeploy via Portainer API (Traefik + SSL no destino).
- Migrations Prisma aplicadas manualmente em produção (workflow dedicado).

## 8. Critérios de sucesso

1. `docker-compose up` sobe app + db + redis; o app responde em `localhost:3000`.
2. `/api/health` retorna OK.
3. Login funciona com o usuário admin semeado; RBAC com os 4 perfis.
4. Middleware bloqueia `(protected)` sem sessão e redireciona ao login.
5. Admin consegue criar/editar/desativar usuários.
6. `npm run build` e o build Docker passam; o CI publica a imagem no GHCR.
7. Nenhum código específico de Chatwoot/Power BI presente.

## 9. Riscos

- Next.js 16 + Tailwind v4 + base-ui são versões recentes — possíveis ajustes
  de configuração durante o scaffolding.
- Portar do `nexus-insights` exige disciplina para não arrastar dependências
  de Chatwoot; cada arquivo portado é revisado.
- Secrets de produção (Portainer, GHCR) e o `docker-compose.production.yml`
  são configurados pelo usuário no deploy — fora do escopo de código.

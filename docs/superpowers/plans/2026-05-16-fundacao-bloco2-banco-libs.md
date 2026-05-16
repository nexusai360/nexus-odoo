# F1 · Bloco 2 — Banco e bibliotecas base — Plano

**Goal:** Schema Prisma completo (sem Chatwoot/LLM/PowerBI), migration inicial
aplicada, seed rodando, e as 6 libs base (`prisma`, `pg-pool`, `redis`,
`encryption`, `audit`, `rate-limit`) em `src/lib/`.

**Roteiro:** `docs/superpowers/plans/2026-05-16-fundacao.md` (Bloco 2 de 6).

**Fonte de porte:** `nexus-insights` em
`/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`.

**Pré-condição:** Bloco 1 concluído (`npm install`, `tsc --noEmit`, `prisma validate`,
`docker compose config` — todos passando, confirmados).

---

### Task 1: Schema Prisma — enums base

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1:** Adicionar enum `PlatformRole` (valores: `super_admin`, `admin`,
  `manager`, `viewer`) ao schema.
- [ ] **Step 2:** Adicionar enum `Theme` (valores: `dark`, `light`, `system`).
- [ ] **Step 3:** Adicionar enum `AuditAction` com os valores genéricos portados
  do `nexus-insights`, excluindo ações de Chatwoot, integração PowerBI,
  nexus-chat e polling:

  Manter: `login_succeeded`, `login_failed`, `password_reset_requested`,
  `password_reset_completed`, `user_created`, `user_updated`, `user_deleted`,
  `user_role_changed`, `user_activated`, `user_deactivated`, `profile_updated`,
  `profile_password_changed`, `email_change_requested`, `email_change_completed`,
  `setting_updated`, `session_revoked`.

  **Não** adicionar: `user_access_granted`, `user_access_revoked`,
  `account_switched`, `opened_chatwoot_link`, `credential_*`,
  `integration_*`, `nexus_chat_*`, `company_chat_*`, `polling_*`.

- [ ] **Step 4:** Verificar com `npx prisma validate`. Expected: schema válido.

### Task 2: Schema Prisma — model User

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1:** Adicionar model `User` portado do `nexus-insights/prisma/schema.prisma`
  (linhas 68–98), com as seguintes adaptações:
  - Remover campos de relação com Chatwoot: `accountAccess UserAccountAccess[]`
    e `teamAccess UserTeamAccess[]`.
  - Remover relações de integração PowerBI: `integrationProfilesCreated` e
    `integrationAuditEvents`.
  - Manter todos os outros campos (id, email, password, name, platformRole,
    isOwner, isActive, mustChangePassword, passwordChangedAt, avatarUrl,
    theme, emailVerifiedAt, lastLoginAt, lastLoginIp, createdAt, updatedAt,
    createdById, createdBy, createdUsers, audits, passwordResetTokens,
    emailChangeTokens).
- [ ] **Step 2:** Verificar com `npx prisma validate`.

### Task 3: Schema Prisma — models de suporte

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1:** Adicionar model `AppSetting` portado sem alteração
  (nexus-insights linhas 129–138).
- [ ] **Step 2:** Adicionar model `AuditLog` portado sem alteração
  (nexus-insights linhas 140–155). Campo `action AuditAction` usa o enum
  adaptado da Task 1.
- [ ] **Step 3:** Adicionar model `PasswordResetToken` portado sem alteração
  (nexus-insights linhas 157–168).
- [ ] **Step 4:** Adicionar model `EmailChangeToken` portado sem alteração
  (nexus-insights linhas 170–181).
- [ ] **Step 5:** Verificar com `npx prisma validate`. Expected: schema válido
  com todos os 4 models de suporte.

### Task 4: Seed — adaptar `prisma/seed.ts`

**Files:** Create `prisma/seed.ts`

- [ ] **Step 1:** Criar `prisma/seed.ts` baseado em `nexus-insights/prisma/seed.ts`.
  Adaptações obrigatórias:
  - Remover a constante `KNOWN_ACCOUNTS` e o loop `userAccountAccess.upsert`
    (não existe mais o model `UserAccountAccess`).
  - Filtrar `APP_SETTINGS_DEFAULTS`: remover entradas com category `chatwoot`,
    `realtime`, `polling`, e as entradas de `reports.visibility.*` e
    `feature_flags.*` específicas do Chatwoot/Matrix IA.
  - Manter entradas genéricas: `audit.retention_days` e `reports.max_period_days`.
  - Adicionar 2 settings de sincronização Odoo: `odoo.sync_interval_seconds`
    (valor `300`, category `odoo`) e `odoo.last_full_sync` (valor `null`,
    category `odoo`).
- [ ] **Step 2:** Verificar tipagem: `npx tsc --noEmit`. Expected: sem erro de
  tipo em `prisma/seed.ts` (antes de `prisma generate`, o `@/generated/prisma`
  não existe — verificação de tipo completa acontece na Task 9).

### Task 5: Corrigir script de seed no `package.json`

**Files:** Modify `package.json`

- [ ] **Step 1:** Alterar o campo `prisma.seed` de
  `"ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"` para
  `"tsx prisma/seed.ts"` — compatível com Prisma 7 + tsx já instalado.
- [ ] **Step 2:** Verificar: `cat package.json | grep -A2 '"prisma"'` confirma
  o valor novo.

### Task 6: `src/lib/prisma.ts`

**Files:** Create `src/lib/prisma.ts`

- [ ] **Step 1:** Criar `src/lib/` (mkdir).
- [ ] **Step 2:** Copiar `nexus-insights/src/lib/prisma.ts` sem alteração —
  o singleton do `PrismaClient` com `PrismaPg` adapter é idêntico.

### Task 7: `src/lib/pg-pool.ts`

**Files:** Create `src/lib/pg-pool.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/lib/pg-pool.ts`. Adaptação: renomear
  o global `__nexusPgPool` para `__nexusOdooPgPool` para evitar colisão caso
  ambos os projetos compartilhem o mesmo processo Node em algum cenário de teste.

### Task 8: `src/lib/redis.ts`

**Files:** Create `src/lib/redis.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/lib/redis.ts` sem alteração —
  sem referências específicas de projeto.

### Task 9: `src/lib/encryption.ts`

**Files:** Create `src/lib/encryption.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/lib/encryption.ts` sem alteração —
  puro Node.js `crypto`, sem dependência de projeto.

### Task 10: `src/lib/audit.ts`

**Files:** Create `src/lib/audit.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/lib/audit.ts` sem alteração —
  importa `AuditAction` de `@/generated/prisma/client` e usa `pgPool` de
  `@/lib/pg-pool`. Ambas as dependências estão disponíveis.

### Task 11: `src/lib/rate-limit.ts`

**Files:** Create `src/lib/rate-limit.ts`

- [ ] **Step 1:** Copiar `nexus-insights/src/lib/rate-limit.ts` sem alteração —
  usa apenas `redis` de `@/lib/redis`, sem referências de projeto.

### Task 12: Gerar cliente Prisma

**Files:** (gerado em `src/generated/prisma/`)

- [ ] **Step 1:** Subir o banco de dados local: `docker compose up -d db`.
  Expected: container `nexus-odoo-db-1` em estado `healthy`.
- [ ] **Step 2:** Rodar `npx prisma generate`. Expected: client gerado em
  `src/generated/prisma/`. Saída confirma que os 4 models foram gerados
  (User, AppSetting, AuditLog, PasswordResetToken, EmailChangeToken).
- [ ] **Step 3:** Rodar `npx tsc --noEmit`. Expected: EXIT=0. Agora o client
  existe e os imports de `@/generated/prisma/client` em `audit.ts` e
  `prisma.ts` resolvem.

### Task 13: Migration inicial

**Files:** Create `prisma/migrations/*/migration.sql`

- [ ] **Step 1:** Rodar `npx prisma migrate dev --name init`.
  Expected: migration criada em `prisma/migrations/`, schema aplicado no banco
  local. Tabelas criadas: `users`, `app_settings`, `audit_logs`,
  `password_reset_tokens`, `email_change_tokens`.
- [ ] **Step 2:** Verificar: `docker compose exec db psql -U nexus -d nexus_odoo -c "\dt"`.
  Expected: lista as 5 tabelas acima.

### Task 14: Seed inicial

- [ ] **Step 1:** Rodar `npx prisma db seed`.
  Expected: `[seed] owner=<email>, accounts=0, settings=4` (ou similar, com
  os 4 settings mantidos).
- [ ] **Step 2:** Verificar: `docker compose exec db psql -U nexus -d nexus_odoo -c "SELECT email, platform_role FROM users;"`.
  Expected: 1 linha com o email do owner e role `super_admin`.

### Task 15: Verificação do Bloco 2

- [ ] **Step 1:** `npx prisma validate` — schema válido.
- [ ] **Step 2:** `npx tsc --noEmit` — EXIT=0 (client gerado resolve imports).
- [ ] **Step 3:** `docker compose exec db psql -U nexus -d nexus_odoo -c "\dt"` —
  5 tabelas listadas.
- [ ] **Step 4:** `npx prisma db seed` — idempotente (roda sem erro pela segunda vez).
- [ ] **Step 5:** `grep -ri chatwoot src/` — zero resultados.
- [ ] **Step 6:** `git status` — arquivos a commitar são apenas os novos/modificados
  (sem `src/generated/` — está no `.gitignore`).
- [ ] **Step 7:** Commit — `chore: schema Prisma, libs base e migration init`.

---

## Self-Review

**Cobertura:**
- 7 arquivos de lib: `prisma.ts`, `pg-pool.ts`, `redis.ts`, `encryption.ts`,
  `audit.ts`, `rate-limit.ts` + `prisma/seed.ts`.
- 1 schema: `prisma/schema.prisma` com 4 models + 3 enums.
- 1 migration: gerada via `prisma migrate dev`.
- 1 ajuste de config: `package.json` campo `prisma.seed`.

**Placeholder scan:** sem TBD. Todos os steps têm arquivo e verificação definidos.

**Consistência:**
- Task 12 Step 2 (`prisma generate`) depende de Tasks 1–3 (schema completo) —
  corretamente sequenciado.
- Task 12 Step 3 (`tsc`) depende do generate — corretamente após.
- Task 13 (migration) depende de Task 12 (generate) e do banco up (Task 12 Step 1).
- Task 14 (seed) depende de Task 13 (tabelas existem) e Task 5 (script correto).
- `audit.ts` importa `AuditAction` de `@/generated/prisma/client` — só resolve
  após `prisma generate` (Task 12). A Task 10 é criação do arquivo; o `tsc`
  final (Task 12 Step 3, após generate) é quem valida. Sequência correta.

---

## Review Profunda #1 — lacunas, ordem, premissas

**Premissa de banco local:** as Tasks 12–14 exigem o banco local rodando. A Task
12 Step 1 sobe o container antes do generate — correta. Se o container já
estiver rodando (de sessão anterior), o `docker compose up -d db` é idempotente.

**Lacuna — `DATABASE_URL` no ambiente shell:** `prisma migrate dev` e
`prisma db seed` leem `DATABASE_URL` do `.env.local`. O Prisma v7 + `prisma.config.ts`
buscam `process.env.DATABASE_URL` via a propriedade `datasource.url` do config.
Mas ao rodar `npx prisma migrate dev` no shell, o Prisma carrega o
`prisma.config.ts` que referencia `process.env.DATABASE_URL` — e o `.env.local`
**não** é carregado automaticamente pelo Prisma CLI (ao contrário do `.env`).
**Fix no plano:** antes de `migrate dev` e `db seed`, exportar a variável:
```sh
export $(grep DATABASE_URL .env.local | xargs)
```
Ou usar `dotenv -e .env.local -- npx prisma migrate dev` (requer `dotenv-cli`
não instalado). Solução mais simples: o Prisma v7 recomenda usar `.env` para
o CLI. **Ação:** no Step 1 de Task 13 e Task 14, adicionar instrução de
exportar `DATABASE_URL` antes do comando. Alternativamente, criar um `.env`
(não commitado, apenas com `DATABASE_URL`) apontando para o banco local —
mas isso colide com o `.gitignore` que cobre `.env`. A solução mais limpa:
exportar inline — `DATABASE_URL=... npx prisma migrate dev`.

**Lacuna — `prisma.config.ts` compilado:** o `prisma.config.ts` é TypeScript e
o Prisma CLI precisa compilá-lo. Com `tsx` instalado como devDependency, o
Prisma v7 usa `tsx` automaticamente. Verificar se `tsx` está em `node_modules/.bin/`.

**Seed — settings count:** o log `[seed] owner=..., settings=4` assume que
ficam 4 entries (2 genéricas + 2 Odoo). Verificar no Step 14 Step 1 que a
contagem bate com as settings definidas na Task 4.

**Review #1 veredito:** lacuna material encontrada e corrigida (DATABASE_URL
no CLI). Tasks 13 e 14 precisam de ajuste para incluir o export da variável.

---

## Review Profunda #2 — granularidade, integração, testabilidade

**Granularidade:** cada task tem exatamente um arquivo-alvo ou uma ação CLI.
Tasks 1–3 decompõem o schema em 3 partes (enums, model User, models de suporte)
— cada uma com `prisma validate` próprio. Nenhuma task condensa mais de uma
unidade.

**Integração — `audit.ts` + `AuditAction`:** `audit.ts` importa `AuditAction`
do client gerado. A Task 10 cria o arquivo e a Task 12 Step 3 valida o import
via `tsc`. Se `AuditAction` for renomeado ou removido do schema, o `tsc` pega
— correto.

**Integração — `seed.ts` + `UserAccountAccess`:** a remoção do model
`UserAccountAccess` do schema (não portado) significa que qualquer referência a
`prisma.userAccountAccess` no seed vai falhar no `tsc` após o generate. A Task 4
instrui a remoção explícita do loop — correto. O `tsc` da Task 12 Step 3 é a
rede de segurança.

**Testabilidade:** Bloco 2 não tem testes unitários — as libs são utilitários
e o schema/migration são verificados pelo CLI. Testes de integração das libs
(prisma.ts, redis.ts, encryption.ts) são responsabilidade do Bloco 3+ quando
houver código de aplicação que os usa. Apropriado para este bloco.

**Lacuna adicional — `docker compose exec db`:** os comandos de verificação
`psql` nas Tasks 13 e 14 assumem que o serviço está rodando com o nome de
container padrão. O `exec` usa o nome do serviço (`db`), não o nome do
container — correto, o Compose resolve.

**DATABASE_URL inline:** seguindo o fix da Review #1, as Tasks 13 e 14 devem
usar a forma:

```sh
DATABASE_URL=$(grep '^DATABASE_URL' .env.local | cut -d= -f2-) npx prisma migrate dev --name init
```

Essa forma não expõe o valor no histórico do shell de forma persistente.

**Veredito:** plano granular o suficiente; a lacuna do `DATABASE_URL` foi
identificada e tratada nas duas reviews. Nenhuma task precisa ser redecomposta.
Liberado para execução.

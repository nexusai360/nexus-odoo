# F1 · Bloco 1 — Scaffolding base — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`).

**Goal:** Erguer o esqueleto do projeto Next.js 16 — dependências, configs, Prisma (esqueleto) e Docker — pronto para receber código nos blocos seguintes.

**Roteiro:** `docs/superpowers/plans/2026-05-16-fundacao.md` (Bloco 1 de 6).

**Fonte de porte:** `nexus-insights` em `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`. Quando um step diz "copiar de `nexus-insights/<arquivo>`", a fonte é a especificação completa; aplicar só as adaptações listadas.

**Não faz parte deste bloco:** schema Prisma com models, qualquer `src/`, qualquer código de aplicação — são os Blocos 2–6.

---

### Task 1: `package.json`

**Files:** Create `package.json`

- [ ] **Step 1:** Abrir `nexus-insights/package.json` como referência. Criar `package.json` na raiz com `name: "nexus-odoo"`, `version: "0.1.0"`, `private: true`.
- [ ] **Step 2:** Copiar de `nexus-insights` as dependências de **framework e infraestrutura**: `next`, `react`, `react-dom`, `typescript`, `@types/*`, `tailwindcss` v4 + `@tailwindcss/postcss`, `prisma`/`@prisma/client` v7, `@prisma/adapter-pg`, `pg`, `next-auth` v5, `bcryptjs`, `zod`, `bullmq`, `ioredis`, `lucide-react`, o pacote base-ui, `sonner`, `tsx`, `jest` + `ts-jest`/`@types/jest` + `jest-environment-jsdom` + `jest-mock-extended`, `eslint` + config. Manter as **mesmas versões** do `nexus-insights`.
- [ ] **Step 3:** **Não** copiar dependências exclusivas de features não portadas (charts/recharts, libs de tour, de Power BI, de transcrição/áudio do agente-nex). Em dúvida sobre uma dependência, deixá-la fora — blocos seguintes a adicionam se faltar.
- [ ] **Step 4:** Definir `scripts`: `dev`, `build`, `start`, `lint`, `test` (`jest`), `prisma:generate`, `prisma:migrate`, `prisma:seed`.
- [ ] **Step 5:** Commit — `chore: package.json do nexus-odoo`.

### Task 2: Configs de TypeScript, Next, lint e Node

**Files:** Create `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `.nvmrc`

- [ ] **Step 1:** Copiar `tsconfig.json` de `nexus-insights` **sem alteração** (paths `@/*`, target, etc. são genéricos).
- [ ] **Step 2:** Copiar `next.config.ts` de `nexus-insights`. Remover qualquer referência a domínios/integrações específicas de Chatwoot, se houver.
- [ ] **Step 3:** Copiar `eslint.config.mjs` e `postcss.config.mjs` sem alteração.
- [ ] **Step 4:** Copiar `components.json` (config base-ui) sem alteração.
- [ ] **Step 5:** Criar `.nvmrc` com o conteúdo `22`.
- [ ] **Step 6:** Commit — `chore: configs de TypeScript, Next, ESLint e Node`.

### Task 3: Configuração do Jest

**Files:** Create `jest.config.ts`, e o arquivo de setup de teste se o `nexus-insights` tiver um

- [ ] **Step 1:** Copiar `jest.config.ts` de `nexus-insights`. Ajustar `roots`/`testMatch` para o `src/` deste projeto; manter o mapeamento do alias `@/`.
- [ ] **Step 2:** Se o `nexus-insights` tiver arquivo de setup (`jest.setup.ts` ou similar referenciado em `setupFilesAfterEnv`), copiá-lo; senão, omitir a referência.
- [ ] **Step 3:** Commit — `chore: configuração do Jest`.

### Task 4: `.env.local` de desenvolvimento

**Files:** Modify `.env.local` (não versionado)

- [ ] **Step 1:** O `.env.local` já existe com as variáveis do Odoo. Completar/ajustar os valores de **desenvolvimento**: `DATABASE_URL="postgresql://nexus:nexus@localhost:5433/nexus_odoo?schema=public"` (porta 5433 = mapeamento do `db` no compose), `REDIS_URL="redis://localhost:6380"`, `NEXTAUTH_URL="http://localhost:3000"`.
- [ ] **Step 2:** Gerar segredos reais de dev: `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `ENCRYPTION_KEY` (`openssl rand -hex 32` — 64 chars).
- [ ] **Step 3:** Definir `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` para o owner de desenvolvimento.
- [ ] **Step 4:** Verificar: `git check-ignore .env.local` confirma que está ignorado. **Sem commit** (arquivo não versionado).

### Task 5: Instalar dependências e verificar

- [ ] **Step 1:** Rodar `npm install --legacy-peer-deps` (a flag é exigida por Next 16 + NextAuth v5). Expected: instala sem erro fatal.
- [ ] **Step 2:** Rodar `npx tsc --noEmit`. Expected: sem erro de configuração (erros de "arquivo não encontrado" para `src/` ainda inexistente são aceitáveis; erro de config do tsconfig não é).
- [ ] **Step 3:** Atualizar `.gitignore`: confirmar que `node_modules/`, `.next/`, `.venv/` já constam (constam). Adicionar `src/generated/` (client Prisma, gerado nos Blocos 2+).
- [ ] **Step 4:** Commit — `chore: lockfile de dependências` (commitar `package-lock.json` e `.gitignore`).

### Task 6: Prisma — esqueleto

**Files:** Create `prisma/schema.prisma`, `prisma.config.ts`

- [ ] **Step 1:** Criar `prisma/schema.prisma` apenas com o cabeçalho (sem models):

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

- [ ] **Step 2:** Copiar `prisma.config.ts` de `nexus-insights`. Garantir que a configuração de seed aponte para `prisma/seed.ts` (`tsx prisma/seed.ts`) — o Bloco 2 cria o `seed.ts`.
- [ ] **Step 3:** Verificar: `npx prisma validate`. Expected: schema válido.
- [ ] **Step 4:** Commit — `chore: esqueleto do Prisma`.

### Task 7: Docker — imagem

**Files:** Create `docker/Dockerfile`, `docker/entrypoint.sh`, `.dockerignore`

- [ ] **Step 1:** Copiar `docker/Dockerfile` de `nexus-insights`. Adaptações: base `node:22-alpine`; remover o ENV de build `CHATWOOT_DATABASE_URL`; manter os demais ENV dummies de build (`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_*`, `ENCRYPTION_KEY`, `ADMIN_*`); ajustar nomes `nexus_insights`→`nexus_odoo` onde aparecerem.
- [ ] **Step 2:** Copiar `docker/entrypoint.sh` de `nexus-insights` (lógica de migrations/seed condicional). Ajustar nomes se necessário.
- [ ] **Step 3:** Copiar `.dockerignore` de `nexus-insights`.
- [ ] **Step 4:** Commit — `chore: Dockerfile e entrypoint`.

### Task 8: Docker — compose

**Files:** Create `docker-compose.yml`

- [ ] **Step 1:** Copiar `docker-compose.yml` de `nexus-insights`. Adaptações: imagem/serviço base `nexus-odoo`; nome do banco `nexus_odoo`; volumes `nexus_odoo_postgres` / `nexus_odoo_redis`; **remover** `CHATWOOT_DATABASE_URL` e `CHATWOOT_BASE_URL` de todos os serviços; **acrescentar** ao serviço `worker` as variáveis `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`. Manter os mapeamentos de porta `5433:5432` (db) e `6380:6379` (redis).
- [ ] **Step 2:** Verificar: `docker compose config` valida o arquivo sem erro.
- [ ] **Step 3:** Commit — `chore: docker-compose`.

### Task 9: Verificação do Bloco 1

- [ ] **Step 1:** `npm install --legacy-peer-deps` está concluído e `node_modules/` existe.
- [ ] **Step 2:** `npx tsc --noEmit` não acusa erro de configuração.
- [ ] **Step 3:** `npx prisma validate` passa.
- [ ] **Step 4:** `docker compose config` valida.
- [ ] **Step 5:** `git status` limpo; `.env.local` e `node_modules/` não aparecem como rastreados.
- [ ] **Step 6:** Confirmar o critério de pronto do Bloco 1 (roteiro) e liberar o Bloco 2.

---

## Self-Review

**Cobertura:** os 14 arquivos-alvo do Bloco 1 (roteiro) estão cobertos —
Task 1 (package.json), 2 (5 configs + .nvmrc), 3 (jest), 6 (prisma x2),
7 (docker x3), 8 (compose); `.env.local` na Task 4.

**Placeholder scan:** sem TBD. O schema sem models é intencional (esqueleto —
models no Bloco 2).

**Consistência:** Task 5 depende de 1–3 (precisa do package.json e configs);
Task 6 Step 2 referencia o `seed.ts` do Bloco 2 como dependência futura,
declarada. Portas do `.env.local` (5433/6380) batem com o compose (Task 8).

## Review Profunda #1 — lacunas, ordem, premissas

- **Ordem `.env.local` × `tsc`:** a Task 5 roda `tsc`; o `tsc` não precisa do
  `.env.local`, então a ordem 4→5 é folgada — ok.
- **Premissa do lockfile:** a Task 5 Step 4 commita `package-lock.json`; ele só
  existe após o `npm install` do Step 1 — ordem correta.
- **Lacuna corrigida:** o `.gitignore` precisa de `src/generated/` antes de
  qualquer `prisma generate` (Blocos 2+) — incluído na Task 5 Step 3.
- **Premissa de porte:** `prisma.config.ts`, `jest.config.ts`, `components.json`
  podem ter formatos que mudaram entre versões — cada task de cópia tem
  verificação (`tsc`, `prisma validate`) que pega incompatibilidade.

## Review Profunda #2 — granularidade, integração, testabilidade

- **Granularidade:** cada task tem escopo único (deps / configs / jest / env /
  install / prisma / dockerfile / compose / verificação). Os steps são de
  1 arquivo ou 1 ação — atômicos. Nenhuma task esconde mais de uma unidade.
- **Integração:** Task 8 (compose) usa as portas que a Task 4 (.env.local)
  assume — verificado, consistentes. O `entrypoint.sh` (Task 7) depende de
  migrations que só existem no Bloco 2 — mas o entrypoint só as roda em
  runtime de container, não no Bloco 1; sem conflito.
- **Testabilidade:** o Bloco 1 não tem código testável (é scaffolding); a
  verificação é por comando (`tsc`, `prisma validate`, `docker compose
  config`) — apropriado. Jest fica configurado para os blocos seguintes.
- **Veredito:** plano granular o suficiente; nenhuma task precisa ser
  redecomposta. Liberado para execução.

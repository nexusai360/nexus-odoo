# STATUS — nexus-odoo

> Estado do projeto para retomada entre sessões. Atualizado em 2026-05-16.
> **Modo de trabalho: autônomo até o fim** — executar sem pausar para
> aprovação; interromper só em bloqueio real. Esta pausa foi pontual (troca
> de sessão), não é regra.

## Onde estamos

- **F0 — Discovery do Odoo:** ✅ CONCLUÍDO, mergeado na `main` (PR #1).
  650 modelos no censo, 79 mapeados em profundidade. Protocolo definido:
  **JSON-RPC** (XML-RPC quebra nesta instância). Achados em
  `docs/runbooks/discovery-odoo.md`.
- **F1 — Fundação:** 🔄 EM ANDAMENTO na branch **`feat/fundacao`**.

## F1 — estrutura

Executado em **6 blocos**, cada um com plano granular próprio + double-check +
verificação antes do seguinte. Roteiro: `docs/superpowers/plans/2026-05-16-fundacao.md`.
Spec: `docs/superpowers/specs/2026-05-15-fundacao-design.md`.

### Bloco 1 — Scaffolding base — ✅ CONCLUÍDO
Plano: `docs/superpowers/plans/2026-05-16-fundacao-bloco1-scaffolding.md`

Todas as 9 tasks concluídas. Verificação: `tsc --noEmit` ✅ · `prisma validate` ✅ · `docker compose config` ✅ · git limpo ✅.

### Bloco 2 — Banco e libs — ✅ CONCLUÍDO (parcial: migration/seed pendentes)
Plano: `docs/superpowers/plans/2026-05-16-fundacao-bloco2-banco-libs.md`
- Schema Prisma: 3 enums + 5 models (`users`, `app_settings`, `audit_logs`, `password_reset_tokens`, `email_change_tokens`) ✅
- `src/lib/`: prisma, pg-pool, redis, encryption, audit, rate-limit ✅
- `prisma/seed.ts`: adaptado (sem Chatwoot, 4 settings Odoo) ✅
- `prisma generate`: client gerado, `tsc --noEmit` limpo ✅
- **Migration + seed**: PENDENTE — Docker não estava rodando. Executar quando Docker disponível:
  ```sh
  docker compose up -d db
  DATABASE_URL=$(grep '^DATABASE_URL' .env.local | cut -d= -f2-) npx prisma migrate dev --name init
  DATABASE_URL=$(grep '^DATABASE_URL' .env.local | cut -d= -f2-) npx prisma db seed
  ```

### Bloco 3 — Auth e RBAC — ✅ CONCLUÍDO
Plano: `docs/superpowers/plans/2026-05-16-fundacao-bloco3-auth.md`
- `src/auth.ts`, `src/auth.config.ts`: NextAuth v5 JWT ✅
- `src/middleware.ts`: proteção de rotas sem REDIRECT_MAP ✅
- `src/lib/auth-helpers.ts`: AuthUser sem accountIds/teamIds ✅
- `src/lib/permissions.ts`: RBAC sem funções Chatwoot ✅
- `src/lib/constants/roles.ts`: hierarquia 4 papéis ✅
- `src/types/next-auth.d.ts`: tipos de sessão ✅
- `src/app/api/auth/[...nextauth]/route.ts` ✅

### Bloco 4 — UI base e telas auth — ⬜ **PRÓXIMO — RETOMAR AQUI**
Plano ainda não criado. `framer-motion ^11.18.2` já adicionado ao `package.json` e instalado.

Arquivos a criar (fonte: nexus-insights, com adaptações de branding "Nexus Insights" → "Nexus Odoo"):
- `src/lib/theme.ts` — copiar verbatim
- `src/components/providers/theme-provider.tsx` — copiar verbatim
- `src/app/globals.css` — copiar verbatim (266 linhas)
- `src/app/layout.tsx` — title/description: "Nexus Odoo | Dados do ERP"
- `src/app/page.tsx` — copiar verbatim (redirect logic)
- `src/app/(auth)/layout.tsx` — copiar verbatim
- `src/app/(auth)/login/page.tsx` + `actions.ts` — adaptar título; actions sem alteração
- `src/components/login/login-content.tsx` — adaptar: título "Nexus Odoo", subtítulo "Dados do ERP"
- `src/components/ui/{button,input,label,sonner,password-input}.tsx` — copiar verbatim
- `src/app/(auth)/forgot-password/` — page.tsx + forgot-password-form.tsx
- `src/app/(auth)/reset-password/` — page.tsx + reset-password-form.tsx
- `src/app/(auth)/verify-email/` — page.tsx + verify-email-content.tsx (se necessário para rotas públicas)
- `src/app/api/user/theme/route.ts` — persistir tema (usa `prisma`)
- `src/app/api/health/route.ts` — retorna `{ok: true}`
- `public/` — logo placeholder (pode usar qualquer PNG 88×88 por ora)

Verificação do Bloco 4: `npx next build` passa; login renderiza via `npm run dev`.

### Blocos 5–6 — ⬜ não iniciados
5: telas protegidas (dashboard placeholder, usuários, perfil) · 6: worker + CI.

## PARA RETOMAR

1. `git checkout feat/fundacao` (já na branch).
2. Criar plano granular para o **Bloco 4** com double-check.
3. Executar Bloco 4, depois Blocos 5→6, em modo autônomo até concluir F1.
4. Ao fim do F1: verificação, PR `feat/fundacao` → `main`.
5. Executar migration/seed quando Docker estiver disponível (ver instruções no Bloco 2 acima).

## Notas

- `.env.local` existe na raiz (gitignored) com credenciais do Odoo e valores
  de desenvolvimento. **Se retomar em outra máquina**, recriar a partir do
  `.env.example` (a próxima sessão tem o conteúdo no histórico desta).
- Fonte de porte do F1: `nexus-insights` em
  `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`.
- `discovery/.venv` e `discovery/output/` são locais (gitignored).
- Workflow e decisões canônicas: `CLAUDE.md`.

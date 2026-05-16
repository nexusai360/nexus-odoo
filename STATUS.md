# STATUS — nexus-odoo

> Ponto de retomada entre sessões. Atualizado em 2026-05-16.
> Ao iniciar uma sessão: ler este arquivo e o `CLAUDE.md`. Modo autônomo.

## Onde estamos

- **F0 — Discovery do Odoo:** ✅ CONCLUÍDO, mergeado na `main` (PR #1).
- **F1 — Fundação:** ✅ CONCLUÍDA na branch **`feat/fundacao`**. **PR #2 aberto**
  (`feat/fundacao` → `main`): https://github.com/jvzanini/nexus-odoo/pull/2 —
  CI verde. Merge para `main` é decisão humana (dispara produção).
- **Pós-F1:** rodada de **ajustes de UI/UX da seção de usuários** em andamento,
  conduzida com o usuário comparando tela a tela com o `nexus-insights`.

## F1 — entregue (Blocos 1–6)

Auth + RBAC, shell protegido com sidebar, dashboard, CRUD de usuários, perfil,
worker BullMQ (scaffold) e CI. UAT funcional executado com banco real (login,
middleware, rotas protegidas, mutation). Planos em `docs/superpowers/plans/`,
reviews em `docs/superpowers/reviews/`.

## Ajustes pós-F1 já aplicados (commitados em `feat/fundacao`)

- Sidebar sem item "Perfil" duplicado (abre pelo nome do usuário).
- Dashboard com saudação personalizada.
- Seção de usuários reconstruída fiel ao nexus-insights: abas Usuários/Auditoria,
  badges de nível/status clicáveis, "(VOCÊ)", modal multi-step (2 etapas:
  Identidade + Confirmação), tabela com alinhamento/larguras corrigidos.
- **RBAC revisado** (regras do cliente): gerente gerencia usuários (cria/edita
  gerente e visualizador); visualizador não gerencia nada; admin de admin para
  baixo; **owner** edita/exclui qualquer usuário e nunca é excluído.
- Ícones de papel: super_admin=Crown, admin=ShieldCheck, manager=Shield,
  viewer=Eye. Botão X dos modais fiel ao original. Tooltip nos botões de ação.
- **Validação de duplicidade de e-mail**: `checkEmailAvailable` (modal de novo
  usuário valida no "Próximo"); `requestEmailChange` rejeita e-mail em uso.
- Correção de hydration mismatch do ícone de tema na sidebar.

## Decisões registradas

- **Etapa "Acesso" do modal de usuário: adiada.** O modal fica com 2 etapas.
  A parametrização de "o que cada papel/usuário acessa" depende dos recursos da
  F3 (relatórios) — será desenhada lá, com enforcement de "só concede o que
  você tem". Regras de RBAC do cliente já anotadas: ver commits e este arquivo.
- Camada de validações iniciada (e-mail duplicado). Outras validações podem
  surgir conforme o usuário valida as telas.

## Ambiente

- Docker: projeto `nexus-odoo` — containers `nexus-odoo-db-1` (Postgres, porta
  **5436**) e `nexus-odoo-redis-1` (Redis, porta **6380**). Se pararem:
  `docker compose up -d db redis`.
- Banco já migrado e com seed. Owner: `nexusai360@gmail.com` (credencial em
  `.env.local`). Migration inicial: `prisma/migrations/20260516080504_init`.
- Dev server: `npm run dev` (porta 3000). `.env.local` aponta para
  `localhost:5436` / `localhost:6380`.
- Verificação: `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npm test`.

## PARA RETOMAR (próxima sessão)

1. `git checkout feat/fundacao` (já na branch). Conferir `git log` recente.
2. Subir ambiente se necessário (`docker compose up -d db redis`, `npm run dev`).
3. Continuar os ajustes de UI/UX da seção de usuários conforme feedback do
   usuário (ele valida no browser e aponta divergências vs nexus-insights).
   Regra do projeto: usar a skill `ui-ux-pro-max` para qualquer ajuste de UI.
4. Quando o usuário aprovar visualmente: merge do PR #2 → `main` (humano).
5. Fase 2 (Ingestão/cache) começa com brainstorm — requer o usuário.

## Notas

- `.env.local` na raiz (gitignored) tem credenciais do Odoo e do owner.
- Fonte de porte de UI: `nexus-insights` em
  `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`.
- Workflow e decisões canônicas: `CLAUDE.md`.

# Frente B , Configuração de acesso aos menus por perfil (BRIEFING p/ construção)

> Worktree `feat/config-acesso-menus`, criada a partir da `main` (que já tem
> Diretoria + Nex + Configurações + Relatórios 2.0 mergeados). Objetivo: uma seção
> na tela **Configuração** (só super_admin) onde se define, POR PERFIL, quem vê
> cada menu da plataforma. Padrão visual = botões segmentados do Agente Nex.

## O que o usuário pediu (mensagens + 3 imagens)
- Imagem 1: o sidebar , menus **Dashboard, Diretoria, Relatórios, Relatórios 2.0**
  (área comum) e seção **ADMINISTRAÇÃO: Agente Nex, Usuários, Integrações, Configuração**.
- Imagem 2: o padrão de UI que ele gostou , tela "Disponibilidade" do Agente Nex,
  com cards e `SegmentedControl` (Desativado / Super Admin / Admin / Gerente / Visualizador).
- Imagem 3: a tela **Configuração** atual (só "Intervalos de sincronização").
- Ele quer: adicionar na tela Configuração uma seção para configurar, por perfil,
  o acesso a CADA menu (comum e administração), no mesmo padrão de botões segmentados.

## Estado atual do RBAC de menus (mapeado , fatos com arquivo:line)
- **Perfis:** enum `PlatformRole` = super_admin(4)/admin(3)/manager(2)/viewer(1),
  hierarquia em `src/lib/constants/roles.ts:12-17`. Nível de canal: enum
  `ChannelAccessLevel` = off/viewer/manager/admin/super_admin (`schema.prisma:146-152`).
- **Catálogo de menus:** `src/lib/constants/nav.ts:42-147` , cada `NavItem` declara
  `superAdminOnly?` ou `visibleTo?: PlatformRole[]` ESTÁTICOS. Dashboard/Relatórios
  (todos); Diretoria (dinâmico por capability); Relatórios 2.0 (dinâmico por perfil);
  Agente Nex (superAdminOnly); Usuários (flag); Integrações/Configuração (super_admin).
- **Filtro:** `filterNav` (`nav.ts:149-166`) só ESCONDE no client (`sidebar.tsx`
  visibleNav). A proteção REAL é server-side: redirect em cada `layout.tsx`/`page.tsx`
  (middleware só autentica). Ex.: `configuracao/page.tsx:16`, `relatorios-2/layout.tsx:14-19`.
- **Dois modelos de RBAC dinâmico já existem:**
  - Diretoria = capability POR USUÁRIO (tabela `user_diretoria_access`). Granularidade
    diferente (por usuário) , NÃO é o molde.
  - **Relatórios 2.0 = nível POR PERFIL** , 4 colunas `ChannelAccessLevel` no singleton
    `AgentSettings` (id="global"): `relatorios2MenuAccess/PaineisAccess/MeusAccess/
    ConstrutorAccess` (`schema.prisma:3220-3223`). Lógica em
    `src/lib/reports/acesso-relatorios2.ts` (`obterAcessoRelatorios2`, `podeAcessar`,
    `podeAcessarSubmenu`, `definirAcessoRelatorios2` com travas de coerência).
    **ESTE é o molde.**
- **Padrão visual (reusar):** `SegmentedControl` + `channelLevelOptions()`/
  `channelLevelDescription()` (`src/lib/agent/channel-level-options.ts:16-53`).
  Card de referência do agente: `src/components/agent/agent-availability-card.tsx`.
  Card JÁ EXISTENTE p/ menu: `src/components/configuracao/relatorios2-access-card.tsx`
  (montado em `configuracao/page.tsx:35-37`). A feature nova GENERALIZA isso.

## Proposta técnica (validar/ajustar antes de codar)
1. **Modelo de dados , tabela nova `menu_access` (não somar colunas ao AgentSettings):**
   `menu_access(menuKey TEXT PK, accessLevel ChannelAccessLevel, updatedAt)`. Uma linha
   por menu/submenu configurável. `menuKey` = slug estável (ex.: `dashboard`, `diretoria`,
   `relatorios`, `relatorios2`, `agente`, `usuarios`, `integracoes`, `configuracao`).
   Default por menu = o comportamento estático atual (seed idempotente). Migration formal.
2. **Camada de acesso , `src/lib/nav/menu-access.ts`:** `obterMenuAccess()` (lê a tabela,
   com defaults), `podeVerMenu(menuKey, user)` (compara rank do role vs nível; `off` só
   super_admin dono), `definirMenuAccess(menuKey, level)` (upsert + audit). Espelha o
   padrão de `acesso-relatorios2.ts`.
3. **Aplicar no sidebar (server):** `layout.tsx` resolve o mapa de acessos e passa ao
   Sidebar; `filterNav`/visibleNav passa a respeitar `menu_access` (mantendo os casos
   especiais já existentes: Diretoria por capability, Relatórios 2.0 por submenu).
   **Regra dura:** menus de ADMINISTRAÇÃO (Agente Nex, Usuários, Integrações, Configuração)
   têm piso , nunca abaixo de admin/super_admin conforme hoje (a config pode restringir
   mais, não afrouxar o que é sensível). Confirmar com o usuário o piso de cada um.
4. **Guarda de rota (server):** cada rota configurável revalida `podeVerMenu` e redirect
   (o sidebar só esconde). Reusar o padrão de `relatorios-2/layout.tsx`.
5. **UI , nova seção na tela Configuração** (`src/app/(protected)/configuracao/page.tsx`,
   já super_admin-only): um card "Acesso aos menus" listando cada menu com um
   `SegmentedControl` (Desativado/Super Admin/Admin/Gerente/Visualizador), no MESMO
   estilo do `relatorios2-access-card.tsx` e do agente. Agrupar por seção (Comum /
   Administração). `ui-ux-pro-max` OBRIGATÓRIO. Server action `definirMenuAccess`.
6. **Migração de continuidade:** o card atual de Relatórios 2.0 pode ser absorvido pela
   nova seção genérica (ou coexistir). Decidir com o usuário.

## Decisões a confirmar com o usuário antes/ durante a spec
- Piso de segurança dos menus de administração (não deixar super_admin se trancar fora).
- Menus configuráveis: todos os 8, ou só os "comuns" (Dashboard/Diretoria/Relatórios/
  Relatórios 2.0) + os de administração ficam fixos?
- Absorver o card de Relatórios 2.0 na seção nova ou manter separado.
- Granularidade: por PERFIL (proposta) , confirmar que não precisa por USUÁRIO.

## Fluxo de construção (protocolo do projeto)
spec (superpowers:brainstorming) → double-check spec (2x) → plan (writing-plans) →
double-check plan (2x) → execução TDD → UI com `ui-ux-pro-max` (inline) → migration
formal + validação em banco limpo → E2E dev local → PR. **NÃO mergear sem "sim".**
Ler `docs/runbooks/deploy-procedure.md` antes de qualquer deploy (mudança de schema =
migration formal idempotente).

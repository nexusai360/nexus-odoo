# Auditoria , overhaul (CONTINUAÇÃO para a próxima sessão)

> Branch: `feat/router-ativacao-r2` (worktree `branches/feat-router-ativacao-r2`).
> Localhost roda ESTA branch (`agente up` aqui). F5.1 + fix de login já estão em
> produção (PR #128). O trabalho de auditoria abaixo é LOCAL, ainda SEM PR.
> Ao retomar: ler este doc + `STATUS.md`/`HISTORY.md`. Continuar em modo autônomo.

## Contexto da demanda (usuário, 2026-06-18)
A tela de **Auditoria** (menu Usuários → aba Auditoria) e a tabela de **Usuários**
precisam de uma reformulação para uma auditoria COMPLETA. O usuário quer
"registrar TUDO que acontece na plataforma".

## JÁ FEITO nesta sessão (commitado nesta branch, validado no localhost, tsc/eslint verdes)
Arquivos: `src/components/users/audits-table.tsx`, `src/components/users/users-content.tsx`,
`src/lib/actions/users.ts`, `src/auth.ts`, `prisma/schema.prisma`.
- **Última atividade REAL** (substituiu "último acesso"):
  - Coluna `last_activity_at` adicionada ao model `User` (migração ADITIVA já
    aplicada no banco compartilhado via `prisma db execute`; `agente schema-changed`
    disparado , outras worktrees precisam sincronizar).
  - O callback `jwt` (`src/auth.ts`) atualiza `last_activity_at` a CADA requisição
    autenticada (page load, navegação, server action), com **throttle de 60s** e via
    `$executeRaw` (não bumpa `updated_at`).
  - `listUsers` retorna `lastActivityAt`; a coluna da tabela virou **"Última
    atividade"** com **segundos** (`dd MMM yyyy HH:mm:ss`) e mostra **"Nunca"** se nulo.
- **"Criado em"** também com segundos.
- **Filtro de Ação** (multi-select) na auditoria, ANTES do filtro de usuário:
  busca interna + checkboxes; tags **apagadas (neutras) quando não marcadas, acendem
  na cor da ação ao marcar**; "Limpar seleção". Agora lista **TODAS as ações**
  (`ALL_ACTIONS = Object.keys(ACTION_LABELS)`), não só as presentes nos dados.
- **Limpar** reposicionado ao lado da busca (padrão da tabela do Router) + a busca
  encolhe; aparece quando há busca OU filtro selecionado; limpa tudo.
- **Cores das ações repaginadas (sem cinza)** em `getActionBadgeClasses`: vermelho
  SÓ para falha/recusa (`login_failed`, `agent_permission_denied`,
  `whatsapp_inbound_rejected`); rose para remoção/revogação/desativação; e
  sky/amber/emerald/orange/fuchsia/teal/indigo/cyan/violet/pink por grupo.

## PENDENTE , o overhaul que o usuário quer (FAZER NA PRÓXIMA SESSÃO)
1. **Auditar MUITO mais eventos (instrumentação ampla).** Hoje só ~28 ações têm
   `logAudit`. Revisar o código e adicionar auditoria em todos os pontos relevantes:
   - acesso/visualização de relatórios e dashboards; exports;
   - mudanças de configuração (todas as telas de config/integrações);
   - ações do Agente Nex (perguntas, uso de tools, no in-app e WhatsApp) , avaliar o
     que faz sentido sem poluir;
   - login/logout, troca de sessão, etc. que ainda não logam.
   - Para cada evento novo: (a) acrescentar valor no enum `AuditAction` (Prisma +
     migração), (b) rótulo em `ACTION_LABELS`, (c) cor/categoria em
     `getActionBadgeClasses`, (d) chamar `logAudit` no ponto certo (ver
     `src/lib/audit.ts` e usos existentes).
2. **Recategorizar/agrupar** as ações na lista suspensa (cabeçalhos por categoria:
   Autenticação / Usuários / Perfil & E-mail / Configurações & Agente / Credenciais
   & API / ...) e fechar o CRITÉRIO de cor por categoria (documentar o critério).
3. **Alvo dissertativo e claro.** Hoje a coluna "Alvo" mostra `targetType` + o
   `targetId` cru (ex.: `User <uuid>`), e o usuário não entende. Trocar por uma
   frase legível: ex. "Usuário: Teste (teste@teste.com)", "Configuração: canal
   WhatsApp", etc., escondendo o ID técnico. Isso exige RESOLVER o nome amigável do
   alvo: enriquecer `listAuditLogs` (`src/lib/actions/audit-logs.ts`) para, a partir
   de `targetType`+`targetId`, buscar o nome de exibição (ex.: join no `users` quando
   `targetType="User"`), e um helper de formatação no componente. Definir um texto
   por `targetType`.
4. Depois: validar no localhost → APROVAÇÃO do usuário → PR → merge (#) → deploy
   (auto via Shepherd) → replicar nas outras branches.

## Onde mexer (mapa rápido)
- Tabela/again UI auditoria: `src/components/users/audits-table.tsx`
  (`ACTION_LABELS`, `ALL_ACTIONS`, `getActionBadgeClasses`, `ActionMultiSelect`,
  coluna "Alvo" ~ render de `r.targetType`/`r.targetId`).
- Action de dados: `src/lib/actions/audit-logs.ts` (`listAuditLogs`, `AuditLogRow`).
- Enum/labels: `AuditAction` no Prisma (`prisma/schema.prisma`) + `ACTION_LABELS`.
- Helper de log: `src/lib/audit.ts` (`logAudit`).
- Tabela usuários: `src/components/users/users-content.tsx`; action `src/lib/actions/users.ts`.

## Lembretes
- UI sempre com `ui-ux-pro-max` e inline (nunca delegar layout).
- Migrations: aditivas via `prisma db execute` + `agente schema-changed` (o
  `migrate dev` quebra por drift pré-existente). Regenerar `prisma generate`.
- Sem travessão "—" em nenhum texto.
- Validar tsc + eslint + jest; e2e quando aplicável.

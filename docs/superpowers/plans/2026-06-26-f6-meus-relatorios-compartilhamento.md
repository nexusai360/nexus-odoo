# F6 , "Meus relatórios": abrir/editar/compartilhar relatório (estudo + tasks)

> Pedido do usuário (2026-06-26). ESTUDO A FUNDO primeiro; implementar só depois.
> Migrations do F6 SEMPRE manuais. F6 só local até aprovação.

## Bugs imediatos (corrigir antes da feature grande)

**B1 , Abrir relatório aparece SEM TÍTULO.**
- Rota atual: `app/(protected)/relatorios/d/[savedId]`. A página renderiza o
  `ReportRenderer` (que mostra `entry.titulo`) , investigar por que o título
  some: (a) a página de view não exibe um header com o título salvo, ou (b) a
  ficha salva veio com `titulo` vazio. Provável (a): a page só desenha as seções.
  Ação: a tela de view do relatório deve ter um cabeçalho com o `titulo` do
  `SavedReport` (não só `entry.titulo`), criador e data.

**B2 , Sidebar destaca "Relatórios" (antigo) em vez de "Relatórios 2.0 > Meus
relatórios" ao abrir um relatório salvo.**
- Causa: a rota de view vive em `/relatorios/d/[savedId]` (prefixo `/relatorios`),
  então `isLeafActive`/`isGroupActive` casa o menu antigo.
- Ação: **mover a rota de view para `/relatorios-2/d/[savedId]`** (copiar a page +
  `carregar-relatorio-dinamico` reusa), atualizar os 2 links
  (`builder-workspace.tsx:60` e `relatorios-meus.tsx:59`) e, no
  `sidebar-active-path`, tratar `/relatorios-2/d/*` como pertencente ao submenu
  "Meus relatórios" (`/relatorios-2/meus`) para acender o item certo. Manter um
  redirect de `/relatorios/d/[savedId]` -> `/relatorios-2/d/[savedId]` (links
  antigos/salvos).

## Feature , Detalhe + edição + compartilhamento do relatório

### O que o usuário quer (transcrição)
- Em "Meus relatórios", clicar no card abre o relatório E permite:
  - **Editar o nome** do relatório.
  - **Ver informações**: quem criou (foto + nome + e-mail + tag de nível), data.
  - **Definir visibilidade de consumo** (quem pode ver/consumir):
    - **Privado** (só eu / o criador).
    - **Por nível**: escolher admin / gerente / visualizador. Ao escolher um
      nível, **marca automaticamente TODOS os usuários daquele nível**.
    - **Lista de usuários** (como lista de colaboradores): cada linha com
      **foto, nome, e-mail, tag do nível de acesso e checkbox** (já vem marcado
      conforme o nível escolhido). O criador desmarca individualmente quem não
      deve ver. "Atualizar permissões" salva.

### Dados (o que já existe e o que falta)
`SavedReport` já tem:
- `status SavedReportStatus` = `rascunho` (privado) | `publicado` (compartilhado).
- `visibilidadeConsumo String[]` (default []): **guardar aqui os userIds
  explicitamente liberados** a consumir o relatório.
- `criadoPor String @db.Uuid` (o criador).
- `titulo`, `entry`, `etag`, `atualizadoEm`.

Modelagem proposta (sem tabela nova , reusa `visibilidadeConsumo`):
- **Privado**: `status=rascunho` (ou `visibilidadeConsumo=[]`). Só `criadoPor` vê.
- **Compartilhado**: `status=publicado` + `visibilidadeConsumo = [userIds...]`.
  - A escolha "por nível" é só um ATALHO de UI que pré-marca os userIds daquele
    nível; o que persiste é a **lista final de userIds** (assim, desmarcar 1
    gerente é trivial e não quebra a semântica).
  - (Opcional v2: guardar também os níveis escolhidos para "auto-incluir novos
    usuários do nível" no futuro , decidir depois; v1 persiste só userIds.)
- O **criador sempre vê** o próprio relatório, independente da lista.

### Correlações / guardas
- **Leitura/consumo** (`carregar-relatorio-dinamico` + `listarMeus`/listagem de
  consumo): um usuário pode ver um `SavedReport` se
  `criadoPor === user.id` OU `user.id ∈ visibilidadeConsumo`. (super_admin: ver
  todos, como hoje no repo.)
- **Quem pode editar nome/visibilidade**: só o `criadoPor` (e super_admin).
- **Botão "Novo relatório" / criar**: já gated pelo acesso ao Construtor (Onda 4).
- A visibilidade do relatório é INDEPENDENTE do acesso ao menu/submenu (RBAC do
  menu controla quem vê a TELA; a visibilidade do relatório controla quem vê
  AQUELE relatório).

## Tasks (decompostas)

### Onda A , bugs de navegação/título
- [ ] A1. Criar `app/(protected)/relatorios-2/d/[savedId]/page.tsx` (reusa
      `carregarRelatorioDinamico`) com **cabeçalho**: título do SavedReport +
      criador (foto/nome) + data + (placeholder) botão "Compartilhar/Editar".
- [ ] A2. `builder-workspace` e `relatorios-meus` apontam para `/relatorios-2/d/`.
- [ ] A3. `sidebar-active-path`: `/relatorios-2/d/*` acende "Meus relatórios".
- [ ] A4. Redirect de `/relatorios/d/[savedId]` -> `/relatorios-2/d/[savedId]`.

### Onda B , repo + actions de compartilhamento
- [ ] B1. `saved-report-repo`: `renomear(id, userId, titulo)` (etag), 
      `definirVisibilidade(id, userId, {status, userIds})`, 
      `listarParaConsumo(user)` (criador OU em visibilidadeConsumo OU super_admin).
- [ ] B2. `lib/actions/saved-report.ts`: actions gated (criador/super_admin) para
      renomear + salvar visibilidade + obter detalhe (com dados do criador).
- [ ] B3. `lib/actions/usuarios-lista.ts` (ou reuso): lista de usuários
      `{id, name, email, avatarUrl, platformRole}` para o seletor (gated admin+).
- [ ] B4. Helper `usuariosDoNivel(level)` -> userIds (para o atalho "marca todos
      do nível"). Definir regra: "marca todos do nível X" = exatamente o nível
      (não herança) , confirmar com o usuário na implementação.

### Onda C , UI (ui-ux-pro-max)
- [ ] C1. Card de "Meus relatórios" clicável -> abre **painel/modal de detalhe**.
- [ ] C2. Painel de detalhe: título editável (inline), bloco "Criado por"
      (foto+nome+email+tag), data, link "Abrir relatório".
- [ ] C3. Seção "Quem pode ver": toggle Privado/Compartilhado; quando
      compartilhado, **chips de nível** (admin/gerente/visualizador) que
      pré-marcam, + **lista de usuários** (foto, nome, email, tag, checkbox).
      Buscar usuário na lista. "Atualizar permissões" salva.
- [ ] C4. Estado/empty/erros + toasts; refletir status (Privado/Compartilhado)
      no card de "Meus relatórios".

### Onda D , consumo + verificação
- [ ] D1. `carregar-relatorio-dinamico` / listagem de consumo respeitam
      `visibilidadeConsumo` (quem não está liberado recebe notFound).
- [ ] D2. E2E manual: criar relatório, compartilhar p/ um gerente específico,
      logar como ele e confirmar que vê; desmarcar e confirmar que some.
- [ ] D3. tsc + jest + lint verdes.

## Decisões a confirmar na implementação
- "Marcar todos do nível" = só aquele nível, ou nível + acima? (provável: só o
  nível, com herança opcional).
- v1 persiste userIds (sem auto-incluir novos do nível). v2 pode guardar níveis.
- Detalhe em modal vs página dedicada (`/relatorios-2/meus/[id]`). Provável modal.

## Estado
- Planejado. Bugs A1-A4 são o ponto de partida natural. Não iniciar a feature C
  sem a Onda A (navegação/título) pronta.

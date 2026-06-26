# F6 , HANDOFF: pendências do construtor (retomar AQUI na nova sessão)

> **ATUALIZAÇÃO 2026-06-26 (sessão seguinte): P1, P2 e P3 ENTREGUES e commitados
> com TDD (tsc 0; 371+ testes verdes). Detalhes no topo do `STATUS.md`. Falta só a
> validação na UI pelo usuário (`/relatorios-2/construtor` e `/relatorios-2/meus`)
> e o E2E do chat contra o LLM pela sessão logada. F6 segue só local.** Itens abaixo
> mantidos como registro do que foi pedido.

> Usuário frustrado: "nada do que pedi foi feito devidamente". Várias coisas
> ficaram pela metade ou não pegaram (hot-reload do dev velho mascarou). 
> **AÇÃO 1 da nova sessão: `npm run dev:fresh` ANTES de validar qualquer coisa**
> (o hot-reload falhou várias vezes; código novo não aparecia). F6 só local.

## Contexto rápido
- Branch `feat/nex-reconstrucao`. Construtor vive em **Relatórios 2.0 > Construtor**
  (`/relatorios-2/construtor`). Tela = `BuilderWorkspace` (chat + preview).
- Componentes do chat: `src/components/reports/builder/builder-chat.tsx`,
  `builder-preview.tsx`, `builder-workspace.tsx`, `report-renderer.tsx`.
- Nex (referência a COPIAR): `src/components/agent/chat-panel.tsx`,
  `agent-message.tsx`, `message-input.tsx`, `attach-menu.tsx`, `audio-recorder.tsx`.

## PRIORIDADE 1 , Chat do construtor TEM que ser IGUAL ao Agente Nex
O usuário repetiu isso várias vezes. Hoje o chat do construtor é uma casca
simplificada. Precisa REUSAR/ADAPTAR os componentes do Nex (`ChatPanel`/
`AgentMessage`). Itens exatos pedidos:
- [ ] **Mensagens PERSISTEM** (HOJE NÃO , some ao recarregar). Precisa salvar a
      conversa do construtor (tabela relacional, como o Nex salva conversa/
      mensagens). Carregar ao abrir. Investigar como o Nex persiste
      (`conversation` / `conversation-messages`) e replicar p/ o construtor.
- [ ] **Animação de "pensando" mostrando QUAIS FERRAMENTAS** estão sendo
      consultadas (steps por tool_call), igual ao Nex (não os 3 pontinhos atuais).
- [ ] **Menu de 3 pontinhos** no topo: **Limpar conversa** + **Baixar conversa
      TXT** (copiar do header do `ChatPanel`/bubble do Nex).
- [ ] **Indicador de DATA flutuante** (16/06 -> regra hoje/ontem ao rolar) +
      **seta "ir pro fim"** (scroll-to-bottom FAB). Copiar do `ChatPanel`.
- [ ] **Por mensagem** (igual `AgentMessage`): nº de **tools chamadas**, botão
      **copiar**, **timestamp (dd/mm/aaaa hh:mm)**, **duração em segundos** da
      montagem.
- [ ] "Construa com o **Agente** Nex" (A maiúsculo) , JÁ FEITO (commit f2f901e).
- Estratégia recomendada: o `runBuilder` já retorna `{ficha, mensagem}`; estender
  para retornar também `toolsCalled`/`reasoningMs`/duração (como o `run-agent`
  faz, ver `RunAgentResult`), e a action `construirRelatorio` repassar. Reusar
  `AgentMessage` para render. Persistir via uma tabela de conversa do construtor.

## PRIORIDADE 2 , Bugs de navegação/preview (parcial)
- [ ] **Abrir relatório destaca o menu "Relatórios" ANTIGO** em vez de
      "Relatórios 2.0 > Meus relatórios". Mover a rota de view
      `app/(protected)/relatorios/d/[savedId]` -> `app/(protected)/relatorios-2/d/[savedId]`,
      atualizar links (`builder-workspace.tsx:~60`, `relatorios-meus.tsx:~59`),
      e em `src/lib/utils/sidebar-active-path.ts` fazer `/relatorios-2/d/*`
      acender "Meus relatórios". Redirect do caminho antigo.
- [x] **Título "sem título"**: era cor hardcoded `text-slate-900` (sumia no dark);
      trocado por `text-foreground` (commit 6c5a04c). VALIDAR com dev:fresh.
- [x] **Preview vazio / erro de key**: agora deriva colunas das chaves do dado
      quando o agente não define `config.colunas` (commit f2f901e). VALIDAR.
- [ ] A tela de view do relatório deve ter **cabeçalho** (título do SavedReport +
      criador + data), não só as seções.

## PRIORIDADE 3 , Meus relatórios: abrir/editar/COMPARTILHAR
Plano completo já escrito em
`docs/superpowers/plans/2026-06-26-f6-meus-relatorios-compartilhamento.md`
(modelagem usa `SavedReport.status` + `visibilidadeConsumo[]` + `criadoPor`,
sem tabela nova). Resumo: clicar no card abre detalhe; editar nome; ver criador
(foto/nome/email/tag); definir visibilidade Privado / por nível (admin/gerente/
visualizador marca todos do nível) / lista de usuários com foto+nome+email+tag+
checkbox p/ incluir/remover individualmente; "Atualizar permissões" salva em
`visibilidadeConsumo`. Guard de consumo respeita a lista.

## O que JÁ foi entregue (commitado) , não refazer
- Menu "Relatórios 2.0" + submenus (Painéis em branco, Meus, Construtor), via
  constant `RELATORIOS2_*`. RBAC dinâmico do menu (campos `relatorios2_*_access`
  em AgentSettings; trava só Meus<-Construtor; ícones acendem; sem spinner).
- Config do construtor em Agente>Configuração: card "Configuração do LLM"
  (provider/modelo c/ busca/chave, padrão router, colapsável) + Recursos
  (Raciocínio reusando ReasoningCard com custo/consumo, Áudio, Anexo; 2 estados).
- Composer reusa MessageInput+AttachMenu+AudioRecorder (áudio grava).
- Default de modelo da plataforma = gpt-5.4-mini onde era caro/vazio.
- Migrations manuais aplicadas: builder_model_credential, builder_recursos,
  relatorios2_acesso (+ builder_model_config, f6_saved_report). SEMPRE manual.

## Verificação atual
- tsc 0; jest builder verde; E2E real do runBuilder OK (8/8 com fonte, recusa ok)
  com gpt-5.4-mini + raciocínio ligado.
- **Mas a UI do chat NÃO está no padrão Nex e mensagens NÃO persistem** , é o
  grosso do trabalho da próxima sessão (Prioridade 1).

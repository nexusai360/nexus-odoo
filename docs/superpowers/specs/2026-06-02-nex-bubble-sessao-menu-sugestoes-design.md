# Nex Bubble: persistência de sessão, menu consolidado e sugestões por domínio

> Spec de feature. Fase de continuação da F5 (Agente Nex in-app).
> Worktree/branch: `feat/agente-nex-bubble-ux`.
> Status: v3 (pós duas reviews adversariais). Autor: sessão autônoma 2026-06-02.

## 1. Objetivo

Tornar a conversa da bubble do Agente Nex **persistente e contínua** para o
usuário (sobrevive a fechar a bubble, F5 e logout/login), consolidar o **menu
de três pontinhos** em ações claras, e garantir que as **sugestões iniciais**
sejam coerentes com os **domínios de acesso** do usuário (quem vê faturamento
recebe perguntas de faturamento; quem vê estoque, de estoque).

Três frentes independentes, uma base comum (a bubble e o cache de conversas
que já existem). Cada frente é verificável isoladamente.

## 2. Estado atual (resumo do código)

- **Bubble:** `src/components/agent/agent-bubble.tsx` (FAB + estado do
  `conversationId`) monta `ChatPanel` (`src/components/agent/chat-panel.tsx`).
- **Montagem server:** `src/app/(protected)/layout.tsx:89-97` renderiza
  `<AgentBubble>` e computa as props (`isSuperAdmin`, `personalizedWelcome`,
  `maxSuggestions`, `audio/imageInputEnabled`).
- **Persistência:** modelos `Conversation` + `Message` no Postgres. As
  mensagens são gravadas a cada turno pelo `/api/agent/stream`. O `ChatPanel`
  recarrega o histórico do banco ao abrir (`getConversationMessages`).
  **Gap:** o `conversationId` vive só na memória do FAB
  (`agent-bubble.tsx:67-69`); após F5/logout o ponteiro some, então a conversa
  não é reencontrada no login seguinte. `Conversation` **não tem** campo de
  status/arquivamento.
- **Menu (`chat-panel.tsx:727-795`):** três itens. "Limpar histórico"
  (`handleClear`, só zera a UI, não toca no banco, sempre visível); "Baixar
  relatório (.txt)" (super_admin only, `exportConversationReport`); "Encerrar
  sessão" (`onEndSession` → `setConversationId(null)`).
- **Sugestões:** `src/lib/agent/welcome-suggestions.ts`
  (`pickWelcomeByRole` por role + `WELCOME_SUGGESTIONS` fallback) combinadas no
  layout com `getPersonalizedWelcomeSuggestions(userId, max)`
  (`src/lib/agent/personalized-suggestions/`, por histórico de uso de tools).
  **Gap:** a âncora por role pode sugerir perguntas de domínios que o usuário
  **não** tem acesso; não há filtro por domínio permitido.
- **Domínios (RBAC v2):** enum `ReportDomain`
  (`cadastros, comercial, contabil, crm, estoque, financeiro, fiscal`).
  `getMyDomains()` / `getUserDomains(userId)` em
  `src/lib/actions/domain-access.ts` resolvem os domínios; super_admin/admin
  recebem **todos**. `seesAll(role)` é o gate rápido.

## 3. Decisões tomadas (com o usuário)

1. **Limpar sessão = arquivar + iniciar nova** (soft delete). A conversa
   anterior fica salva no Postgres (auditoria/log da F5); o usuário vê a tela
   limpa. Nada é apagado fisicamente.
2. **Sugestões = por domínios permitidos do RBAC v2** como base determinística.
   A camada por histórico (`getPersonalizedWelcomeSuggestions`) permanece e
   refina por cima, mas **só com perguntas de domínios acessíveis**.
3. **Botão único de limpeza:** "Limpar sessão" com ícone de lixeira, para
   todos. "Limpar histórico" é removido. "Baixar relatório (.txt)" vira
   "Baixar conversa (.txt)" (segue super_admin only).
4. A bubble **não abre sozinha** ao logar; abre fechada e, ao ser aberta, já
   mostra a conversa anterior.

## 4. Frente 1, persistência cross-login

### 4.1 Schema (migration)

Adicionar a `Conversation`:

```prisma
/// Quando a conversa foi encerrada/arquivada pelo usuário ("Limpar sessão").
/// null = conversa ativa. Conversas arquivadas não são reabertas, mas
/// permanecem no banco para auditoria/log e exportação.
endedAt   DateTime?  @map("ended_at")

@@index([userId, channel, endedAt, updatedAt])
```

Migration nova em `prisma/migrations/`. Schema compartilhado: exige rebuild
`app`+`mcp`+`worker` no dev e aviso `agente schema-changed` às outras
worktrees (ver §9).

### 4.2 Resolver a conversa ativa no boot

Nova server action `getActiveConversationId()` em
`src/lib/actions/active-conversation.ts`:

- Auth via `getCurrentUser()`; sem usuário → `{ ok: false }`.
- Busca a `Conversation` mais recente do usuário com `channel = in_app` e
  `endedAt = null` (`orderBy updatedAt desc`, `take 1`).
- Retorna `{ ok: true, conversationId: string | null }` (null = usuário sem
  conversa ativa).

O `(protected)/layout.tsx` chama essa action (server) e passa
`initialConversationId` para `<AgentBubble>`. O FAB inicializa
`useState(initialConversationId)` em vez de `null`. Nenhuma mensagem é
carregada enquanto a bubble está fechada; ao abrir, o fluxo atual
(`getConversationMessages`) carrega o histórico.

### 4.3 Comportamento

- Fechar a bubble (X): inalterado (já preserva o id; agora o id também
  sobrevive ao reload porque é re-resolvido do banco no próximo boot).
- F5 / logout-login: o layout re-resolve o `initialConversationId` do banco →
  a conversa continua.

## 5. Frente 2, menu de três pontinhos

### 5.1 Itens finais (em ordem)

| Item | Ícone | Visível para | Ação |
|---|---|---|---|
| Baixar conversa (.txt) | `Download` | super_admin | `exportConversationReport` (inalterado, só o rótulo muda) |
| Limpar sessão | `Trash2` | todos | arquiva a conversa ativa + zera a UI + volta ao welcome |

"Limpar histórico" é **removido** por completo.

### 5.2 "Limpar sessão"

Nova server action `archiveActiveConversation(conversationId)` em
`src/lib/actions/active-conversation.ts`:

- Auth via `getCurrentUser()`.
- Valida ownership (`conv.userId === user.id`); conversa inexistente ou de
  outro dono → `{ ok: false, error }`.
- Se a conversa já está arquivada (`endedAt != null`) → no-op idempotente
  (`{ ok: true }`).
- `update endedAt = now()`. Retorna `{ ok: true }`.

No `ChatPanel`, o handler do botão:
1. Fecha o menu.
2. Se há `conversationId` ativo, chama `archiveActiveConversation(id)`
   (se não houver id ainda, pula a chamada de banco).
3. Aborta streaming em andamento, zera `messages`, zera o id interno
   (reaproveita a lógica de `handleClear`).
4. Chama `onEndSession()` → o FAB faz `setConversationId(null)`.
5. `showWelcome` volta a `true` (lista vazia) → tela inicial.

A próxima mensagem do usuário cria uma `Conversation` nova (fluxo atual do
`done` do SSE, que seta `onConversationCreated`).

### 5.3 Renomeações

- Rótulo "Baixar relatório (.txt)" → **"Baixar conversa (.txt)"**
  (`chat-panel.tsx`). A server action `exportConversationReport` e o nome do
  arquivo gerado permanecem.
- A prop `onEndSession` continua existindo (semântica: "limpar sessão");
  comentários internos atualizados para refletir o novo nome.

## 6. Frente 3, sugestões iniciais por domínio permitido

### 6.0 Fonte única de verdade (decisão da review)

Já existe `TOOL_TO_QUESTION` em
`src/lib/agent/personalized-suggestions/templates.ts`: o mapa canônico
`tool id -> pergunta`, e o prefixo do tool id já indica o domínio
(`estoque_*`, `financeiro_*`, `fiscal_*`, `comercial_*`, `cadastro_*`,
`contabil_*`). **Não criar um catálogo paralelo hardcoded** (divergiria com o
tempo). O catálogo de sugestões por domínio é **derivado** dessa fonte.

**Cobertura real (verificada contra o catálogo de tools):** estoque, financeiro,
fiscal, comercial e cadastros têm boa cobertura; contábil tem poucas; **crm não
tem tool nenhuma**. Decisão: as sugestões iniciais cobrem só domínios com
capacidade real. **crm fica de fora** (sugerir pergunta de crm viraria resposta
de "não sei"). Um usuário cujo único domínio é crm cai no fallback por role.

> Nota de mapeamento importante: "Quanto faturamos no mês corrente?" pertence ao
> domínio **fiscal** (`fiscal_faturamento_periodo`), não a financeiro. O acesso a
> faturamento vem do domínio `fiscal`. O mapa tool→domínio é a verdade, não a
> intuição de negócio.

### 6.1 Mapa tool → domínio

Novo `TOOL_DOMAIN: Readonly<Record<string, ReportDomain>>` em
`templates.ts` (ao lado de `TOOL_TO_QUESTION`), associando cada tool id ao seu
`ReportDomain`. Mapa explícito (não parsear prefixo em runtime) para robustez e
para o caso de tools cujo prefixo não bate com o enum. Toda tool em
`TOOL_TO_QUESTION` tem entrada aqui; tools sem domínio mapeado são ignoradas nas
sugestões por domínio.

### 6.2 Builder domain-aware

Nova função pura `pickWelcomeByDomains(allowedDomains, role, max)` em
`welcome-suggestions.ts`:

- `allowedDomains: ReportDomain[]` (de `getMyDomains()`/`getUserDomains`);
  super_admin/admin vêm com todos.
- Deriva, de `TOOL_TO_QUESTION` + `TOOL_DOMAIN`, as perguntas das tools cujos
  domínios estão em `allowedDomains`.
- Intercala entre os domínios do usuário (round-robin) para variedade,
  priorizando ordem de negócio (fiscal/financeiro/comercial → estoque →
  cadastros → contábil). Cap em `max` (1..5). Dedup por texto.
- Fallbacks: nenhuma pergunta elegível (ex.: só crm) ou `allowedDomains` vazio
  → `pickWelcomeByRole(role)`; este por sua vez cai em `WELCOME_SUGGESTIONS`.

`pickWelcomeByRole` e `WELCOME_SUGGESTIONS` são **mantidas** como fallback.

### 6.3 Filtro das personalizadas por domínio (não por string)

A review apontou que filtrar as personalizadas por igualdade de string seria
ingênuo. Como as personalizadas são geradas a partir de **tool ids** (via
`TOOL_TO_QUESTION` em `pick.ts`), o filtro correto é **por domínio da tool de
origem**, não pelo texto:

- A seleção de personalizadas passa a descartar toda tool cujo `TOOL_DOMAIN`
  não esteja em `allowedDomains`. Implementar filtrando os tool ids antes de
  mapear para pergunta (em `pick.ts` ou na borda do layout), garantindo
  exatidão (mesma fonte que gera a pergunta decide o domínio).
- Resultado: uma personalizada nunca vaza domínio sem acesso, e o match é
  determinístico (id, não texto).

### 6.4 Integração no layout

`(protected)/layout.tsx`:

- Reusar a resolução de domínios já feita para `canUseAgent`
  (`seesAll(role) ? todos : getUserDomains(user.id)`) para obter
  `allowedDomains`.
- Trocar a âncora `pickWelcomeByRole(role)` por
  `pickWelcomeByDomains(allowedDomains, role, max)`.
- Passar `allowedDomains` para a camada de personalizadas (filtro §6.3). Manter
  a regra de merge atual (âncora[0] primeiro, intercala personalizadas, dedup)
  intacta, só trocando a origem da âncora e filtrando as personalizadas.

### 6.5 Garantia pedida pelo usuário

Resultado determinístico e auditável: dado o conjunto de domínios do usuário, as
sugestões iniciais (âncora + personalizadas) só contêm perguntas de tools desses
domínios. Coberto por teste unitário (§8).

## 6bis. Consistência do `endedAt` no sistema (achados da review)

Arquivar não pode ser "meia-arquivação": uma conversa com `endedAt != null` não
pode ser reaberta nem por outra aba, nem por outro canal. Mudanças obrigatórias
além das duas actions novas:

1. **`/api/agent/stream` bloqueia conversa arquivada.** Ao receber um
   `conversationId`, além da validação de ownership atual, recusar com 403 se
   `endedAt != null` (a aba órfã não ressuscita a conversa; o cliente trata o
   403 iniciando conversa nova). Local: rota de stream / onde a conversa é
   carregada antes de `runAgent`.
2. **`getConversationMessages` ignora arquivada.** Passa a exigir
   `conversation: { endedAt: null }` no where (a bubble nunca recarrega uma
   conversa limpa). O `exportConversationReport` do super_admin **continua**
   podendo ler por id (inclusive arquivada), pois é auditoria.
3. **WhatsApp não reaproveita arquivada.** `getOrCreateWhatsappConversation`
   (`src/lib/agent/conversation.ts`) adiciona `endedAt: null` ao `findFirst` da
   janela de reuso, senão "Limpar sessão" no in-app poderia colidir com a
   janela de 24h do WhatsApp.

**Política de dados derivados (quality, router decisions, topicTags):** arquivar
**não apaga** nada. Métricas e auditoria de conversas arquivadas permanecem
válidas e visíveis no monitoramento (são histórico real). Não há filtro
`endedAt` nas telas de monitoramento. `title` da conversa é preservado. Esta é
a decisão explícita (alternativa ao cascade delete), coerente com "arquivar, não
deletar".

## 7. Edge cases

- Usuário sem conversa ativa: `initialConversationId = null`, welcome normal.
- Conversa ativa cujo histórico falha ao carregar: toast de erro (fluxo atual),
  welcome não é forçado.
- "Limpar sessão" sem id ainda (welcome, zero mensagens): só zera UI, sem
  chamada de banco.
- Arquivar conversa de outro usuário: bloqueado por ownership.
- super_admin/admin: `allowedDomains` = todos → sugestões de alto impacto no
  topo, sem filtro restritivo.
- viewer/manager com 1 domínio: sugestões 100% daquele domínio.
- Falha de Redis/DB nas personalizadas: cai no catálogo por domínio (já é o
  comportamento de fallback).

## 8. Testes

- **Unit `welcome-suggestions`:** `pickWelcomeByDomains`
  - 1 domínio (ex.: estoque) → só perguntas de tools daquele domínio, capado em
    `max`.
  - múltiplos domínios → intercala, respeita prioridade de negócio, dedup.
  - **só crm (sem tools)** → cai em `pickWelcomeByRole` (não inventa pergunta).
  - `allowedDomains` vazio → cai em `pickWelcomeByRole`.
  - todos os domínios (super_admin) → inclui faturamento (fiscal) no topo.
  - **integridade do mapa:** toda tool de `TOOL_TO_QUESTION` tem entrada em
    `TOOL_DOMAIN` (teste que falha se alguém adicionar tool sem domínio).
- **Unit filtro de personalizadas:** dada lista de tool ids e `allowedDomains`,
  descarta tools de domínio sem acesso (ex.: usuário só estoque não recebe
  personalizada de tool fiscal).
- **Unit actions:** `getActiveConversationId` (sem auth, sem conversa, com
  conversa `in_app` ativa, ignora arquivadas e ignora outros canais) e
  `archiveActiveConversation` (ownership, idempotência quando já arquivada, set
  `endedAt`). Seguem o padrão de `domain-access.test.ts`.
- **Unit stream guard:** `/api/agent/stream` com `conversationId` de conversa
  arquivada → 403 (não grava Message).
- **E2E manual (regra de raiz §9 do CLAUDE.md):** subir o app, 4 perfis
  (super_admin; viewer só estoque; viewer só financeiro; manager):
  - sugestões coerentes com o domínio de cada perfil;
  - enviar mensagem, fechar (X) e reabrir → histórico presente;
  - logout e login → histórico presente ao abrir a bubble;
  - "Limpar sessão" → arquiva (confere `ended_at` no banco), zera UI, volta ao
    welcome; nova mensagem cria conversa nova;
  - "Baixar conversa (.txt)" aparece só para super_admin e baixa o arquivo.

## 9. Impacto e operação

- **Migration** (`endedAt`): schema compartilhado. Rebuild dev
  `app`+`mcp`+`worker` (rebuildar via `docker compose build app`, ver armadilha
  do worker no CLAUDE.md §2.1). Rodar `agente schema-changed` após a migration
  e recomendar fechar o PR rápido para reduzir divergência com as outras
  worktrees.
- **Containers afetados:** mudança em `prisma/schema.prisma` → todos; mudança
  em `src/**` (componentes/actions/lib) → `app`.
- **Multi-agente:** registrar em `docs/agents/HISTORY.md`. Não tocar a worktree
  `feat/router-ativacao-r2`.

## 10. Fora de escopo (YAGNI)

- Listagem/retomada de conversas antigas arquivadas (histórico multi-conversa
  na UI). Só a conversa ativa é restaurada.
- Personalização por `UserAgentProfile.preferredDomains` (camada futura; o
  gancho fica pronto via `allowedDomains`).
- Mudanças visuais além das descritas (cores, tamanho da bubble, animações).
- Exportação para admin (segue super_admin only).

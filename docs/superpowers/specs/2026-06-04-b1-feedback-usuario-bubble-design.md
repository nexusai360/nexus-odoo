# B1 · Feedback do usuário na bubble do Agente Nex

> Spec de design. Sub-projeto **B1** de "Monitoramento Bubble + Aprendizado"
> (B1 captura → B2 monitoramento → B3 aprendizado).
> Data: 2026-06-04. **Status: v3** (reviews profundas #1 e #2 aplicadas; pronta para PLAN).
> Brainstorm validado no companion visual (`feedback-v4.html`), aprovado pelo usuário.

---

## 1. Contexto e objetivo

O Agente Nex (chat in-app) só tem avaliação automática (juiz LLM →
`ConversationQualityEvaluation`). Falta o sinal do **próprio usuário** sobre a resposta.

B1 entrega a **captura do feedback dentro da bubble**: passando o mouse na mensagem da
IA, o usuário classifica a resposta em 4 níveis e, quando cabível, escreve em uma frase o
que aconteceu. Persistido com **histórico de alterações**, alimenta:
- **B2** (monitoramento): voto por mensagem/sessão/usuário + percentuais.
- **B3** (aprendizado): cruzar feedback do usuário com a avaliação automática e abastecer
  a autocorreção do agente.

Escopo de B1: **captura + persistência + propagação do id da mensagem + checkpoint + UI
de admin do checkpoint**. Inclui ajuste pontual: timestamp da bolha da IA para a direita.

---

## 2. Escopo

### Dentro (B1)
1. Controle de avaliação na bolha da IA (canal `in_app`), 4 classificações.
2. Campo de comentário opcional (≤100 chars) para Parcial/Errado/Alucinou.
3. Voto vigente (último vale) + histórico append-only de alterações.
4. Voto otimista no clique (independe do comentário).
5. **Propagar o id real (de banco) da mensagem do assistant até a UI** (pré-requisito do
   voto ao vivo; §7.1): toca `run-agent`, `RunAgentResult`, SSE `done`, `chat-panel`.
6. Re-exibir o voto vigente ao reabrir a bubble (badge fixado).
7. Checkpoint `feedbackCheckpoint` (read público + write de admin completos) + UI de admin.
8. Timestamp da bolha da IA: esquerda → direita.

### Fora (B2/B3/F5/fase 2)
- Visualização do feedback em monitoramento (B2); cruzamento e autocorreção (B3).
- Reação por emoji no WhatsApp (F5; reusa via `Conversation.channel`).
- Feedback no playground (canal `playground`, modelo `PlaygroundMessage` distinto).
- **Reveal por toque (touch).** B1 é **hover-only**, idêntico ao botão copiar atual (que
  já é `group-hover` puro). Não há regressão: hoje, em touch, o copiar também não aparece.
  Tap/long-press é fase 2 (evita conflito com o gesto de scroll do chat e estado por
  mensagem — ver decisão #10).

---

## 3. As 4 classificações

Eixo **do usuário**, distinto do `EvalStatus` do juiz.

| Classificação | Enum | Cor | Ícone (Lucide) | Abre campo? |
|---|---|---|---|---|
| Correto | `CORRETO` | emerald `#10b981` | `Check` | Não |
| Parcial | `PARCIAL` | amber `#f59e0b` | `Contrast` | Sim |
| Errado | `ERRADO` | red `#ef4444` | `X` | Sim |
| Alucinou | `ALUCINOU` | violet `#8b5cf6` | `Ghost` | Sim |

Gatilho "avaliar": `Gauge`. Todos os ícones são de `lucide-react` (consistência com
`Check`/`X`/`Copy`/`Database` já usados em `agent-message.tsx`). Tamanho `h-3 w-3` no
gatilho/badge (padrão dos botões da casa); `h-4 w-4` nos ícones da paleta aberta.

> **Cor (review):** mapa do juiz em `src/components/agent/monitoramento/evaluations-table.tsx:63-75`
> é CORRETO=emerald, PARCIAL=amber, ERRADO=red, FORA_DO_ESCOPO=slate, PENDENTE=sky,
> FALHA_TECNICA=violet. emerald/amber/red coincidem; o **violet de ALUCINOU colide com
> FALHA_TECNICA** do juiz. Mantemos o roxo (escolha do usuário), mas é **eixo diferente**:
> B2/B3 separam os dois eixos visualmente e **nunca** mapeiam ALUCINOU↔FALHA_TECNICA pela
> cor. Não afirmar "cor reaproveitada do juiz" para o 4º item.

---

## 4. UX validada (referência `feedback-v4.html`)

Tokens reais: bolha IA `bg-muted` (#27272a), `rounded-xl`, `text-sm`; botões iguais ao
copiar (`h-6 w-6 rounded-md border border-border bg-background`, ícone `h-3 w-3`);
animações `framer-motion` + `useReducedMotion`.

**Reuso de componentes existentes:**
- `src/components/ui/tooltip.tsx` (base-ui; `Tooltip`/`TooltipTrigger`/`TooltipContent`/
  `IconButtonWithTooltip`) para os rótulos das opções.
- `src/components/ui/feature-checkpoint.tsx` (+ `src/components/agent/resource-card.tsx`)
  para o controle 3-estados na admin (§7.4).
- **NÃO reusar** `expandable-textarea.tsx` (é o de tela cheia com `Maximize2`+`Dialog`).
  O `textarea.tsx` base não tem auto-grow → o campo que cresce para baixo (1→2 linhas) é
  **lógica nova de auto-resize inline** no `FeedbackControl`.
- A paleta horizontal com stagger é custom.

### Fluxo
1. **Hover na bolha da IA** revela copiar (canto superior direito, existente) + avaliar/
   `Gauge` (canto inferior direito, novo), espelhados.
2. **Clique no gatilho** abre a paleta deslizando direita→esquerda, 4 ícones em stagger
   (~40ms). Ordem da direita (colado no gatilho) p/ esquerda: **Correto → Parcial →
   Errado → Alucinou**.
3. **Hover/focus em cada ícone** mostra `Tooltip` com o rótulo. Ícones contornados,
   coloridos pela cor da classificação. `aria-label` por ícone.
4. **Clicar numa classificação:** grava o voto na hora (otimista); paleta recolhe; o
   **badge escolhido fixa no canto inferior direito**, quadrado **preenchido sólido**
   (cor + ícone branco `h-3 w-3`). Correto encerra; Parcial/Errado/Alucinou abrem o campo
   (sanfona, revelando direita→esquerda, largura da bolha).
5. **Campo de comentário** (compacto): cabeçalho 1 linha (mini-ícone sólido + `Label:` +
   orientação); textarea auto-resize (até ~2 linhas), `maxlength=100`, contador `x/100`;
   **Enviar** (avião roxo `#7c3aed`) + **×** que fecha só o comentário sem desfazer o voto.
   Orientações e placeholders exatos (do companion aprovado):
   | Rating | Orientação (cabeçalho) | Placeholder do campo |
   |---|---|---|
   | Parcial | "o que acertou, o que errou e qual era a resposta certa." | "Ex: acertou o total, mas não listou os negativos." |
   | Errado | "o que saiu errado e qual era a resposta certa." | "Ex: o saldo certo era 8 unidades, não 12." |
   | Alucinou | "o que aconteceu? Descreva em detalhes." | "Ex: citou um modelo que não existe no catálogo." |
6. **Trocar o voto:** clicar no badge reabre a paleta; outra classificação atualiza o
   vigente (último vale) e registra a alteração no histórico. Ao trocar para um rating
   com campo (ex.: Parcial→Errado), **o campo reabre vazio** (o comentário anterior foi
   descartado do vigente; permanece só no histórico — decisão #4).
7. **Click-away:** clicar fora fecha a paleta (e o campo, se aberto sem envio); o voto
   gravado permanece.

### Coexistência timestamp + badge
Badge/gatilho **fora** da bolha (canto inferior direito); timestamp **dentro**, à direita.
Copiar fica no topo-direito; badge na base; não colidem (validado no `feedback-v4`;
reconfirmar no componente React real na verificação).

### Não perder o voto (regra de raiz)
Clicou → grava na hora. Digitou e enviou → atualiza com texto. Não digitou / fechou no
× / click-away → registro fica só com a classificação.

---

## 5. Modelo de dados (Prisma)

Migration: 2 enums + 2 models + 1 coluna em `agent_settings`. Schema compartilhado →
`agente schema-changed` na execução (§10). Convenções (confirmadas): PK/FK `String
@db.Uuid`; coluna `@map("snake_case")`; model com `@@map`; espelhar `Conversation`
(schema.prisma:2505) / `Message` (2540).

### Enums
```prisma
enum UserFeedbackRating { CORRETO PARCIAL ERRADO ALUCINOU }

enum MessageFeedbackAction { created rating_changed comment_set comment_edited }
```

### `MessageFeedback` (voto vigente: 1 por mensagem+usuário)
```prisma
model MessageFeedback {
  id                 String   @id @default(uuid()) @db.Uuid
  conversationId     String   @map("conversation_id") @db.Uuid
  assistantMessageId String   @map("assistant_message_id") @db.Uuid
  userId             String   @map("user_id") @db.Uuid
  rating             UserFeedbackRating
  comment            String?  @db.VarChar(100)
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  message      Message      @relation(fields: [assistantMessageId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  events       MessageFeedbackEvent[]

  @@unique([assistantMessageId, userId])
  @@index([conversationId])
  @@index([userId])
  @@map("message_feedback")
}
```

### `MessageFeedbackEvent` (histórico append-only)
```prisma
model MessageFeedbackEvent {
  id         String   @id @default(uuid()) @db.Uuid
  feedbackId String   @map("feedback_id") @db.Uuid
  rating     UserFeedbackRating
  comment    String?  @db.VarChar(100)
  action     MessageFeedbackAction
  createdAt  DateTime @default(now()) @map("created_at")

  feedback MessageFeedback @relation(fields: [feedbackId], references: [id], onDelete: Cascade)

  @@index([feedbackId, createdAt])
  @@map("message_feedback_event")
}
```

### Relações inversas
`Conversation`, `Message`, `User` ganham `messageFeedback MessageFeedback[]`.

### Cascade × histórico
"Append-only" = sem UPDATE/DELETE de eventos em operação normal. "Limpar sessão" só seta
`Conversation.endedAt` (arquiva, não apaga). Hard-delete só em deleção de conta (LGPD),
onde remover o feedback é desejável. Cascade `Message→MessageFeedback→Event` é seguro; o
histórico vive enquanto a conversa existir. Não desnormalizar (YAGNI + LGPD).

### `AgentSettings`
```prisma
feedbackCheckpoint FeatureCheckpoint @default(OFF) @map("feedback_checkpoint")
```
`enum FeatureCheckpoint { OFF PLAYGROUND PRODUCTION }` já existe (schema.prisma:84).
`PRODUCTION` libera no `in_app`; `OFF`/`PLAYGROUND` não renderizam (feedback é só in_app).

---

## 6. Backend (Server Action)

Novo `src/lib/actions/message-feedback.ts`. Leitura/escrita do **cache interno**; jamais
Odoo/write-tool MCP (decisão #2 do CLAUDE.md; auth INTERNO). **Retorno no padrão real da
casa** = `ActionResult<T>` de `src/lib/actions/users.ts:25`:
`{ success: true; data?: T } | { success: false; error: string }` (igual a `agent-config.ts`).

### `submitMessageFeedback({ assistantMessageId, rating, comment? })`
1. Auth: usuário logado. Carrega `Message` + `Conversation`.
2. Autorização: `conversation.userId === currentUser.id` **e** `conversation.channel === "in_app"`.
3. Checkpoint: `feedbackCheckpoint === "PRODUCTION"`, senão recusa.
4. Zod: `rating` no enum; `comment` opcional, `.trim()`, ≤100.
5. Idempotência: lê o vigente; normaliza comment (`trim`, `null≡""`); se `rating` e
   `comment` normalizados forem iguais → no-op (sem evento).
6. Upsert em transação por `(assistantMessageId, userId)`:
   - não existia → cria; evento `created`.
   - **`rating` mudou → atualiza `rating` e força `comment = null`** (descarta o do
     payload, alinhado à decisão #4; o comentário do novo rating vem num submit separado);
     evento `rating_changed`.
   - `rating` igual, `comment` mudou → atualiza comment; evento `comment_set` (vigente era
     null) ou `comment_edited`.
7. Retorna `{ success: true, data: { rating, comment, updatedAt } }`.

> Consequência no cliente: ao **trocar de rating** envia só `{ assistantMessageId, rating }`
> (sem comment). Ao **comentar** envia `{ assistantMessageId, rating(atual), comment }`.
> São dois submits distintos — bate com a UX (campo reabre vazio na troca).

### Re-exibição (estende `getConversationMessages`)
`src/lib/actions/conversation-messages.ts` (mantém seu retorno atual `{ ok }`, que é o
contrato existente dessa action — não confundir com o `ActionResult` da action nova):
- após o `findMany` de mensagens, `findMany` em `message_feedback` por
  `conversationId + userId(atual)`, mapeado por `assistantMessageId`.
- `ConversationMessageDto` (`{ id, role, content, createdAt, steps? }`) ganha
  `feedback?: { rating: UserFeedbackRating; comment: string | null } | null`.

---

## 7. Frontend

### 7.1 Propagar o id de banco do assistant até a UI (BLOQUEANTE corrigido)
Hoje a bolha ao vivo usa id sintético `a_${uuid}` (chat-panel.tsx ~496); o `done` do SSE
não traz o id de banco; o reload que traria o id é **pulado** na mesma sessão
(`justCreatedConvIdsRef`). Cadeia exata (4 alterações; o `AgentEvent` do backend **não**
muda):
1. `src/lib/agent/run-agent.ts`: `RunAgentResult` (caso `ok`, hoje
   `{ ok:true; message; suggestions; usage }`, linha ~1114) ganha `messageId: string`. Usar
   o `assistantMessageId` de `persistMessageAndReturnId` (linha **1050**, resposta FINAL),
   **nunca** o de `persistAssistantMessageWithTools` (1129, mensagem intermediária de
   tool_calls).
2. `src/app/api/agent/stream/route.ts`: o `emit({ type:"done", conversationId, message,
   suggestions })` (linha ~160) ganha `messageId: result.messageId`. (O `AgentEvent.done`
   do backend, run-agent.ts:187, permanece sem campos — não tocar.)
3. `src/components/agent/chat-panel.tsx`: o `SseEvent` `done` (linha ~99) ganha
   `messageId?: string`; no handler do `done` (~652-711), no MESMO `map` que finaliza a
   bolha, gravar `dbMessageId: evt.messageId` no `UiMessage` (campo NOVO, separado do `id`
   de render — o `id` casa as bolhas em `setMessages`, não trocar). No reload,
   `dbMessageId = dto.id`.
4. `FeedbackControl` **só habilita quando `dbMessageId` existe**. É também o **gate de
   erro**: `evt.type==="error"` reescreve a bolha com `**Erro:** ...` e **não** persiste
   `Message` → sem `dbMessageId` → sem feedback (sem matching de texto).

### 7.2 Cadeia de gating do checkpoint (read + write) — 7 pontos
Espelhar `imageCheckpoint` (`imageInputEnabled`). Caminho real `src/lib/actions/`:
1. `prisma/schema.prisma`: coluna `feedbackCheckpoint` (§5).
2. `agent-config.ts` `AgentSettingsRow` (linha 128): + campo.
3. `agent-config.ts` `mapSettings()` (165): + campo.
4. `agent-config-types.ts`: `feedbackCheckpoint` em `AgentSettingsData`;
   `feedbackInputEnabled` em `PublicAgentFlags`.
5. `agent-config.ts` `UpdateResourcesSchema` (73): `feedbackCheckpoint: CheckpointSchema.optional()`
   (opcional, como `reasoningCheckpoint`); + bloco `if (d.feedbackCheckpoint) payload.feedbackCheckpoint = d.feedbackCheckpoint` em `updateAgentResources`.
6. `agent-config.ts` `getPublicAgentFlags()`: `feedbackCheckpoint: true` no `select` (277);
   `feedbackInputEnabled: settings.feedbackCheckpoint === "PRODUCTION"` no retorno;
   `feedbackInputEnabled: false` em `DEFAULT_FLAGS` (255).
7. Plumbing (3 saltos): `src/app/(protected)/layout.tsx` (44 lê flags; 107 passa a
   `<AgentBubble>`) resolve `feedbackEnabled`; `src/components/agent/agent-bubble.tsx`
   (prop em `AgentBubbleProps`, repassa ~173) → `<ChatPanel feedbackEnabled>`;
   `chat-panel.tsx` repassa a cada `AgentMessage`.

### 7.3 `agent-message.tsx`
- **Timestamp:** ramo `createdAt && !streaming` → `text-right` sempre (era
  `isUser ? "text-right" : "text-left"`, ~177).
- Novo `FeedbackControl` (irmão do `CopyButton` no `div.relative max-w-[80%]`, ~137),
  renderizado quando: `role === "assistant"`, `kind === "text"`, `!streaming`,
  `dbMessageId` presente, e `feedbackEnabled`. Gatilho `Gauge` em `-right-2 -bottom-2`,
  revelado por `group-hover/msg` (hover-only, como o `CopyButton`). Paleta + `Tooltip` +
  textarea auto-resize custom, conforme §4. Estado local: `open`, `rating`, `comment`,
  `fieldOpen`. A11y: `aria-label` por ícone, teclado, `Tooltip` em focus,
  `prefers-reduced-motion`, alvos ≥44px. Click-away por `pointerdown` no documento.
- Props novas em `AgentMessageProps`: `feedbackEnabled?: boolean`, `dbMessageId?: string`,
  `feedback?: {rating, comment}|null`,
  `onSubmitFeedback?: (rating, comment?) => Promise<{rating, comment, updatedAt}>`.
- `CopyButton` **não muda** (hover-only mantido).

### 7.4 UI de admin do checkpoint
Tela `src/app/(protected)/agente/configuracao/page.tsx` (**super_admin-only**) monta
`initialResources` (+ `feedbackCheckpoint: settings?.feedbackCheckpoint ?? "OFF"`) e passa
a `<ResourcesToggles>`. Em `src/components/agent/resources-toggles.tsx`: `feedbackCheckpoint`
em `ResourcesTogglesProps.initial`; `useState` local `feedbackCp`; `persistResources` ganha
o label `"feedback"` no union e envia `feedbackCheckpoint` ao `updateAgentResources`; novo
`<ResourceCard>` "Feedback do usuário" usando `FeatureCheckpoint` (props `checkpoint` /
`onCheckpointChange`).

### 7.5 `chat-panel.tsx` (montagem + otimismo)
- `UiMessage` ganha `dbMessageId?: string` e `feedback?: {rating, comment}|null`.
- No reload (loop que monta `uiMessages` a partir do dto, ~260-308): `dto.feedback`→
  `UiMessage.feedback`, `dto.id`→`dbMessageId`. Ao vivo: `messageId` do `done` (§7.1).
- `onSubmitFeedback` chama `submitMessageFeedback` e lê `result.success`/`result.data`.
  **Ciclo otimista:** snapshot do feedback anterior → aplica o novo no estado local → on
  `success` substitui pelo `result.data` canônico → on erro restaura o snapshot + toast.

---

## 8. Testes (TDD)

Server action (retorno `{ success }`):
- cria voto → `created`; troca de voto → `rating_changed` + atualiza vigente;
- **troca de rating limpa comentário:** Parcial+texto → submit `{rating: ERRADO}` →
  vigente `comment=null` + evento `rating_changed(comment=null)`, texto antigo no histórico;
- comentário (submit `{rating(atual), comment}`) → `comment_set`/`comment_edited`;
- no-op: reclique idêntico (rating+comment normalizados iguais) não gera evento;
- autorização: não-dono recusado; conversa não-`in_app` recusada;
- checkpoint ≠ PRODUCTION recusa;
- Zod: comment >100 recusado; rating inválido recusado; voto persiste sem comentário;
- concorrência: duas submissões quase simultâneas → 1 `MessageFeedback` + eventos coerentes.
Integridade: hard-delete de `Conversation` não deixa feedback/eventos órfãos (cascade).
Componente (leve): gatilho só quando `dbMessageId` presente (não em erro/streaming);
Correto não abre campo; Parcial/Errado/Alucinou abrem; trocar rating reabre campo vazio;
× fecha sem apagar voto; reabrir mostra badge.

Verificação E2E: subir a bubble, votar na resposta recém-gerada (sem reload), recarregar e
conferir persistência em `message_feedback` e `message_feedback_event`.

---

## 9. Correção do timestamp
No `agent-message.tsx`, o rodapé da bolha da IA passa de `text-left` para `text-right`,
sem colidir com o badge (que fica fora da bolha).

---

## 10. Migration e coordenação multi-worktree

Outra worktree ativa (`feat-router-ativacao-r2`); Postgres compartilhado. B-1 toca
`run-agent.ts`/`stream/route.ts` (candidatos a edição na outra branch → possível conflito
de merge, resolver no merge). Execução: avisar antes da migration; `npx prisma migrate dev`
(2 enums + 2 tabelas + coluna); **`agente schema-changed`**; **rebuild** dos containers
(regra de raiz §2.1: mudança em `schema.prisma` → regenerar Prisma client em app+mcp+worker;
**atenção à armadilha do worker** — ele se atualiza via `docker compose build app`, não
`build worker`); sugerir fechar o PR do B1 cedo.

---

## 11. Como B1 alimenta B2 e B3
- **B2** lê `MessageFeedback` (vigente) por conversa/usuário. Os índices `[conversationId]`
  e `[userId]` bastam para o volume de B1 (feedback é esparso). Se B2 medir lentidão no
  GROUP BY por rating, promover a composto `[conversationId, rating]`/`[userId, rating]`.
- **B3** lê `MessageFeedbackEvent` (histórico) + `ConversationQualityEvaluation`, separando
  o eixo do usuário do eixo do juiz (violet desambiguado).

---

## 12. Decisões canônicas
1. `UserFeedbackRating` é eixo separado do `EvalStatus`. emerald/amber/red coincidem com o
   juiz; violet de ALUCINOU colide com FALHA_TECNICA → B2/B3 separam eixos, nunca mapeiam
   pela cor.
2. Último voto vale; histórico append-only (sem UPDATE/DELETE em operação normal).
3. Voto otimista, independe de comentário.
4. Trocar o rating descarta o comentário vigente (força `comment=null`; texto antigo só no
   histórico); o campo reabre vazio; comentário do novo rating vem em submit separado.
5. Liberação por `feedbackCheckpoint` (default OFF; admin liga em PRODUCTION); feedback é
   **in_app** (PLAYGROUND tratado como OFF na bubble).
6. WhatsApp (F5) reusa via `Conversation.channel`.
7. Ícones Lucide: gatilho `Gauge`, alucinou `Ghost`, demais `Check`/`Contrast`/`X`.
8. Schema `@db.Uuid`+`@map`+`@@map`; `action` é enum; cascade `Message→Feedback→Event`;
   `comment VarChar(100)`.
9. Reusar `Tooltip`, `FeatureCheckpoint`/`ResourceCard`; **não** reusar `expandable-textarea`
   (auto-resize inline); paleta é custom.
10. Pré-requisito: propagar `dbMessageId` (`runAgent`→`done`→UI), usando o id da resposta
    FINAL (run-agent.ts:1050); é também o gate que exclui erros (não persistidos).
11. Retorno da action nova segue `ActionResult` (`{ success, data }`); `getConversationMessages`
    mantém seu `{ ok }` próprio. B1 é **hover-only** (touch é fase 2).

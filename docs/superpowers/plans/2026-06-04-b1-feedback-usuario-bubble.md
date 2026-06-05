# B1 · Feedback do usuário na bubble — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar, persistir (com histórico) e re-exibir o feedback do usuário (correto/parcial/errado/alucinou + comentário opcional) na bubble do Agente Nex, liberado por checkpoint.

**Architecture:** Migration Prisma (2 enums + 2 models + coluna de checkpoint) → server action `submitMessageFeedback` (cache interno, padrão `ActionResult`) → propagação do id real da `Message` (`runAgent`→SSE `done`→`chat-panel`) → `FeedbackControl` na `agent-message` (hover-only, design do `feedback-v4`) → flag do checkpoint do `AgentSettings` até a bubble + card de admin.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Prisma v7 (`@db.Uuid`/`@map`), Postgres, Tailwind v4, framer-motion, lucide-react, base-ui (tooltip), Jest.

**Spec:** `docs/superpowers/specs/2026-06-04-b1-feedback-usuario-bubble-design.md` (v3).

---

## Mapa de arquivos

- **Criar:** `prisma/migrations/<ts>_b1_message_feedback/migration.sql` (gerado), `src/lib/actions/message-feedback.ts`, `src/lib/actions/__tests__/message-feedback.test.ts`, `src/components/agent/feedback-control.tsx`.
- **Modificar:** `prisma/schema.prisma`, `src/lib/actions/agent-config-types.ts`, `src/lib/actions/agent-config.ts`, `src/components/agent/resources-toggles.tsx`, `src/app/(protected)/agente/configuracao/page.tsx`, `src/lib/agent/run-agent.ts`, `src/app/api/agent/stream/route.ts`, `src/lib/actions/conversation-messages.ts`, `src/components/agent/agent-message.tsx`, `src/components/agent/chat-panel.tsx`, `src/components/agent/agent-bubble.tsx`, `src/app/(protected)/layout.tsx`.

---

## Task 1: Schema Prisma + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Adicionar os 2 enums** (perto dos outros enums, ex.: após `enum FeatureCheckpoint`, ~linha 88)

```prisma
enum UserFeedbackRating {
  CORRETO
  PARCIAL
  ERRADO
  ALUCINOU
}

enum MessageFeedbackAction {
  created
  rating_changed
  comment_set
  comment_edited
}
```

- [ ] **Step 2: Adicionar os 2 models** (após o model `Message`, ~linha 2557)

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

  conversation Conversation           @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  message      Message                @relation(fields: [assistantMessageId], references: [id], onDelete: Cascade)
  user         User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  events       MessageFeedbackEvent[]

  @@unique([assistantMessageId, userId])
  @@index([conversationId])
  @@index([userId])
  @@map("message_feedback")
}

model MessageFeedbackEvent {
  id         String                @id @default(uuid()) @db.Uuid
  feedbackId String                @map("feedback_id") @db.Uuid
  rating     UserFeedbackRating
  comment    String?               @db.VarChar(100)
  action     MessageFeedbackAction
  createdAt  DateTime              @default(now()) @map("created_at")

  feedback MessageFeedback @relation(fields: [feedbackId], references: [id], onDelete: Cascade)

  @@index([feedbackId, createdAt])
  @@map("message_feedback_event")
}
```

- [ ] **Step 3: Relações inversas.** No model `Conversation` (após `routerDecisions`, ~linha 2532) adicionar:
```prisma
  messageFeedback    MessageFeedback[]
```
No model `Message` (após `routerDecisions`, ~linha 2553):
```prisma
  messageFeedback MessageFeedback[]
```
No model `User` (após `suggestionInteractions`, ~linha 141):
```prisma
  messageFeedback        MessageFeedback[]
```

- [ ] **Step 4: Coluna de checkpoint.** No model `AgentSettings`, junto dos outros checkpoints (~linha 2683, após `imageCheckpoint`):
```prisma
  feedbackCheckpoint    FeatureCheckpoint @default(OFF) @map("feedback_checkpoint")
```

- [ ] **Step 5: Avisar o usuário** (1 frase) que vem migration que mexe no schema compartilhado, e rodar a migration.

Run: `npx prisma migrate dev --name b1_message_feedback`
Expected: cria a migration, aplica no DB, regenera o client sem erro.

- [ ] **Step 6: Sinalizar às outras worktrees**

Run: `agente schema-changed`
Expected: registra o sinal (outras worktrees verão no `agente status`).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(b1): schema de feedback do usuario (models + enums + checkpoint)"
```

---

## Task 2: Checkpoint no backend (tipos, leitura, escrita)

**Files:**
- Modify: `src/lib/actions/agent-config-types.ts`, `src/lib/actions/agent-config.ts`

- [ ] **Step 1: `agent-config-types.ts`** — adicionar `feedbackCheckpoint` em `AgentSettingsData` (junto de `imageCheckpoint`, ~linha 27):
```ts
  feedbackCheckpoint: FeatureCheckpoint;
```
e `feedbackInputEnabled` em `PublicAgentFlags` (junto de `imageInputEnabled`, ~linha 63):
```ts
  feedbackInputEnabled: boolean;
```

- [ ] **Step 2: `agent-config.ts` `AgentSettingsRow`** (~linha 141, junto de `imageCheckpoint`):
```ts
  feedbackCheckpoint: FeatureCheckpoint;
```

- [ ] **Step 3: `agent-config.ts` `mapSettings`** (~linha 182, junto de `imageCheckpoint`):
```ts
    feedbackCheckpoint: row.feedbackCheckpoint,
```

- [ ] **Step 4: `agent-config.ts` `DEFAULT_FLAGS`** (~linha 258, junto de `imageInputEnabled`):
```ts
  feedbackInputEnabled: false,
```

- [ ] **Step 5: `agent-config.ts` `getPublicAgentFlags`** — no `select` (~linha 279) adicionar `feedbackCheckpoint: true,` e no retorno (~linha 292) adicionar:
```ts
    feedbackInputEnabled: settings.feedbackCheckpoint === "PRODUCTION",
```

- [ ] **Step 6: `agent-config.ts` `UpdateResourcesSchema`** (~linha 93, junto de `reasoningCheckpoint`):
```ts
  feedbackCheckpoint: z.enum(CHECKPOINT_VALUES).optional(),
```
e no `updateAgentResources`, após o bloco do `reasoningCheckpoint` (~linha 412):
```ts
      if (d.feedbackCheckpoint) {
        payload.feedbackCheckpoint = d.feedbackCheckpoint;
      }
```

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/agent-config-types.ts src/lib/actions/agent-config.ts
git commit -m "feat(b1): feedbackCheckpoint na cadeia de config do agente (read+write)"
```

---

## Task 3: UI de admin do checkpoint

**Files:**
- Modify: `src/components/agent/resources-toggles.tsx`, `src/app/(protected)/agente/configuracao/page.tsx`

- [ ] **Step 1: `configuracao/page.tsx`** — em `initialResources` (~linha 122, junto de `imageCheckpoint`):
```tsx
    feedbackCheckpoint: settings?.feedbackCheckpoint ?? "OFF",
```

- [ ] **Step 2: `resources-toggles.tsx` props** — em `ResourcesTogglesProps.initial` (~linha 65, junto de `imageCheckpoint`):
```tsx
    feedbackCheckpoint: CheckpointState;
```

- [ ] **Step 3: `resources-toggles.tsx` estado** (~linha 148, junto de `imageCp`):
```tsx
  const [feedbackCp, setFeedbackCp] = useState<CheckpointState>(initial.feedbackCheckpoint);
```

- [ ] **Step 4: `resources-toggles.tsx` `persistResources`** — adicionar `"feedback"` ao union `label` (~linha 233) e o campo no payload do `updateAgentResources` (~linha 241):
```tsx
    label: "audio" | "image" | "suggestions" | "reasoning" | "context" | "feedback",
```
```tsx
          feedbackCheckpoint: next.feedbackCheckpoint ?? feedbackCp,
```
e no tipo `next` (Partial, ~linha 216) adicionar `feedbackCheckpoint?: CheckpointState;`.

- [ ] **Step 5: `resources-toggles.tsx` card** — adicionar um `<ResourceCard>` (perto do card de sugestões/raciocínio), espelhando o card de imagem:
```tsx
        {/* Feedback do usuário */}
        <ResourceCard
          id="feedback"
          collapsible
          defaultCollapsed={feedbackCp === "OFF"}
          icon={<Gauge className={`h-4 w-4 ${checkpointIconClass(feedbackCp)}`} aria-hidden />}
          title="Feedback do usuário"
          subtitle="Botão de avaliação (correto/parcial/errado/alucinou) na resposta da IA."
          checkpoint={feedbackCp}
          onCheckpointChange={(cp) => {
            setFeedbackCp(cp);
            persistResources({ feedbackCheckpoint: cp }, "feedback");
          }}
          loading={pending === "feedback"}
          ariaLabel="Estado do feedback do usuário"
        />
```
Importar `Gauge` de `lucide-react` e `checkpointIconClass` de `@/components/ui/feature-checkpoint` (se ainda não importados no arquivo).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add src/components/agent/resources-toggles.tsx src/app/\(protected\)/agente/configuracao/page.tsx
git commit -m "feat(b1): card de admin do feedbackCheckpoint em /agente/configuracao"
```

---

## Task 4: Server action `submitMessageFeedback` (TDD)

**Files:**
- Create: `src/lib/actions/message-feedback.ts`
- Test: `src/lib/actions/__tests__/message-feedback.test.ts`

> **Nota de teste (corrigida no review):** o projeto NÃO tem suíte de integração com
> Postgres. O padrão real (ver `src/lib/actions/__tests__/user-tour.test.ts`) é
> `jest.mock("@/lib/prisma")` + `jest.mock("@/lib/auth")` e stubar cada método. Seguimos
> esse padrão para a lógica de guardas e de ramos (created/rating_changed/comment_set/
> comment_edited/no-op/auth/checkpoint/zod), mockando `$transaction` para executar o
> callback com o próprio mock como `tx`. **Os testes de cascade (hard-delete) e de
> concorrência (spec §8) NÃO são possíveis com mock** → viram verificação E2E na Task 9
> (documentado lá), não testes unitários.

- [ ] **Step 1: Setup do mock (topo do arquivo de teste)**

```ts
import { submitMessageFeedback } from "../message-feedback";

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    message: { findUnique: jest.fn() },
    agentSettings: { findUnique: jest.fn() },
    messageFeedback: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    messageFeedbackEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const USER = "11111111-1111-1111-1111-111111111111";
const MSG = "22222222-2222-2222-2222-222222222222";
const CONV = "33333333-3333-3333-3333-333333333333";

function happyContext() {
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: USER });
  (prisma.message.findUnique as jest.Mock).mockResolvedValue({
    id: MSG, role: "assistant", conversation: { id: CONV, userId: USER, channel: "in_app" },
  });
  (prisma.agentSettings.findUnique as jest.Mock).mockResolvedValue({ feedbackCheckpoint: "PRODUCTION" });
  // $transaction executa o callback com o proprio prisma mock como tx
  (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));
}
beforeEach(() => { jest.clearAllMocks(); happyContext(); });
```

- [ ] **Step 2: Teste que falha (cria voto novo → evento `created`)**

```ts
test("cria voto novo e grava evento created", async () => {
  (prisma.messageFeedback.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.messageFeedback.create as jest.Mock).mockResolvedValue({ id: "fb1", rating: "CORRETO", comment: null, updatedAt: new Date() });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(true);
  expect(prisma.messageFeedback.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rating: "CORRETO", userId: USER, assistantMessageId: MSG, conversationId: CONV }) }));
  expect(prisma.messageFeedbackEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "created", rating: "CORRETO" }) });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx jest src/lib/actions/__tests__/message-feedback.test.ts -t "cria voto novo"`
Expected: FAIL ("Cannot find module '../message-feedback'").

- [ ] **Step 3: Implementar a action**

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const RATINGS = ["CORRETO", "PARCIAL", "ERRADO", "ALUCINOU"] as const;
const InputSchema = z.object({
  assistantMessageId: z.string().uuid(),
  rating: z.enum(RATINGS),
  comment: z.string().trim().max(100).optional(),
});

type Data = { rating: (typeof RATINGS)[number]; comment: string | null; updatedAt: Date };
type Result = { success: true; data: Data } | { success: false; error: string };

export async function submitMessageFeedback(input: unknown): Promise<Result> {
  const me = await getCurrentUser();
  const userId = me?.id;
  if (!userId) return { success: false, error: "Não autenticado." };

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dados inválidos." };
  const { assistantMessageId, rating } = parsed.data;
  const comment = parsed.data.comment && parsed.data.comment.length > 0 ? parsed.data.comment : null;

  const message = await prisma.message.findUnique({
    where: { id: assistantMessageId },
    select: { id: true, role: true, conversation: { select: { id: true, userId: true, channel: true } } },
  });
  if (!message || message.role !== "assistant") return { success: false, error: "Mensagem inválida." };
  const conv = message.conversation;
  if (conv.userId !== userId || conv.channel !== "in_app") return { success: false, error: "Não autorizado." };

  const settings = await prisma.agentSettings.findUnique({ where: { id: "global" }, select: { feedbackCheckpoint: true } });
  if (settings?.feedbackCheckpoint !== "PRODUCTION") return { success: false, error: "Feedback desativado." };

  const current = await prisma.messageFeedback.findUnique({
    where: { assistantMessageId_userId: { assistantMessageId, userId } },
    select: { id: true, rating: true, comment: true },
  });

  // Idempotência (no-op) quando nada muda
  const norm = (c: string | null) => (c ?? "");
  if (current && current.rating === rating && norm(current.comment) === norm(comment)) {
    return { success: true, data: { rating: current.rating, comment: current.comment, updatedAt: new Date() } };
  }

  const data = await prisma.$transaction(async (tx) => {
    if (!current) {
      const fb = await tx.messageFeedback.create({
        data: { conversationId: conv.id, assistantMessageId, userId, rating, comment },
        select: { id: true, rating: true, comment: true, updatedAt: true },
      });
      await tx.messageFeedbackEvent.create({ data: { feedbackId: fb.id, rating, comment, action: "created" } });
      return fb;
    }
    if (current.rating !== rating) {
      // Decisão #4: trocar rating descarta o comentário vigente.
      const fb = await tx.messageFeedback.update({
        where: { id: current.id },
        data: { rating, comment: null },
        select: { id: true, rating: true, comment: true, updatedAt: true },
      });
      await tx.messageFeedbackEvent.create({ data: { feedbackId: fb.id, rating, comment: null, action: "rating_changed" } });
      return fb;
    }
    // rating igual, comentário mudou
    const action = current.comment == null ? "comment_set" : "comment_edited";
    const fb = await tx.messageFeedback.update({
      where: { id: current.id },
      data: { comment },
      select: { id: true, rating: true, comment: true, updatedAt: true },
    });
    await tx.messageFeedbackEvent.create({ data: { feedbackId: fb.id, rating, comment, action } });
    return fb;
  });

  return { success: true, data: { rating: data.rating, comment: data.comment, updatedAt: data.updatedAt } };
}
```

- [ ] **Step 4: Rodar o teste do Step 1**

Run: `npx jest src/lib/actions/__tests__/message-feedback.test.ts -t "cria voto novo"`
Expected: PASS.

- [ ] **Step 5: Escrever os demais testes** (mock-based; um `test()` por caso)

```ts
test("troca de rating limpa comentario e grava rating_changed", async () => {
  (prisma.messageFeedback.findUnique as jest.Mock).mockResolvedValue({ id: "fb1", rating: "PARCIAL", comment: "faltou X" });
  (prisma.messageFeedback.update as jest.Mock).mockResolvedValue({ id: "fb1", rating: "ERRADO", comment: null, updatedAt: new Date() });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "ERRADO" });
  expect(res.success).toBe(true);
  expect(prisma.messageFeedback.update).toHaveBeenCalledWith(expect.objectContaining({ data: { rating: "ERRADO", comment: null } }));
  expect(prisma.messageFeedbackEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "rating_changed", comment: null }) });
});

test("comentario sem trocar rating gera comment_set", async () => {
  (prisma.messageFeedback.findUnique as jest.Mock).mockResolvedValue({ id: "fb1", rating: "ERRADO", comment: null });
  (prisma.messageFeedback.update as jest.Mock).mockResolvedValue({ id: "fb1", rating: "ERRADO", comment: "certo era 8", updatedAt: new Date() });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "ERRADO", comment: "certo era 8" });
  expect(res.success).toBe(true);
  expect(prisma.messageFeedbackEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "comment_set", comment: "certo era 8" }) });
});

test("reclique identico e no-op (nao gera evento)", async () => {
  (prisma.messageFeedback.findUnique as jest.Mock).mockResolvedValue({ id: "fb1", rating: "CORRETO", comment: null });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(true);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.messageFeedbackEvent.create).not.toHaveBeenCalled();
});

test("nao-dono e recusado", async () => {
  (prisma.message.findUnique as jest.Mock).mockResolvedValue({ id: MSG, role: "assistant", conversation: { id: CONV, userId: "outro", channel: "in_app" } });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(false);
});

test("conversa nao in_app e recusada", async () => {
  (prisma.message.findUnique as jest.Mock).mockResolvedValue({ id: MSG, role: "assistant", conversation: { id: CONV, userId: USER, channel: "playground" } });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(false);
});

test("checkpoint != PRODUCTION recusa", async () => {
  (prisma.agentSettings.findUnique as jest.Mock).mockResolvedValue({ feedbackCheckpoint: "OFF" });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(false);
});

test("comment > 100 e recusado (zod)", async () => {
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "ERRADO", comment: "x".repeat(101) });
  expect(res.success).toBe(false);
});

test("rating invalido recusado (zod)", async () => {
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "XPTO" as never });
  expect(res.success).toBe(false);
});
```

> **Cascade e concorrência (spec §8):** não testáveis com mock (precisam de DB real). Viram
> verificação E2E na Task 9 (hard-delete da conversa e dois cliques rápidos).

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npx jest src/lib/actions/__tests__/message-feedback.test.ts`
Expected: todos PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/message-feedback.ts src/lib/actions/__tests__/message-feedback.test.ts
git commit -m "feat(b1): server action submitMessageFeedback + testes"
```

---

## Task 5: Re-exibição do voto (estender `getConversationMessages`)

**Files:**
- Modify: `src/lib/actions/conversation-messages.ts`

- [ ] **Step 1: Estender o DTO** (~linha 14):
```ts
export interface ConversationMessageDto {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  steps?: { label: string }[];
  feedback?: { rating: "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU"; comment: string | null } | null;
}
```

- [ ] **Step 2: Carregar o feedback do usuário atual.** Após o `findMany` de mensagens (~linha 72), adicionar (usando o `userId` da sessão já resolvido na action):
```ts
  // NOTA (review): a action resolve o usuário como `const user = await getCurrentUser()`
  // e usa `user.id` (NÃO existe variável `userId`). Conferir o nome real no arquivo.
  const feedbacks = await prisma.messageFeedback.findMany({
    where: { conversationId, userId: user.id },
    select: { assistantMessageId: true, rating: true, comment: true },
  });
  const fbByMsg = new Map(feedbacks.map((f) => [f.assistantMessageId, { rating: f.rating, comment: f.comment }]));
```

- [ ] **Step 3: Projetar no map do retorno** (~linha 83). Dentro do `messages.map((m) => {`,
antes do `return`, capturar e espalhar (evita `undefined` vs `null` do DTO):
```ts
      const fb = fbByMsg.get(m.id) ?? null;
      // ...no objeto retornado, junto de createdAt:
        ...(fb ? { feedback: fb } : {}),
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/conversation-messages.ts
git commit -m "feat(b1): getConversationMessages traz o voto vigente do usuario"
```

---

## Task 6: Propagar o id de banco da mensagem (`dbMessageId`)

**Files:**
- Modify: `src/lib/agent/run-agent.ts`, `src/app/api/agent/stream/route.ts`, `src/components/agent/chat-panel.tsx`

- [ ] **Step 1: `run-agent.ts` `RunAgentResult`** (~linha 226) — adicionar `messageId` ao caso `ok`:
```ts
export type RunAgentResult =
  | { ok: true; message: string; suggestions: string[]; usage: ChatUsage; messageId: string }
  | { ok: false; error: string };
```

- [ ] **Step 2: `run-agent.ts` — expor o id da resposta FINAL (corrigido no review: escopo).**
O `const assistantMessageId` da ~linha 1050 (de `persistMessageAndReturnId`) é local a um bloco e
**não está em escopo** no `return { ok:true }` (~1114). Ler o `runAgent` e:
1. declarar no topo da função `let finalAssistantMessageId: string | null = null;`
2. na persistência da resposta FINAL (trocar `const assistantMessageId = await persistMessageAndReturnId(...)`
   por `finalAssistantMessageId = await persistMessageAndReturnId(...)`, ajustando usos locais).
   **NÃO** usar o id de `persistAssistantMessageWithTools` (~1129, mensagem intermediária de tool_calls).
3. no return ~1114: `return { ok: true, message, suggestions, usage: totalUsage, messageId: finalAssistantMessageId ?? "" };`
   (a resposta final sempre persiste; o `?? ""` só satisfaz o tipo `string`).

- [ ] **Step 3: `stream/route.ts` emit done** (~linha 160) — propagar o id:
```ts
        if (result.ok) {
          emit({
            type: "done",
            conversationId,
            message: result.message,
            suggestions: result.suggestions,
            messageId: result.messageId,
          });
        }
```

- [ ] **Step 4: `chat-panel.tsx` `SseEvent`** (~linha 99) — adicionar `messageId`:
```ts
    | { type: "done"; conversationId: string; message: string; suggestions: string[]; messageId: string }
```

- [ ] **Step 5: `chat-panel.tsx` `UiMessage`** (~linha 61) — adicionar campos:
```ts
  dbMessageId?: string;
  feedback?: { rating: "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU"; comment: string | null } | null;
```

- [ ] **Step 6: `chat-panel.tsx` handler do `done`** (~linha 674-696) — gravar `dbMessageId` ao finalizar a bolha. No objeto retornado pelo `.map` quando `m.id === assistantMsgId` e no push final, acrescentar `dbMessageId: evt.messageId`.

- [ ] **Step 7: `chat-panel.tsx` reload** — onde monta `uiMessages` a partir do dto (~linha 260-308), mapear `dbMessageId: dto.id` e `feedback: dto.feedback ?? null`.

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/lib/agent/run-agent.ts src/app/api/agent/stream/route.ts src/components/agent/chat-panel.tsx
git commit -m "feat(b1): propaga o id real da Message do assistant ate a UI (done SSE)"
```

---

## Task 7: `FeedbackControl` + timestamp à direita

**Files:**
- Create: `src/components/agent/feedback-control.tsx`
- Modify: `src/components/agent/agent-message.tsx`

> **Decisão (divergência consciente da spec §7.3):** `onSubmitFeedback` retorna
> `Promise<void>` (não `{rating,comment,updatedAt}`). O `FeedbackControl` não consome o
> retorno; quem aplica o `result.data` canônico ao estado é o `handleSubmitFeedback` do
> chat-panel (otimismo lá). `void` é mais correto e evita acoplar o componente ao formato
> da action.
> **Granularidade:** o `feedback-control.tsx` é um componente coeso construído em um
> arquivo (Step 2); a verificação é o `tsc`/`eslint` (Step 4) + o checklist manual da
> Task 9 Step 7. Não há teste unitário de render (jest do projeto é `node`, sem jsdom).

- [ ] **Step 1: Timestamp à direita.** Em `agent-message.tsx` (~linha 177), no bloco do
timestamp (`createdAt && !streaming`), trocar (usar a linha-âncora vizinha para o match ser único):
```tsx
                "mt-1 text-[10px] tabular-nums text-muted-foreground/70",
                isUser ? "text-right" : "text-left",
```
por:
```tsx
                "mt-1 text-[10px] tabular-nums text-muted-foreground/70",
                "text-right",
```

- [ ] **Step 2: Criar `feedback-control.tsx`** (tradução fiel do `feedback-v4`, hover-only). Estrutura:

```tsx
"use client";
import * as React from "react";
import { Gauge, Check, X, Contrast, Ghost, Send } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export type FeedbackRating = "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU";

const OPTS: { rating: FeedbackRating; label: string; Icon: React.ElementType; color: string; field: boolean; orient?: string; ph?: string }[] = [
  // ordem DOM: Alucinou ... Correto (Correto fica colado no gatilho, a direita)
  { rating: "ALUCINOU", label: "Alucinou", Icon: Ghost, color: "#8b5cf6", field: true, orient: "o que aconteceu? Descreva em detalhes.", ph: "Ex: citou um modelo que não existe no catálogo." },
  { rating: "ERRADO", label: "Errado", Icon: X, color: "#ef4444", field: true, orient: "o que saiu errado e qual era a resposta certa.", ph: "Ex: o saldo certo era 8 unidades, não 12." },
  { rating: "PARCIAL", label: "Parcial", Icon: Contrast, color: "#f59e0b", field: true, orient: "o que acertou, o que errou e qual era a resposta certa.", ph: "Ex: acertou o total, mas não listou os negativos." },
  { rating: "CORRETO", label: "Correto", Icon: Check, color: "#10b981", field: false },
];
const byRating = (r: FeedbackRating) => OPTS.find((o) => o.rating === r)!;

export function FeedbackControl({
  current,
  onSubmit,
}: {
  current: { rating: FeedbackRating; comment: string | null } | null;
  onSubmit: (rating: FeedbackRating, comment?: string) => Promise<void>;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState<FeedbackRating | null>(current?.rating ?? null);
  const [fieldFor, setFieldFor] = React.useState<FeedbackRating | null>(null);
  const [text, setText] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => setChosen(current?.rating ?? null), [current?.rating]);

  // click-away
  React.useEffect(() => {
    if (!open && !fieldFor) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setFieldFor(null); }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, fieldFor]);

  function pick(r: FeedbackRating) {
    setChosen(r); setOpen(false);
    void onSubmit(r); // voto otimista, sem comentario
    const opt = byRating(r);
    if (opt.field) { setText(""); setFieldFor(r); setTimeout(() => taRef.current?.focus(), 180); }
    else setFieldFor(null);
  }
  function send() {
    if (fieldFor) void onSubmit(fieldFor, text.trim() || undefined);
    setFieldFor(null);
  }
  function autosize(el: HTMLTextAreaElement) { el.style.height = "30px"; el.style.height = Math.min(el.scrollHeight, 46) + "px"; }

  const chosenOpt = chosen ? byRating(chosen) : null;
  const fieldOpt = fieldFor ? byRating(fieldFor) : null;

  return (
    <div ref={rootRef}>
      {/* gatilho / badge no canto inferior direito */}
      {!chosen ? (
        <button
          type="button"
          aria-label="Avaliar resposta"
          onClick={() => setOpen((v) => !v)}
          className="absolute -right-2 -bottom-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/msg:opacity-100 focus-visible:opacity-100"
        >
          <Gauge className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Avaliação: ${chosenOpt!.label}. Clique para alterar.`}
          onClick={() => setOpen((v) => !v)}
          style={{ background: chosenOpt!.color, borderColor: chosenOpt!.color }}
          className="absolute -right-2 -bottom-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border text-white shadow-sm"
        >
          {React.createElement(chosenOpt!.Icon, { className: "h-3 w-3" })}
        </button>
      )}

      {/* paleta */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, x: 8, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute -bottom-2.5 right-5 z-10 flex items-center gap-0.5 rounded-[10px] border border-border bg-popover p-1 shadow-xl"
          >
            {OPTS.map((o, i) => (
              <Tooltip key={o.rating}>
                <TooltipTrigger
                  render={
                    <motion.button
                      type="button"
                      aria-label={o.label}
                      onClick={() => pick(o.rating)}
                      initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: (OPTS.length - 1 - i) * 0.04 }}
                      style={{ color: o.color }}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-transparent transition-transform hover:scale-110"
                    />
                  }
                >
                  {React.createElement(o.Icon, { className: "h-4 w-4" })}
                </TooltipTrigger>
                <TooltipContent>{o.label}</TooltipContent>
              </Tooltip>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* campo de comentario (sanfona) */}
      <AnimatePresence>
        {fieldOpt && (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 overflow-hidden border-t border-border pt-2"
          >
            <div className="mb-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
              <span style={{ background: fieldOpt.color }} className="mt-px flex h-4 w-4 items-center justify-center rounded text-white">
                {React.createElement(fieldOpt.Icon, { className: "h-2.5 w-2.5" })}
              </span>
              <span className="flex-1"><b style={{ color: fieldOpt.color }}>{fieldOpt.label}:</b> {fieldOpt.orient}</span>
              <button type="button" aria-label="Fechar comentário" onClick={() => setFieldFor(null)} className="rounded p-0.5 hover:bg-muted hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
            <div className="flex items-end gap-1.5">
              <textarea
                ref={taRef}
                value={text}
                maxLength={100}
                rows={1}
                placeholder={fieldOpt.ph}
                onChange={(e) => { setText(e.target.value); autosize(e.target); }}
                className="h-[30px] max-h-[46px] flex-1 resize-none rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-violet-500"
              />
              <button type="button" aria-label="Enviar" onClick={send} className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700"><Send className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mt-1 pr-9 text-right text-[9px] tabular-nums text-muted-foreground/70">{text.length}/100</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Integrar no `AgentMessage`.** Em `agent-message.tsx`, na `AgentMessageProps` adicionar:
```ts
  feedbackEnabled?: boolean;
  dbMessageId?: string;
  feedback?: { rating: "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU"; comment: string | null } | null;
  onSubmitFeedback?: (rating: "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU", comment?: string) => Promise<void>;
```
E, dentro do `div.relative max-w-[80%]` (irmão do `<CopyButton/>`, ~linha 185), renderizar:
```tsx
        {!isUser && kind === "text" && !streaming && content.length > 0 && feedbackEnabled && dbMessageId && onSubmitFeedback ? (
          <FeedbackControl
            current={feedback ?? null}
            onSubmit={(rating, comment) => onSubmitFeedback(rating, comment)}
          />
        ) : null}
```
Importar `FeedbackControl` no topo do arquivo.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/agent/feedback-control.tsx src/components/agent/agent-message.tsx
git commit -m "feat(b1): FeedbackControl na bubble + timestamp da IA a direita"
```

---

## Task 8: Wiring do flag + submissão otimista no chat-panel

**Files:**
- Modify: `src/app/(protected)/layout.tsx`, `src/components/agent/agent-bubble.tsx`, `src/components/agent/chat-panel.tsx`

- [ ] **Step 1: `layout.tsx`** — onde passa `imageInputEnabled` ao `<AgentBubble>` (~linha 107), adicionar:
```tsx
            feedbackEnabled={flags.feedbackInputEnabled}
```

- [ ] **Step 2: `agent-bubble.tsx`** — adicionar `feedbackEnabled?: boolean` em `AgentBubbleProps` e repassá-lo a `<ChatPanel feedbackEnabled={feedbackEnabled} ... />` (~linha 173).

- [ ] **Step 3: `chat-panel.tsx` prop** — adicionar `feedbackEnabled?: boolean` em `ChatPanelProps` (~linha 43) e no destructuring (`feedbackEnabled = false`, ~linha 106).

- [ ] **Step 4: `chat-panel.tsx` handler otimista** — criar `handleSubmitFeedback`:
```tsx
  const handleSubmitFeedback = React.useCallback(
    async (uiId: string, dbId: string, rating: "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU", comment?: string) => {
      let prev: UiMessage["feedback"] = null;
      setMessages((cur) => cur.map((m) => {
        if (m.id !== uiId) return m;
        prev = m.feedback ?? null;
        return { ...m, feedback: { rating, comment: comment ?? (rating === (prev?.rating) ? prev?.comment ?? null : null) } };
      }));
      const res = await submitMessageFeedback({ assistantMessageId: dbId, rating, comment });
      if (!res.success) {
        setMessages((cur) => cur.map((m) => (m.id === uiId ? { ...m, feedback: prev } : m)));
        toast.error("Não foi possível salvar a avaliação.");
        return;
      }
      setMessages((cur) => cur.map((m) => (m.id === uiId ? { ...m, feedback: { rating: res.data.rating, comment: res.data.comment } } : m)));
    },
    [],
  );
```
Importar `submitMessageFeedback` e o `toast` já usado no arquivo.

- [ ] **Step 5: `chat-panel.tsx` passar ao `<AgentMessage>`** (~linha 1028) — adicionar:
```tsx
                  feedbackEnabled={feedbackEnabled}
                  dbMessageId={m.dbMessageId}
                  feedback={m.feedback}
                  onSubmitFeedback={m.dbMessageId ? (rating, comment) => handleSubmitFeedback(m.id, m.dbMessageId!, rating, comment) : undefined}
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(protected\)/layout.tsx src/components/agent/agent-bubble.tsx src/components/agent/chat-panel.tsx
git commit -m "feat(b1): wiring do feedbackEnabled + submissao otimista no chat-panel"
```

---

## Task 9: Verificação (lint, build, E2E real)

- [ ] **Step 1: Lint + tipos + testes**

Run: `npx tsc --noEmit && npx eslint src/components/agent/feedback-control.tsx src/lib/actions/message-feedback.ts && npx jest src/lib/actions/__tests__/message-feedback.test.ts`
Expected: tudo verde.

- [ ] **Step 2: Rebuild dos containers** (regra de raiz §2.1; schema mudou → app+mcp+worker; worker via `build app`)

Run:
```bash
docker compose build app && docker compose up -d --force-recreate app worker
docker compose up -d --build mcp
```
Expected: imagem `nexus-odoo:local` recriada agora (conferir `docker image inspect nexus-odoo:local --format '{{.Created}}'`).

- [ ] **Step 3: Ligar o checkpoint.** Em `/agente/configuracao` (super_admin), setar "Feedback do usuário" = Produção. Confirmar persistência (`feedback_checkpoint = PRODUCTION` no DB).

- [ ] **Step 4: E2E na bubble.** Abrir a bubble, mandar uma pergunta, aguardar a resposta, e SEM recarregar: hover na resposta → avaliar → escolher Parcial → digitar e enviar. Conferir no DB:
```bash
docker exec nexus-odoo-db-1 psql -U postgres -d nexus_odoo_l1 -c "select rating, comment from message_feedback order by created_at desc limit 1; select action, rating, comment from message_feedback_event order by created_at desc limit 3;"
```
Expected: 1 linha em `message_feedback` (PARCIAL + texto) e eventos `created`+`comment_set` (ou `created` com comment, conforme a ordem dos cliques).

- [ ] **Step 5: Recarregar** a página e reabrir a bubble: o badge sólido da avaliação reaparece na resposta.

- [ ] **Step 6: Trocar o voto** para Errado: badge muda de cor, campo reabre vazio, e o histórico ganha `rating_changed` (comment null), preservando o evento anterior.

- [ ] **Step 7: Checklist manual do componente** (a spec §8 pede teste de componente leve; como o jest do projeto usa `testEnvironment: node` sem jsdom, a verificação do `FeedbackControl` é manual aqui): (a) gatilho só aparece na resposta da IA persistida (não em mensagem de erro, não durante streaming); (b) Correto fixa badge sem abrir campo; (c) Parcial/Errado/Alucinou abrem o campo; (d) × fecha o campo e o badge permanece; (e) click-away fecha a paleta; (f) o timestamp à direita não colide com o badge (canto inferior direito).

- [ ] **Step 8: E2E cascade (spec §8):** apagar a conversa de teste e confirmar que `message_feedback`/`message_feedback_event` ficam sem órfãos:
```bash
docker exec nexus-odoo-db-1 psql -U postgres -d nexus_odoo_l1 -c "delete from conversations where id = '<conv_de_teste>'; select count(*) from message_feedback; select count(*) from message_feedback_event;"
```
Expected: counts coerentes (as linhas daquela conversa sumiram).

- [ ] **Step 9: E2E concorrência (spec §8):** dois cliques rápidos na mesma classificação → 1 linha em `message_feedback`. Política aceita = last-write (a action lê-então-grava; corrida de dois `create` é rara — mesmo usuário/mensagem/2 cliques; se ocorrer P2002, é benigno e o último voto prevalece na prática). Registrado como aceito.

- [ ] **Step 10: Commit final / fechar a frente** conforme `superpowers:finishing-a-development-branch`.

---

## Self-review (cobertura da spec)
- §2.1–4 captura/campo/histórico/otimista → Tasks 4, 7, 8. §2.5 dbMessageId → Task 6.
  §2.6 re-exibição → Task 5 + Task 6 step 7. §2.7 checkpoint+admin → Tasks 1,2,3. §2.8
  timestamp → Task 7 step 1.
- Decisões #1–#11 cobertas (cores/ícones Task 7; in_app+checkpoint Tasks 2/4; trocar rating
  limpa comentário Task 4 step 3; ActionResult Task 4; hover-only Task 7).
- Sem placeholders: todo step tem código/comando concreto. Tipos consistentes
  (`FeedbackRating`/`UserFeedbackRating`, `dbMessageId`, `feedback`) entre tasks.

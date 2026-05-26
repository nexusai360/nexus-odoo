# Sistema /agente/qualidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir `/agente/inteligencia` por `/agente/qualidade`: dashboard interno super_admin com avaliação on-demand do Agente Nex via Claude Code (judge = Opus 4.7, zero custo externo), reaproveitando a tabela `ConversationQualityEvaluation` existente.

**Architecture:** Trigger fire-and-forget no `run-agent.ts` cria rows com status PENDENTE; quando o usuário pede via Claude Code, scripts CLI fazem dump → eu avalio → commit no banco. UI copia padrão de `/agente/consumo` (KpiCard, PeriodPills, charts, table) e exibe KPIs filtráveis por modelo + tabela paginada com drill-down inline.

**Tech Stack:** Next.js 16 (App Router), Prisma v7 + Postgres, Jest, Tailwind v4, base-ui, BullMQ (apenas pra reuso de infraestrutura existente — não usado pra avaliação).

**Spec:** `docs/superpowers/specs/2026-05-26-agente-qualidade-design.md` (v3)

---

## File Structure

### Criados
- `prisma/migrations/{ts}_agent_quality_system/migration.sql` — migration aditiva
- `src/lib/agent/quality/queries.ts` — queries server (KPIs, lista paginada, drill-down)
- `src/lib/agent/quality/queries.test.ts` — testes unitários KPI calculator
- `src/lib/actions/agent-quality.ts` — server actions (override manual de status)
- `scripts/quality-audit/dump-pending.ts` — dump turnos PENDENTES
- `scripts/quality-audit/commit-audit-results.ts` — aplica resultados da avaliação no banco
- `scripts/quality-audit/trigger-health-check.ts` — detecta trigger silenciosamente quebrado
- `src/app/(protected)/agente/qualidade/page.tsx` — rota nova (server component)
- `src/components/agent/qualidade/qualidade-content.tsx` — orchestrator client
- `src/components/agent/qualidade/kpis-block.tsx` — bloco de KPIs
- `src/components/agent/qualidade/charts-block.tsx` — line + donut + bar
- `src/components/agent/qualidade/evaluations-table.tsx` — tabela paginada com filtros
- `src/components/agent/qualidade/evaluations-table-filters.tsx` — filtros (status, modelo, padrão, search)
- `src/components/agent/qualidade/evaluation-drilldown.tsx` — drill-down inline (slide-down)

### Modificados
- `prisma/schema.prisma` — model `ConversationQualityEvaluation` (renomes + novos campos)
- `src/lib/agent/conversation.ts` — adicionar `persistMessageAndReturnId`
- `src/lib/agent/run-agent.ts` — trigger PENDENTE (final do try) + trigger FALHA_TECNICA (catch externo)
- `src/app/(protected)/agente/inteligencia/page.tsx` — vira redirect 307 → `/agente/qualidade`
- Todos os call sites de `reviewerDecision` / `reviewedBy` / `reviewedByHumanAt` (lista produzida na Task 1)

### Mantidos (não modificados nesta onda)
- `src/lib/agent/intelligence/*` (código antigo de judge externo, vira deprecated mas não removido)
- `src/components/agent/inteligencia/*` (componentes órfãos, removidos em onda futura de limpeza)

---

## Task 1: Migration aditiva — renomes + novos campos

**Files:**
- Modify: `prisma/schema.prisma:2664-2695`
- Create: `prisma/migrations/{auto-timestamped}_agent_quality_system/migration.sql`
- Modify: arquivos descobertos no grep

- [ ] **Step 1.1: Listar call sites a atualizar**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
grep -rn "reviewerDecision\|reviewedByHumanAt\|reviewedBy\b" src/ prisma/ scripts/ 2>/dev/null | grep -v node_modules | grep -v ".next"
```

Expected: lista de arquivos e linhas. Anotar todos.

- [ ] **Step 1.2: Atualizar prisma/schema.prisma**

Substituir o bloco existente (linhas 2664-2695, model `ConversationQualityEvaluation`) por:

```prisma
model ConversationQualityEvaluation {
  // === Mantidos da versão anterior ===
  id                    String   @id @default(uuid()) @db.Uuid
  conversationId        String   @map("conversation_id") @db.Uuid
  /// Nullable + sem @unique: pra FALHA_TECNICA (turno que nem gerou
  /// assistant message). Em rows normais, segue 1:1 com Message.
  assistantMessageId    String?  @map("assistant_message_id") @db.Uuid
  judgeModel            String?  @map("judge_model")
  judgeVersion          String   @map("judge_version")
  razoes                String   @default("")
  flags                 String[] @default([])
  toolsReexecuted       Json?    @map("tools_reexecuted")
  createdAt             DateTime @default(now()) @map("created_at")

  // === Deprecated (mantidos nullable pra histórico, não usados pelo novo sistema) ===
  /// @deprecated escala 1-5 da versão antiga, mantido pra histórico
  aderencia             Int?
  /// @deprecated escala 1-5 da versão antiga, mantido pra histórico
  correcaoFactual       Int?     @map("correcao_factual")
  /// @deprecated escala 1-5 da versão antiga, mantido pra histórico
  escolhaDeTools        Int?     @map("escolha_de_tools")
  /// @deprecated escala 1-5 da versão antiga, mantido pra histórico
  clareza               Int?
  /// @deprecated movido pra novo fluxo (PromptRecommendation)
  recomendacaoPrompt    String?  @map("recomendacao_prompt")
  /// @deprecated movido pra novo fluxo (PromptRecommendation)
  recomendacaoEmbedding Unsupported("vector(1536)")? @map("recomendacao_embedding")

  // === Renomeados (review humano) ===
  humanStatus           String?  @map("human_status")
  humanReviewedBy       String?  @map("human_reviewed_by") @db.Uuid
  humanReviewedAt       DateTime? @map("human_reviewed_at")

  // === Novos ===
  status                String   @default("PENDENTE")
  patterns              String[] @default([])
  model                 String?
  userMessageId         String?  @map("user_message_id") @db.Uuid
  questionSnapshot      String?  @map("question_snapshot")
  answerSnapshot        String?  @map("answer_snapshot")
  technicalError        String?  @map("technical_error")

  conversation          Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([status, createdAt])
  @@index([model, status])
  @@index([createdAt])
  @@index([humanStatus])
  @@map("conversation_quality_evaluations")
}
```

- [ ] **Step 1.3: Gerar migration**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
set -a && source .env.local && set +a && \
npx prisma migrate dev --name agent_quality_system
```

Expected: prisma gera SQL com:
- `ALTER TABLE conversation_quality_evaluations RENAME COLUMN reviewer_decision TO human_status;`
- `ALTER TABLE conversation_quality_evaluations RENAME COLUMN reviewed_by TO human_reviewed_by;`
- `ALTER TABLE conversation_quality_evaluations RENAME COLUMN reviewed_by_human_at TO human_reviewed_at;`
- `ALTER TABLE conversation_quality_evaluations ALTER COLUMN assistant_message_id DROP NOT NULL;`
- `DROP INDEX conversation_quality_evaluations_assistant_message_id_key;` (remove unique)
- `ALTER TABLE conversation_quality_evaluations ALTER COLUMN judge_model DROP NOT NULL;`
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDENTE';`
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN patterns TEXT[] NOT NULL DEFAULT '{}';`
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN model TEXT;`
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN user_message_id UUID;`
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN question_snapshot TEXT;`
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN answer_snapshot TEXT;`
- `ALTER TABLE conversation_quality_evaluations ADD COLUMN technical_error TEXT;`
- 3 novos índices

Confirmar que prisma applies sem erro. As 4.914 linhas existentes ficam com status='PENDENTE' por default.

- [ ] **Step 1.4: Atualizar call sites identificados no Step 1.1**

Para cada arquivo da lista do Step 1.1, substituir:
- `reviewerDecision` → `humanStatus`
- `reviewedBy` → `humanReviewedBy`
- `reviewedByHumanAt` → `humanReviewedAt`

Atenção a contextos: em strings de mensagem (ex: error messages, logs) talvez não queira renomear; só renomear identificadores TypeScript / acessos a campos Prisma.

- [ ] **Step 1.5: Validar com tsc**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20
```

Expected: sem output (tsc passou). Se algum erro restante de tipo, corrigir.

- [ ] **Step 1.6: Commit**

```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
git add prisma/ src/ && \
git commit -m "feat(quality): migration aditiva schema agent quality system

Renomeia reviewerDecision/reviewedBy/reviewedByHumanAt -> humanStatus/
humanReviewedBy/humanReviewedAt. Torna assistantMessageId nullable
(suporta FALHA_TECNICA). Adiciona campos novos (status, patterns, model,
userMessageId, questionSnapshot, answerSnapshot, technicalError) e 3
indices. Campos antigos (escalas 1-5, recomendacaoPrompt, embedding)
mantidos como @deprecated pra preservar 4.914 rows historicas."
```

---

## Task 2: Helper persistMessageAndReturnId

**Files:**
- Modify: `src/lib/agent/conversation.ts:200-215`
- Test: `src/lib/agent/__tests__/conversation.test.ts` (criar se não existir, ou adicionar test ao existente)

- [ ] **Step 2.1: Write the failing test**

Adicionar (ou criar arquivo `src/lib/agent/__tests__/conversation.test.ts`):

```typescript
import { persistMessageAndReturnId } from "@/lib/agent/conversation";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    message: { create: jest.fn() },
    conversation: { findUnique: jest.fn() },
  },
}));

describe("persistMessageAndReturnId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates message and returns the generated id", async () => {
    const fakeId = "11111111-2222-3333-4444-555555555555";
    (prisma.message.create as jest.Mock).mockResolvedValue({ id: fakeId });

    const result = await persistMessageAndReturnId(
      "conv-id",
      "assistant",
      "hello",
    );

    expect(result).toBe(fakeId);
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conv-id",
        role: "assistant",
        content: "hello",
      }),
      select: { id: true },
    });
  });
});
```

- [ ] **Step 2.2: Run test (fails — function doesn't exist)**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
npx jest src/lib/agent/__tests__/conversation.test.ts 2>&1 | tail -20
```

Expected: FAIL com `persistMessageAndReturnId is not a function` ou similar.

- [ ] **Step 2.3: Implement persistMessageAndReturnId**

Em `src/lib/agent/conversation.ts`, adicionar após `persistMessage`:

```typescript
/**
 * Variante de persistMessage que retorna o ID da Message criada.
 * Usado pelo sistema de qualidade (/agente/qualidade) pra linkar a
 * avaliação ao messageId. Não substitui persistMessage (mantida pra
 * back-compat).
 *
 * @returns ID UUID da Message criada
 */
export async function persistMessageAndReturnId(
  conversationId: string,
  role: MessageRole,
  content: string,
  toolCalls?: ToolCall[],
): Promise<string> {
  const created = await prisma.message.create({
    data: {
      conversationId,
      role,
      content,
      toolCalls: toolCalls ? JSON.parse(JSON.stringify(toolCalls)) : undefined,
    },
    select: { id: true },
  });
  return created.id;
}
```

- [ ] **Step 2.4: Run test (passes)**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
npx jest src/lib/agent/__tests__/conversation.test.ts 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/agent/conversation.ts src/lib/agent/__tests__/conversation.test.ts && \
git commit -m "feat(quality): helper persistMessageAndReturnId

Variante de persistMessage que retorna o ID da Message criada. Necessario
pelo trigger de eval PENDENTE em run-agent.ts (Task 3)."
```

---

## Task 3: Trigger PENDENTE no run-agent.ts

**Files:**
- Modify: `src/lib/agent/run-agent.ts:550` (substituir `await persistMessage(...)` + adicionar trigger fire-and-forget)
- Test: `src/lib/agent/__tests__/run-agent-quality-trigger.test.ts` (criar)

- [ ] **Step 3.1: Write integration test**

Criar `src/lib/agent/__tests__/run-agent-quality-trigger.test.ts`:

```typescript
/**
 * Valida que o trigger fire-and-forget de eval PENDENTE roda apos a
 * resposta do agente, sem bloquear o retorno.
 *
 * Usa mock minimo de prisma pra inspecionar o create da eval.
 */
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversationQualityEvaluation: { create: jest.fn() },
    message: { findFirst: jest.fn() },
  },
}));

describe("eval PENDENTE trigger", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a PENDENTE eval row with snapshots and model", async () => {
    (prisma.message.findFirst as jest.Mock).mockResolvedValue({
      id: "user-msg-id",
    });
    (prisma.conversationQualityEvaluation.create as jest.Mock).mockResolvedValue(
      { id: "eval-id" },
    );

    // Simula a chamada do trigger (extraido pra funcao testavel — ver Step 3.3)
    const { createPendingEval } = await import("@/lib/agent/quality/trigger");
    await createPendingEval({
      conversationId: "conv-id",
      assistantMessageId: "assist-msg-id",
      userMessage: "Quanto faturamos hoje?",
      answerMessage: "Hoje faturamos R$ 12.345,67",
      model: "gpt-5.4-nano",
    });

    expect(prisma.conversationQualityEvaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conv-id",
        userMessageId: "user-msg-id",
        assistantMessageId: "assist-msg-id",
        status: "PENDENTE",
        model: "gpt-5.4-nano",
        judgeVersion: "v2-claude-code",
        questionSnapshot: "Quanto faturamos hoje?",
        answerSnapshot: "Hoje faturamos R$ 12.345,67",
      }),
    });
  });

  it("truncates snapshots to 4000 chars", async () => {
    (prisma.message.findFirst as jest.Mock).mockResolvedValue({ id: "u" });
    (prisma.conversationQualityEvaluation.create as jest.Mock).mockResolvedValue({
      id: "e",
    });
    const longText = "a".repeat(5000);

    const { createPendingEval } = await import("@/lib/agent/quality/trigger");
    await createPendingEval({
      conversationId: "c",
      assistantMessageId: "a",
      userMessage: longText,
      answerMessage: longText,
      model: "x",
    });

    const args = (prisma.conversationQualityEvaluation.create as jest.Mock).mock
      .calls[0][0];
    expect(args.data.questionSnapshot).toHaveLength(4000);
    expect(args.data.answerSnapshot).toHaveLength(4000);
  });
});
```

- [ ] **Step 3.2: Run test (fails — module doesn't exist)**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
npx jest src/lib/agent/__tests__/run-agent-quality-trigger.test.ts 2>&1 | tail -10
```

Expected: FAIL com `Cannot find module '@/lib/agent/quality/trigger'`.

- [ ] **Step 3.3: Implementar trigger module**

Criar `src/lib/agent/quality/trigger.ts`:

```typescript
/**
 * Trigger do sistema de qualidade (/agente/qualidade).
 *
 * createPendingEval: chamado fire-and-forget no fim do turno bem-sucedido
 * do agente. Insere row em ConversationQualityEvaluation com status PENDENTE.
 * Captura snapshots da pergunta e resposta pra histórico (LGPD: caso a
 * Message seja deletada depois, a avaliação preserva contexto).
 *
 * createTechnicalFailureEval: chamado fire-and-forget no catch externo do
 * runAgent quando o turno falha tecnicamente (timeout, tool crash, etc).
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.4
 */

import { prisma } from "@/lib/prisma";

const JUDGE_VERSION = "v2-claude-code";
const SNAPSHOT_CAP = 4000;
const ERROR_CAP = 1000;

export interface CreatePendingEvalArgs {
  conversationId: string;
  assistantMessageId: string;
  userMessage: string;
  answerMessage: string;
  model: string;
}

export async function createPendingEval(
  args: CreatePendingEvalArgs,
): Promise<void> {
  // Captura userMessageId via query (última msg user da conversa).
  // Seguro: persistMessage("user") foi awaited antes do turno do assistant,
  // então a user msg já está no banco no momento desta query.
  const lastUserMsg = await prisma.message.findFirst({
    where: { conversationId: args.conversationId, role: "user" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await prisma.conversationQualityEvaluation.create({
    data: {
      conversationId: args.conversationId,
      userMessageId: lastUserMsg?.id ?? null,
      assistantMessageId: args.assistantMessageId,
      judgeVersion: JUDGE_VERSION,
      status: "PENDENTE",
      model: args.model,
      questionSnapshot: args.userMessage.slice(0, SNAPSHOT_CAP),
      answerSnapshot: args.answerMessage.slice(0, SNAPSHOT_CAP),
    },
  });
}

export interface CreateTechnicalFailureEvalArgs {
  conversationId: string;
  userMessage: string;
  model: string;
  errorMessage: string;
}

export async function createTechnicalFailureEval(
  args: CreateTechnicalFailureEvalArgs,
): Promise<void> {
  // Atenção: NÃO buscar lastUserMsg via query aqui (race condition se o
  // erro aconteceu antes do persistMessage("user") rodar). Usar
  // args.userMessage direto e deixar userMessageId nullable.
  // Ver spec §5.4.
  await prisma.conversationQualityEvaluation.create({
    data: {
      conversationId: args.conversationId,
      userMessageId: null,
      assistantMessageId: null,
      judgeVersion: JUDGE_VERSION,
      status: "FALHA_TECNICA",
      model: args.model,
      questionSnapshot: args.userMessage.slice(0, SNAPSHOT_CAP),
      answerSnapshot: null,
      technicalError: args.errorMessage.slice(0, ERROR_CAP),
    },
  });
}
```

- [ ] **Step 3.4: Run trigger test (passes)**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
npx jest src/lib/agent/__tests__/run-agent-quality-trigger.test.ts 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 3.5: Modificar run-agent.ts pra usar persistMessageAndReturnId + trigger**

Em `src/lib/agent/run-agent.ts`, localizar a linha 550 (que tem `await persistMessage(args.conversationId, "assistant", message);`). Substituir por:

```typescript
const assistantMessageId = await persistMessageAndReturnId(
  args.conversationId,
  "assistant",
  message,
);

// Trigger fire-and-forget: cria eval PENDENTE pro sistema /agente/qualidade.
// Não bloqueia o usuário. Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.4
void (async () => {
  try {
    const { createPendingEval } = await import("@/lib/agent/quality/trigger");
    await createPendingEval({
      conversationId: args.conversationId,
      assistantMessageId,
      userMessage: args.userMessage,
      answerMessage: message,
      model: client.model,
    });
  } catch (err) {
    console.warn("[runAgent] falha nao-bloqueante ao criar eval PENDENTE:", err);
  }
})();
```

Adicionar import no topo do arquivo (se ainda não tiver):
```typescript
import { persistMessage, persistMessageAndReturnId } from "@/lib/agent/conversation";
```

- [ ] **Step 3.6: Validar tsc**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: sem erro.

- [ ] **Step 3.7: Commit**

```bash
git add src/lib/agent/quality/trigger.ts src/lib/agent/__tests__/run-agent-quality-trigger.test.ts src/lib/agent/run-agent.ts && \
git commit -m "feat(quality): trigger PENDENTE no run-agent.ts

Fire-and-forget cria row ConversationQualityEvaluation com status PENDENTE
no fim de cada turno bem-sucedido. Nao bloqueia retorno do agente.
Snapshots cap 4000 chars (LGPD)."
```

---

## Task 4: Trigger FALHA_TECNICA no catch externo do runAgent

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (catch externo do try grande)
- Test: adicionar caso ao `src/lib/agent/__tests__/run-agent-quality-trigger.test.ts`

- [ ] **Step 4.1: Localizar catch externo do runAgent**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
grep -nE "catch \(.*\) \{|^  \} finally \{" src/lib/agent/run-agent.ts
```

Expected: linha do catch principal do try grande em runAgent (deve estar perto do `finally` que fecha session).

- [ ] **Step 4.2: Add FALHA_TECNICA test**

Adicionar ao arquivo `src/lib/agent/__tests__/run-agent-quality-trigger.test.ts`:

```typescript
describe("eval FALHA_TECNICA trigger", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a FALHA_TECNICA row when run-agent throws", async () => {
    (prisma.conversationQualityEvaluation.create as jest.Mock).mockResolvedValue(
      { id: "eval-id" },
    );

    const { createTechnicalFailureEval } = await import(
      "@/lib/agent/quality/trigger"
    );
    await createTechnicalFailureEval({
      conversationId: "conv-id",
      userMessage: "qual o estoque?",
      model: "gpt-5.4-nano",
      errorMessage: "OpenAI Responses timeout apos 60000ms",
    });

    expect(prisma.conversationQualityEvaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conv-id",
        userMessageId: null,
        assistantMessageId: null,
        status: "FALHA_TECNICA",
        model: "gpt-5.4-nano",
        questionSnapshot: "qual o estoque?",
        answerSnapshot: null,
        technicalError: "OpenAI Responses timeout apos 60000ms",
      }),
    });
  });

  it("truncates technicalError to 1000 chars", async () => {
    (prisma.conversationQualityEvaluation.create as jest.Mock).mockResolvedValue({
      id: "e",
    });
    const longError = "x".repeat(1500);

    const { createTechnicalFailureEval } = await import(
      "@/lib/agent/quality/trigger"
    );
    await createTechnicalFailureEval({
      conversationId: "c",
      userMessage: "q",
      model: "x",
      errorMessage: longError,
    });

    const args = (prisma.conversationQualityEvaluation.create as jest.Mock).mock
      .calls[0][0];
    expect(args.data.technicalError).toHaveLength(1000);
  });
});
```

- [ ] **Step 4.3: Run test (passes — trigger module já tem createTechnicalFailureEval da Task 3)**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
npx jest src/lib/agent/__tests__/run-agent-quality-trigger.test.ts 2>&1 | tail -10
```

Expected: PASS (todos os 4 testes).

- [ ] **Step 4.4: Modificar catch externo em run-agent.ts**

No catch identificado no Step 4.1 (provavelmente próximo do `} finally { if (session) await session.close(); }`), adicionar antes do `throw err` (ou antes de retornar erro estruturado):

```typescript
// Trigger fire-and-forget: registra FALHA_TECNICA pra contabilizar no /agente/qualidade.
// Atenção: usar args.userMessage direto (não buscar lastUserMsg via query — race
// condition se o erro foi antes de persistMessage("user")).
void (async () => {
  try {
    const { createTechnicalFailureEval } = await import(
      "@/lib/agent/quality/trigger"
    );
    await createTechnicalFailureEval({
      conversationId: args.conversationId,
      userMessage: args.userMessage,
      model: resolvedLlm?.model ?? "unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  } catch (innerErr) {
    console.warn("[runAgent] falha ao criar eval FALHA_TECNICA:", innerErr);
  }
})();
```

Atenção: `resolvedLlm` precisa estar acessível no escopo do catch. Se não estiver, mover declaração `let resolvedLlm` pro escopo externo do try.

- [ ] **Step 4.5: Validar tsc**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: sem erro.

- [ ] **Step 4.6: Commit**

```bash
git add src/lib/agent/run-agent.ts src/lib/agent/__tests__/run-agent-quality-trigger.test.ts && \
git commit -m "feat(quality): trigger FALHA_TECNICA no catch externo do runAgent

Captura timeouts e erros internos como FALHA_TECNICA no sistema de
qualidade. KPI nao penaliza falhas tecnicas (separa erro do agente vs
erro de infra)."
```

---

## Task 5: Script CLI dump-pending.ts

**Files:**
- Create: `scripts/quality-audit/dump-pending.ts`

- [ ] **Step 5.1: Criar script dump-pending.ts**

```typescript
#!/usr/bin/env tsx
/**
 * Estagio 1 do fluxo de auditoria on-demand: extrai turnos PENDENTES
 * da tabela ConversationQualityEvaluation e gera batch JSON pro Claude
 * Code avaliar.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.5
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/dump-pending.ts [--limit 40] [--include-evaluated] [--out PATH]
 *
 * Output JSON format (compativel com batches R4/R5):
 * {
 *   "generatedAt": "2026-05-26T...",
 *   "count": N,
 *   "turnos": [
 *     {
 *       "evaluationId": "...",       // <- NOVO campo, ID da eval pra usar no commit
 *       "turnoId": "...",            // assistantMessageId (compat)
 *       "conversationId": "...",
 *       "userMessageId": "...",
 *       "assistantMessageId": "...",
 *       "userMessage": "...",
 *       "toolCalls": [...],
 *       "toolResults": {...},
 *       "finalMessage": "...",
 *       "model": "gpt-5.4-nano",
 *       "createdAt": "..."
 *     }
 *   ]
 * }
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { writeFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";

interface Args {
  limit: number;
  includeEvaluated: boolean;
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: 40, includeEvaluated: false, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") args.limit = parseInt(argv[++i] ?? "40", 10);
    else if (a === "--include-evaluated") args.includeEvaluated = true;
    else if (a === "--out") args.out = argv[++i] ?? null;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `[dump-pending] limit=${args.limit} include-evaluated=${args.includeEvaluated}`,
  );

  const where = args.includeEvaluated
    ? {}
    : { status: "PENDENTE" as const };

  const evals = await prisma.conversationQualityEvaluation.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: args.limit,
    select: {
      id: true,
      conversationId: true,
      userMessageId: true,
      assistantMessageId: true,
      questionSnapshot: true,
      answerSnapshot: true,
      model: true,
      createdAt: true,
    },
  });

  if (evals.length === 0) {
    console.log("[dump-pending] Nenhum turno pendente. Nada a avaliar.");
    process.exit(0);
  }

  // Pra cada eval, busca toolCalls + toolResults na Message do assistant
  // (se assistantMessageId nao for null — FALHA_TECNICA nao tem).
  const turnos = await Promise.all(
    evals.map(async (e) => {
      let toolCalls: unknown = null;
      let toolResults: unknown = null;
      if (e.assistantMessageId) {
        const msg = await prisma.message.findUnique({
          where: { id: e.assistantMessageId },
          select: { toolCalls: true, toolResults: true },
        });
        toolCalls = msg?.toolCalls ?? null;
        toolResults = msg?.toolResults ?? null;
      }
      return {
        evaluationId: e.id,
        turnoId: e.assistantMessageId ?? e.id,
        conversationId: e.conversationId,
        userMessageId: e.userMessageId,
        assistantMessageId: e.assistantMessageId,
        userMessage: e.questionSnapshot ?? "",
        toolCalls,
        toolResults,
        finalMessage: e.answerSnapshot ?? "",
        model: e.model ?? "unknown",
        createdAt: e.createdAt.toISOString(),
      };
    }),
  );

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out =
    args.out ??
    resolve(process.cwd(), `/tmp/quality-audit-pending-${ts}.json`);

  writeFileSync(
    out,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), count: turnos.length, turnos },
      null,
      2,
    ),
  );

  console.log(`[dump-pending] ${turnos.length} turnos em ${out}`);
  console.log(`Cole o path acima na proxima mensagem pra eu avaliar.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[dump-pending] erro:", err);
  process.exit(1);
});
```

- [ ] **Step 5.2: Testar o script manualmente**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
set -a && source .env.local && set +a && \
pnpm tsx scripts/quality-audit/dump-pending.ts --limit 5
```

Expected: roda sem erro. Se houver rows PENDENTES no banco, gera JSON em `/tmp/quality-audit-pending-{ts}.json`. Se não, imprime "Nenhum turno pendente".

- [ ] **Step 5.3: Commit**

```bash
git add scripts/quality-audit/dump-pending.ts && \
git commit -m "feat(quality): script CLI dump-pending.ts

Estagio 1 do fluxo on-demand: extrai turnos PENDENTES + tools/results
das mensagens linkadas, gera batch JSON pra Claude Code avaliar.
Default limit=40 (cabe no contexto)."
```

---

## Task 6: Script CLI commit-audit-results.ts

**Files:**
- Create: `scripts/quality-audit/commit-audit-results.ts`

- [ ] **Step 6.1: Criar script**

```typescript
#!/usr/bin/env tsx
/**
 * Estagio 3 do fluxo de auditoria on-demand: aplica resultados da
 * avaliacao do Claude Code no banco (atualiza rows
 * ConversationQualityEvaluation com status, patterns, razoes).
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.5
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/commit-audit-results.ts --results PATH [--force]
 *
 * Input JSON format:
 * {
 *   "results": [
 *     {
 *       "evaluationId": "uuid-da-eval",
 *       "status": "CORRETO|PARCIAL|ERRADO|FORA_DO_ESCOPO",
 *       "patterns": ["acerto_objetividade"],
 *       "razoes": "Diagnostico em texto livre"
 *     }
 *   ]
 * }
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";

const JUDGE_MODEL = "claude-opus-4-7-via-cc";
const JUDGE_VERSION = "v2-claude-code";

const VALID_STATUS = ["CORRETO", "PARCIAL", "ERRADO", "FORA_DO_ESCOPO"] as const;
type ValidStatus = (typeof VALID_STATUS)[number];

interface Result {
  evaluationId: string;
  status: ValidStatus;
  patterns: string[];
  razoes: string;
}

interface ResultsFile {
  results: Result[];
}

interface Args {
  resultsPath: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  let resultsPath = "";
  let force = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--results") resultsPath = argv[++i] ?? "";
    else if (a === "--force") force = true;
  }
  if (!resultsPath) {
    console.error("Uso: --results PATH (obrigatorio)");
    process.exit(1);
  }
  return { resultsPath, force };
}

async function main() {
  const args = parseArgs(process.argv);
  const raw = readFileSync(args.resultsPath, "utf8");
  const parsed = JSON.parse(raw) as ResultsFile;

  if (!parsed.results || !Array.isArray(parsed.results)) {
    console.error("JSON invalido: esperado { results: [...] }");
    process.exit(1);
  }

  const counts: Record<string, number> = {
    CORRETO: 0,
    PARCIAL: 0,
    ERRADO: 0,
    FORA_DO_ESCOPO: 0,
  };
  let skipped = 0;
  let updated = 0;

  for (const r of parsed.results) {
    if (!VALID_STATUS.includes(r.status)) {
      console.warn(`Status invalido em ${r.evaluationId}: ${r.status}. Pulando.`);
      continue;
    }

    // Verifica se ja foi avaliada (sem --force, pula).
    if (!args.force) {
      const existing = await prisma.conversationQualityEvaluation.findUnique({
        where: { id: r.evaluationId },
        select: { status: true },
      });
      if (existing && existing.status !== "PENDENTE") {
        skipped++;
        continue;
      }
    }

    await prisma.conversationQualityEvaluation.update({
      where: { id: r.evaluationId },
      data: {
        status: r.status,
        patterns: r.patterns ?? [],
        razoes: r.razoes ?? "",
        judgeModel: JUDGE_MODEL,
        judgeVersion: JUDGE_VERSION,
      },
    });

    counts[r.status]++;
    updated++;
  }

  console.log(`[commit] Atualizadas ${updated} rows.`);
  console.log(
    `  CORRETO: ${counts.CORRETO} | PARCIAL: ${counts.PARCIAL} | ERRADO: ${counts.ERRADO} | FORA_DO_ESCOPO: ${counts.FORA_DO_ESCOPO}`,
  );
  if (skipped > 0) {
    console.log(`  Puladas (ja avaliadas, sem --force): ${skipped}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[commit] erro:", err);
  process.exit(1);
});
```

- [ ] **Step 6.2: Testar com JSON de teste**

Criar arquivo de teste:
```bash
cat > /tmp/test-audit-result.json <<'EOF'
{
  "results": []
}
EOF
```

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
set -a && source .env.local && set +a && \
pnpm tsx scripts/quality-audit/commit-audit-results.ts --results /tmp/test-audit-result.json
```

Expected: `Atualizadas 0 rows. CORRETO: 0 | PARCIAL: 0 | ...`

- [ ] **Step 6.3: Commit**

```bash
git add scripts/quality-audit/commit-audit-results.ts && \
git commit -m "feat(quality): script CLI commit-audit-results.ts

Estagio 3 do fluxo: aplica resultados da avaliacao do Claude Code no
banco. Sem --force, pula rows ja avaliadas (preserva trabalho anterior).
Valida status contra enum fechado."
```

---

## Task 7: Script CLI trigger-health-check.ts

**Files:**
- Create: `scripts/quality-audit/trigger-health-check.ts`

- [ ] **Step 7.1: Criar script**

```typescript
#!/usr/bin/env tsx
/**
 * Health check do trigger de criacao de eval PENDENTE.
 *
 * Detecta caso em que o trigger esta silenciosamente quebrado (ex: schema
 * mudou e prisma client esta stale, ou erro permanente). Compara conversas
 * dos ultimos 7 dias com evals criadas no mesmo periodo. Se houver conversas
 * mas zero evals, sinaliza problema.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §6 Observabilidade
 *
 * CLI:
 *   pnpm tsx scripts/quality-audit/trigger-health-check.ts
 *
 * Exit code: 0 se saudavel, 1 se anomalia detectada.
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { prisma } from "@/lib/prisma";

async function main() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Exclui FALHA_TECNICA da contagem de evals (essas não vêm de assistant
  // message, vêm de erro pré-resposta — quebrariam a comparação 1:1).
  const [assistantCount, evalCount] = await Promise.all([
    prisma.message.count({
      where: { role: "assistant", createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.conversationQualityEvaluation.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        status: { not: "FALHA_TECNICA" },
      },
    }),
  ]);

  console.log(`[health-check] Ultimos 7 dias:`);
  console.log(`  Assistant messages: ${assistantCount}`);
  console.log(`  Evaluations criadas (excl. FALHA_TECNICA): ${evalCount}`);

  if (assistantCount > 0 && evalCount === 0) {
    console.error(
      `[health-check] ALERTA: ${assistantCount} respostas do agente nos ultimos 7 dias, mas 0 evals criadas. Trigger pode estar quebrado.`,
    );
    process.exit(1);
  }

  const coverage =
    assistantCount > 0
      ? ((evalCount / assistantCount) * 100).toFixed(1)
      : "N/A";
  console.log(`[health-check] Cobertura: ${coverage}% (saudavel >= 95%)`);

  if (assistantCount > 0 && evalCount / assistantCount < 0.95) {
    console.warn(
      `[health-check] Cobertura abaixo de 95%. Investigar se o trigger esta falhando em alguns casos.`,
    );
    process.exit(1);
  }

  console.log(`[health-check] OK`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[health-check] erro:", err);
  process.exit(1);
});
```

- [ ] **Step 7.2: Testar manualmente**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
set -a && source .env.local && set +a && \
pnpm tsx scripts/quality-audit/trigger-health-check.ts
```

Expected: imprime contagens. Hoje (antes das ondas anteriores popularem) provavelmente vai dizer cobertura baixa, OK.

- [ ] **Step 7.3: Commit**

```bash
git add scripts/quality-audit/trigger-health-check.ts && \
git commit -m "feat(quality): script CLI trigger-health-check.ts

Detecta trigger de eval PENDENTE silenciosamente quebrado. Compara
assistant messages vs evals criadas nos ultimos 7 dias, alerta se
cobertura < 95% ou zero."
```

---

## Task 8: Server queries da UI (KPIs, lista paginada, drill-down)

**Files:**
- Create: `src/lib/agent/quality/queries.ts`
- Create: `src/lib/agent/quality/queries.test.ts`

- [ ] **Step 8.1: Write failing test for KPI calculator**

Criar `src/lib/agent/quality/queries.test.ts`:

```typescript
import { calculateKpis, type RawEvalCounts } from "@/lib/agent/quality/queries";

describe("calculateKpis", () => {
  it("computes % CORRETO excluding PENDENTE and FALHA_TECNICA", () => {
    const counts: RawEvalCounts = {
      CORRETO: 200,
      PARCIAL: 50,
      ERRADO: 30,
      FORA_DO_ESCOPO: 20,
      PENDENTE: 100,
      FALHA_TECNICA: 5,
    };
    const kpis = calculateKpis(counts);
    expect(kpis.totalAvaliado).toBe(300);
    expect(kpis.percentCorreto).toBeCloseTo(66.67, 1);
    expect(kpis.pendentes).toBe(100);
    expect(kpis.falhasTecnicas).toBe(5);
  });

  it("returns null percent when no evaluations exist", () => {
    const counts: RawEvalCounts = {
      CORRETO: 0,
      PARCIAL: 0,
      ERRADO: 0,
      FORA_DO_ESCOPO: 0,
      PENDENTE: 50,
      FALHA_TECNICA: 0,
    };
    const kpis = calculateKpis(counts);
    expect(kpis.totalAvaliado).toBe(0);
    expect(kpis.percentCorreto).toBeNull();
  });

  it("returns 100% when all are CORRETO", () => {
    const counts: RawEvalCounts = {
      CORRETO: 10,
      PARCIAL: 0,
      ERRADO: 0,
      FORA_DO_ESCOPO: 0,
      PENDENTE: 0,
      FALHA_TECNICA: 0,
    };
    expect(calculateKpis(counts).percentCorreto).toBe(100);
  });
});
```

- [ ] **Step 8.2: Run test (fails — module doesn't exist)**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
npx jest src/lib/agent/quality/queries.test.ts 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 8.3: Implementar queries.ts**

Criar `src/lib/agent/quality/queries.ts`:

```typescript
/**
 * Queries server-side para a tela /agente/qualidade.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.6
 */

import "server-only";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type EvalStatus =
  | "CORRETO"
  | "PARCIAL"
  | "ERRADO"
  | "FORA_DO_ESCOPO"
  | "PENDENTE"
  | "FALHA_TECNICA";

export interface RawEvalCounts {
  CORRETO: number;
  PARCIAL: number;
  ERRADO: number;
  FORA_DO_ESCOPO: number;
  PENDENTE: number;
  FALHA_TECNICA: number;
}

export interface QualityKpisV2 {
  /** CORRETO + PARCIAL + ERRADO + FORA_DO_ESCOPO (exclui PENDENTE/FALHA_TECNICA). */
  totalAvaliado: number;
  corretos: number;
  parciais: number;
  errados: number;
  foraDoEscopo: number;
  pendentes: number;
  falhasTecnicas: number;
  /** null quando totalAvaliado === 0. */
  percentCorreto: number | null;
}

export interface EvaluationRow {
  id: string;
  createdAt: Date;
  conversationId: string;
  status: EvalStatus;
  patterns: string[];
  model: string | null;
  questionSnapshot: string | null;
  answerSnapshot: string | null;
  dominantPattern: string | null;
  humanStatus: string | null;
}

export interface EvaluationFilters {
  periodStart: Date;
  periodEnd: Date;
  status?: EvalStatus[];
  models?: string[];
  patterns?: string[];
  search?: string;
}

// ---------------------------------------------------------------------------
// Pure: KPI calculator (testavel sem DB)
// ---------------------------------------------------------------------------

export function calculateKpis(counts: RawEvalCounts): QualityKpisV2 {
  const totalAvaliado =
    counts.CORRETO + counts.PARCIAL + counts.ERRADO + counts.FORA_DO_ESCOPO;
  return {
    totalAvaliado,
    corretos: counts.CORRETO,
    parciais: counts.PARCIAL,
    errados: counts.ERRADO,
    foraDoEscopo: counts.FORA_DO_ESCOPO,
    pendentes: counts.PENDENTE,
    falhasTecnicas: counts.FALHA_TECNICA,
    percentCorreto:
      totalAvaliado > 0 ? (counts.CORRETO / totalAvaliado) * 100 : null,
  };
}

// ---------------------------------------------------------------------------
// DB queries
// ---------------------------------------------------------------------------

export async function getRawCounts(
  filters: EvaluationFilters,
): Promise<RawEvalCounts> {
  const where = buildWhere(filters);
  const grouped = await prisma.conversationQualityEvaluation.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  const counts: RawEvalCounts = {
    CORRETO: 0,
    PARCIAL: 0,
    ERRADO: 0,
    FORA_DO_ESCOPO: 0,
    PENDENTE: 0,
    FALHA_TECNICA: 0,
  };
  for (const row of grouped) {
    const s = row.status as EvalStatus;
    if (s in counts) counts[s] = row._count._all;
  }
  return counts;
}

export async function getKpis(
  filters: EvaluationFilters,
): Promise<QualityKpisV2> {
  return calculateKpis(await getRawCounts(filters));
}

export async function listEvaluations(
  filters: EvaluationFilters,
  pagination: { page: number; pageSize: number },
): Promise<{ rows: EvaluationRow[]; total: number }> {
  const where = buildWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.conversationQualityEvaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      select: {
        id: true,
        createdAt: true,
        conversationId: true,
        status: true,
        patterns: true,
        model: true,
        questionSnapshot: true,
        answerSnapshot: true,
        humanStatus: true,
      },
    }),
    prisma.conversationQualityEvaluation.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      status: r.status as EvalStatus,
      dominantPattern: r.patterns[0] ?? null,
    })),
    total,
  };
}

export async function getDistinctModels(): Promise<string[]> {
  const rows = await prisma.conversationQualityEvaluation.findMany({
    where: { model: { not: null } },
    distinct: ["model"],
    select: { model: true },
  });
  return rows
    .map((r) => r.model!)
    .filter(Boolean)
    .sort();
}

export async function getDistinctPatterns(
  filters: EvaluationFilters,
): Promise<Array<{ pattern: string; count: number }>> {
  // Postgres unnest pra contar patterns array.
  // NOTA: $queryRaw com Date precisa ser convertido pra ISO string ou usar
  // Prisma.sql tagged template pra segurança.
  const startIso = filters.periodStart.toISOString();
  const endIso = filters.periodEnd.toISOString();
  const rows = (await prisma.$queryRaw`
    SELECT pattern, COUNT(*)::int AS count
    FROM conversation_quality_evaluations,
         unnest(patterns) AS pattern
    WHERE created_at >= ${startIso}::timestamptz
      AND created_at <= ${endIso}::timestamptz
    GROUP BY pattern
    ORDER BY count DESC
    LIMIT 10
  `) as Array<{ pattern: string; count: number }>;
  return rows;
}

/** Timeseries de % CORRETO por dia, no período. */
export async function getDailyCorrectness(
  filters: EvaluationFilters,
): Promise<Array<{ date: string; percent: number | null; total: number }>> {
  const startIso = filters.periodStart.toISOString();
  const endIso = filters.periodEnd.toISOString();
  const rows = (await prisma.$queryRaw`
    SELECT
      date_trunc('day', created_at)::date AS date,
      COUNT(*) FILTER (WHERE status = 'CORRETO')::int AS corretos,
      COUNT(*) FILTER (WHERE status IN ('CORRETO','PARCIAL','ERRADO','FORA_DO_ESCOPO'))::int AS total
    FROM conversation_quality_evaluations
    WHERE created_at >= ${startIso}::timestamptz
      AND created_at <= ${endIso}::timestamptz
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<{ date: Date; corretos: number; total: number }>;
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    percent: r.total > 0 ? (r.corretos / r.total) * 100 : null,
    total: r.total,
  }));
}

export async function getEvaluationDetail(
  id: string,
): Promise<{
  evaluation: EvaluationRow & {
    razoes: string;
    judgeModel: string | null;
    judgeVersion: string;
    technicalError: string | null;
    humanReviewedBy: string | null;
    humanReviewedAt: Date | null;
  };
  toolCalls: unknown;
  toolResults: unknown;
} | null> {
  const ev = await prisma.conversationQualityEvaluation.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      conversationId: true,
      assistantMessageId: true,
      status: true,
      patterns: true,
      model: true,
      questionSnapshot: true,
      answerSnapshot: true,
      humanStatus: true,
      humanReviewedBy: true,
      humanReviewedAt: true,
      razoes: true,
      judgeModel: true,
      judgeVersion: true,
      technicalError: true,
    },
  });

  if (!ev) return null;

  let toolCalls: unknown = null;
  let toolResults: unknown = null;
  if (ev.assistantMessageId) {
    const msg = await prisma.message.findUnique({
      where: { id: ev.assistantMessageId },
      select: { toolCalls: true, toolResults: true },
    });
    toolCalls = msg?.toolCalls ?? null;
    toolResults = msg?.toolResults ?? null;
  }

  return {
    evaluation: {
      id: ev.id,
      createdAt: ev.createdAt,
      conversationId: ev.conversationId,
      status: ev.status as EvalStatus,
      patterns: ev.patterns,
      model: ev.model,
      questionSnapshot: ev.questionSnapshot,
      answerSnapshot: ev.answerSnapshot,
      humanStatus: ev.humanStatus,
      humanReviewedBy: ev.humanReviewedBy,
      humanReviewedAt: ev.humanReviewedAt,
      dominantPattern: ev.patterns[0] ?? null,
      razoes: ev.razoes,
      judgeModel: ev.judgeModel,
      judgeVersion: ev.judgeVersion,
      technicalError: ev.technicalError,
    },
    toolCalls,
    toolResults,
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function buildWhere(filters: EvaluationFilters) {
  const where: Record<string, unknown> = {
    createdAt: { gte: filters.periodStart, lte: filters.periodEnd },
  };
  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }
  if (filters.models && filters.models.length > 0) {
    where.model = { in: filters.models };
  }
  if (filters.patterns && filters.patterns.length > 0) {
    where.patterns = { hasSome: filters.patterns };
  }
  if (filters.search && filters.search.trim().length > 0) {
    const s = filters.search.trim();
    where.OR = [
      { questionSnapshot: { contains: s, mode: "insensitive" } },
      { answerSnapshot: { contains: s, mode: "insensitive" } },
    ];
  }
  return where;
}
```

- [ ] **Step 8.4: Run test (passes)**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
npx jest src/lib/agent/quality/queries.test.ts 2>&1 | tail -10
```

Expected: PASS (3 tests).

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/agent/quality/queries.ts src/lib/agent/quality/queries.test.ts && \
git commit -m "feat(quality): queries server pra /agente/qualidade

calculateKpis: pure (testado), formula % CORRETO exclui PENDENTE/
FALHA_TECNICA. getRawCounts/listEvaluations/getDistinct*/timeseries/
detail: queries Prisma + 2 raw SQL (unnest patterns + daily correctness)."
```

---

## Task 9: Server action de ajuste manual de status

**Files:**
- Create: `src/lib/actions/agent-quality.ts`

- [ ] **Step 9.1: Implementar server action**

Criar `src/lib/actions/agent-quality.ts`:

```typescript
"use server";

/**
 * Server actions de /agente/qualidade.
 *
 * adjustEvaluation: super_admin sobrescreve manualmente o status de uma
 * avaliacao (humanStatus). Auditado via humanReviewedBy + humanReviewedAt.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AdjustSchema = z.object({
  evaluationId: z.string().uuid(),
  humanStatus: z.enum([
    "CORRETO",
    "PARCIAL",
    "ERRADO",
    "FORA_DO_ESCOPO",
  ]),
  reason: z.string().min(1).max(2000),
});

export async function adjustEvaluation(input: {
  evaluationId: string;
  humanStatus: "CORRETO" | "PARCIAL" | "ERRADO" | "FORA_DO_ESCOPO";
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Permissão negada" };
  }

  const parsed = AdjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  // 1 raw SQL: atualiza humanStatus/Reviewer/At + append da justificativa
  // humana em razoes (não temos APPEND nativo no Prisma client).
  const nowIso = new Date().toISOString();
  await prisma.$executeRaw`
    UPDATE conversation_quality_evaluations
    SET
      human_status = ${parsed.data.humanStatus},
      human_reviewed_by = ${user.id}::uuid,
      human_reviewed_at = NOW(),
      razoes = COALESCE(razoes, '') || E'\n[AJUSTE HUMANO ' || ${nowIso} || E'] ' || ${parsed.data.reason}
    WHERE id = ${parsed.data.evaluationId}::uuid
  `;

  revalidatePath("/agente/qualidade");
  return { ok: true };
}
```

- [ ] **Step 9.2: Validar tsc**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: sem erro.

- [ ] **Step 9.3: Commit**

```bash
git add src/lib/actions/agent-quality.ts && \
git commit -m "feat(quality): server action adjustEvaluation

super_admin sobrescreve manualmente humanStatus de uma eval. Auditado
(humanReviewedBy, humanReviewedAt) e append da justificativa em razoes."
```

---

## Task 10: Consultar UI/UX Pro Max + criar componentes UI

Esta task tem prereq: **invocar a skill ui-ux-pro-max ANTES** de definir os componentes visuais. Skill é autoridade de design.

**Files:**
- Create: `src/components/agent/qualidade/qualidade-content.tsx`
- Create: `src/components/agent/qualidade/kpis-block.tsx`
- Create: `src/components/agent/qualidade/charts-block.tsx`
- Create: `src/components/agent/qualidade/evaluations-table.tsx`
- Create: `src/components/agent/qualidade/evaluations-table-filters.tsx`
- Create: `src/components/agent/qualidade/evaluation-drilldown.tsx`

- [ ] **Step 10.1: Invocar UI/UX Pro Max**

Antes de codificar, invocar a skill:

```
Skill tool: ui-ux-pro-max
args: "Sistema /agente/qualidade — dashboard interno super_admin. Layout copia exato de /agente/consumo (KpiCard, PeriodPills, charts, table). Conteúdo: 6 KPIs (% CORRETO, Total, Corretos, Parciais, Errados, Fora_escopo), 3 charts (linha + donut + barra), tabela paginada com drill-down inline. Estilo: profissional, neutro, foco em métricas. Preciso de orientações sobre: hierarquia visual dos KPIs, cores semânticas pra status (CORRETO verde, PARCIAL amarelo, ERRADO vermelho, FORA_DO_ESCOPO cinza, PENDENTE azul-claro, FALHA_TECNICA roxo), pattern chips, estado de loading, estado vazio."
```

Anotar as orientações recebidas. Aplicar nos componentes abaixo.

- [ ] **Step 10.2: Criar qualidade-content.tsx (orchestrator)**

```typescript
"use client";

/**
 * QualidadeContent — orchestrator client da tela /agente/qualidade.
 *
 * Padrão copiado de consumo-content.tsx.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodPills } from "@/components/reports/period-pills";
import { PeriodNavigator } from "@/components/dashboard/period-navigator";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  fetchQualityKpis,
  fetchQualityEvaluations,
  fetchQualityDistinctModels,
  fetchQualityDailyCorrectness,
  fetchQualityTopPatterns,
} from "@/lib/actions/quality-fetch";
import { KpisBlock } from "./kpis-block";
import { ChartsBlock } from "./charts-block";
import { EvaluationsTable } from "./evaluations-table";
import {
  getPeriodInTz,
  getCanonicalPeriod,
  type PeriodKey,
} from "@/lib/datetime-core";

const TZ = "America/Sao_Paulo";

interface QualidadeContentProps {
  minDate: string;
}

export function QualidadeContent({ minDate }: QualidadeContentProps) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("30d");
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>();
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [models, setModels] = useState<string[]>([]);
  const [kpis, setKpis] = useState<Awaited<ReturnType<typeof fetchQualityKpis>> | null>(null);
  const [evaluations, setEvaluations] = useState<Awaited<ReturnType<typeof fetchQualityEvaluations>> | null>(null);
  const [dailyData, setDailyData] = useState<Awaited<ReturnType<typeof fetchQualityDailyCorrectness>>>([]);
  const [topPatterns, setTopPatterns] = useState<Awaited<ReturnType<typeof fetchQualityTopPatterns>>>([]);
  const [loading, setLoading] = useState(true);

  const period = useMemo(() => {
    if (periodKey === "custom" && customRange) {
      return {
        start: new Date(customRange.start),
        end: new Date(customRange.end + "T23:59:59"),
      };
    }
    if (periodKey === "todos") {
      return { start: new Date(minDate), end: new Date() };
    }
    return getPeriodInTz(periodKey, TZ);
  }, [periodKey, customRange, minDate]);

  useEffect(() => {
    void fetchQualityDistinctModels().then(setModels);
  }, []);

  useEffect(() => {
    setLoading(true);
    const filters = {
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      models: modelFilter === "all" ? undefined : [modelFilter],
    };
    Promise.all([
      fetchQualityKpis(filters),
      fetchQualityEvaluations(filters, { page: 1, pageSize: 25 }),
      fetchQualityDailyCorrectness(filters),
      fetchQualityTopPatterns(filters),
    ])
      .then(([k, e, d, p]) => {
        setKpis(k);
        setEvaluations(e);
        setDailyData(d);
        setTopPatterns(p);
      })
      .catch((err) => {
        console.error("[QualidadeContent] falha ao buscar dados:", err);
        // TODO no executor: mostrar toast/banner de erro pro usuário
      })
      .finally(() => setLoading(false));
  }, [period, modelFilter]);

  return (
    <div className="space-y-6">
      {/* Filtros header */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <PeriodPills value={periodKey} onChange={setPeriodKey} />
          {periodKey === "custom" && (
            <PeriodNavigator
              minDate={new Date(minDate)}
              onChange={setCustomRange}
            />
          )}
          <div className="ml-auto">
            <CustomSelect
              value={modelFilter}
              onChange={setModelFilter}
              options={[
                { value: "all", label: "Todos os modelos" },
                ...models.map((m) => ({ value: m, label: m })),
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {kpis && <KpisBlock kpis={kpis} loading={loading} />}
      {kpis && <ChartsBlock dailyData={dailyData} kpis={kpis} topPatterns={topPatterns} loading={loading} />}
      {evaluations && (
        <EvaluationsTable
          initialData={evaluations}
          filters={{
            periodStart: period.start.toISOString(),
            periodEnd: period.end.toISOString(),
            models: modelFilter === "all" ? undefined : [modelFilter],
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 10.3: Criar kpis-block.tsx**

```typescript
"use client";

import { KpiCard } from "@/components/reports/kpi-card";
import { CheckCircle2, AlertCircle, XCircle, MinusCircle, Clock, AlertTriangle } from "lucide-react";
import type { QualityKpisV2 } from "@/lib/agent/quality/queries";

interface Props {
  kpis: QualityKpisV2;
  loading: boolean;
}

export function KpisBlock({ kpis, loading }: Props) {
  const percentLabel = kpis.percentCorreto !== null
    ? `${kpis.percentCorreto.toFixed(1)}%`
    : "—";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={CheckCircle2}
          label="% CORRETO"
          value={percentLabel}
          tooltip="CORRETO / (CORRETO + PARCIAL + ERRADO + FORA_DO_ESCOPO). Exclui PENDENTE e FALHA_TECNICA."
          color="green"
          loading={loading}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Total avaliado"
          value={kpis.totalAvaliado.toString()}
          color="neutral"
          loading={loading}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Corretos"
          value={kpis.corretos.toString()}
          color="green"
          loading={loading}
        />
        <KpiCard
          icon={AlertCircle}
          label="Parciais"
          value={kpis.parciais.toString()}
          color="amber"
          loading={loading}
        />
        <KpiCard
          icon={XCircle}
          label="Errados"
          value={kpis.errados.toString()}
          color="red"
          loading={loading}
        />
        <KpiCard
          icon={MinusCircle}
          label="Fora de escopo"
          value={kpis.foraDoEscopo.toString()}
          color="neutral"
          loading={loading}
        />
      </div>
      {(kpis.pendentes > 0 || kpis.falhasTecnicas > 0) && (
        <div className="text-sm text-muted-foreground flex gap-4 items-center px-1">
          {kpis.pendentes > 0 && (
            <span className="flex items-center gap-1">
              <Clock size={14} /> {kpis.pendentes} pendentes aguardando auditoria
            </span>
          )}
          {kpis.falhasTecnicas > 0 && (
            <span className="flex items-center gap-1 text-purple-600">
              <AlertTriangle size={14} /> {kpis.falhasTecnicas} falhas técnicas
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

**Atenção: `KpiCard` pode não ter prop `color` ou `tooltip` no projeto.** Verificar a assinatura real em `src/components/reports/kpi-card.tsx` e ajustar. Se faltar essas props, estender o componente ou simplificar a UI.

- [ ] **Step 10.4: Criar charts-block.tsx**

```typescript
"use client";

import { InteractiveAreaChart, DonutWithCenter, InteractiveBarChart } from "@/components/charts/interactive";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QualityKpisV2 } from "@/lib/agent/quality/queries";

interface Props {
  dailyData: Array<{ date: string; percent: number | null; total: number }>;
  kpis: QualityKpisV2;
  topPatterns: Array<{ pattern: string; count: number }>;
  loading: boolean;
}

const STATUS_COLORS = {
  CORRETO: "#22c55e",
  PARCIAL: "#f59e0b",
  ERRADO: "#ef4444",
  FORA_DO_ESCOPO: "#94a3b8",
};

export function ChartsBlock({ dailyData, kpis, topPatterns, loading }: Props) {
  const donutData = [
    { name: "CORRETO", value: kpis.corretos, color: STATUS_COLORS.CORRETO },
    { name: "PARCIAL", value: kpis.parciais, color: STATUS_COLORS.PARCIAL },
    { name: "ERRADO", value: kpis.errados, color: STATUS_COLORS.ERRADO },
    { name: "FORA_DO_ESCOPO", value: kpis.foraDoEscopo, color: STATUS_COLORS.FORA_DO_ESCOPO },
  ].filter((d) => d.value > 0);

  const lineData = dailyData.map((d) => ({
    date: d.date,
    "% CORRETO": d.percent ?? 0,
  }));

  const barData = topPatterns.map((p) => ({
    name: p.pattern,
    count: p.count,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">% CORRETO por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <InteractiveAreaChart data={lineData} dataKey="% CORRETO" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Distribuição de status</CardTitle>
        </CardHeader>
        <CardContent>
          <DonutWithCenter data={donutData} centerLabel={`${kpis.totalAvaliado}`} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Top 10 padrões</CardTitle>
        </CardHeader>
        <CardContent>
          <InteractiveBarChart data={barData} dataKey="count" />
        </CardContent>
      </Card>
    </div>
  );
}
```

**Atenção**: assinatura exata de `InteractiveAreaChart`, `DonutWithCenter`, `InteractiveBarChart` precisa ser verificada em `src/components/charts/interactive.ts(x)` antes de codificar. Ajustar props conforme.

- [ ] **Step 10.5: Criar evaluations-table.tsx + drilldown + filtros**

(Devido ao tamanho, omito código completo aqui e referencio o padrão direto.)

Estrutura mínima:
- `evaluations-table.tsx`: usa `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` de `@/components/ui/table`. Colunas: Data | Pergunta (trunc 80 + Tooltip) | Resposta (trunc 80 + Tooltip) | Status (Badge colorido) | Modelo | Pattern dominante (Badge) | Ações (botão "Ver").
- `evaluations-table-filters.tsx`: search input + multi-select status + multi-select pattern + select modelo. Aplicar via callback `onFiltersChange`.
- `evaluation-drilldown.tsx`: slide-down inline. Mostra pergunta+resposta completa, tool calls e tool results (lidos via `getEvaluationDetail`), badge status, razões, patterns chips, bloco de ajuste manual com `adjustEvaluation` server action.

**Atenção**: o padrão `UsageDetailInline` em `src/components/agent/consumo/usage-detail-inline.tsx` é a referência exata pra esse drill-down. Copiar a estrutura e adaptar campos.

Como o tamanho deste plano impede embed do código completo, ao chegar nesta task abra `usage-detail-inline.tsx` (374 linhas), `usage-table-filters.tsx` (293 linhas) e adapte:
- `UsageDetailRow` → `EvaluationRow`
- Campos de custo → campos de status/patterns/razoes
- Toolcalls e tool results: parsed JSON em `<details>` colapsável

- [ ] **Step 10.6: Criar wrapper de server actions pra fetch**

Criar `src/lib/actions/quality-fetch.ts`:

```typescript
"use server";

import { getCurrentUser } from "@/lib/auth";
import {
  getKpis,
  listEvaluations,
  getDistinctModels,
  getDailyCorrectness,
  getDistinctPatterns,
  getEvaluationDetail,
  type EvaluationFilters,
} from "@/lib/agent/quality/queries";

async function gate() {
  const user = await getCurrentUser();
  if (!user || user.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
}

interface FilterInputs {
  periodStart: string;
  periodEnd: string;
  status?: string[];
  models?: string[];
  patterns?: string[];
  search?: string;
}

function toFilters(f: FilterInputs): EvaluationFilters {
  return {
    periodStart: new Date(f.periodStart),
    periodEnd: new Date(f.periodEnd),
    status: f.status as EvaluationFilters["status"],
    models: f.models,
    patterns: f.patterns,
    search: f.search,
  };
}

export async function fetchQualityKpis(f: FilterInputs) {
  await gate();
  return getKpis(toFilters(f));
}

export async function fetchQualityEvaluations(
  f: FilterInputs,
  pagination: { page: number; pageSize: number },
) {
  await gate();
  return listEvaluations(toFilters(f), pagination);
}

export async function fetchQualityDistinctModels() {
  await gate();
  return getDistinctModels();
}

export async function fetchQualityDailyCorrectness(f: FilterInputs) {
  await gate();
  return getDailyCorrectness(toFilters(f));
}

export async function fetchQualityTopPatterns(f: FilterInputs) {
  await gate();
  return getDistinctPatterns(toFilters(f));
}

export async function fetchQualityEvaluationDetail(id: string) {
  await gate();
  return getEvaluationDetail(id);
}
```

- [ ] **Step 10.7: Validar tsc**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20
```

Expected: sem erro (ou apenas erros de props que precisam ajuste pelas verificações de assinatura).

- [ ] **Step 10.8: Commit**

```bash
git add src/components/agent/qualidade/ src/lib/actions/quality-fetch.ts && \
git commit -m "feat(quality): componentes UI /agente/qualidade

KpisBlock, ChartsBlock, EvaluationsTable, EvaluationDrilldown, filtros.
Padrao copiado de /agente/consumo (KpiCard, PeriodPills, charts,
table). Server actions com gate super_admin."
```

---

## Task 11: Página /agente/qualidade

**Files:**
- Create: `src/app/(protected)/agente/qualidade/page.tsx`

- [ ] **Step 11.1: Implementar page.tsx**

```typescript
/**
 * /agente/qualidade — dashboard interno de qualidade do Agente Nex.
 *
 * Gate: super_admin (aplicado também no layout do grupo /agente).
 * Server Component: busca a data mínima de avaliação e passa para o Client.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md
 */

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QualidadeContent } from "@/components/agent/qualidade/qualidade-content";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = { title: "Qualidade do Agente | Matrix Fitness Group" };
export const dynamic = "force-dynamic";

export default async function QualidadePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  // Data mais antiga de avaliação (pra range "todos")
  const oldest = await prisma.conversationQualityEvaluation.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const minDate = oldest?.createdAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return (
    <PageShell variant="form">
      <PageHeader
        icon={ShieldCheck}
        title="Qualidade do Agente Nex"
        subtitle="Desempenho semântico das respostas por modelo e período."
      />
      <QualidadeContent minDate={minDate.toISOString()} />
    </PageShell>
  );
}
```

- [ ] **Step 11.2: Validar tsc**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: sem erro.

- [ ] **Step 11.3: Commit**

```bash
git add "src/app/(protected)/agente/qualidade/page.tsx" && \
git commit -m "feat(quality): rota /agente/qualidade (server component)

super_admin gate via layout. Server fetch da data minima de avaliacao.
Delega ao QualidadeContent (client)."
```

---

## Task 12: Redirect 307 /agente/inteligencia → /agente/qualidade

**Files:**
- Modify: `src/app/(protected)/agente/inteligencia/page.tsx`

- [ ] **Step 12.1: Substituir page.tsx por redirect**

```typescript
/**
 * /agente/inteligencia — deprecated, redirect 307 pra /agente/qualidade.
 *
 * Sistema antigo (escalas 1-5, judge externo) substituido pelo novo
 * /agente/qualidade (status discreto, judge via Claude Code).
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md §5.7
 */
import { permanentRedirect } from "next/navigation";

export default function InteligenciaPage(): never {
  // 307 (preserva método HTTP). Não usamos 308 permanente — facilita reverter.
  permanentRedirect("/agente/qualidade");
}
```

**Atenção**: `permanentRedirect` é 308 em Next. Pra 307 use `redirect()` com status. Conforme docs Next 16:
- `redirect(path)` → 307 (temporary, padrão em server actions/components)
- `permanentRedirect(path)` → 308

Pra spec (307 temporário): usar `redirect("/agente/qualidade")`.

Substituir o código acima por:

```typescript
import { redirect } from "next/navigation";

export default function InteligenciaPage(): never {
  redirect("/agente/qualidade");
}
```

- [ ] **Step 12.2: Validar tsc e testar manualmente**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

Expected: sem erro.

Iniciar dev server e abrir `/agente/inteligencia`. Confirmar que redireciona pra `/agente/qualidade` (307 no Network do DevTools).

- [ ] **Step 12.3: Commit**

```bash
git add "src/app/(protected)/agente/inteligencia/page.tsx" && \
git commit -m "feat(quality): redirect 307 /agente/inteligencia -> /agente/qualidade

Sistema antigo de qualidade (escalas 1-5, judge externo, layout ruim)
substituido pelo novo /agente/qualidade. Redirect 307 (temporario) ao
inves de 308 (permanente) pra facilitar reverter se necessario."
```

---

## Task 13: Smoke test E2E manual

- [ ] **Step 13.1: Disparar 1 turno do agente Nex em playground/web**

Abrir playground (`/agente/playground`) e mandar uma pergunta simples (ex: "quantos parceiros temos?"). Aguardar resposta completa.

- [ ] **Step 13.2: Verificar row PENDENTE no banco**

Run:
```bash
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c \
  "SELECT id, status, model, LEFT(question_snapshot, 60) as q FROM conversation_quality_evaluations ORDER BY created_at DESC LIMIT 3;"
```

Expected: linha nova com `status=PENDENTE`, `model='gpt-5.4-nano'`, question_snapshot batendo com a pergunta.

- [ ] **Step 13.3: Rodar dump-pending**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
set -a && source .env.local && set +a && \
pnpm tsx scripts/quality-audit/dump-pending.ts --limit 10
```

Expected: imprime path do JSON gerado em `/tmp/`.

- [ ] **Step 13.4: Avaliar manualmente (eu — Claude Code) e gerar results.json**

Eu (Claude Code Opus 4.7) leio o JSON do step anterior, avalio cada turno seguindo a taxonomia (CORRETO/PARCIAL/ERRADO/FORA_DO_ESCOPO + patterns), e escrevo `/tmp/audit-results-{ts}.json` no formato esperado pelo commit-script.

- [ ] **Step 13.5: Rodar commit-audit-results**

Run:
```bash
cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo" && \
set -a && source .env.local && set +a && \
pnpm tsx scripts/quality-audit/commit-audit-results.ts --results /tmp/audit-results-{ts}.json
```

Expected: `Atualizadas N rows. Quebra: ...`

- [ ] **Step 13.6: Verificar UI**

Iniciar dev server. Abrir `/agente/qualidade`. Confirmar:
- KPIs mostram contagens incluindo os turnos novos
- Tabela lista os turnos com status correto
- Drill-down abre e mostra tools/results
- Filtros funcionam

- [ ] **Step 13.7: Testar redirect**

Abrir `/agente/inteligencia`. Confirmar redirect pra `/agente/qualidade`.

- [ ] **Step 13.7b: Validar performance das queries (EXPLAIN ANALYZE)**

Spec §6 exige verificar EXPLAIN ANALYZE pras queries críticas. Rodar no banco:

```bash
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "
EXPLAIN ANALYZE
SELECT date_trunc('day', created_at)::date AS date,
       COUNT(*) FILTER (WHERE status = 'CORRETO')::int AS corretos,
       COUNT(*) FILTER (WHERE status IN ('CORRETO','PARCIAL','ERRADO','FORA_DO_ESCOPO'))::int AS total
FROM conversation_quality_evaluations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 1 ASC;
"
```

Expected: tempo total < 200ms. Se >500ms com volume atual, criar issue de follow-up pra adicionar índice ou materialized view.

Repetir pro unnest de patterns:

```bash
docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "
EXPLAIN ANALYZE
SELECT pattern, COUNT(*)::int AS count
FROM conversation_quality_evaluations, unnest(patterns) AS pattern
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY pattern ORDER BY count DESC LIMIT 10;
"
```

Expected: tempo total < 200ms.

- [ ] **Step 13.8: Commit final + tag (se for fechar a onda)**

```bash
git push origin feat/agente-nex-inteligencia
```

(Não fazer merge pra main — onda continua, esperando bateria 6 e Onda 2.)

---

## Self-review checklist (após executar todas as tasks)

- [ ] **Spec coverage**: cada uma das 12 etapas da §9 da spec tem task correspondente? ✅
- [ ] **Placeholder scan**: zero "TBD/TODO/implement later" no plano. ✅
- [ ] **Type consistency**: `EvaluationRow` consistente entre queries.ts e components? ✅
- [ ] **Trigger health check**: criado na Task 7 ✅
- [ ] **UI/UX Pro Max invocado**: Task 10 ✅
- [ ] **Migration aditiva sem perda**: ✅
- [ ] **Test coverage**: KPI calculator + helpers + triggers — todos testados ✅

---

## Notas pra quem executar

1. **Tasks 1, 2, 3, 4 são bloqueantes**: schema → helper → trigger PENDENTE → trigger FALHA_TECNICA. Não pular ordem.
2. **Tasks 5, 6, 7 podem ser paralelas** entre si (scripts CLI independentes).
3. **Tasks 8, 9 antes da 10**: UI depende das queries e server actions.
4. **Task 10 EXIGE invocar `ui-ux-pro-max` skill antes de codificar componentes**. Não pular.
5. **Task 13 é smoke test manual**: precisa dev server + DB rodando, e eu (Claude Code) preciso fazer a avaliação no Step 13.4.
6. **Não fazer merge pra main**: trabalho continua na branch até bateria 6 validar com Ondas 1+2.

## Rollback strategy

Se a migration da Task 1 falhar ou causar problema em produção:

1. Revert do schema:
   ```bash
   cd "PROJECT_DIR" && \
   git revert <commit-hash-da-migration> && \
   npx prisma migrate dev --name revert_agent_quality_system
   ```
2. Restaurar tabela pra estado anterior: o Prisma vai gerar uma migration que desfaz renomes e remove campos novos. Como é aditiva, **nenhuma data antiga é perdida** (4.914 rows ficam intactas, campos novos viram NULL/DROP).
3. Se houver rows novas (PENDENTE/FALHA_TECNICA) criadas após migration, elas ficam órfãs mas inofensivas — só ocupam espaço. Limpar com `DELETE FROM conversation_quality_evaluations WHERE status IN ('PENDENTE','FALHA_TECNICA') AND created_at >= '{migration-date}';`

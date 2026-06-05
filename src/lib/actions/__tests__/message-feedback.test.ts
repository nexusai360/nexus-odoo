/**
 * B1. Testes da server action submitMessageFeedback.
 * Padrão da casa: mock de @/lib/prisma + @/lib/auth (sem Postgres real).
 * Cascade e concorrência são verificados no E2E (não testáveis com mock).
 */

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

import { submitMessageFeedback } from "../message-feedback";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const USER = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";

function happyContext() {
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: USER });
  (prisma.message.findUnique as jest.Mock).mockResolvedValue({
    id: MSG,
    role: "assistant",
    conversation: { id: CONV, userId: USER, channel: "in_app" },
  });
  (prisma.agentSettings.findUnique as jest.Mock).mockResolvedValue({
    feedbackCheckpoint: "PRODUCTION",
  });
  // $transaction executa o callback com o próprio prisma mock como tx.
  (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
}

beforeEach(() => {
  jest.clearAllMocks();
  happyContext();
});

test("cria voto novo e grava evento created", async () => {
  (prisma.messageFeedback.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.messageFeedback.create as jest.Mock).mockResolvedValue({
    id: "fb1", rating: "CORRETO", comment: null, updatedAt: new Date(),
  });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(true);
  expect(prisma.messageFeedback.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ rating: "CORRETO", userId: USER, assistantMessageId: MSG, conversationId: CONV }),
    }),
  );
  expect(prisma.messageFeedbackEvent.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ action: "created", rating: "CORRETO" }),
  });
});

test("troca de rating limpa comentario e grava rating_changed", async () => {
  (prisma.messageFeedback.findUnique as jest.Mock).mockResolvedValue({ id: "fb1", rating: "PARCIAL", comment: "faltou X" });
  (prisma.messageFeedback.update as jest.Mock).mockResolvedValue({ id: "fb1", rating: "ERRADO", comment: null, updatedAt: new Date() });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "ERRADO" });
  expect(res.success).toBe(true);
  expect(prisma.messageFeedback.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { rating: "ERRADO", comment: null } }),
  );
  expect(prisma.messageFeedbackEvent.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ action: "rating_changed", comment: null }),
  });
});

test("comentario sem trocar rating gera comment_set", async () => {
  (prisma.messageFeedback.findUnique as jest.Mock).mockResolvedValue({ id: "fb1", rating: "ERRADO", comment: null });
  (prisma.messageFeedback.update as jest.Mock).mockResolvedValue({ id: "fb1", rating: "ERRADO", comment: "certo era 8", updatedAt: new Date() });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "ERRADO", comment: "certo era 8" });
  expect(res.success).toBe(true);
  expect(prisma.messageFeedbackEvent.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ action: "comment_set", comment: "certo era 8" }),
  });
});

test("reclique identico e no-op (nao gera evento)", async () => {
  (prisma.messageFeedback.findUnique as jest.Mock).mockResolvedValue({ id: "fb1", rating: "CORRETO", comment: null });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(true);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.messageFeedbackEvent.create).not.toHaveBeenCalled();
});

test("nao-dono e recusado", async () => {
  (prisma.message.findUnique as jest.Mock).mockResolvedValue({
    id: MSG, role: "assistant", conversation: { id: CONV, userId: "outro", channel: "in_app" },
  });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(false);
});

test("conversa nao in_app e recusada", async () => {
  (prisma.message.findUnique as jest.Mock).mockResolvedValue({
    id: MSG, role: "assistant", conversation: { id: CONV, userId: USER, channel: "playground" },
  });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(false);
});

test("checkpoint != PRODUCTION recusa", async () => {
  (prisma.agentSettings.findUnique as jest.Mock).mockResolvedValue({ feedbackCheckpoint: "OFF" });
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(false);
});

test("comment > 150 e recusado (zod)", async () => {
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "ERRADO", comment: "x".repeat(151) });
  expect(res.success).toBe(false);
});

test("rating invalido recusado (zod)", async () => {
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "XPTO" });
  expect(res.success).toBe(false);
});

test("nao autenticado recusa", async () => {
  (getCurrentUser as jest.Mock).mockResolvedValue(null);
  const res = await submitMessageFeedback({ assistantMessageId: MSG, rating: "CORRETO" });
  expect(res.success).toBe(false);
});

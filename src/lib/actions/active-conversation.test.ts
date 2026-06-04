import { describe, expect, it, jest, beforeEach } from "@jest/globals";

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

import {
  getActiveConversationId,
  archiveActiveConversation,
} from "./active-conversation";

const { prisma } = jest.requireMock("@/lib/prisma") as any;
const { getCurrentUser } = jest.requireMock("@/lib/auth") as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getActiveConversationId", () => {
  it("retorna ok:false sem usuario", async () => {
    getCurrentUser.mockResolvedValue(null);
    const r = await getActiveConversationId();
    expect(r).toEqual({ ok: false });
    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
  });

  it("retorna conversationId null quando nao ha conversa ativa", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.conversation.findFirst.mockResolvedValue(null);
    const r = await getActiveConversationId();
    expect(r).toEqual({ ok: true, conversationId: null });
  });

  it("resolve a conversa in_app ativa mais recente", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.conversation.findFirst.mockResolvedValue({ id: "c9" });
    const r = await getActiveConversationId();
    expect(r).toEqual({ ok: true, conversationId: "c9" });
    const arg = prisma.conversation.findFirst.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u1", channel: "in_app", endedAt: null });
    expect(arg.orderBy).toEqual({ updatedAt: "desc" });
  });
});

describe("archiveActiveConversation", () => {
  it("erro sem usuario", async () => {
    getCurrentUser.mockResolvedValue(null);
    const r = await archiveActiveConversation("c1");
    expect(r).toEqual({ ok: false, error: "Não autenticado" });
  });

  it("erro com id vazio", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    const r = await archiveActiveConversation("");
    expect(r).toMatchObject({ ok: false });
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("nega conversa de outro usuario", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.conversation.findUnique.mockResolvedValue({ userId: "outro", endedAt: null });
    const r = await archiveActiveConversation("c1");
    expect(r).toEqual({ ok: false, error: "Acesso negado" });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("idempotente quando ja arquivada", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.conversation.findUnique.mockResolvedValue({
      userId: "u1",
      endedAt: new Date(),
    });
    const r = await archiveActiveConversation("c1");
    expect(r).toEqual({ ok: true });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it("arquiva conversa ativa setando endedAt", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    prisma.conversation.findUnique.mockResolvedValue({ userId: "u1", endedAt: null });
    prisma.conversation.update.mockResolvedValue({});
    const r = await archiveActiveConversation("c1");
    expect(r).toEqual({ ok: true });
    const arg = prisma.conversation.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "c1" });
    expect(arg.data.endedAt).toBeInstanceOf(Date);
  });
});

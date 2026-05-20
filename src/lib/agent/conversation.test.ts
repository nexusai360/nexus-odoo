import {
  getOrCreateWhatsappConversation,
  createConversation,
  assertConversationOwned,
  loadHistory,
  persistMessage,
  deriveTitle,
} from "./conversation";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const { prisma } = jest.requireMock("@/lib/prisma");

beforeEach(() => jest.clearAllMocks());

describe("deriveTitle", () => {
  test("trunca mensagem longa em ~60 chars com ellipsis", () => {
    const long = "a".repeat(100);
    const title = deriveTitle(long);
    expect(title.length).toBeLessThanOrEqual(63); // 60 + "..."
    expect(title).toContain("...");
  });

  test("mensagem curta → retorna sem truncar", () => {
    const short = "Qual o saldo do estoque?";
    expect(deriveTitle(short)).toBe(short);
  });

  test("string vazia → retorna 'Nova conversa'", () => {
    expect(deriveTitle("")).toBe("Nova conversa");
  });
});

describe("getOrCreateWhatsappConversation", () => {
  test("reusa conversa whatsapp com última msg < 24h", async () => {
    const recentTime = new Date(Date.now() - 60 * 60 * 1000); // 1h atrás
    prisma.conversation.findFirst.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
      channel: "whatsapp",
      updatedAt: recentTime,
    });

    const conv = await getOrCreateWhatsappConversation("user-1");
    expect(conv.id).toBe("conv-1");
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  test("cria nova conversa quando nenhuma existe", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({
      id: "conv-new",
      userId: "user-1",
      channel: "whatsapp",
      updatedAt: new Date(),
    });

    const conv = await getOrCreateWhatsappConversation("user-1");
    expect(conv.id).toBe("conv-new");
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "whatsapp", userId: "user-1" }),
      }),
    );
  });
});

describe("createConversation", () => {
  test("cria conversa com channel e userId", async () => {
    prisma.conversation.create.mockResolvedValue({
      id: "conv-99",
      userId: "user-2",
      channel: "in_app",
      updatedAt: new Date(),
    });

    const conv = await createConversation("user-2", "in_app");
    expect(conv.id).toBe("conv-99");
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "in_app", userId: "user-2" }),
      }),
    );
  });
});

describe("assertConversationOwned", () => {
  test("não lança quando conversa pertence ao usuário", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "conv-1",
      userId: "user-1",
    });
    await expect(assertConversationOwned("conv-1", "user-1")).resolves.not.toThrow();
  });

  test("lança quando conversa não existe", async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(assertConversationOwned("conv-xxx", "user-1")).rejects.toThrow(/não encontrada/i);
  });

  test("lança quando conversa pertence a outro usuário", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "conv-1",
      userId: "user-2",
    });
    await expect(assertConversationOwned("conv-1", "user-1")).rejects.toThrow(/acesso negado/i);
  });
});

describe("loadHistory", () => {
  test("retorna mensagens em ordem cronológica (últimas N, invertidas)", async () => {
    // findMany é chamado com orderBy: desc — o mock retorna as msgs em ordem desc
    // (mais recente primeiro). O código faz .reverse() para ordem cronológica.
    prisma.message.findMany.mockResolvedValue([
      { id: "m2", role: "assistant", content: "Oi!", toolCalls: null },
      { id: "m1", role: "user", content: "Olá", toolCalls: null },
    ]);

    const history = await loadHistory("conv-1", 10);
    expect(history).toHaveLength(2);
    // Após reverse: m1(user) primeiro, m2(assistant) depois
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("assistant");
  });

  test("busca com orderBy desc para retornar as últimas mensagens", async () => {
    prisma.message.findMany.mockResolvedValue([]);
    await loadHistory("conv-1", 20);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    );
  });

  test("budget 0 → retorna array vazio", async () => {
    const history = await loadHistory("conv-1", 0);
    expect(history).toEqual([]);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe("persistMessage", () => {
  test("grava mensagem user sem toolCalls", async () => {
    prisma.message.create.mockResolvedValue({ id: "m-new" });
    await persistMessage("conv-1", "user", "Pergunta");
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv-1",
          role: "user",
          content: "Pergunta",
        }),
      }),
    );
  });

  test("grava mensagem assistant com toolCalls serializado", async () => {
    prisma.message.create.mockResolvedValue({ id: "m-tool" });
    const toolCalls = [{ id: "tc1", name: "estoque_saldo_produto", arguments: {} }];
    await persistMessage("conv-1", "assistant", "Vou verificar...", toolCalls);
    const callData = prisma.message.create.mock.calls[0][0].data;
    expect(callData.toolCalls).toBeTruthy();
  });
});

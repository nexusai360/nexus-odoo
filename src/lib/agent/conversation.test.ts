import {
  getOrCreateWhatsappConversation,
  createConversation,
  assertConversationOwned,
  loadHistory,
  persistMessage,
  deriveTitle,
  loadConversationReasoningHistory,
  saveConversationReasoningHistory,
  capReasoningHistory,
  REASONING_HISTORY_MAX_ITEMS,
  REASONING_HISTORY_MAX_BYTES,
  getLastNPairs,
  updateMessageToolResults,
  persistAssistantMessageWithTools,
} from "./conversation";
import type { ReasoningContext } from "./llm/types";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
    // findMany é chamado com orderBy: desc , o mock retorna as msgs em ordem desc
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

describe("reasoning history persistence (Onda 1)", () => {
  test("loadConversationReasoningHistory retorna [] quando conversa nao existe", async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(null);
    const result = await loadConversationReasoningHistory("conv-x");
    expect(result).toEqual([]);
  });

  test("loadConversationReasoningHistory retorna array preservado", async () => {
    const history: ReasoningContext[] = [
      { provider: "openai", data: { items: [{ type: "reasoning" }] } },
      { provider: "openai", data: { items: [{ type: "reasoning" }] } },
    ];
    prisma.conversation.findUnique.mockResolvedValueOnce({ reasoningHistory: history });
    const result = await loadConversationReasoningHistory("conv-1");
    expect(result).toEqual(history);
  });

  test("loadConversationReasoningHistory retorna [] se campo nao for array", async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce({ reasoningHistory: null });
    expect(await loadConversationReasoningHistory("conv-1")).toEqual([]);
    prisma.conversation.findUnique.mockResolvedValueOnce({ reasoningHistory: { foo: "bar" } });
    expect(await loadConversationReasoningHistory("conv-1")).toEqual([]);
  });

  test("saveConversationReasoningHistory chama update com history capped", async () => {
    prisma.conversation.update.mockResolvedValueOnce({});
    const history: ReasoningContext[] = [{ provider: "anthropic", data: { blocks: [] } }];
    await saveConversationReasoningHistory("conv-1", history);
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "conv-1" },
      data: { reasoningHistory: history },
    });
  });

  test("capReasoningHistory respeita maxItems=20", () => {
    const big: ReasoningContext[] = Array.from({ length: 30 }, (_, i) => ({
      provider: "openai",
      data: { iter: i },
    }));
    const result = capReasoningHistory(big);
    expect(result.length).toBe(REASONING_HISTORY_MAX_ITEMS);
    expect((result[0].data as { iter: number }).iter).toBe(10);
    expect((result[result.length - 1].data as { iter: number }).iter).toBe(29);
  });

  test("capReasoningHistory respeita maxBytes truncando do início", () => {
    const big: ReasoningContext[] = Array.from({ length: 10 }, (_, i) => ({
      provider: "gemini",
      data: { iter: i, payload: "x".repeat(10_000) },
    }));
    const result = capReasoningHistory(big, REASONING_HISTORY_MAX_ITEMS, REASONING_HISTORY_MAX_BYTES);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(REASONING_HISTORY_MAX_BYTES);
    expect((result[result.length - 1].data as { iter: number }).iter).toBe(9);
  });

  test("capReasoningHistory retorna mesmo array quando dentro dos limites", () => {
    const small: ReasoningContext[] = [{ provider: "openrouter", data: { details: [] } }];
    expect(capReasoningHistory(small)).toEqual(small);
  });
});

// ============================================================================
// Onda 1 Inteligencia — getLastNPairs + tool-results helpers.
// ============================================================================

describe("getLastNPairs", () => {
  test("conversa simples (3 pares user->assistant) — retorna 3 em ordem DESC", async () => {
    const t = (n: number) => new Date(`2026-05-25T20:${n.toString().padStart(2, "0")}:00Z`);
    // Banco devolve DESC; mais recentes primeiro.
    prisma.message.findMany.mockResolvedValue([
      { id: "a3", role: "assistant", content: "ans 3", toolCalls: null, createdAt: t(6) },
      { id: "u3", role: "user", content: "q3", toolCalls: null, createdAt: t(5) },
      { id: "a2", role: "assistant", content: "ans 2", toolCalls: null, createdAt: t(4) },
      { id: "u2", role: "user", content: "q2", toolCalls: null, createdAt: t(3) },
      { id: "a1", role: "assistant", content: "ans 1", toolCalls: null, createdAt: t(2) },
      { id: "u1", role: "user", content: "q1", toolCalls: null, createdAt: t(1) },
    ]);
    const out = await getLastNPairs("conv-1", 5);
    expect(out).toHaveLength(3);
    expect(out[0].user.content).toBe("q3");
    expect(out[0].assistant.content).toBe("ans 3");
    expect(out[2].user.content).toBe("q1");
  });

  test("ignora assistant intermediario com toolCalls (final assistant tem toolCalls vazio)", async () => {
    const t = (n: number) => new Date(`2026-05-25T20:${n.toString().padStart(2, "0")}:00Z`);
    prisma.message.findMany.mockResolvedValue([
      // final assistant (sem toolCalls)
      { id: "a_final", role: "assistant", content: "resposta final", toolCalls: null, createdAt: t(5) },
      // tool message intermediaria
      { id: "tool_1", role: "tool", content: "tool result", toolCalls: null, createdAt: t(4) },
      // assistant intermediario com toolCalls (turno de chamada de tool)
      { id: "a_inter", role: "assistant", content: "vou consultar", toolCalls: [{ id: "tc1", name: "x", arguments: {} }], createdAt: t(3) },
      { id: "u1", role: "user", content: "pergunta", toolCalls: null, createdAt: t(1) },
    ]);
    const out = await getLastNPairs("conv-2", 5);
    expect(out).toHaveLength(1);
    expect(out[0].user.id).toBe("u1");
    expect(out[0].assistant.id).toBe("a_final");
  });

  test("toolCalls array vazio conta como final assistant", async () => {
    const t = (n: number) => new Date(`2026-05-25T20:${n}:00Z`);
    prisma.message.findMany.mockResolvedValue([
      { id: "a1", role: "assistant", content: "resp", toolCalls: [], createdAt: t(2) },
      { id: "u1", role: "user", content: "q", toolCalls: null, createdAt: t(1) },
    ]);
    const out = await getLastNPairs("conv-3", 5);
    expect(out).toHaveLength(1);
  });

  test("conversa com menos pares do que pedido — retorna todos disponiveis", async () => {
    prisma.message.findMany.mockResolvedValue([
      { id: "a1", role: "assistant", content: "resp", toolCalls: null, createdAt: new Date() },
      { id: "u1", role: "user", content: "q", toolCalls: null, createdAt: new Date() },
    ]);
    const out = await getLastNPairs("conv-4", 5);
    expect(out).toHaveLength(1);
  });

  test("conversa sem assistant final — retorna vazio", async () => {
    prisma.message.findMany.mockResolvedValue([
      { id: "u1", role: "user", content: "q", toolCalls: null, createdAt: new Date() },
    ]);
    expect(await getLastNPairs("conv-5", 5)).toEqual([]);
  });

  test("cap em n=2 mesmo com 5 pares no banco", async () => {
    const t = (n: number) => new Date(`2026-05-25T20:${n.toString().padStart(2, "0")}:00Z`);
    const rows = [];
    for (let i = 5; i >= 1; i--) {
      rows.push({ id: `a${i}`, role: "assistant", content: `a${i}`, toolCalls: null, createdAt: t(i * 2) });
      rows.push({ id: `u${i}`, role: "user", content: `u${i}`, toolCalls: null, createdAt: t(i * 2 - 1) });
    }
    prisma.message.findMany.mockResolvedValue(rows);
    const out = await getLastNPairs("conv-6", 2);
    expect(out).toHaveLength(2);
  });
});

describe("updateMessageToolResults", () => {
  test("grava JSON na coluna toolResults", async () => {
    prisma.message.update.mockResolvedValue({});
    await updateMessageToolResults("msg-1", { c1: "resultA", c2: "resultB" });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: { toolResults: { c1: "resultA", c2: "resultB" } },
    });
  });

  test("nao lanca quando mensagem nao existe (cascade delete)", async () => {
    prisma.message.update.mockRejectedValue(new Error("Record not found"));
    // best-effort: deve resolver sem throw
    await expect(updateMessageToolResults("msg-deleted", {})).resolves.toBeUndefined();
  });
});

describe("persistAssistantMessageWithTools", () => {
  test("cria Message com toolCalls e retorna id", async () => {
    prisma.message.create.mockResolvedValue({ id: "msg-id-1" });
    prisma.conversation.findUnique.mockResolvedValue({ userId: "u1" });
    const id = await persistAssistantMessageWithTools(
      "conv-x",
      "Vou consultar",
      [{ id: "tc1", name: "fiscal_faturamento", arguments: { mes: 5 } }],
    );
    expect(id).toBe("msg-id-1");
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv-x",
          role: "assistant",
          content: "Vou consultar",
        }),
        select: { id: true },
      }),
    );
  });
});

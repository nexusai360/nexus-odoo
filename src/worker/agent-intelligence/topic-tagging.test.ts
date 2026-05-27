/**
 * Testes do processor agent-topic-tagging.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    message: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/agent/intelligence", () => ({
  extractTopics: jest.fn(),
}));

import { processTopicTaggingJob } from "./topic-tagging";

const { prisma } = jest.requireMock("@/lib/prisma");
const { extractTopics } = jest.requireMock("@/lib/agent/intelligence");

beforeEach(() => jest.clearAllMocks());

describe("processTopicTaggingJob", () => {
  test("conversa nova (sem tags) gera tags do extractor", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "c1",
      topicTags: [],
      topicTagsAt: null,
    });
    prisma.message.findMany.mockResolvedValue([
      { content: "Quanto faturamos em maio?" },
    ]);
    extractTopics.mockResolvedValue({
      topic: "faturamento",
      domain: "fiscal",
      keywords: ["fatura", "venda"],
    });
    prisma.conversation.update.mockResolvedValue({});

    const out = await processTopicTaggingJob({ conversationId: "c1" });
    expect(out.skipped).toBeFalsy();
    expect(out.tags).toEqual([
      "fiscal:faturamento",
      "keyword:fatura",
      "keyword:venda",
    ]);
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({
        topicTags: ["fiscal:faturamento", "keyword:fatura", "keyword:venda"],
        topicTagsVersion: 1,
      }),
    });
  });

  test("idempotente: pula quando < 10 msgs novas desde topicTagsAt", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "c2",
      topicTags: ["estoque"],
      topicTagsAt: new Date("2026-05-25T10:00:00Z"),
    });
    prisma.message.count.mockResolvedValue(3);

    const out = await processTopicTaggingJob({ conversationId: "c2" });
    expect(out.skipped).toBe(true);
    expect(extractTopics).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  test("re-tag mescla mantendo tags antigas + cap 5", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "c3",
      topicTags: ["estoque", "keyword:saldo", "keyword:produto"],
      topicTagsAt: new Date("2026-05-25T10:00:00Z"),
    });
    prisma.message.count.mockResolvedValue(15); // >= 10 → re-roda
    prisma.message.findMany.mockResolvedValue([
      { content: "agora sobre faturamento" },
    ]);
    extractTopics.mockResolvedValue({
      topic: "faturamento",
      domain: "fiscal",
      keywords: ["fatura", "venda", "comissao"],
    });
    prisma.conversation.update.mockResolvedValue({});

    const out = await processTopicTaggingJob({ conversationId: "c3" });
    expect(out.skipped).toBeFalsy();
    expect(out.tags).toHaveLength(5);
    expect(out.tags?.[0]).toBe("estoque"); // preservou
    expect(out.tags).toContain("fiscal:faturamento");
  });

  test("conversa sem mensagens de user pula", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "c4",
      topicTags: [],
      topicTagsAt: null,
    });
    prisma.message.findMany.mockResolvedValue([]);
    const out = await processTopicTaggingJob({ conversationId: "c4" });
    expect(out.skipped).toBe(true);
  });

  test("conversa nao encontrada → skip silencioso", async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    const out = await processTopicTaggingJob({ conversationId: "deleted" });
    expect(out.skipped).toBe(true);
  });

  test("domain=outros usa apenas topic sem prefixo", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "c5",
      topicTags: [],
      topicTagsAt: null,
    });
    prisma.message.findMany.mockResolvedValue([{ content: "olá" }]);
    extractTopics.mockResolvedValue({
      topic: "saudacao",
      domain: "outros",
      keywords: [],
    });
    prisma.conversation.update.mockResolvedValue({});

    const out = await processTopicTaggingJob({ conversationId: "c5" });
    expect(out.tags?.[0]).toBe("saudacao");
  });

  test("dedup case-insensitive remove tags repetidas", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "c6",
      topicTags: ["fiscal:faturamento"],
      topicTagsAt: new Date("2026-05-25T10:00:00Z"),
    });
    prisma.message.count.mockResolvedValue(10);
    prisma.message.findMany.mockResolvedValue([{ content: "x" }]);
    // Extractor devolve mesma tag (Fiscal:Faturamento , mais case)
    extractTopics.mockResolvedValue({
      topic: "Faturamento",
      domain: "Fiscal",
      keywords: [],
    });
    prisma.conversation.update.mockResolvedValue({});

    const out = await processTopicTaggingJob({ conversationId: "c6" });
    // Manteve a versao original (primeiro encontrado vence no dedup).
    expect(out.tags).toEqual(["fiscal:faturamento"]);
  });
});

/**
 * Testes de monitoramento-bubble (F5 E.4): sessões e colaboradores incluem
 * WhatsApp; status por canal via helper (whatsapp respeita janela de 24h).
 */

jest.mock("server-only", () => ({}));

const mockConversationFindMany = jest.fn();
const mockConversationGroupBy = jest.fn();
const mockUserFindMany = jest.fn();
const mockMessageFindMany = jest.fn();
const mockFeedbackGroupBy = jest.fn();
const mockEvalFindMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findMany: mockConversationFindMany,
      groupBy: mockConversationGroupBy,
    },
    user: { findMany: mockUserFindMany },
    message: { findMany: mockMessageFindMany },
    messageFeedback: { groupBy: mockFeedbackGroupBy },
    conversationQualityEvaluation: { findMany: mockEvalFindMany },
  },
}));

jest.mock("@/lib/auth/require", () => ({
  requireMinRole: jest.fn().mockResolvedValue(undefined),
}));

import { listBubbleSessions, listBubbleCollaborators } from "./monitoramento-bubble";

const now = Date.now();

beforeEach(() => {
  jest.clearAllMocks();
  mockMessageFindMany.mockResolvedValue([]);
  mockFeedbackGroupBy.mockResolvedValue([]);
  mockEvalFindMany.mockResolvedValue([]);
});

describe("listBubbleSessions , inclui WhatsApp + status por canal (F5 E)", () => {
  it("consulta in_app + whatsapp e expõe channel por sessão", async () => {
    mockConversationFindMany.mockResolvedValue([
      {
        id: "c-wa",
        createdAt: new Date(now - 30 * 3600e3),
        endedAt: null,
        channel: "whatsapp",
        updatedAt: new Date(now - 30 * 3600e3),
      },
    ]);

    const rows = await listBubbleSessions("u1");

    // O where da query inclui os dois canais.
    const where = mockConversationFindMany.mock.calls[0][0].where;
    expect(where.channel).toEqual({ in: ["in_app", "whatsapp"] });
    expect(rows[0].channel).toBe("whatsapp");
    // WhatsApp com updatedAt há 30h => fora da janela de 24h => não ativa.
    expect(rows[0].isActive).toBe(false);
  });

  it("WhatsApp dentro de 24h é ativa", async () => {
    mockConversationFindMany.mockResolvedValue([
      {
        id: "c-wa2",
        createdAt: new Date(now - 2 * 3600e3),
        endedAt: null,
        channel: "whatsapp",
        updatedAt: new Date(now - 2 * 3600e3),
      },
    ]);

    const rows = await listBubbleSessions("u1");
    expect(rows[0].isActive).toBe(true);
  });
});

describe("listBubbleCollaborators , conta in_app + whatsapp (F5 E)", () => {
  it("agrupa pelos dois canais", async () => {
    mockConversationGroupBy.mockResolvedValue([
      { userId: "u1", _count: { _all: 2 }, _max: { updatedAt: new Date(now) } },
    ]);
    mockConversationFindMany.mockResolvedValue([
      { userId: "u1", channel: "whatsapp", updatedAt: new Date(now - 1 * 3600e3) },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: "u1", name: "Ana", avatarUrl: null, platformRole: "viewer" },
    ]);

    const rows = await listBubbleCollaborators();

    const where = mockConversationGroupBy.mock.calls[0][0].where;
    expect(where.channel).toEqual({ in: ["in_app", "whatsapp"] });
    expect(rows[0].userId).toBe("u1");
    expect(rows[0].hasActiveSession).toBe(true);
  });
});

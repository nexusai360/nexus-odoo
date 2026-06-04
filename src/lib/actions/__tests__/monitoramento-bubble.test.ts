/**
 * B2. Testes do monitoramento da bubble do Nex (canal in_app).
 * Padrão da casa: mock de @/lib/prisma + @/lib/auth/require (sem Postgres real).
 */

jest.mock("@/lib/auth/require", () => ({ requireMinRole: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { groupBy: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    messageFeedback: { groupBy: jest.fn() },
  },
}));

import {
  computeAccuracy,
  listBubbleCollaborators,
  listBubbleSessions,
} from "../monitoramento-bubble";
import { requireMinRole } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  jest.clearAllMocks();
  (requireMinRole as jest.Mock).mockResolvedValue({ id: "admin" });
});

describe("computeAccuracy", () => {
  test("sem votos retorna null", () => {
    expect(
      computeAccuracy({ CORRETO: 0, PARCIAL: 0, ERRADO: 0, ALUCINOU: 0 }),
    ).toBeNull();
  });
  test("apenas correto retorna 100", () => {
    expect(
      computeAccuracy({ CORRETO: 1, PARCIAL: 0, ERRADO: 0, ALUCINOU: 0 }),
    ).toBe(100);
  });
  test("apenas parcial retorna 50", () => {
    expect(
      computeAccuracy({ CORRETO: 0, PARCIAL: 2, ERRADO: 0, ALUCINOU: 0 }),
    ).toBe(50);
  });
  test("correto + errado retorna 50", () => {
    expect(
      computeAccuracy({ CORRETO: 1, PARCIAL: 0, ERRADO: 1, ALUCINOU: 0 }),
    ).toBe(50);
  });
});

describe("requireMinRole gateia as actions", () => {
  test("listBubbleCollaborators propaga quando requireMinRole lança", async () => {
    (requireMinRole as jest.Mock).mockRejectedValue(new Error("denied"));
    await expect(listBubbleCollaborators()).rejects.toThrow("denied");
  });
  test("listBubbleSessions propaga quando requireMinRole lança", async () => {
    (requireMinRole as jest.Mock).mockRejectedValue(new Error("denied"));
    await expect(listBubbleSessions("u1")).rejects.toThrow("denied");
  });
});

describe("listBubbleCollaborators", () => {
  test("monta colaboradores com sessão ativa, votos e acurácia, ordenados por atividade", async () => {
    (prisma.conversation.groupBy as jest.Mock).mockResolvedValue([
      { userId: "u1", _count: { _all: 3 }, _max: { updatedAt: new Date("2026-06-01") } },
      { userId: "u2", _count: { _all: 1 }, _max: { updatedAt: new Date("2026-06-03") } },
    ]);
    (prisma.conversation.findMany as jest.Mock).mockResolvedValue([
      { userId: "u2" },
    ]);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: "u1", name: "Ana", avatarUrl: null },
      { id: "u2", name: "Beto", avatarUrl: "a.png" },
    ]);
    (prisma.messageFeedback.groupBy as jest.Mock).mockResolvedValue([
      { userId: "u1", rating: "CORRETO", _count: { _all: 2 } },
      { userId: "u1", rating: "ERRADO", _count: { _all: 2 } },
    ]);

    const res = await listBubbleCollaborators();

    // u2 mais recente vem primeiro
    expect(res.map((r) => r.userId)).toEqual(["u2", "u1"]);

    const u1 = res.find((r) => r.userId === "u1")!;
    expect(u1.name).toBe("Ana");
    expect(u1.sessionCount).toBe(3);
    expect(u1.hasActiveSession).toBe(false);
    expect(u1.ratingCounts).toEqual({ CORRETO: 2, PARCIAL: 0, ERRADO: 2, ALUCINOU: 0 });
    expect(u1.accuracyPct).toBe(50);
    // @ts-expect-error lastActivity não deve vazar no tipo público
    expect(u1.lastActivity).toBeUndefined();

    const u2 = res.find((r) => r.userId === "u2")!;
    expect(u2.hasActiveSession).toBe(true);
    expect(u2.ratingCounts).toEqual({ CORRETO: 0, PARCIAL: 0, ERRADO: 0, ALUCINOU: 0 });
    expect(u2.accuracyPct).toBeNull();
  });
});

describe("listBubbleSessions", () => {
  test("index cronológico, isActive, ratingCounts e acurácia", async () => {
    (prisma.conversation.findMany as jest.Mock).mockResolvedValue([
      { id: "c3", createdAt: new Date("2026-06-03"), endedAt: null, _count: { messages: 5 } },
      { id: "c2", createdAt: new Date("2026-06-02"), endedAt: new Date("2026-06-02"), _count: { messages: 8 } },
      { id: "c1", createdAt: new Date("2026-06-01"), endedAt: new Date("2026-06-01"), _count: { messages: 2 } },
    ]);
    (prisma.messageFeedback.groupBy as jest.Mock).mockResolvedValue([
      { conversationId: "c2", rating: "CORRETO", _count: { _all: 1 } },
      { conversationId: "c2", rating: "PARCIAL", _count: { _all: 1 } },
    ]);

    const res = await listBubbleSessions("u1");

    expect(res.map((r) => r.conversationId)).toEqual(["c3", "c2", "c1"]);
    // mais recente (pos 0) recebe o maior index; mais antiga recebe 1
    expect(res.map((r) => r.index)).toEqual([3, 2, 1]);

    const c3 = res[0];
    expect(c3.isActive).toBe(true);
    expect(c3.endedAt).toBeNull();
    expect(c3.startedAt).toBe(new Date("2026-06-03").toISOString());
    expect(c3.messageCount).toBe(5);
    expect(c3.accuracyPct).toBeNull();

    const c2 = res[1];
    expect(c2.isActive).toBe(false);
    expect(c2.endedAt).toBe(new Date("2026-06-02").toISOString());
    expect(c2.ratingCounts).toEqual({ CORRETO: 1, PARCIAL: 1, ERRADO: 0, ALUCINOU: 0 });
    expect(c2.accuracyPct).toBe(75);
  });
});

/**
 * B2. Testes do monitoramento da bubble do Nex (canal in_app).
 * Padrão da casa: mock de @/lib/prisma + @/lib/auth/require (sem Postgres real).
 */

jest.mock("@/lib/auth/require", () => ({ requireMinRole: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { groupBy: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
    messageFeedback: { groupBy: jest.fn(), findMany: jest.fn() },
    conversationQualityEvaluation: { findMany: jest.fn() },
  },
}));

import {
  listBubbleCollaborators,
  listBubbleSessions,
  getBubbleSessionMessages,
} from "../monitoramento-bubble";
import { computeAccuracy } from "../monitoramento-bubble-helpers";
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

describe("getBubbleSessionMessages", () => {
  function mockEvals(rows: unknown[]) {
    (prisma.conversationQualityEvaluation.findMany as jest.Mock).mockResolvedValue(rows);
  }
  function mockFeedbacks(rows: unknown[]) {
    (prisma.messageFeedback.findMany as jest.Mock).mockResolvedValue(rows);
  }

  test("super_admin lê conversa de qualquer dono (sem trava de propriedade)", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ id: "cX" });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: "m1", role: "user", content: "oi", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:00Z") },
      { id: "m2", role: "assistant", content: "olá", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:01Z") },
    ]);
    mockEvals([]);
    mockFeedbacks([]);

    const res = await getBubbleSessionMessages("cX");
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("esperado ok");
    // a action NUNCA chama findUnique com userId atual nem filtra por dono
    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: "cX" },
      select: { id: true },
    });
    // findMany de mensagens não filtra endedAt (lê arquivadas)
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "cX" } }),
    );
    expect(res.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  test("conversa inexistente retorna ok:false", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await getBubbleSessionMessages("nope");
    expect(res).toEqual({ ok: false, error: "Conversa não encontrada" });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  test("Map do juiz: terminal (status), humanStatus sobrescreve, sem-row vira null", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ id: "c1" });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: "a1", role: "assistant", content: "r1", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:00Z") },
      { id: "a2", role: "assistant", content: "r2", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:01Z") },
      { id: "a3", role: "assistant", content: "r3", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:02Z") },
    ]);
    mockEvals([
      { id: "e1", assistantMessageId: "a1", status: "APROVADO", humanStatus: null, suggestions: [] },
      { id: "e2", assistantMessageId: "a2", status: "PENDENTE", humanStatus: "REPROVADO", suggestions: [] },
    ]);
    mockFeedbacks([]);

    const res = await getBubbleSessionMessages("c1");
    if (!res.ok) throw new Error("esperado ok");
    const byId = new Map(res.messages.map((m) => [m.id, m]));
    expect(byId.get("a1")!.evaluation).toEqual({ id: "e1", status: "APROVADO" });
    // humanStatus tem prioridade sobre status do judge
    expect(byId.get("a2")!.evaluation).toEqual({ id: "e2", status: "REPROVADO" });
    // sem linha no Map → null
    expect(byId.get("a3")!.evaluation).toBeNull();
  });

  test("steps agregados no range-merge do turno (anexa na assistant final)", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ id: "c1" });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: "u1", role: "user", content: "pergunta", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:00Z") },
      { id: "a1", role: "assistant", content: "", kind: "text", toolCalls: [{ name: "estoque_modelo" }], createdAt: new Date("2026-06-01T10:00:01Z") },
      { id: "a2", role: "assistant", content: "resposta final", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:02Z") },
    ]);
    mockEvals([]);
    mockFeedbacks([]);

    const res = await getBubbleSessionMessages("c1");
    if (!res.ok) throw new Error("esperado ok");
    const byId = new Map(res.messages.map((m) => [m.id, m]));
    // a intermediária não carrega steps; a final do turno carrega a trilha
    expect(byId.get("a1")!.steps).toBeUndefined();
    expect(byId.get("a2")!.steps).toHaveLength(1);
  });

  test("feedback do dono é anexado por mensagem assistant", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ id: "c1" });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: "a1", role: "assistant", content: "r1", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:00Z") },
    ]);
    mockEvals([]);
    mockFeedbacks([
      { assistantMessageId: "a1", rating: "CORRETO", comment: "bom" },
    ]);

    const res = await getBubbleSessionMessages("c1");
    if (!res.ok) throw new Error("esperado ok");
    expect(prisma.messageFeedback.findMany).toHaveBeenCalledWith({
      where: { conversationId: "c1" },
      select: { assistantMessageId: true, rating: true, comment: true },
    });
    expect(res.messages[0].feedback).toEqual({ rating: "CORRETO", comment: "bom" });
  });

  test("clicada derivada: próxima user == sugestão marca clickedSuggestion", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ id: "c1" });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: "a1", role: "assistant", content: "r1", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:00Z") },
      { id: "u1", role: "user", content: "  Ver estoque  ", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:01Z") },
    ]);
    mockEvals([
      { id: "e1", assistantMessageId: "a1", status: "APROVADO", humanStatus: null, suggestions: ["Ver estoque", "Ver financeiro"] },
    ]);
    mockFeedbacks([]);

    const res = await getBubbleSessionMessages("c1");
    if (!res.ok) throw new Error("esperado ok");
    const a1 = res.messages.find((m) => m.id === "a1")!;
    expect(a1.suggestions).toEqual(["Ver estoque", "Ver financeiro"]);
    expect(a1.clickedSuggestion).toBe("Ver estoque");
  });

  test("clicada derivada: sugestões repetidas marca a PRIMEIRA igual", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ id: "c1" });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: "a1", role: "assistant", content: "r1", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:00Z") },
      { id: "u1", role: "user", content: "Ver estoque", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:01Z") },
    ]);
    mockEvals([
      { id: "e1", assistantMessageId: "a1", status: "APROVADO", humanStatus: null, suggestions: ["Ver estoque", "Ver estoque"] },
    ]);
    mockFeedbacks([]);

    const res = await getBubbleSessionMessages("c1");
    if (!res.ok) throw new Error("esperado ok");
    // find retorna a primeira ocorrência (mesmo valor, mas garante semântica)
    expect(res.messages.find((m) => m.id === "a1")!.clickedSuggestion).toBe("Ver estoque");
  });

  test("clicada derivada: última assistant sem próximo user fica sem clicada", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ id: "c1" });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: "u1", role: "user", content: "oi", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:00Z") },
      { id: "a1", role: "assistant", content: "r1", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:01Z") },
    ]);
    mockEvals([
      { id: "e1", assistantMessageId: "a1", status: "APROVADO", humanStatus: null, suggestions: ["Ver estoque"] },
    ]);
    mockFeedbacks([]);

    const res = await getBubbleSessionMessages("c1");
    if (!res.ok) throw new Error("esperado ok");
    expect(res.messages.find((m) => m.id === "a1")!.clickedSuggestion).toBeUndefined();
  });

  test("requireMinRole gateia: propaga quando lança", async () => {
    (requireMinRole as jest.Mock).mockRejectedValue(new Error("denied"));
    await expect(getBubbleSessionMessages("c1")).rejects.toThrow("denied");
  });
});

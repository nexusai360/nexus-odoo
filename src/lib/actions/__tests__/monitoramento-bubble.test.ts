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
  test("apenas parcial retorna 0 (parcial não conta como acerto)", () => {
    expect(
      computeAccuracy({ CORRETO: 0, PARCIAL: 2, ERRADO: 0, ALUCINOU: 0 }),
    ).toBe(0);
  });
  test("correto + errado retorna 50", () => {
    expect(
      computeAccuracy({ CORRETO: 1, PARCIAL: 0, ERRADO: 1, ALUCINOU: 0 }),
    ).toBe(50);
  });
  test("correto + parcial retorna 50 (1 certo de 2 classificações)", () => {
    expect(
      computeAccuracy({ CORRETO: 1, PARCIAL: 1, ERRADO: 0, ALUCINOU: 0 }),
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

describe("filtro de canal exclui replay/backtest (raiz do dado poluído)", () => {
  test("listBubbleCollaborators só agrega channel in_app", async () => {
    (prisma.conversation.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.conversation.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.messageFeedback.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.conversationQualityEvaluation.findMany as jest.Mock).mockResolvedValue([]);

    await listBubbleCollaborators();

    expect(prisma.conversation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { channel: "in_app" } }),
    );
    // sessão ativa também restrita a in_app (backtest nunca conta como ativa)
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { channel: "in_app", endedAt: null } }),
    );
    // votos só de conversas in_app
    expect(prisma.messageFeedback.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversation: { channel: "in_app" } },
      }),
    );
  });

  test("listBubbleSessions só lista channel in_app do usuário", async () => {
    (prisma.conversation.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.messageFeedback.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.conversationQualityEvaluation.findMany as jest.Mock).mockResolvedValue([]);

    await listBubbleSessions("u1");

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", channel: "in_app" } }),
    );
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
    // PERÍCIA: juiz aprovou 3 e marcou 1 fora de escopo (=> alucinou) para u1.
    (prisma.conversationQualityEvaluation.findMany as jest.Mock).mockResolvedValue([
      { status: "CORRETO", humanStatus: null, conversation: { userId: "u1" } },
      { status: "CORRETO", humanStatus: null, conversation: { userId: "u1" } },
      { status: "ERRADO", humanStatus: "CORRETO", conversation: { userId: "u1" } },
      { status: "FORA_DO_ESCOPO", humanStatus: null, conversation: { userId: "u1" } },
      { status: "PENDENTE", humanStatus: null, conversation: { userId: "u1" } },
    ]);

    const res = await listBubbleCollaborators();

    // u2 mais recente vem primeiro
    expect(res.map((r) => r.userId)).toEqual(["u2", "u1"]);

    const u1 = res.find((r) => r.userId === "u1")!;
    expect(u1.name).toBe("Ana");
    expect(u1.sessionCount).toBe(3);
    expect(u1.hasActiveSession).toBe(false);
    // AVALIAÇÃO (usuário): 2 certo, 2 errado => 2/4 = 50%
    expect(u1.avaliacaoCounts).toEqual({ CORRETO: 2, PARCIAL: 0, ERRADO: 2, ALUCINOU: 0 });
    expect(u1.avaliacaoPct).toBe(50);
    // PERÍCIA (juiz, status efetivo): 3 certo (1 via ajuste humano) + 1 alucinou;
    // PENDENTE é não-terminal e não conta. 3/4 = 75%
    expect(u1.periciaCounts).toEqual({ CORRETO: 3, PARCIAL: 0, ERRADO: 0, ALUCINOU: 1 });
    expect(u1.periciaPct).toBe(75);
    // @ts-expect-error lastActivity não deve vazar no tipo público
    expect(u1.lastActivity).toBeUndefined();

    const u2 = res.find((r) => r.userId === "u2")!;
    expect(u2.hasActiveSession).toBe(true);
    expect(u2.avaliacaoCounts).toEqual({ CORRETO: 0, PARCIAL: 0, ERRADO: 0, ALUCINOU: 0 });
    expect(u2.avaliacaoPct).toBeNull();
    expect(u2.periciaPct).toBeNull();
  });
});

describe("listBubbleSessions", () => {
  test("index cronológico, isActive, ratingCounts e acurácia", async () => {
    (prisma.conversation.findMany as jest.Mock).mockResolvedValue([
      { id: "c3", createdAt: new Date("2026-06-03"), endedAt: null },
      { id: "c2", createdAt: new Date("2026-06-02"), endedAt: new Date("2026-06-02") },
      { id: "c1", createdAt: new Date("2026-06-01"), endedAt: new Date("2026-06-01") },
    ]);
    // messageCount agora = mensagens VISÍVEIS (exclui role tool e content vazio).
    // c3: 2 visíveis; c2: 1 visível (1 tool e 1 vazia excluídas); c1: 0.
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { conversationId: "c3", role: "user", content: "oi", kind: "text" },
      { conversationId: "c3", role: "assistant", content: "resposta", kind: "text" },
      { conversationId: "c2", role: "assistant", content: "x", kind: "text" },
      { conversationId: "c2", role: "tool", content: "ignorada", kind: "text" },
      { conversationId: "c2", role: "assistant", content: "   ", kind: "text" },
    ]);
    (prisma.messageFeedback.groupBy as jest.Mock).mockResolvedValue([
      { conversationId: "c2", rating: "CORRETO", _count: { _all: 1 } },
      { conversationId: "c2", rating: "PARCIAL", _count: { _all: 1 } },
    ]);
    // PERÍCIA: c2 com 1 parcial do juiz.
    (prisma.conversationQualityEvaluation.findMany as jest.Mock).mockResolvedValue([
      { status: "PARCIAL", humanStatus: null, conversationId: "c2" },
    ]);

    const res = await listBubbleSessions("u1");

    expect(res.map((r) => r.conversationId)).toEqual(["c3", "c2", "c1"]);
    // mais recente (pos 0) recebe o maior index; mais antiga recebe 1
    expect(res.map((r) => r.index)).toEqual([3, 2, 1]);

    const c3 = res[0];
    expect(c3.isActive).toBe(true);
    expect(c3.endedAt).toBeNull();
    expect(c3.startedAt).toBe(new Date("2026-06-03").toISOString());
    expect(c3.messageCount).toBe(2);
    expect(c3.avaliacaoPct).toBeNull();
    expect(c3.periciaPct).toBeNull();

    const c2 = res[1];
    expect(c2.isActive).toBe(false);
    expect(c2.endedAt).toBe(new Date("2026-06-02").toISOString());
    expect(c2.messageCount).toBe(1); // 1 visível (tool e vazia excluídas)
    // AVALIAÇÃO: 1 certo + 1 parcial => 1/2 = 50%
    expect(c2.avaliacaoCounts).toEqual({ CORRETO: 1, PARCIAL: 1, ERRADO: 0, ALUCINOU: 0 });
    expect(c2.avaliacaoPct).toBe(50);
    // PERÍCIA: 1 parcial => 0/1 = 0%
    expect(c2.periciaCounts).toEqual({ CORRETO: 0, PARCIAL: 1, ERRADO: 0, ALUCINOU: 0 });
    expect(c2.periciaPct).toBe(0);
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

  test("durationMs do turno = assistant final − user que abriu (anexa na final)", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({ id: "c1" });
    (prisma.message.findMany as jest.Mock).mockResolvedValue([
      { id: "u1", role: "user", content: "p", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:00Z") },
      { id: "a1", role: "assistant", content: "", kind: "text", toolCalls: [{ name: "estoque_modelo" }], createdAt: new Date("2026-06-01T10:00:02Z") },
      { id: "a2", role: "assistant", content: "final", kind: "text", toolCalls: null, createdAt: new Date("2026-06-01T10:00:05Z") },
    ]);
    mockEvals([]);
    mockFeedbacks([]);

    const res = await getBubbleSessionMessages("c1");
    if (!res.ok) throw new Error("esperado ok");
    const byId = new Map(res.messages.map((m) => [m.id, m]));
    // turno: u1(10:00:00) -> a2(10:00:05) = 5000ms, anexado na assistant FINAL
    expect(byId.get("a2")!.durationMs).toBe(5000);
    // a intermediária e o user não carregam duração
    expect(byId.get("a1")!.durationMs).toBeUndefined();
    expect(byId.get("u1")!.durationMs).toBeUndefined();
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

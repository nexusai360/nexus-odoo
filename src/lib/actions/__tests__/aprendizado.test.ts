/**
 * B3. Testes da action de Aprendizado (cruzamento Avaliação × Perícia).
 * Padrão da casa: mock de @/lib/prisma + @/lib/auth/require.
 */

jest.mock("@/lib/auth/require", () => ({ requireMinRole: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    messageFeedback: { findMany: jest.fn() },
    conversationQualityEvaluation: { findMany: jest.fn() },
  },
}));

import { getAprendizadoOverview } from "../aprendizado";
import { requireMinRole } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  jest.clearAllMocks();
  (requireMinRole as jest.Mock).mockResolvedValue({ id: "admin" });
});

test("requireMinRole gateia (propaga quando lança)", async () => {
  (requireMinRole as jest.Mock).mockRejectedValue(new Error("denied"));
  await expect(getAprendizadoOverview()).rejects.toThrow("denied");
});

test("cruza por assistantMessageId; só terminal; monta matriz, discordâncias e patterns", async () => {
  (prisma.messageFeedback.findMany as jest.Mock).mockResolvedValue([
    // concorda (CORRETO x CORRETO)
    { assistantMessageId: "m1", conversationId: "c1", rating: "CORRETO", comment: null },
    // discorda: usuário ERRADO, juiz CORRETO (overconfidence) + comentário
    { assistantMessageId: "m2", conversationId: "c1", rating: "ERRADO", comment: "saldo errado" },
    // perícia PENDENTE -> não cruza
    { assistantMessageId: "m3", conversationId: "c2", rating: "ALUCINOU", comment: "inventou" },
    // sem perícia -> não cruza
    { assistantMessageId: "m4", conversationId: "c2", rating: "PARCIAL", comment: null },
  ]);
  (prisma.conversationQualityEvaluation.findMany as jest.Mock).mockResolvedValue([
    { id: "e1", assistantMessageId: "m1", conversationId: "c1", status: "CORRETO", humanStatus: null, patterns: [], razoes: "ok", model: "gpt", questionSnapshot: "q1", answerSnapshot: "a1" },
    { id: "e2", assistantMessageId: "m2", conversationId: "c1", status: "CORRETO", humanStatus: null, patterns: ["numero_errado"], razoes: "parece certo", model: "gpt", questionSnapshot: "q2", answerSnapshot: "a2" },
    { id: "e3", assistantMessageId: "m3", conversationId: "c2", status: "PENDENTE", humanStatus: null, patterns: [], razoes: "", model: "gpt", questionSnapshot: "q3", answerSnapshot: "a3" },
  ]);

  const res = await getAprendizadoOverview();

  // só m1 e m2 cruzaram (m3 pendente, m4 sem perícia)
  expect(res.crossed).toBe(2);
  expect(res.disagreements).toBe(1);
  expect(res.agreementPct).toBe(50); // 1 de 2
  expect(res.matrix.CORRETO.CORRETO).toBe(1);
  expect(res.matrix.ERRADO.CORRETO).toBe(1);

  // a discordância é a m2 (usuário ERRADO x juiz CORRETO)
  expect(res.disagreementRows).toHaveLength(1);
  expect(res.disagreementRows[0].evaluationId).toBe("e2");
  expect(res.disagreementRows[0].userRating).toBe("ERRADO");
  expect(res.disagreementRows[0].judgeBucket).toBe("CORRETO");
  expect(res.disagreementRows[0].userComment).toBe("saldo errado");

  // patterns de erro: e2 é CORRETO efetivo -> NÃO entra (só não-corretos);
  // nenhuma perícia não-correta com pattern => vazio
  expect(res.errorPatterns).toEqual([]);

  // comentários negativos: m2 (ERRADO, "saldo errado") e m3 (ALUCINOU, "inventou")
  const comments = res.negativeComments.map((c) => c.comment).sort();
  expect(comments).toEqual(["inventou", "saldo errado"]);
  // m2 tem perícia (e2) -> link; m3 não tem perícia terminal mas tem eval? e3 existe
  const m2c = res.negativeComments.find((c) => c.comment === "saldo errado")!;
  expect(m2c.evaluationId).toBe("e2");
});

test("humanStatus sobrescreve status do juiz no balde", async () => {
  (prisma.messageFeedback.findMany as jest.Mock).mockResolvedValue([
    { assistantMessageId: "m1", conversationId: "c1", rating: "CORRETO", comment: null },
  ]);
  (prisma.conversationQualityEvaluation.findMany as jest.Mock).mockResolvedValue([
    // juiz disse ERRADO, humano ajustou pra CORRETO -> balde efetivo CORRETO -> concorda
    { id: "e1", assistantMessageId: "m1", conversationId: "c1", status: "ERRADO", humanStatus: "CORRETO", patterns: [], razoes: "", model: null, questionSnapshot: null, answerSnapshot: null },
  ]);

  const res = await getAprendizadoOverview();
  expect(res.agreementPct).toBe(100);
  expect(res.disagreements).toBe(0);
  expect(res.matrix.CORRETO.CORRETO).toBe(1);
});

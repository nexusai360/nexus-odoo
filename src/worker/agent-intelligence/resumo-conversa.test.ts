// Onda M (Arquitetura 3.0) M.5 , testes do processor do resumo progressivo.
import { processResumoConversaJob } from "./resumo-conversa";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    message: { count: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    userDomainAccess: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/agent/llm/get-active-config", () => ({
  getActiveLlmConfig: jest.fn(),
}));
jest.mock("@/lib/agent/llm/get-client", () => ({
  buildLlmClient: jest.fn(),
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const { getActiveLlmConfig } = jest.requireMock("@/lib/agent/llm/get-active-config");
const { buildLlmClient } = jest.requireMock("@/lib/agent/llm/get-client");

beforeEach(() => {
  jest.clearAllMocks();
  prisma.conversation.update.mockResolvedValue({});
  getActiveLlmConfig.mockResolvedValue({
    provider: "openai",
    apiKey: "sk-x",
    model: "gpt-5.4-mini",
  });
});

function mockChat(message: string) {
  const chat = jest.fn().mockResolvedValue({
    message,
    usage: { tokensInput: 100, tokensOutput: 50 },
  });
  buildLlmClient.mockReturnValue({ chat });
  return chat;
}

const MSGS = [
  { id: "m1", role: "user", content: "faturamento de junho?", toolDigest: null, createdAt: new Date("2026-06-12T10:00:00Z") },
  {
    id: "m2",
    role: "assistant",
    content: "R$ 9.737.728,54.",
    toolDigest: "[fiscal_faturamento_periodo] dominio=fiscal numeros: total=9737728.54",
    createdAt: new Date("2026-06-12T10:00:10Z"),
  },
  { id: "m3", role: "user", content: "e o estoque da esteira?", toolDigest: null, createdAt: new Date("2026-06-12T10:01:00Z") },
  {
    id: "m4",
    role: "assistant",
    content: "611 unidades.",
    toolDigest: "[estoque_saldo_produto] dominio=estoque numeros: qtd=611",
    createdAt: new Date("2026-06-12T10:01:10Z"),
  },
];

test("menos de 8 mensagens novas -> skip sem LLM", async () => {
  prisma.conversation.findUnique.mockResolvedValue({
    id: "c1",
    userId: "u1",
    resumoAtualizadoEm: new Date("2026-06-12T09:00:00Z"),
    resumoAteMensagemId: "m0",
  });
  prisma.message.count.mockResolvedValue(3);
  const r = await processResumoConversaJob({ conversationId: "c1" });
  expect(r.skipped).toBe(true);
  expect(buildLlmClient).not.toHaveBeenCalled();
});

test("gera resumo das mensagens originais e grava cursor + dominios dos digests", async () => {
  prisma.conversation.findUnique.mockResolvedValue({
    id: "c1",
    userId: "u1",
    resumoAtualizadoEm: null,
    resumoAteMensagemId: null,
  });
  prisma.message.count.mockResolvedValue(8);
  prisma.user.findUnique.mockResolvedValue({ platformRole: "super_admin" });
  prisma.message.findMany.mockResolvedValue(MSGS.slice().reverse()); // desc
  const chat = mockChat("- Faturamento junho: R$ 9.737.728,54 (fiscal_faturamento_periodo)");

  const r = await processResumoConversaJob({ conversationId: "c1" });
  expect(r.skipped).toBeUndefined();
  expect(chat).toHaveBeenCalledTimes(1);
  const sent = chat.mock.calls[0][0].messages[1].content as string;
  expect(sent).toContain("faturamento de junho?");
  expect(sent.indexOf("faturamento de junho?")).toBeLessThan(sent.indexOf("611 unidades."));

  const update = prisma.conversation.update.mock.calls[0][0];
  expect(update.where).toEqual({ id: "c1" });
  expect(update.data.resumoProgressivo).toContain("9.737.728,54");
  expect(update.data.resumoAteMensagemId).toBe("m4");
  expect(update.data.resumoDominios.sort()).toEqual(["estoque", "fiscal"]);
  expect(update.data.resumoAtualizadoEm).toBeInstanceOf(Date);
});

test("RBAC: mensagem assistant de dominio revogado fica fora do resumo e dos dominios", async () => {
  prisma.conversation.findUnique.mockResolvedValue({
    id: "c1",
    userId: "u1",
    resumoAtualizadoEm: null,
    resumoAteMensagemId: null,
  });
  prisma.message.count.mockResolvedValue(10);
  prisma.user.findUnique.mockResolvedValue({ platformRole: "member" });
  prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "estoque" }]);
  prisma.message.findMany.mockResolvedValue(MSGS.slice().reverse());
  const chat = mockChat("- Estoque esteira: 611 unidades (estoque_saldo_produto)");

  await processResumoConversaJob({ conversationId: "c1" });
  const sent = chat.mock.calls[0][0].messages[1].content as string;
  expect(sent).not.toContain("9.737.728,54"); // assistant fiscal excluida
  expect(sent).toContain("611 unidades.");
  const update = prisma.conversation.update.mock.calls[0][0];
  expect(update.data.resumoDominios).toEqual(["estoque"]);
});

test("LLM indisponivel -> skip sem gravar", async () => {
  prisma.conversation.findUnique.mockResolvedValue({
    id: "c1",
    userId: "u1",
    resumoAtualizadoEm: null,
    resumoAteMensagemId: null,
  });
  prisma.message.count.mockResolvedValue(9);
  prisma.user.findUnique.mockResolvedValue({ platformRole: "super_admin" });
  prisma.message.findMany.mockResolvedValue(MSGS.slice().reverse());
  getActiveLlmConfig.mockResolvedValue(null);

  const r = await processResumoConversaJob({ conversationId: "c1" });
  expect(r.skipped).toBe(true);
  expect(prisma.conversation.update).not.toHaveBeenCalled();
});

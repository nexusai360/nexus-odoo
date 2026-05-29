import { describe, expect, it, beforeEach, jest } from "@jest/globals";

const mockCreate = jest.fn<(args: unknown) => Promise<{ id: string }>>();
const mockUpdate = jest.fn<(args: unknown) => Promise<unknown>>();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    agentRouterDecision: {
      create: (args: unknown) => mockCreate(args),
      update: (args: unknown) => mockUpdate(args),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createDecision, updateDecision } = require("../log-decision") as {
  createDecision: (input: unknown) => Promise<{ decisionId: string; persisted: boolean }>;
  updateDecision: (id: string, input: unknown) => Promise<void>;
};

const BASE_DECISION = {
  pickedDomains: ["financeiro"],
  scores: { financeiro: 0.9 },
  topScore: 0.9,
  fallback: { triggered: false },
  pickDurationMs: 5,
  routerVersion: "r1.0.0-aaaaaaaa",
};

const BASE_INPUT = {
  decision: BASE_DECISION,
  mode: "shadow" as const,
  catalogSizeOffered: 79,
  catalogSizeFull: 79,
  userQuestion: "qual o saldo?",
};

describe("log-decision: createDecision", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockUpdate.mockReset();
  });

  it("persiste com sucesso e retorna decisionId do banco", async () => {
    mockCreate.mockResolvedValueOnce({ id: "abc123" });
    const r = await createDecision(BASE_INPUT);
    expect(r.persisted).toBe(true);
    expect(r.decisionId).toBe("abc123");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("erro de banco loga warn mas nao quebra (retorna local id)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("db down"));
    const r = await createDecision(BASE_INPUT);
    expect(r.persisted).toBe(false);
    expect(r.decisionId).toMatch(/^local-/);
  });

  it("inclui campos minimos do schema", async () => {
    mockCreate.mockResolvedValueOnce({ id: "x" });
    await createDecision(BASE_INPUT);
    const callArgs = mockCreate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(callArgs.data.userQuestion).toBe("qual o saldo?");
    expect(callArgs.data.mode).toBe("shadow");
    expect(callArgs.data.pickedDomains).toEqual(["financeiro"]);
    expect(callArgs.data.topScore).toBe(0.9);
    expect(callArgs.data.routerVersion).toBe("r1.0.0-aaaaaaaa");
  });

  it("conversationId e messageId opcionais setados como null se ausentes", async () => {
    mockCreate.mockResolvedValueOnce({ id: "x" });
    await createDecision(BASE_INPUT);
    const callArgs = mockCreate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(callArgs.data.conversationId).toBeNull();
    expect(callArgs.data.messageId).toBeNull();
  });

  it("toolsActuallyUsed e toolsDomains comecam vazios", async () => {
    mockCreate.mockResolvedValueOnce({ id: "x" });
    await createDecision(BASE_INPUT);
    const callArgs = mockCreate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(callArgs.data.toolsActuallyUsed).toEqual([]);
    expect(callArgs.data.toolsDomains).toEqual([]);
  });
});

describe("log-decision: updateDecision", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockUpdate.mockReset();
  });

  it("atualiza com sucesso", async () => {
    mockUpdate.mockResolvedValueOnce({});
    await updateDecision("abc", {
      toolsUsed: ["fiscal_notas_emitidas", "financeiro_saldo"],
    });
    const callArgs = mockUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(callArgs.where.id).toBe("abc");
    expect(callArgs.data.toolsActuallyUsed).toEqual([
      "fiscal_notas_emitidas",
      "financeiro_saldo",
    ]);
    expect(callArgs.data.toolsDomains).toEqual(["fiscal", "financeiro"]);
  });

  it("erro silencioso (nao re-throw)", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("db lost"));
    await expect(
      updateDecision("abc", { toolsUsed: ["fiscal_notas"] }),
    ).resolves.toBeUndefined();
  });

  it("toolsUsed vazio gera toolsDomains vazio", async () => {
    mockUpdate.mockResolvedValueOnce({});
    await updateDecision("abc", { toolsUsed: [] });
    const callArgs = mockUpdate.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(callArgs.data.toolsActuallyUsed).toEqual([]);
    expect(callArgs.data.toolsDomains).toEqual([]);
  });
});

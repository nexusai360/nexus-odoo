// RBAC v2 (SPEC §6.2/§6.4): testes unitarios do fast-path de recusa.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    message: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

jest.mock("./router/log-decision", () => ({
  updateDecision: jest.fn(),
}));

// Spy defensivo: se o modulo passar a importar o cliente LLM, este mock pega.
jest.mock("./llm/get-client", () => ({
  buildLlmClient: jest.fn(),
}));

import {
  sanitize,
  formatDomainList,
  respondPermissionDenied,
} from "./permission-denial";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { prisma } = jest.requireMock("@/lib/prisma") as any;
const { updateDecision } = jest.requireMock("./router/log-decision") as any;
const { buildLlmClient } = jest.requireMock("./llm/get-client") as any;

beforeEach(() => {
  jest.clearAllMocks();
  prisma.message.create.mockResolvedValue({});
  prisma.auditLog.create.mockResolvedValue({});
  updateDecision.mockResolvedValue(undefined);
});

describe("formatDomainList", () => {
  it("lista vazia -> string vazia", () => {
    expect(formatDomainList([])).toBe("");
  });

  it("um dominio -> label unico", () => {
    expect(formatDomainList(["estoque"])).toBe("Estoque");
  });

  it("dois dominios -> 'A e B'", () => {
    expect(formatDomainList(["estoque", "financeiro"])).toBe(
      "Estoque e Financeiro",
    );
  });

  it("tres ou mais -> 'A, B e C'", () => {
    expect(formatDomainList(["estoque", "financeiro", "fiscal"])).toBe(
      "Estoque, Financeiro e Fiscal",
    );
  });
});

describe("sanitize", () => {
  it("mascara CPF nu (11 digitos)", () => {
    expect(sanitize("CPF 12345678901 aqui")).toBe("CPF [doc] aqui");
  });

  it("mascara CNPJ nu (14 digitos)", () => {
    expect(sanitize("CNPJ 12345678901234 aqui")).toBe("CNPJ [doc] aqui");
  });

  it("PRESERVA CPF formatado (decisao MVP)", () => {
    expect(sanitize("CPF 123.456.789-01")).toBe("CPF 123.456.789-01");
  });

  it("trunca em maxLen", () => {
    const longo = "a".repeat(300);
    expect(sanitize(longo).length).toBe(200);
  });
});

describe("respondPermissionDenied", () => {
  const baseArgs = {
    conversationId: "conv-1",
    userId: "user-1",
    routerDecisionId: "dec-1",
    userQuestion: "Qual o saldo bancário?",
  };

  it("template com available vazio orienta a falar com admin", async () => {
    const res = await respondPermissionDenied({
      ...baseArgs,
      deniedDomains: ["financeiro"],
      availableDomains: [],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.message).toContain("Financeiro");
      expect(res.message).toContain("Fale com seu administrador");
    }
  });

  it("template com um available cita o label", async () => {
    const res = await respondPermissionDenied({
      ...baseArgs,
      deniedDomains: ["financeiro"],
      availableDomains: ["estoque"],
    });
    if (res.ok) {
      expect(res.message).toContain("Posso te ajudar com Estoque");
    }
  });

  it("template com dois available usa 'A e B'", async () => {
    const res = await respondPermissionDenied({
      ...baseArgs,
      deniedDomains: ["fiscal"],
      availableDomains: ["estoque", "financeiro"],
    });
    if (res.ok) {
      expect(res.message).toContain("Estoque e Financeiro");
    }
  });

  it("template plural quando >1 dominio negado", async () => {
    const res = await respondPermissionDenied({
      ...baseArgs,
      deniedDomains: ["financeiro", "fiscal"],
      availableDomains: ["estoque"],
    });
    if (res.ok) {
      expect(res.message).toContain("esses módulos");
    }
  });

  it("persiste user + assistant, audita e marca outcome SEM chamar LLM", async () => {
    await respondPermissionDenied({
      ...baseArgs,
      deniedDomains: ["financeiro"],
      availableDomains: ["estoque"],
    });

    // 2 message.create (user + assistant)
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
    const roles = prisma.message.create.mock.calls.map(
      (c: any[]) => (c[0] as { data: { role: string } }).data.role,
    );
    expect(roles).toEqual(["user", "assistant"]);

    // 1 auditLog.create com action agent_permission_denied
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = prisma.auditLog.create.mock.calls[0]![0] as {
      data: { action: string; details: { questionSnippet: string } };
    };
    expect(auditArg.data.action).toBe("agent_permission_denied");
    expect(auditArg.data.details.questionSnippet).toBe(
      "Qual o saldo bancário?",
    );

    // 1 updateDecision outcome permission_denied
    expect(updateDecision).toHaveBeenCalledTimes(1);
    expect(updateDecision).toHaveBeenCalledWith({
      decisionId: "dec-1",
      outcome: "permission_denied",
    });

    // ZERO chamadas ao cliente LLM
    expect(buildLlmClient).not.toHaveBeenCalled();
  });

  it("auditoria recebe questionSnippet sanitizado (CPF nu mascarado)", async () => {
    await respondPermissionDenied({
      ...baseArgs,
      userQuestion: "saldo do CPF 12345678901",
      deniedDomains: ["financeiro"],
      availableDomains: [],
    });
    const auditArg = prisma.auditLog.create.mock.calls[0]![0] as {
      data: { details: { questionSnippet: string } };
    };
    expect(auditArg.data.details.questionSnippet).toBe("saldo do CPF [doc]");
  });

  it("usage zerado (custo 0)", async () => {
    const res = await respondPermissionDenied({
      ...baseArgs,
      deniedDomains: ["financeiro"],
      availableDomains: [],
    });
    if (res.ok) {
      expect(res.usage).toEqual({ tokensInput: 0, tokensOutput: 0, costUsd: 0 });
    }
  });
});

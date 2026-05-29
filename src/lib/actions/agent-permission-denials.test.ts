// RBAC v2 (Onda F): testes da query de metricas de recusa.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { findMany: jest.fn() } },
}));

import { getPermissionDenialStats } from "./agent-permission-denials";

const { prisma } = jest.requireMock("@/lib/prisma") as any;

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

function fixtures() {
  const now = Date.now();
  return [
    {
      userId: "u1",
      user: { name: "Ana" },
      createdAt: new Date(now - 1 * HORA),
      details: { questionSnippet: "saldo bancário?", deniedDomains: ["financeiro"] },
    },
    {
      userId: "u2",
      user: { name: "Bruno" },
      createdAt: new Date(now - 2 * DIA),
      details: { questionSnippet: "notas e saldo", deniedDomains: ["financeiro", "fiscal"] },
    },
    {
      userId: "u3",
      user: { name: "Carla" },
      createdAt: new Date(now - 10 * DIA),
      details: { questionSnippet: "estoque do produto", deniedDomains: ["estoque"] },
    },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  // Mock que respeita o filtro de janela (where.createdAt.gte) e a ordenacao desc.
  prisma.auditLog.findMany.mockImplementation(async ({ where }: any) => {
    const gte: Date = where.createdAt.gte;
    return fixtures()
      .filter((f) => f.createdAt >= gte)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
});

describe("getPermissionDenialStats", () => {
  it("24h conta apenas a recusa de 1h atras", async () => {
    const s = await getPermissionDenialStats("24h");
    expect(s.total).toBe(1);
    expect(s.byDomain).toEqual([
      { domain: "financeiro", label: "Financeiro", count: 1 },
    ]);
  });

  it("7d conta as duas dentro de 7 dias", async () => {
    const s = await getPermissionDenialStats("7d");
    expect(s.total).toBe(2);
  });

  it("30d conta as tres", async () => {
    const s = await getPermissionDenialStats("30d");
    expect(s.total).toBe(3);
  });

  it("byDomain agrega e ordena desc", async () => {
    const s = await getPermissionDenialStats("30d");
    expect(s.byDomain[0]).toEqual({
      domain: "financeiro",
      label: "Financeiro",
      count: 2,
    });
    const fiscal = s.byDomain.find((d) => d.domain === "fiscal");
    const estoque = s.byDomain.find((d) => d.domain === "estoque");
    expect(fiscal?.count).toBe(1);
    expect(estoque?.count).toBe(1);
  });

  it("recent vem ordenado desc com nome e snippet", async () => {
    const s = await getPermissionDenialStats("30d");
    expect(s.recent).toHaveLength(3);
    expect(s.recent[0].userName).toBe("Ana");
    expect(s.recent[0].questionSnippet).toBe("saldo bancário?");
    expect(s.recent[0].deniedDomains).toEqual(["financeiro"]);
    expect(s.recent[2].userName).toBe("Carla");
  });

  it("janela vazia -> total 0, listas vazias", async () => {
    prisma.auditLog.findMany.mockResolvedValueOnce([]);
    const s = await getPermissionDenialStats("24h");
    expect(s).toEqual({ total: 0, byDomain: [], recent: [] });
  });
});

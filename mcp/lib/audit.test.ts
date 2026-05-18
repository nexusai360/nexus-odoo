// mcp/lib/audit.test.ts
import { recordAudit, extractRowCount } from "./audit.js";
import type { PrismaClient } from "@/generated/prisma/client";

function makePrismaMock() {
  return {
    mcpAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

describe("extractRowCount", () => {
  it("retorna comprimento do array 'linhas' para envelope ok", () => {
    const output = { estado: "ok", dados: { linhas: [1, 2, 3] } };
    expect(extractRowCount(output)).toBe(3);
  });

  it("retorna 0 para envelope ok com dados apenas escalares (sem array)", () => {
    const output = { estado: "ok", dados: { entrada: 100, saida: 50, saldo: 50 } };
    expect(extractRowCount(output)).toBe(0);
  });

  it("retorna null para envelope 'preparando'", () => {
    const output = { estado: "preparando", dados: {} };
    expect(extractRowCount(output)).toBeNull();
  });

  it("retorna null para output não-envelope", () => {
    expect(extractRowCount("string qualquer")).toBeNull();
    expect(extractRowCount(null)).toBeNull();
    expect(extractRowCount(42)).toBeNull();
  });

  it("prioriza 'linhas' sobre outras chaves de array", () => {
    const output = { estado: "ok", dados: { linhas: [1, 2], titulos: [1, 2, 3] } };
    expect(extractRowCount(output)).toBe(2);
  });

  it("retorna comprimento de 'titulos' quando 'linhas' ausente", () => {
    const output = { estado: "ok", dados: { titulos: [1, 2, 3, 4] } };
    expect(extractRowCount(output)).toBe(4);
  });
});

describe("recordAudit", () => {
  it("chama prisma.mcpAuditLog.create com os campos corretos", async () => {
    const prisma = makePrismaMock();
    await recordAudit(prisma, {
      userId: "user-1",
      tool: "saldo_produto",
      params: { familiaId: 1 },
      outcome: "ok",
      rowCount: 5,
      durationMs: 120,
    });
    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        tool: "saldo_produto",
        params: { familiaId: 1 },
        outcome: "ok",
        rowCount: 5,
        durationMs: 120,
      },
    });
  });

  it("funciona sem rowCount e durationMs (opcionais)", async () => {
    const prisma = makePrismaMock();
    await recordAudit(prisma, {
      userId: "user-2",
      tool: "contas_receber",
      params: {},
      outcome: "denied",
    });
    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-2",
        outcome: "denied",
        rowCount: undefined,
        durationMs: undefined,
      }),
    });
  });
});

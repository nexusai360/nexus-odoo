// src/worker/cleanup/audit-log.test.ts

// Mocka o cliente Prisma gerado para evitar `import.meta` ESM em Jest
jest.mock("@/generated/prisma/client", () => ({
  Prisma: {
    JsonNull: "JsonNull",
  },
  PrismaClient: jest.fn(),
}));

import { mockPrisma } from "../../../mcp/__tests__/mocks/prisma";
import { cleanupAuditLog } from "./audit-log";

function makePrisma(nullified = 3, deleted = 1) {
  return mockPrisma({
    mcpAuditLog: {
      updateMany: jest.fn().mockResolvedValue({ count: nullified }),
      deleteMany: jest.fn().mockResolvedValue({ count: deleted }),
    },
  });
}

describe("cleanupAuditLog", () => {
  beforeEach(() => {
    delete process.env["MCP_AUDIT_DETAIL_RETENTION_DAYS"];
    delete process.env["MCP_AUDIT_FULL_RETENTION_DAYS"];
  });

  it("deve nullificar campos de detalhe e deletar registros muito antigos", async () => {
    const prisma = makePrisma(5, 2);
    const result = await cleanupAuditLog(prisma);

    expect(result.nullified).toBe(5);
    expect(result.deleted).toBe(2);
    expect(result.detailCutoff).toBeInstanceOf(Date);
    expect(result.fullCutoff).toBeInstanceOf(Date);
    // fullCutoff deve ser mais antigo que detailCutoff
    expect(result.fullCutoff.getTime()).toBeLessThan(result.detailCutoff.getTime());
  });

  it("deve usar criadoEm (não createdAt) no filtro de nullify", async () => {
    const prisma = makePrisma(0, 0);
    await cleanupAuditLog(prisma);

    const updateCall = (prisma.mcpAuditLog.updateMany as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toHaveProperty("criadoEm");
    expect(updateCall.where.criadoEm).toHaveProperty("lt");
  });

  it("deve usar criadoEm no filtro de delete", async () => {
    const prisma = makePrisma(0, 0);
    await cleanupAuditLog(prisma);

    const deleteCall = (prisma.mcpAuditLog.deleteMany as jest.Mock).mock.calls[0][0];
    expect(deleteCall.where).toHaveProperty("criadoEm");
    expect(deleteCall.where.criadoEm).toHaveProperty("lt");
  });

  it("deve nullificar payload, result, snapshotBefore e snapshotAfter", async () => {
    const prisma = makePrisma(3, 0);
    await cleanupAuditLog(prisma);

    const updateCall = (prisma.mcpAuditLog.updateMany as jest.Mock).mock.calls[0][0];
    // Prisma.JsonNull é usado para nullificar campos Json em updateMany
    const { Prisma } = jest.requireMock("@/generated/prisma/client") as { Prisma: { JsonNull: unknown } };
    expect(updateCall.data).toEqual({
      payload: Prisma.JsonNull,
      result: Prisma.JsonNull,
      snapshotBefore: Prisma.JsonNull,
      snapshotAfter: Prisma.JsonNull,
    });
  });

  it("deve respeitar MCP_AUDIT_DETAIL_RETENTION_DAYS e MCP_AUDIT_FULL_RETENTION_DAYS do env", async () => {
    process.env["MCP_AUDIT_DETAIL_RETENTION_DAYS"] = "30";
    process.env["MCP_AUDIT_FULL_RETENTION_DAYS"] = "365";
    const prisma = makePrisma(0, 0);
    const before = new Date();
    const result = await cleanupAuditLog(prisma);
    const after = new Date();

    // detailCutoff ≈ 30 dias atrás
    const expected30 = new Date();
    expected30.setDate(expected30.getDate() - 30);
    expect(Math.abs(result.detailCutoff.getTime() - expected30.getTime())).toBeLessThan(5000);

    // fullCutoff ≈ 365 dias atrás
    const expected365 = new Date();
    expected365.setDate(expected365.getDate() - 365);
    expect(Math.abs(result.fullCutoff.getTime() - expected365.getTime())).toBeLessThan(5000);

    void before; void after;
  });

  it("deve usar defaults se variáveis de env são inválidas", async () => {
    process.env["MCP_AUDIT_DETAIL_RETENTION_DAYS"] = "abc";
    process.env["MCP_AUDIT_FULL_RETENTION_DAYS"] = "-5";
    const prisma = makePrisma(0, 0);
    const result = await cleanupAuditLog(prisma);

    // default: detail=90d, full=730d
    const detail90 = new Date();
    detail90.setDate(detail90.getDate() - 90);
    const full730 = new Date();
    full730.setDate(full730.getDate() - 730);

    expect(Math.abs(result.detailCutoff.getTime() - detail90.getTime())).toBeLessThan(5000);
    expect(Math.abs(result.fullCutoff.getTime() - full730.getTime())).toBeLessThan(5000);
  });
});

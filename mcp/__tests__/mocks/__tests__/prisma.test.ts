// mcp/__tests__/mocks/__tests__/prisma.test.ts
// Testes da factory mockPrisma — verifica que retorna métodos esperados e que overrides funcionam.

import { mockPrisma } from "../prisma.js";

describe("mockPrisma()", () => {
  it("retorna jest.fn() para todos os métodos padrão sem overrides", () => {
    const prisma = mockPrisma();

    // apiKey
    expect(prisma.apiKey.findUnique).toBeDefined();
    expect(typeof prisma.apiKey.findUnique).toBe("function");
    expect(prisma.apiKey.findMany).toBeDefined();
    expect(prisma.apiKey.create).toBeDefined();
    expect(prisma.apiKey.update).toBeDefined();
    expect(prisma.apiKey.delete).toBeDefined();

    // mcpAuditLog
    expect(prisma.mcpAuditLog.create).toBeDefined();
    expect(prisma.mcpAuditLog.createMany).toBeDefined();
    expect(prisma.mcpAuditLog.findMany).toBeDefined();
    expect(prisma.mcpAuditLog.groupBy).toBeDefined();

    // rawResPartner
    expect(prisma.rawResPartner.findUnique).toBeDefined();
    expect(prisma.rawResPartner.create).toBeDefined();
    expect(prisma.rawResPartner.update).toBeDefined();
    expect(prisma.rawResPartner.upsert).toBeDefined();
    expect(prisma.rawResPartner.delete).toBeDefined();
    expect(prisma.rawResPartner.aggregate).toBeDefined();

    // primitivos raw
    expect(prisma.$queryRaw).toBeDefined();
    expect(prisma.$executeRaw).toBeDefined();
  });

  it("os métodos retornados são jest.fn() rastreáveis", () => {
    const prisma = mockPrisma();
    expect(jest.isMockFunction(prisma.apiKey.findUnique)).toBe(true);
    expect(jest.isMockFunction(prisma.mcpAuditLog.createMany)).toBe(true);
    expect(jest.isMockFunction(prisma.$queryRaw)).toBe(true);
  });

  it("overrides substituem a implementação padrão do método", () => {
    const customFindUnique = jest.fn().mockResolvedValue({ id: "key-1" });
    const prisma = mockPrisma({
      apiKey: { findUnique: customFindUnique },
    });

    expect(prisma.apiKey.findUnique).toBe(customFindUnique);
    // Outros métodos de apiKey ainda existem
    expect(jest.isMockFunction(prisma.apiKey.findMany)).toBe(true);
  });

  it("cada chamada a mockPrisma() retorna uma instância independente", () => {
    const a = mockPrisma();
    const b = mockPrisma();
    expect(a.apiKey.findUnique).not.toBe(b.apiKey.findUnique);
  });

  it("override parcial em mcpAuditLog preserva os demais métodos", () => {
    const customCreate = jest.fn().mockResolvedValue({ id: 1 });
    const prisma = mockPrisma({
      mcpAuditLog: { create: customCreate },
    });

    expect(prisma.mcpAuditLog.create).toBe(customCreate);
    expect(jest.isMockFunction(prisma.mcpAuditLog.createMany)).toBe(true);
    expect(jest.isMockFunction(prisma.mcpAuditLog.findMany)).toBe(true);
    expect(jest.isMockFunction(prisma.mcpAuditLog.groupBy)).toBe(true);
  });
});

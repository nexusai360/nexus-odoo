// mcp/__tests__/mocks/prisma.ts
// Factory de mock do PrismaClient para testes unitários do servidor MCP.
// Usado por todos os blocos B, C, D, E, F, G, H, J do F4 Onda 2.

import type { PrismaClient } from "@/generated/prisma/client";

export function mockPrisma(
  overrides: Partial<{
    apiKey: Partial<PrismaClient["apiKey"]>;
    mcpAuditLog: Partial<PrismaClient["mcpAuditLog"]>;
    mcpIdempotencyRecord: Partial<PrismaClient["mcpIdempotencyRecord"]>;
    rawResPartner: Partial<PrismaClient["rawResPartner"]>;
  }> = {},
): jest.Mocked<PrismaClient> {
  return {
    apiKey: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      ...overrides.apiKey,
    },
    mcpAuditLog: {
      create: jest.fn(),
      // createMany preserva compat com mcp/lib/audit.ts existente
      createMany: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      ...overrides.mcpAuditLog,
    },
    mcpIdempotencyRecord: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      ...overrides.mcpIdempotencyRecord,
    },
    rawResPartner: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
      ...overrides.rawResPartner,
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  } as unknown as jest.Mocked<PrismaClient>;
}

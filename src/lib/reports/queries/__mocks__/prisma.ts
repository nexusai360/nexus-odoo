// src/lib/reports/queries/__mocks__/prisma.ts
// Helper de mock do PrismaClient para testes do núcleo de query.
// Usa jest.fn() simples (sem jest-mock-extended) para evitar dependência
// de tipos gerados que podem variar entre builds.

export function createMockContext() {
  return {
    fatoEstoqueSaldo: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    fatoEstoqueMovimento: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    fatoProdutoParado: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    fatoBuildState: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    syncState: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
  };
}

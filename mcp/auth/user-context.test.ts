// mcp/auth/user-context.test.ts
import { resolveUserContext } from "./user-context.js";
import type { PrismaClient } from "@/generated/prisma/client";

// Mock mínimo do prisma
function makePrismaMock(overrides: Partial<{
  user: unknown;
  domains: unknown[];
}> = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(overrides.user ?? null),
    },
    userDomainAccess: {
      findMany: jest.fn().mockResolvedValue(
        (overrides.domains ?? []).map((d) => ({ domain: d })),
      ),
    },
  } as unknown as PrismaClient;
}

describe("resolveUserContext", () => {
  it("retorna UserContext para usuário ativo", async () => {
    const prisma = makePrismaMock({
      user: { id: "user-1", platformRole: "admin", isActive: true },
      domains: ["estoque", "financeiro"],
    });
    const ctx = await resolveUserContext(prisma, "user-1");
    expect(ctx).toEqual({
      userId: "user-1",
      role: "admin",
      domains: ["estoque", "financeiro"],
    });
  });

  it("retorna null para usuário isActive=false", async () => {
    const prisma = makePrismaMock({
      user: { id: "user-2", platformRole: "viewer", isActive: false },
      domains: ["estoque"],
    });
    const ctx = await resolveUserContext(prisma, "user-2");
    expect(ctx).toBeNull();
  });

  it("retorna null para usuário inexistente", async () => {
    const prisma = makePrismaMock({ user: null });
    const ctx = await resolveUserContext(prisma, "non-existent");
    expect(ctx).toBeNull();
  });
});

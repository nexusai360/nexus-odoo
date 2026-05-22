// src/worker/cleanup/idempotency.test.ts

import { mockPrisma } from "../../../mcp/__tests__/mocks/prisma";
import { cleanupExpiredIdempotency } from "./idempotency";

describe("cleanupExpiredIdempotency", () => {
  it("deve deletar registros com expiresAt < agora e retornar contagem", async () => {
    const prisma = mockPrisma({
      mcpIdempotencyRecord: {
        deleteMany: jest.fn().mockResolvedValue({ count: 7 }),
      },
    });

    const before = new Date();
    const result = await cleanupExpiredIdempotency(prisma);
    const after = new Date();

    expect(result.deleted).toBe(7);
    expect(result.cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(prisma.mcpIdempotencyRecord.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it("deve retornar deleted=0 quando não há registros expirados", async () => {
    const prisma = mockPrisma({
      mcpIdempotencyRecord: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const result = await cleanupExpiredIdempotency(prisma);
    expect(result.deleted).toBe(0);
  });
});

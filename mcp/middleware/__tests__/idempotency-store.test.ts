// mcp/middleware/__tests__/idempotency-store.test.ts
import { recordIdempotencyResult } from "../idempotency-store";
import { mockPrisma } from "../../__tests__/mocks/prisma";

const BASE_OPTS = {
  apiKeyId: "api-key-uuid-1",
  key: "idem-123",
  toolId: "estoque_modelo",
  payloadHash: "abc123def",
  result: { data: "ok" },
  status: "success",
  httpStatus: 200,
};

describe("recordIdempotencyResult", () => {
  it("cria McpIdempotencyRecord com os campos corretos", async () => {
    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.create as jest.Mock).mockResolvedValue({});

    const before = Date.now();
    await recordIdempotencyResult({ prisma, ...BASE_OPTS });

    expect(prisma.mcpIdempotencyRecord.create).toHaveBeenCalledTimes(1);
    const { data } = (prisma.mcpIdempotencyRecord.create as jest.Mock).mock.calls[0][0];
    expect(data.apiKeyId).toBe("api-key-uuid-1");
    expect(data.key).toBe("idem-123");
    expect(data.toolId).toBe("estoque_modelo");
    expect(data.payloadHash).toBe("abc123def");
    expect(data.result).toEqual({ data: "ok" });
    expect(data.status).toBe("success");
    expect(data.httpStatus).toBe(200);
    // expiresAt ≈ now + 24h
    const expiresMs = data.expiresAt.getTime();
    expect(expiresMs).toBeGreaterThan(before + 23 * 3600 * 1000);
    expect(expiresMs).toBeLessThan(before + 25 * 3600 * 1000);
  });

  it("TTL configurável , ttlHours=1 → expiresAt ≈ now+1h", async () => {
    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.create as jest.Mock).mockResolvedValue({});

    const before = Date.now();
    await recordIdempotencyResult({ prisma, ...BASE_OPTS, ttlHours: 1 });

    const { data } = (prisma.mcpIdempotencyRecord.create as jest.Mock).mock.calls[0][0];
    const expiresMs = data.expiresAt.getTime();
    expect(expiresMs).toBeGreaterThan(before + 59 * 60 * 1000);
    expect(expiresMs).toBeLessThan(before + 61 * 60 * 1000);
  });

  it("não lança erro quando Prisma falha (try/catch silencioso)", async () => {
    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.create as jest.Mock).mockRejectedValue(
      new Error("DB unavailable"),
    );

    await expect(
      recordIdempotencyResult({ prisma, ...BASE_OPTS }),
    ).resolves.toBeUndefined();
  });

  it("aceita result com valores arbitrários (null, array, primitivo)", async () => {
    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.create as jest.Mock).mockResolvedValue({});

    await recordIdempotencyResult({ prisma, ...BASE_OPTS, result: null });
    expect(prisma.mcpIdempotencyRecord.create).toHaveBeenCalledTimes(1);
  });
});

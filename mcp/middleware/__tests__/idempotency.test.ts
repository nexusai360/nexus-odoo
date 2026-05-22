// mcp/middleware/__tests__/idempotency.test.ts
// Testes E3–E7 do middleware de idempotência.

import { checkIdempotency } from "../idempotency";
import { mockPrisma } from "../../__tests__/mocks/prisma";
import { createMockRedis } from "../../__tests__/mocks/redis";
import { canonicalHash } from "../../lib/canonical-json";

const API_KEY_ID = "api-key-uuid-1";
const TOOL_ID = "estoque_modelo";
const PAYLOAD = { modelo: "Leg Press" };
const PAYLOAD_HASH = canonicalHash(PAYLOAD);

function makeHeaders(key?: string): Record<string, string | undefined> {
  return key ? { "idempotency-key": key } : {};
}

// ─── E3: operation=read → proceed ────────────────────────────────────────────
describe("E3 — operation=read", () => {
  it("retorna proceed sem verificar header ou Redis", async () => {
    const prisma = mockPrisma();
    const redis = createMockRedis();

    const result = await checkIdempotency({
      operation: "read",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: {},
      prisma,
      redis,
    });

    expect(result.status).toBe("proceed");
    expect(prisma.mcpIdempotencyRecord.findUnique).not.toHaveBeenCalled();
  });

  it("operation=read com header presente → ainda retorna proceed", async () => {
    const prisma = mockPrisma();
    const redis = createMockRedis();

    const result = await checkIdempotency({
      operation: "read",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: makeHeaders("idem-123"),
      prisma,
      redis,
    });

    expect(result.status).toBe("proceed");
  });
});

// ─── E3: operation=write sem header → 400 ────────────────────────────────────
describe("E3 — operation=write sem idempotency-key", () => {
  it("retorna 400 idempotency_key_required quando header ausente", async () => {
    const prisma = mockPrisma();
    const redis = createMockRedis();

    const result = await checkIdempotency({
      operation: "write",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: {},
      prisma,
      redis,
    });

    expect(result.status).toBe(400);
    expect(result.errorCode).toBe("idempotency_key_required");
  });

  it("lê header case-insensitive: Idempotency-Key (capitalizado) funciona", async () => {
    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.findUnique as jest.Mock).mockResolvedValue(null);
    const redis = createMockRedis();

    const result = await checkIdempotency({
      operation: "write",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: { "Idempotency-Key": "idem-cap-123" },
      prisma,
      redis,
    });

    // Deve prosseguir (não 400) — encontrou header capitalizado
    expect(result.status).not.toBe(400);
  });
});

// ─── E4: mesmo key + mesmo payloadHash → cached ──────────────────────────────
describe("E4 — cached: mesma key + mesmo payloadHash", () => {
  it("com lock adquirido + record existente com mesmo hash → cached + solta lock", async () => {
    const existingRecord = {
      apiKeyId: API_KEY_ID,
      key: "idem-123",
      toolId: TOOL_ID,
      payloadHash: PAYLOAD_HASH,
      result: { data: "resultado anterior" },
      status: "success",
      httpStatus: 200,
      expiresAt: new Date(Date.now() + 86400_000),
      createdAt: new Date(),
    };

    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.findUnique as jest.Mock).mockResolvedValue(existingRecord);
    const redis = createMockRedis();

    const result = await checkIdempotency({
      operation: "write",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: makeHeaders("idem-123"),
      prisma,
      redis,
    });

    expect(result.status).toBe("cached");
    expect(result.cachedResult).toEqual({ data: "resultado anterior" });
    expect(result.cachedHttpStatus).toBe(200);
  });
});

// ─── E5: mesma key + payloadHash diferente → 422 ─────────────────────────────
describe("E5 — conflict: mesma key + payloadHash diferente", () => {
  it("com lock adquirido + record existente com hash diferente → 422", async () => {
    const existingRecord = {
      apiKeyId: API_KEY_ID,
      key: "idem-123",
      toolId: TOOL_ID,
      payloadHash: canonicalHash({ modelo: "OUTRO PRODUTO" }),
      result: {},
      status: "success",
      httpStatus: 200,
      expiresAt: new Date(Date.now() + 86400_000),
      createdAt: new Date(),
    };

    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.findUnique as jest.Mock).mockResolvedValue(existingRecord);
    const redis = createMockRedis();

    const result = await checkIdempotency({
      operation: "write",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: makeHeaders("idem-123"),
      prisma,
      redis,
    });

    expect(result.status).toBe(422);
    expect(result.errorCode).toBe("idempotency_key_conflict");
  });

  it("sem lock (outro executor) + record com hash diferente → 422", async () => {
    const existingRecord = {
      apiKeyId: API_KEY_ID,
      key: "idem-race",
      toolId: TOOL_ID,
      payloadHash: canonicalHash({ modelo: "PAYLOAD DIFERENTE" }),
      result: {},
      status: "success",
      httpStatus: 200,
      expiresAt: new Date(Date.now() + 86400_000),
      createdAt: new Date(),
    };

    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.findUnique as jest.Mock).mockResolvedValue(existingRecord);

    // Redis com lock já ocupado
    const redis = createMockRedis();
    await redis.set("mcp:idem:api-key-uuid-1:idem-race", "1", "EX", 60, "NX"); // ocupa o lock

    const result = await checkIdempotency({
      operation: "write",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: makeHeaders("idem-race"),
      prisma,
      redis,
    });

    expect(result.status).toBe(422);
    expect(result.errorCode).toBe("idempotency_key_conflict");
  });
});

// ─── E6: race condition → 409 ─────────────────────────────────────────────────
describe("E6 — race condition: lock em posse de outro executor, sem record", () => {
  it("retorna 409 idempotency_in_progress", async () => {
    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.findUnique as jest.Mock).mockResolvedValue(null);

    // Lock já ocupado por outro executor
    const redis = createMockRedis();
    await redis.set("mcp:idem:api-key-uuid-1:idem-race", "1", "EX", 60, "NX");

    const result = await checkIdempotency({
      operation: "write",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: makeHeaders("idem-race"),
      prisma,
      redis,
    });

    expect(result.status).toBe(409);
    expect(result.errorCode).toBe("idempotency_in_progress");
  });
});

// ─── E7: Redis indisponível → 503 ────────────────────────────────────────────
describe("E7 — Redis indisponível", () => {
  it("retorna 503 idempotency_unavailable quando Redis lança erro", async () => {
    const prisma = mockPrisma();

    // Simular Redis quebrado
    const redis = {
      set: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      del: jest.fn(),
    } as unknown as import("ioredis").default;

    const result = await checkIdempotency({
      operation: "write",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: makeHeaders("idem-503"),
      prisma,
      redis,
    });

    expect(result.status).toBe(503);
    expect(result.errorCode).toBe("idempotency_unavailable");
  });
});

// ─── Caminho happy-path: proceed com lock ─────────────────────────────────────
describe("proceed — sem record existente", () => {
  it("retorna proceed + lockKey quando não há record anterior", async () => {
    const prisma = mockPrisma();
    (prisma.mcpIdempotencyRecord.findUnique as jest.Mock).mockResolvedValue(null);
    const redis = createMockRedis();

    const result = await checkIdempotency({
      operation: "write",
      apiKeyId: API_KEY_ID,
      toolId: TOOL_ID,
      payload: PAYLOAD,
      headers: makeHeaders("idem-new"),
      prisma,
      redis,
    });

    expect(result.status).toBe("proceed");
    expect(result.lockKey).toBe(`mcp:idem:${API_KEY_ID}:idem-new`);
  });
});

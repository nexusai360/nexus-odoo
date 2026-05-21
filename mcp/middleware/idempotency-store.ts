// mcp/middleware/idempotency-store.ts
// Persiste o resultado de uma operação idempotente em McpIdempotencyRecord.
// TTL configurável (padrão 24h). Usa try/catch para não deixar o caller cair.

import type { PrismaClient } from "@/generated/prisma/client";

export interface RecordIdempotencyResultOpts {
  prisma: PrismaClient;
  apiKeyId: string;
  key: string;
  toolId: string;
  payloadHash: string;
  result: unknown;
  status: string;
  httpStatus: number;
  ttlHours?: number;
}

export async function recordIdempotencyResult(
  opts: RecordIdempotencyResultOpts,
): Promise<void> {
  const {
    prisma,
    apiKeyId,
    key,
    toolId,
    payloadHash,
    result,
    status,
    httpStatus,
    ttlHours = 24,
  } = opts;

  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  try {
    await prisma.mcpIdempotencyRecord.create({
      data: {
        apiKeyId,
        key,
        toolId,
        payloadHash,
        result: result as object,
        status,
        httpStatus,
        expiresAt,
      },
    });
  } catch {
    // Log silencioso — não propagar erro para não afetar o caller
    // O TTL do Redis garante que a key expira; ausência do record é aceitável
  }
}

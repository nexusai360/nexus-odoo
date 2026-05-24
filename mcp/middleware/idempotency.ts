// mcp/middleware/idempotency.ts
// Middleware de idempotência para operações de escrita no MCP.
// Usa lock distribuído Redis + McpIdempotencyRecord em Postgres.
//
// Fluxo:
//   read  → "proceed" direto (sem lock, sem DB)
//   write → verifica header → tenta lock → consulta record → retorna status
//
// IMPORTANTE: quando status="proceed", o CALLER é responsável por chamar
// `recordIdempotencyResult` e depois `releaseLock` ao finalizar.

import type { PrismaClient } from "@/generated/prisma/client";
import type Redis from "ioredis";
import { canonicalHash } from "../lib/canonical-json.js";
import { acquireLock, releaseLock } from "../lib/distributed-lock.js";

export interface IdempotencyCheckResult {
  status: "proceed" | "cached" | 400 | 409 | 422 | 503;
  errorCode?: string;
  cachedResult?: unknown;
  cachedHttpStatus?: number;
  /** Lock key para o caller soltar via releaseLock após gravar o resultado */
  lockKey?: string;
}

export interface IdempotencyCheckOpts {
  operation: "read" | "write";
  apiKeyId: string;
  toolId: string;
  payload: unknown;
  headers: Record<string, string | undefined>;
  prisma: PrismaClient;
  redis: Redis;
}

function getIdempotencyKey(headers: Record<string, string | undefined>): string | undefined {
  return headers["idempotency-key"] ?? headers["Idempotency-Key"];
}

export async function checkIdempotency(
  opts: IdempotencyCheckOpts,
): Promise<IdempotencyCheckResult> {
  const { operation, apiKeyId, toolId, payload, headers, prisma, redis } = opts;

  // 1. Leitura → prosseguir sem verificação
  if (operation === "read") {
    return { status: "proceed" };
  }

  // 2. Escrita sem idempotency-key → 400
  const key = getIdempotencyKey(headers);
  if (!key) {
    return { status: 400, errorCode: "idempotency_key_required" };
  }

  const payloadHash = canonicalHash(payload);
  const lockKey = `mcp:idem:${apiKeyId}:${key}`;

  // 3. Tentar adquirir lock
  let acquired: boolean;
  try {
    acquired = await acquireLock(redis, lockKey, { ttlSec: 60 });
  } catch {
    return { status: 503, errorCode: "idempotency_unavailable" };
  }

  if (!acquired) {
    // Lock em posse de outro executor , buscar record existente
    const record = await prisma.mcpIdempotencyRecord.findUnique({
      where: { apiKeyId_key: { apiKeyId, key } },
    });

    if (record) {
      if (record.payloadHash === payloadHash) {
        return {
          status: "cached",
          cachedResult: record.result,
          cachedHttpStatus: record.httpStatus,
        };
      } else {
        return { status: 422, errorCode: "idempotency_key_conflict" };
      }
    }

    // Record não existe + lock não adquirido → outro executor em andamento
    return { status: 409, errorCode: "idempotency_in_progress" };
  }

  // Lock adquirido , verificar se já existe record
  const existingRecord = await prisma.mcpIdempotencyRecord.findUnique({
    where: { apiKeyId_key: { apiKeyId, key } },
  });

  if (existingRecord) {
    await releaseLock(redis, lockKey);

    if (existingRecord.payloadHash === payloadHash) {
      return {
        status: "cached",
        cachedResult: existingRecord.result,
        cachedHttpStatus: existingRecord.httpStatus,
      };
    } else {
      return { status: 422, errorCode: "idempotency_key_conflict" };
    }
  }

  // Sem record existente → prosseguir com lock (caller deve chamar recordIdempotencyResult + releaseLock)
  return { status: "proceed", lockKey };
}

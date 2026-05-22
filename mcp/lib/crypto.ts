// mcp/lib/crypto.ts
// Helpers criptográficos para o servidor MCP.
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Retorna o hash SHA-256 de uma string como hex lowercase (64 chars).
 * Usado para derivar o tokenHash armazenado em ApiKey.tokenHash.
 */
export function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Compara dois Buffers de forma constant-time (evita timing attacks).
 * Retorna false se os tamanhos forem diferentes.
 */
export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

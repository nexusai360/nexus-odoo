/**
 * Helpers criptográficos para uso em server actions e API routes do `src/`.
 * Espelha `mcp/lib/crypto.ts` — mantidos separados para não cruzar fronteiras
 * de módulo (mcp/ usa Node runtime próprio e não é importável de src/).
 */

import { createHash } from "node:crypto";

/**
 * Retorna o hash SHA-256 de uma string como hex lowercase (64 chars).
 * Usado para derivar o keyHash armazenado em ApiKey.
 */
export function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// mcp/auth/service-token.ts
// Validação constant-time do service token do MCP.
// Falha seguro: retorna false se MCP_SERVICE_TOKEN não está no ambiente.
import { timingSafeEqual, createHash } from "node:crypto";

/**
 * Valida o header Authorization: Bearer <token> contra MCP_SERVICE_TOKEN.
 * Usa timingSafeEqual para evitar timing attacks.
 * Retorna false se o env não estiver configurado (falha seguro).
 */
export function validateServiceToken(header: string | undefined): boolean {
  const expected = process.env.MCP_SERVICE_TOKEN;
  // Falha seguro: sem env configurado, nunca autoriza.
  if (!expected) return false;

  if (!header) return false;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  const provided = header.slice(prefix.length);

  // timingSafeEqual exige buffers de mesmo comprimento.
  // Para não vazar o comprimento do token esperado via exceção,
  // sempre comparamos hashes (comprimento fixo 32 bytes).
  const expectedBuf = createHash("sha256").update(expected).digest();
  const providedBuf = createHash("sha256").update(provided).digest();

  return timingSafeEqual(expectedBuf, providedBuf);
}

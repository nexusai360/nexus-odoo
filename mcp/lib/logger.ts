// mcp/lib/logger.ts
// Logger estruturado com pino para o servidor MCP.
// maskToken: ofusca qualquer string que pareça um Bearer token ou chave de API.
import pino from "pino";

/**
 * Mascara tokens sensíveis em strings para log seguro.
 * Substitui tudo depois dos primeiros 4 caracteres por "****".
 * Strings com menos de 4 caracteres são totalmente mascaradas.
 */
export function maskToken(raw: string): string {
  if (!raw || raw.length === 0) return "****";
  const visible = Math.min(4, Math.floor(raw.length / 4));
  return raw.slice(0, visible) + "****";
}

/**
 * Remove "Bearer " prefix e mascara o token restante.
 * Útil para logar headers Authorization de forma segura.
 */
export function maskBearerHeader(header: string | undefined): string {
  if (!header) return "(absent)";
  const prefix = "Bearer ";
  if (header.startsWith(prefix)) {
    return `Bearer ${maskToken(header.slice(prefix.length))}`;
  }
  return maskToken(header);
}

export const logger = pino({
  name: "nexus-mcp",
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" },
    },
  }),
});

export default logger;

// mcp/__tests__/e2e/setup.ts
// Setup global para suítes E2E do Bloco P.
//
// SKIP ELEGANTE:
//   - DATABASE_URL: obrigatório para todos os E2E (DB local).
//   - ODOO_WRITE_USER / ODOO_WRITE_PASSWORD: opcionais — testes que tocam
//     Odoo real ficam em describe.skip quando ausentes, exibindo mensagem clara.
//   - MCP_WRITE_ENABLED: deve ser "true" para testes de write passarem.
//
// Uso nos testes:
//   import { odooCredsAvailable, skipIfNoOdooCreds } from "./setup.js";
//   describe("bloco que precisa de Odoo", () => {
//     if (!odooCredsAvailable) return;
//     // ...
//   });

export const odooCredsAvailable =
  Boolean(process.env.ODOO_WRITE_USER) &&
  Boolean(process.env.ODOO_WRITE_PASSWORD);

export const dbAvailable = Boolean(process.env.DATABASE_URL);

export const writeEnabled = process.env.MCP_WRITE_ENABLED === "true";

/**
 * Emite console.warn descrevendo quais variáveis estão ausentes.
 * Chamado no beforeAll de cada suíte E2E — não lança, apenas informa.
 */
export function warnMissingEnv(): void {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.ODOO_WRITE_USER) missing.push("ODOO_WRITE_USER");
  if (!process.env.ODOO_WRITE_PASSWORD) missing.push("ODOO_WRITE_PASSWORD");
  if (!writeEnabled) missing.push("MCP_WRITE_ENABLED=true");

  if (missing.length > 0) {
    console.warn(
      `[E2E setup] Variáveis ausentes: ${missing.join(", ")}. ` +
        "Testes que dependem dessas variáveis serão pulados (skipped).",
    );
  }
}

/** Prefixo usado em todos os dados criados pelos testes E2E para facilitar cleanup. */
export const TEST_PREFIX = "[MCP-TEST]";

// mcp/tools/caminho3/bi-pool.ts
// Pool Postgres dedicado ao Caminho 3c (modo BI avançado).
//
// NOTA: este pool NUNCA é exposto no ToolHandlerCtx geral — acessado somente
// via import direto pelo handler de bi-consulta-avancada.ts.
//
// Fail-safe: se MCP_BI_DATABASE_URL não estiver definida, o pool é null e o
// servidor MCP sobe normalmente. O handler do 3c verifica getBiPool() e retorna
// erro estruturado "modo BI não configurado" sem derrubar o boot.
//
// Segurança:
//   - default_transaction_read_only = on: garante read-only em nível de transação.
//   - statement_timeout = '5s': mata queries longas (defesa contra DoS).
//   - O role nexus_mcp_bi (H.2) é o controle primário; estes SETs são reforço.
import { Pool } from "pg";
import type { PoolClient } from "pg";

const connectionString = process.env.MCP_BI_DATABASE_URL;

let pool: Pool | null = null;

if (connectionString) {
  // max conservador: o 3c é gated a admin/super_admin — concorrência baixa esperada.
  pool = new Pool({ connectionString, max: 5 });

  // Reforço de segurança por conexão: read-only + timeout curto.
  // Usamos uma única query com ponto-e-vírgula para garantir atomicidade dos SETs.
  // O handler é síncrono (void) para evitar exceções não tratadas em async handlers
  // que causariam crash do processo Node.js.
  pool.on("connect", (client: PoolClient) => {
    void client
      .query("SET default_transaction_read_only = on; SET statement_timeout = '5s'")
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[bi-pool] falha ao configurar conexão read-only:", msg);
      });
  });

  // Handler de erro em clientes idle — sem isso, um erro de conexão ociosa pode
  // emitir 'error' no pool e derrubar o processo Node.js (comportamento padrão do pg).
  pool.on("error", (err: Error) => {
    console.error("[bi-pool] erro em cliente idle do pool BI:", err.message);
  });
}

/** Retorna o pool dedicado ao Caminho 3c, ou null se MCP_BI_DATABASE_URL não estiver configurada. */
export function getBiPool(): Pool | null {
  return pool;
}

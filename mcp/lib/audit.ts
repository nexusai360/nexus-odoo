// mcp/lib/audit.ts
// Gravação de auditoria de chamadas ao MCP e extração de rowCount do output.
import type { PrismaClient } from "@/generated/prisma/client";

export type AuditOutcome = "ok" | "denied" | "error" | "invalid_input";

export interface AuditParams {
  userId: string;
  tool: string;
  params: unknown;
  outcome: AuditOutcome;
  rowCount?: number;
  durationMs?: number;
}

/**
 * Grava uma linha em mcp_audit_log. Nunca lança — envolver em try/catch no pipeline.
 *
 * IMPORTANTE: usa createMany() em vez de create() para suprimir o RETURNING implícito
 * que o Prisma/adapter-pg emite no create(). O role nexus_mcp tem GRANT INSERT mas não
 * SELECT em mcp_audit_log (menor privilégio: o MCP grava mas não lê seu próprio log).
 * createMany() emite apenas INSERT sem RETURNING, preservando o menor privilégio.
 */
export async function recordAudit(
  prisma: PrismaClient,
  p: AuditParams,
): Promise<void> {
  await prisma.mcpAuditLog.createMany({
    data: [
      {
        userId: p.userId,
        tool: p.tool,
        params: p.params as object,
        outcome: p.outcome,
        rowCount: p.rowCount,
        durationMs: p.durationMs,
      },
    ],
  });
}

// Chaves de array procuradas em ordem de prioridade no objeto `dados`.
const ARRAY_KEYS = [
  "linhas",
  "titulos",
  "serie",
  "contas",
  "top",
  "familia",
  "marca",
] as const;

/**
 * Extrai o rowCount de um output de tool.
 * Regra determinística (achado N13):
 * - Se output é envelope `{ estado, dados }` com `estado !== "preparando"`:
 *   - Se `dados` contém alguma chave de ARRAY_KEYS com valor Array → retorna length.
 *   - Se `dados` é objeto mas nenhuma chave de array existe → retorna 0.
 * - Se `estado === "preparando"` ou output não é envelope → retorna null.
 */
export function extractRowCount(output: unknown): number | null {
  if (!output || typeof output !== "object") return null;

  const o = output as Record<string, unknown>;
  if (!("estado" in o) || !("dados" in o)) return null;

  if (o.estado === "preparando") return null;

  const dados = o.dados;
  if (!dados || typeof dados !== "object") return null;

  const d = dados as Record<string, unknown>;
  for (const key of ARRAY_KEYS) {
    if (key in d && Array.isArray(d[key])) {
      return (d[key] as unknown[]).length;
    }
  }

  // dados existe como objeto mas não tem nenhuma chave de array
  return 0;
}

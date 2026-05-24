/**
 * Agrega o uso de tools do agente por usuario para alimentar as sugestoes
 * personalizadas da bubble. Le `messages.tool_calls` (jsonb array) e conta
 * cada chamada de tool no historico (all-time) ou em janela recente.
 *
 * Server-only: usa Prisma direto e roda numa Server Action ou em layout
 * server component. Nunca importado por client component.
 */

import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

export interface ToolUsageEntry {
  toolName: string;
  count: number;
}

interface RawRow {
  tool_name: string | null;
  count: number | bigint;
}

const MAX_TOOLS_RETURNED = 20;

/**
 * Conta chamadas de tools pelas mensagens do agente em conversas do user.
 * Quando `windowDays` e null, conta all-time. Quando e numero, conta na
 * janela rolante de N dias contados do agora.
 *
 * Retorna ate `MAX_TOOLS_RETURNED` tools em ordem decrescente de frequencia.
 */
export async function aggregateToolUsage(
  prisma: PrismaClient,
  userId: string,
  windowDays: number | null,
): Promise<ToolUsageEntry[]> {
  if (!userId) return [];

  // queryRawUnsafe aceita placeholders parametricos via Prisma.
  // unnest jsonb_array_elements expande cada chamada em uma linha; o coalesce
  // garante 0 quando tool_calls e null.
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `
    SELECT tc->>'name' AS tool_name, COUNT(*)::int AS count
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    CROSS JOIN LATERAL jsonb_array_elements(m.tool_calls) AS tc
    WHERE c.user_id = $1::uuid
      AND m.tool_calls IS NOT NULL
      AND jsonb_typeof(m.tool_calls) = 'array'
      ${windowDays != null ? "AND m.created_at >= now() - ($2 || ' days')::interval" : ""}
    GROUP BY tool_name
    ORDER BY count DESC
    LIMIT ${MAX_TOOLS_RETURNED}
    `,
    ...(windowDays != null ? [userId, String(windowDays)] : [userId]),
  );

  return rows
    .filter((r) => typeof r.tool_name === "string" && r.tool_name.length > 0)
    .map((r) => ({
      toolName: r.tool_name as string,
      count: typeof r.count === "bigint" ? Number(r.count) : r.count,
    }));
}

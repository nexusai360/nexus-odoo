/**
 * GET /api/agent/prompt-preview
 *
 * Retorna o system prompt composto com a config ativa do agente.
 * Não chama LLM, não persiste nada — apenas composição do prompt.
 *
 * Gate: admin ou super_admin apenas.
 * Usado pelo Playground ("Ver prompt usado").
 */

import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { composeSystemPrompt } from "@/lib/agent/prompt/compose";
import { BI_SCHEMA_REFERENCE } from "@/lib/agent/bi-schema-reference";

const ALLOWED_ROLES = new Set(["admin", "super_admin"]);

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!ALLOWED_ROLES.has(user.platformRole)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // Carregar AgentSettings
  const row = await prisma.agentSettings.findUnique({ where: { id: "global" } });
  const agentSettings = {
    identityBase: row?.identityBase ?? null,
    personality: row?.personality ?? "",
    tone: row?.tone ?? "",
    guardrails: (row?.guardrails as string[]) ?? [],
    advancedOverride: row?.advancedOverride ?? null,
    kbEnabled: row?.kbEnabled ?? true,
    terminology: (row?.terminology as Record<string, string>) ?? {},
    suggestionsEnabled: row?.suggestionsEnabled ?? true,
  };

  // Admin/super_admin recebem o BI schema
  const biSchema = ALLOWED_ROLES.has(user.platformRole) ? BI_SCHEMA_REFERENCE : undefined;

  const composedPrompt = composeSystemPrompt(agentSettings, [], undefined, biSchema);

  return NextResponse.json({ composedPrompt });
}

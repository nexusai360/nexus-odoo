"use server";

/**
 * Server actions de /agente/qualidade.
 *
 * adjustEvaluation: super_admin sobrescreve manualmente o status de uma
 * avaliacao (humanStatus). Auditado via humanReviewedBy + humanReviewedAt.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AdjustSchema = z.object({
  evaluationId: z.string().uuid(),
  humanStatus: z.enum(["CORRETO", "PARCIAL", "ERRADO", "FORA_DO_ESCOPO"]),
  reason: z.string().min(1).max(2000),
});

export type AdjustEvaluationInput = z.infer<typeof AdjustSchema>;

export async function adjustEvaluation(
  input: AdjustEvaluationInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Permissão negada" };
  }

  const parsed = AdjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const nowIso = new Date().toISOString();
  await prisma.$executeRaw`
    UPDATE conversation_quality_evaluations
    SET
      human_status = ${parsed.data.humanStatus},
      human_reviewed_by = ${user.id}::uuid,
      human_reviewed_at = NOW(),
      razoes = COALESCE(razoes, '') || E'\n[AJUSTE HUMANO ' || ${nowIso} || E'] ' || ${parsed.data.reason}
    WHERE id = ${parsed.data.evaluationId}::uuid
  `;

  revalidatePath("/agente/monitoramento");
  return { ok: true };
}

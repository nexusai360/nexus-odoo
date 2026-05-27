"use server";

/**
 * Server actions da tela /agente/inteligencia.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function decideRecommendation(
  id: string,
  decision: "accepted" | "rejected" | "needs_more_review",
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Nao autenticado");
  if (user.platformRole !== "super_admin" && user.platformRole !== "admin") {
    throw new Error("Acesso negado");
  }

  await prisma.promptRecommendation.update({
    where: { id },
    data: {
      status: decision,
      decidedAt: new Date(),
      decidedBy: user.id,
    },
  });

  revalidatePath("/agente/inteligencia");
}

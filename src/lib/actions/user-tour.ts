"use server";

/**
 * Server Actions do tour de onboarding.
 *
 * Registram, por usuário, quais tours de tela já foram vistos. Usado para abrir
 * o tour automaticamente apenas na primeira visita. A marca fica no banco (por
 * usuário), então sobrevive a logout, troca de conta e novo login.
 */

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * Diz se o usuário atual já viu o tour informado. Sem usuário autenticado,
 * retorna `true` para não abrir nada automaticamente.
 */
export async function hasSeenTour(tourKey: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return true;
  const row = await prisma.userTourSeen.findUnique({
    where: { userId_tourKey: { userId: user.id, tourKey } },
  });
  return row != null;
}

/** Marca o tour como visto pelo usuário atual. Idempotente. */
export async function markTourSeen(tourKey: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.userTourSeen.upsert({
    where: { userId_tourKey: { userId: user.id, tourKey } },
    create: { userId: user.id, tourKey },
    update: {},
  });
}

"use server";

/**
 * Auditoria do perfil de interacao por usuario (super_admin, read-only + reset).
 *
 * Transparencia: o super_admin ve o que o agente "aprendeu" de cada usuario , SO campos
 * DERIVADOS (assuntos, dominios, breakdown preferido, temas recorrentes), nunca PII nem o
 * interactionPrompt cru (Onda 2). Pode RESETAR um perfil que ficou ruim (sem gate, mas
 * reversivel). Espelha o gate de monitoramento-bubble.ts.
 */

import { requireMinRole } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { resetUserAgentProfile } from "@/lib/agent/user-profile/store";
import type {
  TopTopic,
  RecurringQuestion,
  PresentationPrefs,
} from "@/lib/agent/user-profile/types";

export interface UserProfileAuditRow {
  userId: string;
  userName: string;
  userEmail: string;
  preferredDomains: string[];
  topTopics: string[];
  breakdownPrefs: { familia: string; breakdown: string }[];
  recurringLabels: string[];
  /** Texto destilado pelo LLM (Onda 2). Exibido p/ o super_admin auditar o que foi aprendido. */
  interactionPrompt: string | null;
  profileBuiltAt: string | null;
  profileAppliedAt: string | null;
  quarantinedAt: string | null;
  lastLearnedModel: string | null;
}

/** Lista os perfis de interacao (so derivados, sem PII). super_admin only. */
export async function getUserProfilesForAudit(): Promise<UserProfileAuditRow[]> {
  await requireMinRole("super_admin");
  const rows = await prisma.userAgentProfile.findMany({
    where: { profileBuiltAt: { not: null } },
    select: {
      userId: true,
      topTopics: true,
      preferredDomains: true,
      presentationPrefs: true,
      recurringQuestions: true,
      interactionPrompt: true,
      profileBuiltAt: true,
      profileAppliedAt: true,
      quarantinedAt: true,
      lastLearnedModel: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { profileBuiltAt: "desc" },
  });

  return rows.map((r) => {
    const prefs = (r.presentationPrefs as unknown as PresentationPrefs) ?? {};
    const breakdownPrefs = Object.entries(prefs)
      .filter(([, v]) => v?.breakdownPreferido)
      .map(([familia, v]) => ({ familia, breakdown: v!.breakdownPreferido as string }));
    return {
      userId: r.userId,
      userName: r.user?.name ?? "(sem nome)",
      userEmail: r.user?.email ?? "",
      preferredDomains: r.preferredDomains ?? [],
      topTopics: ((r.topTopics as unknown as TopTopic[]) ?? []).map((t) => t.topic),
      breakdownPrefs,
      recurringLabels: ((r.recurringQuestions as unknown as RecurringQuestion[]) ?? []).map((q) => q.label),
      interactionPrompt: r.interactionPrompt ?? null,
      profileBuiltAt: r.profileBuiltAt ? r.profileBuiltAt.toISOString() : null,
      profileAppliedAt: r.profileAppliedAt ? r.profileAppliedAt.toISOString() : null,
      quarantinedAt: r.quarantinedAt ? r.quarantinedAt.toISOString() : null,
      lastLearnedModel: r.lastLearnedModel ?? null,
    };
  });
}

/** Reseta (zera + quarentena) o perfil de um usuario. super_admin only. */
export async function resetUserProfileAction(userId: string): Promise<{ ok: true }> {
  await requireMinRole("super_admin");
  await resetUserAgentProfile(userId);
  return { ok: true };
}

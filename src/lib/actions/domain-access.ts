"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEditUser } from "@/lib/permissions";
import { REPORT_DOMAINS, grantableDomains, type ReportDomainId } from "@/lib/reports/domains";
import type { ActionResult } from "@/lib/actions/users";

/** Domínios visíveis ao usuário logado. Privilegiados recebem todos sem query. */
export async function getMyDomains(): Promise<ReportDomainId[]> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Não autenticado");
  if (me.platformRole === "super_admin" || me.platformRole === "admin") {
    return REPORT_DOMAINS.map((d) => d.id);
  }
  return getUserDomains(me.id);
}

/** Domínios concedidos a um usuário (linhas de UserDomainAccess). */
export async function getUserDomains(
  userId: string,
): Promise<ReportDomainId[]> {
  const rows = await prisma.userDomainAccess.findMany({
    where: { userId },
    select: { domain: true },
  });
  return rows.map((r) => r.domain);
}

const DOMAIN_IDS = REPORT_DOMAINS.map((d) => d.id) as [
  ReportDomainId,
  ...ReportDomainId[]
];

const UpdateUserDomainsInput = z.object({
  userId: z.string().min(1),
  domains: z.array(z.enum(DOMAIN_IDS)),
});

/**
 * Aplica o conjunto de domínios de um usuário (diff create/delete).
 * Guard de auth → canEditUser → grantableDomains → diff → audit pós-escrita.
 */
export async function updateUserDomains(
  userId: string,
  domains: ReportDomainId[],
): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const parsed = UpdateUserDomainsInput.safeParse({ userId, domains });
    if (!parsed.success) return { success: false, error: "Dados inválidos" };

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, isOwner: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const editCheck = canEditUser(me, target);
    if (!editCheck.allowed) {
      return { success: false, error: editCheck.reason ?? "Sem permissão" };
    }

    const current = await getUserDomains(userId);
    const myGranted = await getUserDomains(me.id);
    const grantable = grantableDomains(me.platformRole, myGranted);

    // Toda mudança (added ou removed) precisa ser de um domínio concedível.
    const added = domains.filter((d) => !current.includes(d));
    const removed = current.filter((d) => !domains.includes(d));
    const touched = [...added, ...removed];
    if (touched.some((d) => !grantable.includes(d))) {
      return {
        success: false,
        error: "Sem permissão para conceder/revogar um destes domínios",
      };
    }

    await prisma.$transaction([
      prisma.userDomainAccess.deleteMany({
        where: { userId, domain: { in: removed } },
      }),
      prisma.userDomainAccess.createMany({
        data: added.map((domain) => ({
          userId,
          domain,
          grantedById: me.id,
        })),
        skipDuplicates: true,
      }),
    ]);

    logAudit({
      userId: me.id,
      action: "user_domains_changed",
      targetType: "User",
      targetId: userId,
      details: { added, removed },
    });

    return { success: true };
  } catch (err) {
    console.error("[domain-access.update]", err);
    return { success: false, error: "Erro ao atualizar domínios" };
  }
}

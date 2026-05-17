"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEditUser } from "@/lib/permissions";
import { REPORT_DOMAINS, grantableDomains, type ReportDomainId } from "@/lib/reports/domains";

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

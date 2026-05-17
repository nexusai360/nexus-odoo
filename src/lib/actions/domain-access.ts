"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEditUser } from "@/lib/permissions";
import { grantableDomains, type ReportDomainId } from "@/lib/reports/domains";

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

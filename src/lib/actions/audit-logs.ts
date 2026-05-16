"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/actions/users";
import type { AuditAction } from "@/generated/prisma/client";

export interface AuditLogRow {
  id: string;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  createdAt: Date;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
}

// --- listAuditLogs ---------------------------------------------------------
// Restrita a super_admin/admin. Lê os ~100 eventos mais recentes.

export async function listAuditLogs(): Promise<ActionResult<AuditLogRow[]>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (me.platformRole !== "super_admin" && me.platformRole !== "admin") {
      return { success: false, error: "Acesso negado" };
    }

    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        ipAddress: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    const data: AuditLogRow[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt,
      userId: r.userId,
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
    }));

    return { success: true, data };
  } catch (err) {
    console.error("[auditLogs.list]", err);
    return { success: false, error: "Erro ao listar auditoria" };
  }
}

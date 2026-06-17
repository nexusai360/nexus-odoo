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
// Acessível a super_admin/admin/gerente (mesma regra de listUsers). Lê os
// eventos mais recentes (cap alto): a tabela de Auditoria faz busca/paginação
// client-side sobre esse conjunto, então carregamos um volume generoso para
// "saber tudo" sem estourar o payload. Acima disso, é caso para paginação
// server-side dedicada (follow-up).

const AUDIT_FETCH_CAP = 2000;

export async function listAuditLogs(): Promise<ActionResult<AuditLogRow[]>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (me.platformRole === "viewer") {
      return { success: false, error: "Acesso negado" };
    }

    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: AUDIT_FETCH_CAP,
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

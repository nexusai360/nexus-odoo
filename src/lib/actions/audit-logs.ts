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
  /**
   * Nome amigável do alvo, já resolvido no servidor (nome do usuário + e-mail,
   * nome do webhook, do documento, do preset, etc.). Quando não há nome a
   * resolver, fica `null` e a UI cai no tipo + id curto. O `targetId` técnico
   * é preservado para tooltip/busca, mas não é o que aparece em destaque.
   */
  targetLabel: string | null;
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
        details: true,
        ipAddress: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    // Alvo dissertativo: para `targetType="User"`, resolvemos o nome/e-mail do
    // usuário-alvo num único batch (em vez de N joins). Para os demais tipos,
    // o nome amigável costuma já vir em `details` (name/label/nome) gravado no
    // momento do log; usamos isso e nunca expomos o id técnico em destaque.
    const userTargetIds = Array.from(
      new Set(
        rows
          .filter((r) => r.targetType === "User" && r.targetId)
          .map((r) => r.targetId as string),
      ),
    );

    const targetUsers = userTargetIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userTargetIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const targetUserMap = new Map(targetUsers.map((u) => [u.id, u]));

    function resolveTargetLabel(
      targetType: string | null,
      targetId: string | null,
      details: unknown,
    ): string | null {
      if (targetType === "User" && targetId) {
        const u = targetUserMap.get(targetId);
        if (u) return u.email ? `${u.name} (${u.email})` : u.name;
        return null;
      }
      // Demais tipos: nome amigável vindo de `details` (name/label/nome).
      if (details && typeof details === "object") {
        const d = details as Record<string, unknown>;
        for (const key of ["name", "label", "nome"]) {
          const v = d[key];
          if (typeof v === "string" && v.trim().length > 0) return v.trim();
        }
      }
      return null;
    }

    const data: AuditLogRow[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      targetLabel: resolveTargetLabel(r.targetType, r.targetId, r.details),
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

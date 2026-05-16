import { pgPool } from "@/lib/pg-pool";
import type { AuditAction } from "@/generated/prisma/client";

export interface LogAuditParams {
  userId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await pgPool.query(
      `INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, user_agent, details, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
      [
        params.userId ?? null,
        params.action,
        params.targetType ?? null,
        params.targetId ?? null,
        params.ipAddress ?? null,
        params.userAgent ?? null,
        params.details ? JSON.stringify(params.details) : null,
      ],
    );
  } catch (error) {
    console.error("[audit] Falha ao registrar audit log:", error);
  }
}

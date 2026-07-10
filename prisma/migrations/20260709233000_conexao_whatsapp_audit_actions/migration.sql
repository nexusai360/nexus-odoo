-- Conexão com WhatsApp (SPEC §3.6): ações de auditoria das operações de
-- conexão (criar/editar/apagar/rotacionar token por ponta).
-- Aditiva e idempotente (ADD VALUE IF NOT EXISTS).

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'whatsapp_connection_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'whatsapp_connection_updated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'whatsapp_connection_deleted';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'whatsapp_connection_token_rotated';

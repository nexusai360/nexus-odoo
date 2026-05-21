-- ROLLBACK da migration 20260521001439_f4_onda2_mcp_writes
--
-- USO: psql $DATABASE_URL -f rollback.sql
-- PRÉ-REQUISITO: backup completo (pg_dump) antes de aplicar.
-- IMPACTO: remove capacidade de escrita do MCP; chaves criadas
--          via F4 Onda 2 perdem suas capabilities (mas registros
--          permanecem com defaults).
--
-- Restauração de dados em caso de erro: usar o backup.

BEGIN;

-- Drop foreign key (precisa vir antes do DROP TABLE)
ALTER TABLE "mcp_audit_log" DROP CONSTRAINT IF EXISTS "mcp_audit_log_api_key_id_fkey";

-- Drop indexes
DROP INDEX IF EXISTS "mcp_idempotency_records_expires_at_idx";
DROP INDEX IF EXISTS "api_keys_active_revoked_at_expires_at_idx";
DROP INDEX IF EXISTS "api_keys_tenant_id_active_idx";
DROP INDEX IF EXISTS "api_keys_last4_idx";
DROP INDEX IF EXISTS "mcp_audit_log_api_key_id_criado_em_idx";
DROP INDEX IF EXISTS "mcp_audit_log_tool_criado_em_idx";
DROP INDEX IF EXISTS "mcp_audit_log_status_criado_em_idx";
DROP INDEX IF EXISTS "mcp_audit_log_idempotency_key_idx";
DROP INDEX IF EXISTS "mcp_audit_log_module_action_criado_em_idx";
DROP INDEX IF EXISTS "mcp_audit_log_event_name_criado_em_idx";

-- Drop new table
DROP TABLE IF EXISTS "mcp_idempotency_records";

-- Drop new columns of mcp_audit_log
ALTER TABLE "mcp_audit_log"
    DROP COLUMN IF EXISTS "action",
    DROP COLUMN IF EXISTS "api_key_id",
    DROP COLUMN IF EXISTS "auth_mode",
    DROP COLUMN IF EXISTS "capability",
    DROP COLUMN IF EXISTS "error_code",
    DROP COLUMN IF EXISTS "error_message",
    DROP COLUMN IF EXISTS "event_name",
    DROP COLUMN IF EXISTS "http_status",
    DROP COLUMN IF EXISTS "idempotency_key",
    DROP COLUMN IF EXISTS "ip_address",
    DROP COLUMN IF EXISTS "module",
    DROP COLUMN IF EXISTS "operation",
    DROP COLUMN IF EXISTS "payload",
    DROP COLUMN IF EXISTS "request_id",
    DROP COLUMN IF EXISTS "result",
    DROP COLUMN IF EXISTS "snapshot_after",
    DROP COLUMN IF EXISTS "snapshot_before",
    DROP COLUMN IF EXISTS "status",
    DROP COLUMN IF EXISTS "user_agent";

-- Drop new columns of api_keys
ALTER TABLE "api_keys"
    DROP COLUMN IF EXISTS "active",
    DROP COLUMN IF EXISTS "allowed_origins",
    DROP COLUMN IF EXISTS "capabilities",
    DROP COLUMN IF EXISTS "capabilities_version",
    DROP COLUMN IF EXISTS "description",
    DROP COLUMN IF EXISTS "expires_at",
    DROP COLUMN IF EXISTS "is_system_key",
    DROP COLUMN IF EXISTS "last_used_at",
    DROP COLUMN IF EXISTS "rate_limit",
    DROP COLUMN IF EXISTS "revoked_reason",
    DROP COLUMN IF EXISTS "rotated_at",
    DROP COLUMN IF EXISTS "tenant_id";

COMMIT;

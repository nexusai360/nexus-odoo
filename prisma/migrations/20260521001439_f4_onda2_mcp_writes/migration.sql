-- F4 Onda 2 — Capacidade de escrita no servidor MCP
--
-- 1. Estende `api_keys` com campos novos (capabilities, rate_limit,
--    expires_at, is_system_key, tenant_id, allowed_origins, etc).
-- 2. Estende `mcp_audit_log` com campos para audit de writes
--    (api_key_id, auth_mode, snapshot_before/after, status, etc).
-- 3. Cria `mcp_idempotency_records` (chave composta apiKeyId+key, TTL).
--
-- Campos legados de `api_keys` e `mcp_audit_log` preservados
-- (compatibilidade com mcp/lib/audit.ts).

-- AlterTable: api_keys
ALTER TABLE "api_keys"
    ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "allowed_origins" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "capabilities" JSONB NOT NULL DEFAULT '{"version":1,"read":[],"write":{}}',
    ADD COLUMN "capabilities_version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "description" TEXT,
    ADD COLUMN "expires_at" TIMESTAMP(3),
    ADD COLUMN "is_system_key" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "last_used_at" TIMESTAMP(3),
    ADD COLUMN "rate_limit" INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN "revoked_reason" TEXT,
    ADD COLUMN "rotated_at" TIMESTAMP(3),
    ADD COLUMN "tenant_id" UUID;

-- AlterTable: mcp_audit_log
ALTER TABLE "mcp_audit_log"
    ADD COLUMN "action" TEXT,
    ADD COLUMN "api_key_id" UUID,
    ADD COLUMN "auth_mode" TEXT,
    ADD COLUMN "capability" TEXT,
    ADD COLUMN "error_code" TEXT,
    ADD COLUMN "error_message" TEXT,
    ADD COLUMN "event_name" TEXT,
    ADD COLUMN "http_status" INTEGER,
    ADD COLUMN "idempotency_key" TEXT,
    ADD COLUMN "ip_address" TEXT,
    ADD COLUMN "module" TEXT,
    ADD COLUMN "operation" TEXT,
    ADD COLUMN "payload" JSONB,
    ADD COLUMN "request_id" TEXT,
    ADD COLUMN "result" JSONB,
    ADD COLUMN "snapshot_after" JSONB,
    ADD COLUMN "snapshot_before" JSONB,
    ADD COLUMN "status" TEXT,
    ADD COLUMN "user_agent" TEXT;

-- CreateTable: mcp_idempotency_records
CREATE TABLE "mcp_idempotency_records" (
    "api_key_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "http_status" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_idempotency_records_pkey" PRIMARY KEY ("api_key_id","key")
);

-- Indexes
CREATE INDEX "mcp_idempotency_records_expires_at_idx" ON "mcp_idempotency_records"("expires_at");

CREATE INDEX "api_keys_active_revoked_at_expires_at_idx" ON "api_keys"("active", "revoked_at", "expires_at");
CREATE INDEX "api_keys_tenant_id_active_idx" ON "api_keys"("tenant_id", "active");
CREATE INDEX "api_keys_last4_idx" ON "api_keys"("last4");

CREATE INDEX "mcp_audit_log_api_key_id_criado_em_idx" ON "mcp_audit_log"("api_key_id", "criado_em" DESC);
CREATE INDEX "mcp_audit_log_tool_criado_em_idx" ON "mcp_audit_log"("tool", "criado_em" DESC);
CREATE INDEX "mcp_audit_log_status_criado_em_idx" ON "mcp_audit_log"("status", "criado_em" DESC);
CREATE INDEX "mcp_audit_log_idempotency_key_idx" ON "mcp_audit_log"("idempotency_key");
CREATE INDEX "mcp_audit_log_module_action_criado_em_idx" ON "mcp_audit_log"("module", "action", "criado_em" DESC);
CREATE INDEX "mcp_audit_log_event_name_criado_em_idx" ON "mcp_audit_log"("event_name", "criado_em");

-- Foreign key
ALTER TABLE "mcp_audit_log" ADD CONSTRAINT "mcp_audit_log_api_key_id_fkey"
    FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

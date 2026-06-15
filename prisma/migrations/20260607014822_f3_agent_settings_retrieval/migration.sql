-- F3 (cerebro): flag de retrieval de tool por embedding (separada do router de dominio).
-- Aplicada via migrate deploy (NUNCA migrate dev). Idempotente.
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "router_tool_retrieval" TEXT NOT NULL DEFAULT 'shadow';

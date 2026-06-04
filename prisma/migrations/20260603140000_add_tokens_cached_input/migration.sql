-- Alavanca 1 (prompt caching): tokens de input servidos do cache do provider.
-- Aplicado via ALTER direto (banco dev em drift de outras features; migrate dev
-- pediria reset). Marcado como applied via prisma migrate resolve.
ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "tokens_cached_input" INTEGER NOT NULL DEFAULT 0;

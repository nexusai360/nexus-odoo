-- CreateTable
CREATE TABLE IF NOT EXISTS "llm_model_entry" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "pricing_input" DOUBLE PRECISION,
  "pricing_output" DOUBLE PRECISION,
  "pricing_per_minute" DOUBLE PRECISION,
  "model_use" TEXT,
  "audio" BOOLEAN NOT NULL DEFAULT false,
  "vision" BOOLEAN NOT NULL DEFAULT false,
  "reasoning_levels" JSONB,
  "released" TEXT,
  "notes" TEXT,
  "source" TEXT NOT NULL DEFAULT 'sync',
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "llm_model_entry_provider_idx" ON "llm_model_entry"("provider");

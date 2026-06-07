-- F3 (cerebro): telemetria de shadow-compare do retrieval de tool. Idempotente. migrate deploy.
ALTER TABLE "agent_router_decision" ADD COLUMN IF NOT EXISTS "retrieval_offered_tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "agent_router_decision" ADD COLUMN IF NOT EXISTS "retrieval_scores" JSONB;
ALTER TABLE "agent_router_decision" ADD COLUMN IF NOT EXISTS "chosen_tool_rank" INTEGER;

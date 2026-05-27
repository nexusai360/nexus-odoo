-- Migration: agente_nex_inteligencia
-- Onda 1: schema para perfis, avaliacoes de qualidade, recomendacoes de prompt,
--         interacoes com chips, tagging de topicos por conversa, toolResults em Message,
--         campos novos em AgentSettings (modelos + checkpoint).
--
-- Idempotente: todas as criacoes usam IF NOT EXISTS para suportar re-aplicacao em
-- ambientes de dev/staging. Tipo `vector` (pgvector) ja disponivel via F5 (migration
-- 20260519054910_f5_pgvector).

-- ========== Tabela: user_agent_profiles ==========
CREATE TABLE IF NOT EXISTS "user_agent_profiles" (
  "user_id"             UUID PRIMARY KEY,
  "top_topics"          JSONB NOT NULL DEFAULT '[]'::jsonb,
  "top_keywords"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "preferred_domains"   TEXT[] NOT NULL DEFAULT '{}'::text[],
  "message_count"       INTEGER NOT NULL DEFAULT 0,
  "last_interaction_at" TIMESTAMP,
  "profile_built_at"    TIMESTAMP,
  "version"             INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "user_agent_profiles_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_agent_profiles_last_interaction_at_idx"
  ON "user_agent_profiles" ("last_interaction_at");

-- ========== Tabela: conversation_quality_evaluations ==========
CREATE TABLE IF NOT EXISTS "conversation_quality_evaluations" (
  "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id"        UUID NOT NULL,
  "assistant_message_id"   UUID NOT NULL UNIQUE,
  "judge_model"            TEXT NOT NULL,
  "judge_version"          TEXT NOT NULL,
  "aderencia"              INTEGER,
  "correcao_factual"       INTEGER,
  "escolha_de_tools"       INTEGER,
  "clareza"                INTEGER,
  "razoes"                 TEXT NOT NULL,
  "recomendacao_prompt"    TEXT,
  "recomendacao_embedding" vector(1536),
  "tools_reexecuted"       JSONB,
  "flags"                  TEXT[] NOT NULL DEFAULT '{}'::text[],
  "reviewed_by_human_at"   TIMESTAMP,
  "reviewed_by"            UUID,
  "reviewer_decision"      TEXT,
  "created_at"             TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "conversation_quality_evaluations_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "conversation_quality_evaluations_conversation_id_idx"
  ON "conversation_quality_evaluations" ("conversation_id");
CREATE INDEX IF NOT EXISTS "conversation_quality_evaluations_aderencia_idx"
  ON "conversation_quality_evaluations" ("aderencia");
CREATE INDEX IF NOT EXISTS "conversation_quality_evaluations_reviewer_decision_idx"
  ON "conversation_quality_evaluations" ("reviewer_decision");

-- ========== Tabela: prompt_recommendations ==========
CREATE TABLE IF NOT EXISTS "prompt_recommendations" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cluster_key"       TEXT NOT NULL UNIQUE,
  "consolidated_text" TEXT NOT NULL,
  "occurrences"       INTEGER NOT NULL DEFAULT 1,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "decided_at"        TIMESTAMP,
  "decided_by"        UUID,
  "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "prompt_recommendations_status_idx"
  ON "prompt_recommendations" ("status");

-- ========== Tabela: suggestion_interactions ==========
CREATE TABLE IF NOT EXISTS "suggestion_interactions" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"         UUID NOT NULL,
  "conversation_id" UUID,
  "chip_text"       TEXT NOT NULL,
  "chip_source"     TEXT NOT NULL,
  "action"          TEXT NOT NULL,
  "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "suggestion_interactions_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "suggestion_interactions_user_created_idx"
  ON "suggestion_interactions" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "suggestion_interactions_source_created_idx"
  ON "suggestion_interactions" ("chip_source", "created_at");

-- ========== Conversations: topic_tags + version + at ==========
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "topic_tags" TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "topic_tags_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "topic_tags_at" TIMESTAMP;

-- ========== Messages: tool_results ==========
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "tool_results" JSONB;

-- ========== AgentSettings: intelligence_model + quality_judge_model + intelligence_checkpoint ==========
ALTER TABLE "agent_settings"
  ADD COLUMN IF NOT EXISTS "intelligence_model" TEXT;
ALTER TABLE "agent_settings"
  ADD COLUMN IF NOT EXISTS "quality_judge_model" TEXT;
ALTER TABLE "agent_settings"
  ADD COLUMN IF NOT EXISTS "intelligence_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF';

-- ========== GRANT SELECT para roles do MCP (idempotente) ==========
-- Licao 2026-05-25 17:15 (fato_produto_canonica): toda nova tabela precisa de GRANT
-- explicito para os roles read-only do MCP, senao tools que dependem dela falham
-- com "permission denied" em producao.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    GRANT SELECT ON "user_agent_profiles" TO "nexus_mcp";
    GRANT SELECT ON "conversation_quality_evaluations" TO "nexus_mcp";
    GRANT SELECT ON "prompt_recommendations" TO "nexus_mcp";
    GRANT SELECT ON "suggestion_interactions" TO "nexus_mcp";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    GRANT SELECT ON "user_agent_profiles" TO "nexus_mcp_bi";
    GRANT SELECT ON "conversation_quality_evaluations" TO "nexus_mcp_bi";
    GRANT SELECT ON "prompt_recommendations" TO "nexus_mcp_bi";
    GRANT SELECT ON "suggestion_interactions" TO "nexus_mcp_bi";
  END IF;
END $$;

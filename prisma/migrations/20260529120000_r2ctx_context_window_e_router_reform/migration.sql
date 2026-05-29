-- R2-ctx: roteamento contextual (Camada 2 / reformulacao) + escolha de modelo
-- de embedding do router + janela de contexto configuravel da resposta.
-- Migration ADITIVA: so adiciona colunas com defaults que preservam o
-- comportamento atual. Nenhum dado existente e' alterado ou removido.

-- AgentSettings: construcao da pergunta + embedding do router + janela de contexto
ALTER TABLE "agent_settings"
  ADD COLUMN IF NOT EXISTS "router_reform_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'OFF',
  ADD COLUMN IF NOT EXISTS "router_reform_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "router_reform_model" TEXT,
  ADD COLUMN IF NOT EXISTS "router_reform_credential_id" UUID,
  ADD COLUMN IF NOT EXISTS "router_reform_n_pairs" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "router_embedding_model" TEXT,
  ADD COLUMN IF NOT EXISTS "context_window_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN IF NOT EXISTS "context_window_size" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "context_window_include_system" BOOLEAN NOT NULL DEFAULT true;

-- AgentRouterDecision: telemetria de origem do roteamento contextual
ALTER TABLE "agent_router_decision"
  ADD COLUMN IF NOT EXISTS "original_fallback" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "used_reformulation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reformulated_question" TEXT;

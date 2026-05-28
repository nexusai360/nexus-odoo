-- R1 Router de catalogo por embedding (sub-projeto do roadmap de cobertura completa).
-- Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md
-- Plan: docs/superpowers/plans/2026-05-28-router-catalogo-plan.md
-- Aditiva: nao quebra Nex atual (95,5% baseline preservado).

-- ----------------------------------------------------------------------------
-- 1. AgentSettings: 5 colunas novas (4 do SPEC + routerRetryEnabled da v3).
--    Defaults conservadores para shadow mode garantido.
-- ----------------------------------------------------------------------------
ALTER TABLE agent_settings
  ADD COLUMN IF NOT EXISTS router_enabled            boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS router_threshold          double precision NOT NULL DEFAULT 0.55,
  ADD COLUMN IF NOT EXISTS router_top_k              integer   NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS router_retry_expand_below double precision NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS router_retry_enabled      boolean   NOT NULL DEFAULT false;

-- Garantir defaults nas linhas existentes (defensivo: o DEFAULT acima ja cobre
-- INSERTs futuros mas UPDATE forca consistencia se alguem tiver setado NULL via
-- algum hack manual).
UPDATE agent_settings SET
  router_enabled            = COALESCE(router_enabled,            false),
  router_threshold          = COALESCE(router_threshold,          0.55),
  router_top_k              = COALESCE(router_top_k,              3),
  router_retry_expand_below = COALESCE(router_retry_expand_below, 0.70),
  router_retry_enabled      = COALESCE(router_retry_enabled,      false);

-- ----------------------------------------------------------------------------
-- 2. agent_router_decision: tabela canonica de auditoria do router.
--    Crescimento estimado: 1k turnos/dia * 90d = 90k rows. ~180MB total.
--    TTL/cleanup entra em onda futura, fora deste R1.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_router_decision (
  id                    text         PRIMARY KEY,
  created_at            timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Contexto opcional do turno (SetNull em delete cascateado).
  conversation_id       uuid,
  message_id            uuid,

  -- Entrada.
  user_question         text         NOT NULL,
  question_token_count  integer,

  -- Saida do router.
  picked_domains        text[]       NOT NULL DEFAULT '{}',
  scores                jsonb        NOT NULL DEFAULT '{}'::jsonb,
  top_score             double precision,
  fallback_triggered    boolean      NOT NULL DEFAULT false,
  fallback_reason       text,
  router_version        text         NOT NULL,

  -- O que aconteceu no turno.
  mode                  text         NOT NULL,
  catalog_size_offered  integer      NOT NULL DEFAULT 0,
  catalog_size_full     integer      NOT NULL DEFAULT 0,
  tools_actually_used   text[]       NOT NULL DEFAULT '{}',
  tools_domains         text[]       NOT NULL DEFAULT '{}',
  llm_model_used        text,
  pick_duration_ms      integer,

  CONSTRAINT agent_router_decision_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  CONSTRAINT agent_router_decision_message_fk
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS agent_router_decision_created_at_mode_idx
  ON agent_router_decision(created_at, mode);
CREATE INDEX IF NOT EXISTS agent_router_decision_conversation_id_idx
  ON agent_router_decision(conversation_id);
CREATE INDEX IF NOT EXISTS agent_router_decision_router_version_idx
  ON agent_router_decision(router_version);

-- ----------------------------------------------------------------------------
-- 3. GRANT SELECT idempotente para roles MCP (alinhado com padrao do projeto).
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  GRANT SELECT ON TABLE agent_router_decision TO nexus_mcp;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  GRANT SELECT ON TABLE agent_router_decision TO nexus_mcp_bi;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

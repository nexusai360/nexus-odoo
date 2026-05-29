-- AgentSettings: intervalo (em minutos) da auditoria heuristica automatica
-- que processa avaliacoes PENDENTE em modo offline (sem custo de LLM).
-- Default 240 min (4h). Configuravel via painel /agente/monitoramento.

ALTER TABLE agent_settings
  ADD COLUMN IF NOT EXISTS quality_heuristic_interval_minutes integer NOT NULL DEFAULT 240;

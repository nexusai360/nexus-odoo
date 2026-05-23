-- Maximo de sugestoes clicaveis no Agente Nex (default 3)
ALTER TABLE "agent_settings" ADD COLUMN "max_suggestions" INTEGER NOT NULL DEFAULT 3;

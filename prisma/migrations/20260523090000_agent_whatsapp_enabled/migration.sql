-- Controle independente de disponibilidade do Agente Nex no WhatsApp.
-- Default true para manter comportamento atual quando o webhook for plugado.
ALTER TABLE "agent_settings"
  ADD COLUMN "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true;

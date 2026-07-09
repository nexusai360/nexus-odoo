-- F6: niveis de acesso do menu Relatorios 2.0 (menu + submenus) no AgentSettings.
-- Aditiva e idempotente, sem reset do banco dev compartilhado.
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "relatorios2_menu_access" "ChannelAccessLevel" NOT NULL DEFAULT 'admin';
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "relatorios2_paineis_access" "ChannelAccessLevel" NOT NULL DEFAULT 'admin';
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "relatorios2_meus_access" "ChannelAccessLevel" NOT NULL DEFAULT 'admin';
ALTER TABLE "agent_settings" ADD COLUMN IF NOT EXISTS "relatorios2_construtor_access" "ChannelAccessLevel" NOT NULL DEFAULT 'admin';

-- R-f5-drop-booleans-legados: a F5 Onda C substituiu os booleans de
-- disponibilidade do Agente Nex pelos niveis de acesso (bubble_access_level /
-- whatsapp_access_level, enum ChannelAccessLevel). O codigo nao referencia
-- bubble_enabled/whatsapp_enabled desde 2026-06-17; o DROP foi deferido
-- enquanto frentes paralelas ainda liam as colunas (banco compartilhado).
-- Essas frentes foram mergeadas/encerradas: removendo agora.
-- Idempotente e destrutiva por design (dados nao sao mais consultados).

ALTER TABLE "agent_settings" DROP COLUMN IF EXISTS "bubble_enabled";
ALTER TABLE "agent_settings" DROP COLUMN IF EXISTS "whatsapp_enabled";

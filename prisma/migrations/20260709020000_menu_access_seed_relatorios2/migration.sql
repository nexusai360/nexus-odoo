-- Preserva o nivel de acesso do menu "Relatorios 2.0" que ja estava configurado.
--
-- Ate 2026-07-09 o menu de topo de Relatorios 2.0 era governado por
-- agent_settings.relatorios2_menu_access. A feature "Acesso aos menus" unificou
-- os 8 menus na tabela menu_access, e o gate da rota passou a ler dali. Sem este
-- seed, um ambiente onde o super_admin ja tivesse mexido naquele nivel voltaria
-- silenciosamente para o padrao (admin) no primeiro deploy.
--
-- Idempotente: so insere se ainda nao existe linha para 'relatorios2'.
-- Nao faz nada se agent_settings ainda nao tem o singleton 'global'.
INSERT INTO "menu_access" ("menu_key", "access_level", "updated_at")
SELECT 'relatorios2', s."relatorios2_menu_access", CURRENT_TIMESTAMP
FROM "agent_settings" s
WHERE s."id" = 'global'
ON CONFLICT ("menu_key") DO NOTHING;

-- Reconciliação de 24h -> 3h.
--
-- A reconciliação é a única rotina que detecta DELEÇÕES no Odoo (o incremental
-- só pega registros com write_date novo; deleção não muda write_date). Com 24h,
-- uma deleção em bloco no Odoo (ex.: 707 títulos a pagar baixados de uma vez)
-- ficava "fantasma" no cache por até um dia, inflando o "a pagar"; e o ciclo
-- diário sempre colidia com a janela de manutenção da Tauga (~meio-dia) e morria.
-- 3h dá 8 janelas/dia: a deleção reflete em horas E o ciclo quase sempre acha a
-- Tauga no ar. Custo baixo (só compara IDs).
--
-- Idempotente: só ajusta quem ainda está no default antigo (1440), preservando
-- qualquer valor customizado pelo operador no painel /configuracao. Se a linha
-- não existir, o default do código (180) já cobre.
UPDATE "app_settings"
SET "value" = '180'::jsonb
WHERE "key" = 'sync.reconcile_interval_min'
  AND "value" = '1440'::jsonb;

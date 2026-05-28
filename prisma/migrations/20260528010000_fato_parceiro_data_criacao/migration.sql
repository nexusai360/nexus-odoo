-- T-42 (Ronda 4): coluna data_criacao em fato_parceiro
-- Populada a partir de raw_res_partner.data->>'create_date'.
-- Permite tool cadastro_parceiros_novos.

ALTER TABLE fato_parceiro ADD COLUMN IF NOT EXISTS data_criacao timestamp(3);
CREATE INDEX IF NOT EXISTS fato_parceiro_data_criacao_idx ON fato_parceiro (data_criacao);

-- Backfill dos registros existentes
UPDATE fato_parceiro fp
   SET data_criacao = (rrp.data->>'create_date')::timestamp
  FROM raw_res_partner rrp
 WHERE fp.odoo_id = rrp.odoo_id
   AND rrp.data->>'create_date' IS NOT NULL
   AND fp.data_criacao IS NULL;

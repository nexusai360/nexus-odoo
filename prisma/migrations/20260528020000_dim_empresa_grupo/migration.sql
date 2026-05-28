-- R5.01 (Ronda 5): tabela canonica das empresas do grupo Matrix.
-- Aditiva: nao toca em nenhuma tabela existente.

CREATE TABLE IF NOT EXISTS dim_empresa_grupo (
  odoo_id integer PRIMARY KEY,
  nome text NOT NULL,
  cnpj text,
  tipo text CHECK (tipo IN ('matriz','filial')) NOT NULL,
  uf text,
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS dim_empresa_grupo_tipo_idx ON dim_empresa_grupo(tipo);
CREATE INDEX IF NOT EXISTS dim_empresa_grupo_uf_idx ON dim_empresa_grupo(uf);

-- Seed: extrai do raw_res_company padrao "Nome - Matriz/Filial UF CNPJ".
-- Exclui as 2 entradas que nao sao do grupo (FIT EXPRESS, XXX - Inativa).
INSERT INTO dim_empresa_grupo (odoo_id, nome, cnpj, tipo, uf, ativo)
SELECT
  odoo_id,
  data->>'name' AS nome,
  -- Extrai CNPJ no formato XX.XXX.XXX/XXXX-XX do final do nome
  (regexp_match(data->>'name', '(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})'))[1] AS cnpj,
  CASE
    WHEN data->>'name' ILIKE '%- Matriz %' THEN 'matriz'
    WHEN data->>'name' ILIKE '%- Filial %' THEN 'filial'
    ELSE 'matriz'
  END AS tipo,
  -- Extrai UF apos "Matriz" ou "Filial"
  (regexp_match(data->>'name', '- (?:Matriz|Filial) ([A-Z]{2})'))[1] AS uf,
  true AS ativo
FROM raw_res_company
WHERE data->>'name' NOT ILIKE '%FIT EXPRESS%'
  AND data->>'name' NOT ILIKE '%XXX - Inativa%'
ON CONFLICT (odoo_id) DO NOTHING;

-- GRANT para role MCP read-only
GRANT SELECT ON dim_empresa_grupo TO nexus_mcp;

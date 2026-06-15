-- Backlog pos-review (item d): estoque_cobertura_dias le
-- raw_estoque_saldo_hoje_duracao_dias. GRANT minimo read-only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    GRANT SELECT ON raw_estoque_saldo_hoje_duracao_dias TO nexus_mcp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    GRANT SELECT ON raw_estoque_saldo_hoje_duracao_dias TO nexus_mcp_bi;
  END IF;
END $$;

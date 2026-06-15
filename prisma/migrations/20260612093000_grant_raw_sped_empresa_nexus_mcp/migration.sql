-- Caso 18x15 (2026-06-11): cadastro_filiais_listar passa a completar a lista
-- com o CADASTRO (raw_sped_empresa). GRANT minimo para os roles read-only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    GRANT SELECT ON raw_sped_empresa TO nexus_mcp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    GRANT SELECT ON raw_sped_empresa TO nexus_mcp_bi;
  END IF;
END $$;

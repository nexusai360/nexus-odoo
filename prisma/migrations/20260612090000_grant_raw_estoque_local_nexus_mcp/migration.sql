-- Cobertura Cliente A1 (2026-06-11): a extensao de estoque_valor_armazem
-- (locais/apenasFisicos/demonstracao) le a arvore de locais em
-- raw_estoque_local (data->>'nome_completo'), e o role read-only nexus_mcp
-- nunca recebeu GRANT nela (mesma classe dos bugs C.0 e raw_res_partner).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    GRANT SELECT ON raw_estoque_local TO nexus_mcp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    GRANT SELECT ON raw_estoque_local TO nexus_mcp_bi;
  END IF;
END $$;

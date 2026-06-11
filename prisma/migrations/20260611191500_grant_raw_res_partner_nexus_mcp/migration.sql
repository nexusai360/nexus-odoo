-- Fix de raiz (golden cov-26, 2026-06-11): a tool crm.res_partner.get le
-- raw_res_partner, a UNICA raw consumida por tool MCP, e o role read-only
-- nexus_mcp nunca recebeu GRANT nela (mesma classe de bug da migration
-- 20260611150000, que cobriu apenas fato_*/dim_*). Resultado: outcome=error
-- ("permission denied") e o agente respondia "nao consegui obter".
-- GRANT minimo: somente esta raw, para os dois roles read-only.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    GRANT SELECT ON raw_res_partner TO nexus_mcp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    GRANT SELECT ON raw_res_partner TO nexus_mcp_bi;
  END IF;
END $$;

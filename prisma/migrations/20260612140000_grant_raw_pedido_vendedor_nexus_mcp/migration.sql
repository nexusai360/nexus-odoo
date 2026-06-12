-- Backlog pos-review (item e): fiscal_faturamento_por_vendedor liga a NF ao
-- pedido (raw_sped_documento.data->pedido_id) e ao vendedor
-- (raw_pedido_documento.data->vendedor_id). GRANT minimo read-only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    GRANT SELECT ON raw_sped_documento TO nexus_mcp;
    GRANT SELECT ON raw_pedido_documento TO nexus_mcp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    GRANT SELECT ON raw_sped_documento TO nexus_mcp_bi;
    GRANT SELECT ON raw_pedido_documento TO nexus_mcp_bi;
  END IF;
END $$;

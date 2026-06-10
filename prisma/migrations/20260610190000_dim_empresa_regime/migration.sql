-- Fase 5: de-para CNPJ-raiz -> regime tributario da empresa.
-- Aditiva: tabela nova, nao toca em nada existente. Populada pelo builder
-- dim-empresa-regime (leitura direcionada de sped.empresa.regime_tributario).

CREATE TABLE IF NOT EXISTS dim_empresa_regime (
  cnpj_raiz text PRIMARY KEY,
  regime_codigo text NOT NULL,
  regime_label text NOT NULL,
  atualizado_em timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- GRANT para role MCP read-only (semantica). O nexus_mcp_bi recebe via db:provision no boot.
GRANT SELECT ON dim_empresa_regime TO nexus_mcp;

-- =============================================================================
-- RLS (Row-Level Security) para o MCP — nexus_mcp
-- STATUS: PREPARADA E DOCUMENTADA — NÃO APLICADA
-- =============================================================================
-- Esta fase (F4) opera com tenant único (Matrix Fitness Group). A RLS não é
-- necessária agora e NÃO está habilitada. Este arquivo documenta o ponto de
-- extensão para quando o sistema evoluir para multi-tenant.
--
-- Ver docs/runbooks/mcp-rls.md para instruções de ativação.
--
-- Para ativar: descomentar os blocos abaixo e executar com o usuário `nexus`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CONTEXTO: como funcionaria a RLS por tenant
-- -----------------------------------------------------------------------------
-- A RLS restringe as linhas retornadas por uma SELECT com base em uma sessão
-- de contexto. O MCP injetaria o tenant_id no início de cada conexão:
--
--   SET LOCAL app.current_tenant = '<tenant_uuid>';
--
-- E as políticas abaixo garantiriam que nexus_mcp só vê linhas do tenant ativo.
--
-- Pré-requisito: as tabelas de fatos precisam de uma coluna `tenant_id UUID`
-- que ainda não existe. Adicionar via migration Prisma antes de ativar.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- BLOCO COMENTADO — ativar quando multi-tenant for necessário
-- =============================================================================

/*

-- 1. Habilitar RLS nas tabelas de fatos de estoque
ALTER TABLE fato_estoque_saldo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fato_estoque_movimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE fato_produto_parado    ENABLE ROW LEVEL SECURITY;

-- 2. Habilitar RLS nas tabelas de fatos de financeiro
ALTER TABLE fato_financeiro_saldo     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fato_financeiro_movimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE fato_financeiro_titulo    ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acesso por tenant
-- A função current_setting('app.current_tenant', true) retorna NULL se não setada.
-- Com COALESCE(..., '') nenhuma linha vaza se o contexto não estiver setado.

CREATE POLICY nexus_mcp_tenant_fato_estoque_saldo
  ON fato_estoque_saldo
  AS PERMISSIVE FOR SELECT
  TO nexus_mcp
  USING (
    tenant_id::TEXT = COALESCE(current_setting('app.current_tenant', true), '')
  );

CREATE POLICY nexus_mcp_tenant_fato_estoque_movimento
  ON fato_estoque_movimento
  AS PERMISSIVE FOR SELECT
  TO nexus_mcp
  USING (
    tenant_id::TEXT = COALESCE(current_setting('app.current_tenant', true), '')
  );

CREATE POLICY nexus_mcp_tenant_fato_produto_parado
  ON fato_produto_parado
  AS PERMISSIVE FOR SELECT
  TO nexus_mcp
  USING (
    tenant_id::TEXT = COALESCE(current_setting('app.current_tenant', true), '')
  );

CREATE POLICY nexus_mcp_tenant_fato_financeiro_saldo
  ON fato_financeiro_saldo
  AS PERMISSIVE FOR SELECT
  TO nexus_mcp
  USING (
    tenant_id::TEXT = COALESCE(current_setting('app.current_tenant', true), '')
  );

CREATE POLICY nexus_mcp_tenant_fato_financeiro_movimento
  ON fato_financeiro_movimento
  AS PERMISSIVE FOR SELECT
  TO nexus_mcp
  USING (
    tenant_id::TEXT = COALESCE(current_setting('app.current_tenant', true), '')
  );

CREATE POLICY nexus_mcp_tenant_fato_financeiro_titulo
  ON fato_financeiro_titulo
  AS PERMISSIVE FOR SELECT
  TO nexus_mcp
  USING (
    tenant_id::TEXT = COALESCE(current_setting('app.current_tenant', true), '')
  );

-- 4. FORCE RLS — mesmo o owner (nexus) é submetido às políticas quando conectado
--    como nexus_mcp. Isso evita bypass acidental se o adapter trocar de role.
ALTER TABLE fato_estoque_saldo     FORCE ROW LEVEL SECURITY;
ALTER TABLE fato_estoque_movimento FORCE ROW LEVEL SECURITY;
ALTER TABLE fato_produto_parado    FORCE ROW LEVEL SECURITY;
ALTER TABLE fato_financeiro_saldo     FORCE ROW LEVEL SECURITY;
ALTER TABLE fato_financeiro_movimento FORCE ROW LEVEL SECURITY;
ALTER TABLE fato_financeiro_titulo    FORCE ROW LEVEL SECURITY;

*/

-- =============================================================================
-- FIM DO BLOCO COMENTADO
-- =============================================================================

-- Para verificar que a RLS está DESABILITADA (estado esperado agora):
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN (
--     'fato_estoque_saldo', 'fato_estoque_movimento', 'fato_produto_parado',
--     'fato_financeiro_saldo', 'fato_financeiro_movimento', 'fato_financeiro_titulo'
--   );
-- Esperado: relrowsecurity = false em todas.

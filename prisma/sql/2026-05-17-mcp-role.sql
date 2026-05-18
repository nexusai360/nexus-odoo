-- =============================================================================
-- Role Postgres para o servidor MCP — nexus_mcp
-- =============================================================================
-- Aplique este script UMA VEZ no banco de destino (dev ou produção) com o usuário
-- `nexus` (superusuário do nexus_odoo). Ver docs/runbooks/mcp-role.md para instruções.
--
-- Princípio do menor privilégio (RBAC camada 4 — §3.6 da spec v3):
--   • SELECT apenas nas tabelas de fatos e de suporte que as tools precisam.
--   • INSERT apenas em mcp_audit_log e feature_requests.
--   • SEM SELECT em mcp_audit_log (o MCP grava mas não lê seu próprio log via SQL).
--   • SEM acesso a qualquer tabela raw_* (dados brutos do Odoo).
--   • SEM UPDATE / DELETE em nenhuma tabela.
--
-- NOTA SOBRE NOMENCLATURA: Prisma mapeia modelos PascalCase para snake_case no banco.
--   Exemplo: model User → tabela "users", model FatoBuildState → tabela "fato_build_state".
-- =============================================================================

-- 1. Criar o role (idempotente via DO)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    CREATE ROLE nexus_mcp LOGIN PASSWORD 'SUBSTITUIR_POR_SENHA_FORTE';
  END IF;
END;
$$;

-- 2. Revogar todos os privilégios padrão no schema public
REVOKE ALL ON SCHEMA public FROM nexus_mcp;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nexus_mcp;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nexus_mcp;

-- 3. Conceder acesso de uso ao schema
GRANT USAGE ON SCHEMA public TO nexus_mcp;

-- 4. SELECT — tabelas de fatos de estoque
GRANT SELECT ON fato_estoque_saldo     TO nexus_mcp;
GRANT SELECT ON fato_estoque_movimento TO nexus_mcp;
GRANT SELECT ON fato_produto_parado    TO nexus_mcp;

-- 5. SELECT — tabelas de fatos de financeiro
GRANT SELECT ON fato_financeiro_saldo     TO nexus_mcp;
GRANT SELECT ON fato_financeiro_movimento TO nexus_mcp;
GRANT SELECT ON fato_financeiro_titulo    TO nexus_mcp;

-- 6. SELECT — tabelas de suporte (auth/RBAC/estado)
--    Prisma model User             → tabela "users"
--    Prisma model UserDomainAccess → tabela "user_domain_access"
--    Prisma model FatoBuildState   → tabela "fato_build_state"
GRANT SELECT ON users               TO nexus_mcp;
GRANT SELECT ON user_domain_access  TO nexus_mcp;
GRANT SELECT ON sync_state          TO nexus_mcp;
GRANT SELECT ON fato_build_state    TO nexus_mcp;

-- 7. INSERT — mcp_audit_log e feature_requests (sem SELECT!)
GRANT INSERT ON mcp_audit_log    TO nexus_mcp;
GRANT INSERT ON feature_requests TO nexus_mcp;

-- 8. REVOKE explícito em todas as tabelas raw_* existentes (dinâmico, seguro)
--    e garantir que mcp_audit_log não tenha SELECT.
DO $$ DECLARE r RECORD;
BEGIN
  -- Revogar tudo em raw_* que existam no schema
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'raw_%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM nexus_mcp', r.tablename);
  END LOOP;
  -- Garantir sem SELECT em mcp_audit_log (mantém INSERT do passo 7)
  EXECUTE 'REVOKE SELECT ON mcp_audit_log FROM nexus_mcp';
END $$;

-- Resultado esperado:
--   \dp fato_estoque_saldo    → nexus_mcp=r (SELECT)
--   \dp mcp_audit_log         → nexus_mcp=a (INSERT apenas)
--   \dp raw_estoque_saldo     → (sem nexus_mcp)

-- =============================================================================
-- Role Postgres para o Caminho 3c do servidor MCP — nexus_mcp_bi
-- =============================================================================
-- Aplique este script UMA VEZ no banco de destino (dev ou produção) com o usuário
-- `nexus` (superusuário do nexus_odoo). Ver docs/runbooks/mcp-role.md para contexto.
--
-- Princípio do menor privilégio (RBAC camada 4 — §3.6 da spec v3):
--   • SELECT APENAS nos 12 fatos + sync_state + fato_build_state (frescor de BI).
--   • INSERT em mcp_audit_log (mesmo que o audit do 3c seja gravado via nexus_mcp).
--   • SEM SELECT em raw_*, users, user_domain_access.
--   • SEM UPDATE / DELETE / DDL em nenhuma tabela.
--   • default_transaction_read_only = on por conexão (reforço em runtime via bi-pool.ts).
--
-- O role nexus_mcp_bi é o controle primário de read-only; a verificação AST por
-- pgsql-parser em mcp/tools/caminho3/sql-guard.ts é defesa-em-profundidade.
-- =============================================================================

-- 1. Criar o role (idempotente via DO)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    CREATE ROLE nexus_mcp_bi LOGIN PASSWORD 'SUBSTITUIR_POR_SENHA_FORTE';
  END IF;
END;
$$;

-- 2. Revogar todos os privilégios padrão no schema public
REVOKE ALL ON SCHEMA public FROM nexus_mcp_bi;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nexus_mcp_bi;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM nexus_mcp_bi;
REVOKE CREATE ON SCHEMA public FROM nexus_mcp_bi;

-- 3. Conceder acesso de uso ao schema
GRANT USAGE ON SCHEMA public TO nexus_mcp_bi;

-- 4. SELECT — 12 tabelas de fatos (todos os domínios de negócio)
--    Fatos de estoque
GRANT SELECT ON fato_estoque_saldo     TO nexus_mcp_bi;
GRANT SELECT ON fato_estoque_movimento TO nexus_mcp_bi;
GRANT SELECT ON fato_produto_parado    TO nexus_mcp_bi;
--    Fatos de financeiro
GRANT SELECT ON fato_financeiro_saldo     TO nexus_mcp_bi;
GRANT SELECT ON fato_financeiro_movimento TO nexus_mcp_bi;
GRANT SELECT ON fato_financeiro_titulo    TO nexus_mcp_bi;
--    Fatos de comercial
GRANT SELECT ON fato_pedido         TO nexus_mcp_bi;
GRANT SELECT ON fato_pedido_parcela TO nexus_mcp_bi;
--    Fatos de fiscal
GRANT SELECT ON fato_nota_fiscal      TO nexus_mcp_bi;
GRANT SELECT ON fato_nota_fiscal_item TO nexus_mcp_bi;
--    Fatos transversais
GRANT SELECT ON fato_parceiro      TO nexus_mcp_bi;
GRANT SELECT ON fato_conta_contabil TO nexus_mcp_bi;

-- 5. SELECT — tabelas de suporte para frescor (uso legítimo de BI)
GRANT SELECT ON sync_state       TO nexus_mcp_bi;
GRANT SELECT ON fato_build_state TO nexus_mcp_bi;

-- INTENCIONALMENTE SEM GRANT em: users, user_domain_access, raw_* (menor privilégio).

-- 6. INSERT em mcp_audit_log (sem SELECT!)
GRANT INSERT ON mcp_audit_log TO nexus_mcp_bi;

-- 7. REVOKE explícito em todas as tabelas raw_* existentes (dinâmico, seguro)
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'raw_%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM nexus_mcp_bi', r.tablename);
  END LOOP;
  -- Garantir sem SELECT em mcp_audit_log (mantém INSERT do passo 6)
  EXECUTE 'REVOKE SELECT ON mcp_audit_log FROM nexus_mcp_bi';
END $$;

-- Resultado esperado:
--   \dp fato_pedido            → nexus_mcp_bi=r (SELECT)
--   \dp mcp_audit_log          → nexus_mcp_bi=a (INSERT apenas)
--   \dp raw_pedido_documento   → (sem nexus_mcp_bi)
--   \dp users                  → (sem nexus_mcp_bi)
--   \dp user_domain_access     → (sem nexus_mcp_bi)

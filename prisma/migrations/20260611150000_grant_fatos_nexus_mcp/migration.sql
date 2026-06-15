-- Fix de raiz (Nex Especialista, Fase C , perícia 2026-06-11):
-- ~20 tabelas de fatos criadas nas ondas O1-O5/Balde B/F4+ NUNCA receberam
-- GRANT para o role read-only nexus_mcp (RBAC camada 4). Resultado: ~20 tools
-- MCP de domínios inteiros (contábil, DF-e, REINF, MDF-e, cobrança bancária,
-- produção, auditoria, CRM, comissões, histórico de pedido, lançamento item,
-- estoque mín/máx, cotação, PIX, cheque) falhavam com "permission denied" e o
-- agente respondia "não consegui obter essa informação agora".
--
-- (1) GRANT retroativo em TODAS as fato_*/dim_* para nexus_mcp e nexus_mcp_bi.
-- (2) DEFAULT PRIVILEGES: toda tabela futura criada pelo role de migration
--     (nexus) nasce legível pelos roles read-only , a classe de bug morre.
-- Idempotente (GRANT repetido é no-op; roles checados antes).

DO $$
DECLARE
  t record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    FOR t IN
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename LIKE 'fato\_%' OR tablename LIKE 'dim\_%')
    LOOP
      EXECUTE format('GRANT SELECT ON %I TO nexus_mcp', t.tablename);
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    FOR t IN
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename LIKE 'fato\_%' OR tablename LIKE 'dim\_%')
    LOOP
      EXECUTE format('GRANT SELECT ON %I TO nexus_mcp_bi', t.tablename);
    END LOOP;
  END IF;

  -- Tabelas futuras: nascem legíveis (o erro de "migration esqueceu o GRANT"
  -- deixa de existir). Aplicado para o role que cria as tabelas (nexus).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE nexus IN SCHEMA public GRANT SELECT ON TABLES TO nexus_mcp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE nexus IN SCHEMA public GRANT SELECT ON TABLES TO nexus_mcp_bi';
  END IF;
END $$;

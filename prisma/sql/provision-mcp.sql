-- =============================================================================
-- Provisionamento dos roles Postgres do MCP — IDEMPOTENTE
-- =============================================================================
-- Cria/atualiza os roles `nexus_mcp` (tools semânticas) e `nexus_mcp_bi`
-- (Caminho 3c / modo BI) e aplica os GRANTs do RBAC camada 4.
--
-- SEGURO RODAR A CADA DEPLOY — todo o script é idempotente. Substitui os antigos
-- `2026-05-17-mcp-role.sql` e `2026-05-18-mcp-bi-role.sql`.
--
-- USO (as senhas vêm de variáveis — nada de senha neste arquivo):
--   psql "$DATABASE_URL" \
--     -v mcp_pw="$MCP_DB_PASSWORD" \
--     -v bi_pw="$MCP_BI_DB_PASSWORD" \
--     -f prisma/sql/provision-mcp.sql
-- Ou simplesmente: `npm run db:provision` (ver package.json).
--
-- Princípio do menor privilégio (RBAC camada 4 — spec §3.6, revisado 2026-06-12):
--   • nexus_mcp / nexus_mcp_bi: SELECT em `fato_*`/`dim_*` + suporte + a
--     ALLOWLIST de `raw_*` (abaixo); INSERT em mcp_audit_log e feature_requests;
--     NUNCA SELECT em mcp_audit_log; NUNCA UPDATE/DELETE/DDL.
--   • O GRANT SELECT em fatos/dims é DINÂMICO (loop) — tabela nova é coberta
--     automaticamente no próximo deploy, sem editar este script.
--   • RAW ALLOWLIST (lição 2026-06-12, classe de bug C.0 reincidente): este
--     script roda em TODO boot de prod (db:deploy) DEPOIS do migrate deploy e
--     fazia REVOKE cego de toda raw_* — apagava os GRANTs das migrations e
--     quebrava em produção as tools que leem raw legitimamente (cobertura de
--     estoque, vendedor do pedido, regime, busca de parceiro). Toda migration
--     nova `grant_raw_*` DEVE adicionar a tabela em `raw_permitidas` abaixo —
--     o teste mcp/__tests__/provision-raw-allowlist.test.ts trava isso no CI.
-- =============================================================================

\set ON_ERROR_STOP on

-- 1. Roles — cria se não existir; senha sempre (re)definida a partir da variável.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    CREATE ROLE nexus_mcp LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    CREATE ROLE nexus_mcp_bi LOGIN;
  END IF;
END $$;

ALTER ROLE nexus_mcp    LOGIN PASSWORD :'mcp_pw';
ALTER ROLE nexus_mcp_bi LOGIN PASSWORD :'bi_pw';

-- 2. Reset — revoga tudo, para o estado final ser determinístico a cada run.
DO $$
DECLARE rl TEXT;
BEGIN
  FOREACH rl IN ARRAY ARRAY['nexus_mcp', 'nexus_mcp_bi'] LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', rl);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', rl);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', rl);
    EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', rl);
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', rl);
  END LOOP;
END $$;

-- 3. GRANT SELECT em todos os fatos e dims (DINÂMICO — cobre futuros sozinho),
--    nas tabelas de suporte e na ALLOWLIST de raw_*. Vale para os dois roles.
DO $$
DECLARE
  rl  TEXT;
  tbl TEXT;
  suporte_mcp    TEXT[] := ARRAY['users', 'user_domain_access', 'sync_state', 'fato_build_state'];
  suporte_bi     TEXT[] := ARRAY['sync_state', 'fato_build_state'];
  -- raws que tools do MCP leem de propósito (cada uma nasceu numa migration
  -- grant_raw_*; manter os dois lugares em sincronia — teste trava no CI):
  raw_permitidas TEXT[] := ARRAY[
    'raw_res_partner',                      -- 20260611191500 (busca de parceiro/CRM)
    'raw_estoque_local',                    -- 20260612090000 (árvore de locais/armazém)
    'raw_sped_empresa',                     -- 20260612093000 (regime tributário)
    'raw_estoque_saldo_hoje_duracao_dias',  -- 20260612100000 (cobertura/idade do estoque)
    'raw_sped_documento',                   -- 20260612140000 (NF -> pedido de origem)
    'raw_pedido_documento'                  -- 20260612140000 (pedido -> vendedor)
  ];
BEGIN
  FOREACH rl IN ARRAY ARRAY['nexus_mcp', 'nexus_mcp_bi'] LOOP
    -- SELECT em todas as fato_* (exceto fato_build_state, tratada como suporte)
    -- e em todas as dim_* (derivadas/curadas, mesma classe de leitura dos fatos)
    FOR tbl IN
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename LIKE 'fato\_%' OR tablename LIKE 'dim\_%')
        AND tablename <> 'fato_build_state'
    LOOP
      EXECUTE format('GRANT SELECT ON TABLE %I TO %I', tbl, rl);
    END LOOP;
    -- SELECT nas raws da allowlist (se existirem neste banco)
    FOREACH tbl IN ARRAY raw_permitidas LOOP
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
        EXECUTE format('GRANT SELECT ON TABLE %I TO %I', tbl, rl);
      END IF;
    END LOOP;
  END LOOP;

  -- Suporte: nexus_mcp precisa de users/user_domain_access (RBAC) + frescor;
  --          nexus_mcp_bi só do frescor (sem dados de identidade).
  FOREACH tbl IN ARRAY suporte_mcp LOOP
    EXECUTE format('GRANT SELECT ON TABLE %I TO nexus_mcp', tbl);
  END LOOP;
  FOREACH tbl IN ARRAY suporte_bi LOOP
    EXECUTE format('GRANT SELECT ON TABLE %I TO nexus_mcp_bi', tbl);
  END LOOP;
END $$;

-- 4. INSERT em mcp_audit_log e feature_requests — SEM SELECT.
--    (o MCP grava o audit mas nunca o lê via SQL; createMany não usa RETURNING)
GRANT INSERT ON mcp_audit_log    TO nexus_mcp;
GRANT INSERT ON feature_requests TO nexus_mcp;
GRANT INSERT ON mcp_audit_log    TO nexus_mcp_bi;

-- 5. Garantia final: nenhum acesso a `raw_*` FORA da allowlist (a mesma lista
--    do passo 3 — manter em sincronia; teste de CI compara as duas seções).
DO $$
DECLARE
  rl TEXT; tbl TEXT;
  raw_permitidas TEXT[] := ARRAY[
    'raw_res_partner',
    'raw_estoque_local',
    'raw_sped_empresa',
    'raw_estoque_saldo_hoje_duracao_dias',
    'raw_sped_documento',
    'raw_pedido_documento'
  ];
BEGIN
  FOREACH rl IN ARRAY ARRAY['nexus_mcp', 'nexus_mcp_bi'] LOOP
    FOR tbl IN
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'raw\_%'
        AND NOT (tablename = ANY (raw_permitidas))
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, rl);
    END LOOP;
  END LOOP;
END $$;

-- Verificação rápida pós-run:
--   \dp fato_pedido     → nexus_mcp=r/nexus_mcp_bi=r
--   \dp mcp_audit_log   → nexus_mcp=a/nexus_mcp_bi=a  (INSERT, sem SELECT)
--   \dp raw_pedido_documento → (sem os roles do MCP)

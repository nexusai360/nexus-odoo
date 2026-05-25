-- Catalogo canonico de produtos: cobre 100% do cadastro (raw_sped_produto),
-- nao apenas os com saldo. Junta com fato_estoque_saldo por produto_id.

CREATE TABLE IF NOT EXISTS "fato_produto" (
  "odoo_id" INTEGER PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "codigo" TEXT,
  "codigo_unico" TEXT,
  "codigo_barras" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "tipo" TEXT,
  "marca_id" INTEGER,
  "marca_nome" TEXT,
  "familia_id" INTEGER,
  "familia_nome" TEXT,
  "unidade_nome" TEXT,
  "ncm_codigo" TEXT,
  "controla_estoque" BOOLEAN NOT NULL DEFAULT false,
  "permite_venda" BOOLEAN NOT NULL DEFAULT true,
  "permite_compra" BOOLEAN NOT NULL DEFAULT true,
  "preco_custo" DECIMAL(14,4),
  "preco_venda" DECIMAL(14,4),
  "peso_liquido" DECIMAL(10,4),
  "peso_bruto" DECIMAL(10,4),
  "criado_em" TIMESTAMP(3),
  "atualizado_em_odoo" TIMESTAMP(3),
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "fato_produto_ativo_idx" ON "fato_produto"("ativo");
CREATE INDEX IF NOT EXISTS "fato_produto_codigo_idx" ON "fato_produto"("codigo");
CREATE INDEX IF NOT EXISTS "fato_produto_codigo_unico_idx" ON "fato_produto"("codigo_unico");
CREATE INDEX IF NOT EXISTS "fato_produto_codigo_barras_idx" ON "fato_produto"("codigo_barras");
CREATE INDEX IF NOT EXISTS "fato_produto_familia_id_idx" ON "fato_produto"("familia_id");
CREATE INDEX IF NOT EXISTS "fato_produto_marca_id_idx" ON "fato_produto"("marca_id");
CREATE INDEX IF NOT EXISTS "fato_produto_controla_estoque_idx" ON "fato_produto"("controla_estoque");

-- Indices funcionais para busca tolerante a acento (mesmo padrao de fato_estoque_saldo)
CREATE INDEX IF NOT EXISTS "fato_produto_nome_unaccent_idx"
  ON "fato_produto" (lower(public.f_unaccent_immutable("nome")));
CREATE INDEX IF NOT EXISTS "fato_produto_nome_trgm_idx"
  ON "fato_produto" USING gin (lower(public.f_unaccent_immutable("nome")) gin_trgm_ops);

-- GRANT para roles do MCP (read-only). Sem isso, queries $queryRawUnsafe
-- da tool estoque_saldo_produto falham com "permission denied for table
-- fato_produto" (code 42501). Idempotente: GRANT roda multiplas vezes
-- sem erro. Roles podem nao existir em ambiente local sem RBAC; DO block
-- silencia erros para nao quebrar dev local.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp') THEN
    EXECUTE 'GRANT SELECT ON fato_produto TO nexus_mcp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_mcp_bi') THEN
    EXECUTE 'GRANT SELECT ON fato_produto TO nexus_mcp_bi';
  END IF;
END $$;

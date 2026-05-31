-- B6 (estoque avançado / mín-máx). Aditiva. 1 raw novo + 1 fato. Estrutural (0 reg).
CREATE TABLE "raw_estoque_minimo_maximo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "raw_estoque_minimo_maximo_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_estoque_minimo_maximo_odoo_write_date_idx" ON "raw_estoque_minimo_maximo"("odoo_write_date");
CREATE INDEX "raw_estoque_minimo_maximo_raw_deleted_idx" ON "raw_estoque_minimo_maximo"("raw_deleted");

CREATE TABLE "fato_estoque_min_max" (
    "odoo_id" INTEGER NOT NULL,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "local_id" INTEGER,
    "local_nome" TEXT,
    "unidade_nome" TEXT,
    "quantidade_minima" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "quantidade_maxima" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_estoque_min_max_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_estoque_min_max_produto_id_idx" ON "fato_estoque_min_max"("produto_id");
CREATE INDEX "fato_estoque_min_max_local_id_idx" ON "fato_estoque_min_max"("local_id");

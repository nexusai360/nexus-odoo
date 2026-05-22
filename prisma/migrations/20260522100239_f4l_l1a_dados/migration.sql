-- DropIndex
DROP INDEX "kb_documents_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "raw_sped_tabela_preco" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_tabela_preco_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_tabela_preco_regra" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_tabela_preco_regra_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_servico" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_servico_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_apuracao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_apuracao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_carta_correcao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_carta_correcao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_preco" (
    "odoo_id" INTEGER NOT NULL,
    "tabela_id" INTEGER,
    "tabela_nome" TEXT,
    "dimensao" TEXT NOT NULL DEFAULT 'geral',
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "familia_id" INTEGER,
    "familia_nome" TEXT,
    "participante_id" INTEGER,
    "participante_nome" TEXT,
    "operacao" TEXT,
    "preco_base" TEXT,
    "valor" DECIMAL(18,4),
    "aliquota" DECIMAL(9,4),
    "quantidade_minima" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "data_inicial" TIMESTAMP(3),
    "data_final" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_preco_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_servico" (
    "odoo_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigo_formatado" TEXT,
    "descricao" TEXT NOT NULL,
    "codigo_tributacao" TEXT,
    "al_inss_retido" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_servico_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "raw_sped_tabela_preco_odoo_write_date_idx" ON "raw_sped_tabela_preco"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_tabela_preco_raw_deleted_idx" ON "raw_sped_tabela_preco"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_tabela_preco_regra_odoo_write_date_idx" ON "raw_sped_tabela_preco_regra"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_tabela_preco_regra_raw_deleted_idx" ON "raw_sped_tabela_preco_regra"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_servico_odoo_write_date_idx" ON "raw_sped_servico"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_servico_raw_deleted_idx" ON "raw_sped_servico"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_apuracao_odoo_write_date_idx" ON "raw_sped_apuracao"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_apuracao_raw_deleted_idx" ON "raw_sped_apuracao"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_carta_correcao_odoo_write_date_idx" ON "raw_sped_carta_correcao"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_carta_correcao_raw_deleted_idx" ON "raw_sped_carta_correcao"("raw_deleted");

-- CreateIndex
CREATE INDEX "fato_preco_produto_id_idx" ON "fato_preco"("produto_id");

-- CreateIndex
CREATE INDEX "fato_preco_tabela_id_idx" ON "fato_preco"("tabela_id");

-- CreateIndex
CREATE INDEX "fato_preco_familia_id_idx" ON "fato_preco"("familia_id");

-- CreateIndex
CREATE INDEX "fato_servico_codigo_idx" ON "fato_servico"("codigo");

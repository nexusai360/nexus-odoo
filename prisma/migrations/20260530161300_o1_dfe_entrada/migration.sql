-- O1 (onda SPED Fiscal): DF-e de entrada. Aditiva (P1): so cria tabelas novas.

-- CreateTable
CREATE TABLE "raw_sped_consulta_dfe_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_consulta_dfe_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "raw_sped_consulta_dfe_item_odoo_write_date_idx" ON "raw_sped_consulta_dfe_item"("odoo_write_date");
CREATE INDEX "raw_sped_consulta_dfe_item_raw_deleted_idx" ON "raw_sped_consulta_dfe_item"("raw_deleted");

-- CreateTable
CREATE TABLE "fato_dfe" (
    "odoo_id" INTEGER NOT NULL,
    "chave" TEXT,
    "numero" TEXT,
    "modelo" TEXT,
    "cnpj_fornecedor" TEXT,
    "fornecedor_id" INTEGER,
    "fornecedor_nome" TEXT,
    "vr_nf" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "data_emissao" TIMESTAMP(3),
    "data_recebimento" TIMESTAMP(3),
    "manifestacao" TEXT,
    "pode_manifestar" BOOLEAN NOT NULL DEFAULT false,
    "consulta_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_dfe_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "fato_dfe_data_emissao_idx" ON "fato_dfe"("data_emissao");
CREATE INDEX "fato_dfe_cnpj_fornecedor_idx" ON "fato_dfe"("cnpj_fornecedor");
CREATE INDEX "fato_dfe_manifestacao_idx" ON "fato_dfe"("manifestacao");

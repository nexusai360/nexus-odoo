-- CreateTable
CREATE TABLE "raw_sped_certificado" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_certificado_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_finan_baixa_lancamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_finan_baixa_lancamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_pedido_faturamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_pedido_faturamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_certificado" (
    "odoo_id" INTEGER NOT NULL,
    "tipo" TEXT,
    "numero_serie" TEXT,
    "proprietario" TEXT,
    "cnpj_cpf" TEXT,
    "data_inicio_validade" TIMESTAMP(3),
    "data_fim_validade" TIMESTAMP(3),
    "data_vencimento_util" TIMESTAMP(3),
    "nome_arquivo" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_certificado_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "raw_sped_certificado_odoo_write_date_idx" ON "raw_sped_certificado"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_certificado_raw_deleted_idx" ON "raw_sped_certificado"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_finan_baixa_lancamento_odoo_write_date_idx" ON "raw_finan_baixa_lancamento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_finan_baixa_lancamento_raw_deleted_idx" ON "raw_finan_baixa_lancamento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_pedido_faturamento_odoo_write_date_idx" ON "raw_pedido_faturamento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_pedido_faturamento_raw_deleted_idx" ON "raw_pedido_faturamento"("raw_deleted");

-- CreateIndex
CREATE INDEX "fato_certificado_data_fim_validade_idx" ON "fato_certificado"("data_fim_validade");

-- CreateTable
CREATE TABLE "raw_sped_ncm" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_ncm_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_cfop" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_cfop_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_cest" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_cest_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_cnae" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_cnae_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_nbs" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_nbs_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_natureza_operacao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_natureza_operacao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_unidade" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_unidade_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_cst_icms" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_cst_icms_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_cst_icms_sn" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_cst_icms_sn_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_cst_ipi" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_cst_ipi_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_cst_pis_cofins" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_cst_pis_cofins_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_cst_cibs" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_cst_cibs_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_municipio" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_municipio_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_pais" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_pais_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_estado" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_estado_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_condicao_pagamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_condicao_pagamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_feriado" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_feriado_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_icms_proprio" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_icms_proprio_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_icms_st" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_icms_st_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_inss" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_inss_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_ipi" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_ipi_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_irpf" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_irpf_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_iss" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_iss_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_pis_cofins" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_pis_cofins_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_simples_aliquota" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_simples_aliquota_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_simples_anexo" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_simples_anexo_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "raw_sped_aliquota_simples_teto" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_aliquota_simples_teto_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_referencia" (
    "id" SERIAL NOT NULL,
    "tabela" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "fato_referencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_sped_ncm_odoo_write_date_idx" ON "raw_sped_ncm"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_ncm_raw_deleted_idx" ON "raw_sped_ncm"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_cfop_odoo_write_date_idx" ON "raw_sped_cfop"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_cfop_raw_deleted_idx" ON "raw_sped_cfop"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_cest_odoo_write_date_idx" ON "raw_sped_cest"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_cest_raw_deleted_idx" ON "raw_sped_cest"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_cnae_odoo_write_date_idx" ON "raw_sped_cnae"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_cnae_raw_deleted_idx" ON "raw_sped_cnae"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_nbs_odoo_write_date_idx" ON "raw_sped_nbs"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_nbs_raw_deleted_idx" ON "raw_sped_nbs"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_natureza_operacao_odoo_write_date_idx" ON "raw_sped_natureza_operacao"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_natureza_operacao_raw_deleted_idx" ON "raw_sped_natureza_operacao"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_unidade_odoo_write_date_idx" ON "raw_sped_unidade"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_unidade_raw_deleted_idx" ON "raw_sped_unidade"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_cst_icms_odoo_write_date_idx" ON "raw_sped_cst_icms"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_cst_icms_raw_deleted_idx" ON "raw_sped_cst_icms"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_cst_icms_sn_odoo_write_date_idx" ON "raw_sped_cst_icms_sn"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_cst_icms_sn_raw_deleted_idx" ON "raw_sped_cst_icms_sn"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_cst_ipi_odoo_write_date_idx" ON "raw_sped_cst_ipi"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_cst_ipi_raw_deleted_idx" ON "raw_sped_cst_ipi"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_cst_pis_cofins_odoo_write_date_idx" ON "raw_sped_cst_pis_cofins"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_cst_pis_cofins_raw_deleted_idx" ON "raw_sped_cst_pis_cofins"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_cst_cibs_odoo_write_date_idx" ON "raw_sped_cst_cibs"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_cst_cibs_raw_deleted_idx" ON "raw_sped_cst_cibs"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_municipio_odoo_write_date_idx" ON "raw_sped_municipio"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_municipio_raw_deleted_idx" ON "raw_sped_municipio"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_pais_odoo_write_date_idx" ON "raw_sped_pais"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_pais_raw_deleted_idx" ON "raw_sped_pais"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_estado_odoo_write_date_idx" ON "raw_sped_estado"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_estado_raw_deleted_idx" ON "raw_sped_estado"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_condicao_pagamento_odoo_write_date_idx" ON "raw_sped_condicao_pagamento"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_condicao_pagamento_raw_deleted_idx" ON "raw_sped_condicao_pagamento"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_feriado_odoo_write_date_idx" ON "raw_sped_feriado"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_feriado_raw_deleted_idx" ON "raw_sped_feriado"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_icms_proprio_odoo_write_date_idx" ON "raw_sped_aliquota_icms_proprio"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_icms_proprio_raw_deleted_idx" ON "raw_sped_aliquota_icms_proprio"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_icms_st_odoo_write_date_idx" ON "raw_sped_aliquota_icms_st"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_icms_st_raw_deleted_idx" ON "raw_sped_aliquota_icms_st"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_inss_odoo_write_date_idx" ON "raw_sped_aliquota_inss"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_inss_raw_deleted_idx" ON "raw_sped_aliquota_inss"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_ipi_odoo_write_date_idx" ON "raw_sped_aliquota_ipi"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_ipi_raw_deleted_idx" ON "raw_sped_aliquota_ipi"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_irpf_odoo_write_date_idx" ON "raw_sped_aliquota_irpf"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_irpf_raw_deleted_idx" ON "raw_sped_aliquota_irpf"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_iss_odoo_write_date_idx" ON "raw_sped_aliquota_iss"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_iss_raw_deleted_idx" ON "raw_sped_aliquota_iss"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_pis_cofins_odoo_write_date_idx" ON "raw_sped_aliquota_pis_cofins"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_pis_cofins_raw_deleted_idx" ON "raw_sped_aliquota_pis_cofins"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_simples_aliquota_odoo_write_date_idx" ON "raw_sped_aliquota_simples_aliquota"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_simples_aliquota_raw_deleted_idx" ON "raw_sped_aliquota_simples_aliquota"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_simples_anexo_odoo_write_date_idx" ON "raw_sped_aliquota_simples_anexo"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_simples_anexo_raw_deleted_idx" ON "raw_sped_aliquota_simples_anexo"("raw_deleted");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_simples_teto_odoo_write_date_idx" ON "raw_sped_aliquota_simples_teto"("odoo_write_date");

-- CreateIndex
CREATE INDEX "raw_sped_aliquota_simples_teto_raw_deleted_idx" ON "raw_sped_aliquota_simples_teto"("raw_deleted");

-- CreateIndex
CREATE INDEX "fato_referencia_tabela_idx" ON "fato_referencia"("tabela");

-- CreateIndex
CREATE INDEX "fato_referencia_tabela_codigo_idx" ON "fato_referencia"("tabela", "codigo");

-- CreateTable
CREATE TABLE "fato_apuracao" (
    "odoo_id" INTEGER NOT NULL,
    "empresa_nome" TEXT,
    "data_inicial" TIMESTAMP(3),
    "data_final" TIMESTAMP(3),
    "tipo" TEXT,
    "entregue" BOOLEAN NOT NULL DEFAULT false,
    "regime_tributario" TEXT,
    "vr_icms_a_recolher" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_icms_saldo_credor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_ipi_a_recolher" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_pis_a_recolher" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_cofins_a_recolher" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_apuracao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_carta_correcao" (
    "odoo_id" INTEGER NOT NULL,
    "descricao" TEXT,
    "correcao" TEXT,
    "documento_id" INTEGER,
    "data_autorizacao" TIMESTAMP(3),
    "protocolo_autorizacao" TEXT,
    "sequencia" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_carta_correcao_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "fato_apuracao_data_inicial_idx" ON "fato_apuracao"("data_inicial");

-- CreateIndex
CREATE INDEX "fato_apuracao_tipo_idx" ON "fato_apuracao"("tipo");

-- CreateIndex
CREATE INDEX "fato_carta_correcao_documento_id_idx" ON "fato_carta_correcao"("documento_id");

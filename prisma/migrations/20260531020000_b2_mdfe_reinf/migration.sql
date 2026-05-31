-- B2 (onda fiscal complementar): MDF-e + REINF. Aditiva (P1): só cria tabelas novas.

-- CreateTable: raws (modelos existem no Odoo com 0 reg; estruturais).
CREATE TABLE "raw_sped_mdfe" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_sped_mdfe_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_sped_mdfe_odoo_write_date_idx" ON "raw_sped_mdfe"("odoo_write_date");
CREATE INDEX "raw_sped_mdfe_raw_deleted_idx" ON "raw_sped_mdfe"("raw_deleted");

CREATE TABLE "raw_reinf_evento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "raw_reinf_evento_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_reinf_evento_odoo_write_date_idx" ON "raw_reinf_evento"("odoo_write_date");
CREATE INDEX "raw_reinf_evento_raw_deleted_idx" ON "raw_reinf_evento"("raw_deleted");

-- CreateTable: fato MDF-e (estrutural).
CREATE TABLE "fato_mdfe" (
    "odoo_id" INTEGER NOT NULL,
    "chave" TEXT,
    "numero" TEXT,
    "situacao_mdfe" TEXT,
    "situacao_fiscal" TEXT,
    "tipo_emissao" TEXT,
    "empresa_id" INTEGER,
    "empresa_cnpj" TEXT,
    "data_emissao" TIMESTAMP(3),
    "data_autorizacao" TIMESTAMP(3),
    "data_encerramento" TIMESTAMP(3),
    "data_cancelamento" TIMESTAMP(3),
    "protocolo_autorizacao" TEXT,
    "municipio_carregamento" TEXT,
    "municipio_descarregamento" TEXT,
    "peso_bruto" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "peso_carga" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_nf" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_mdfe_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_mdfe_data_emissao_idx" ON "fato_mdfe"("data_emissao");
CREATE INDEX "fato_mdfe_empresa_id_idx" ON "fato_mdfe"("empresa_id");
CREATE INDEX "fato_mdfe_situacao_mdfe_idx" ON "fato_mdfe"("situacao_mdfe");

-- CreateTable: fato REINF evento (estrutural).
CREATE TABLE "fato_reinf_evento" (
    "odoo_id" INTEGER NOT NULL,
    "chave" TEXT,
    "tipo" TEXT,
    "situacao" TEXT,
    "protocolo_transmissao" TEXT,
    "empresa_id" INTEGER,
    "empresa_cnpj_raiz" TEXT,
    "data_evento" TIMESTAMP(3),
    "data_inicial" TIMESTAMP(3),
    "data_final" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_reinf_evento_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_reinf_evento_data_evento_idx" ON "fato_reinf_evento"("data_evento");
CREATE INDEX "fato_reinf_evento_empresa_id_idx" ON "fato_reinf_evento"("empresa_id");
CREATE INDEX "fato_reinf_evento_tipo_idx" ON "fato_reinf_evento"("tipo");

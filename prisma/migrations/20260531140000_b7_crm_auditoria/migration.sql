-- B7 (CRM limitado + auditoria). Aditiva. 2 raw + 2 fato.
-- auditoria.log/.item (313k/14MI) NÃO entram (volume; fora de escopo do pré-build).
CREATE TABLE "raw_crm_pipeline" (
    "odoo_id" INTEGER NOT NULL, "data" JSONB NOT NULL, "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "raw_crm_pipeline_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_crm_pipeline_odoo_write_date_idx" ON "raw_crm_pipeline"("odoo_write_date");
CREATE INDEX "raw_crm_pipeline_raw_deleted_idx" ON "raw_crm_pipeline"("raw_deleted");

CREATE TABLE "raw_auditoria_regra" (
    "odoo_id" INTEGER NOT NULL, "data" JSONB NOT NULL, "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "raw_auditoria_regra_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_auditoria_regra_odoo_write_date_idx" ON "raw_auditoria_regra"("odoo_write_date");
CREATE INDEX "raw_auditoria_regra_raw_deleted_idx" ON "raw_auditoria_regra"("raw_deleted");

CREATE TABLE "fato_crm_pipeline" (
    "odoo_id" INTEGER NOT NULL, "numero" INTEGER, "nome" TEXT, "tipo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT false, "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_crm_pipeline_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_crm_pipeline_ativo_idx" ON "fato_crm_pipeline"("ativo");

CREATE TABLE "fato_auditoria_regra" (
    "odoo_id" INTEGER NOT NULL, "nome" TEXT, "ativa" BOOLEAN NOT NULL DEFAULT false,
    "dias" DECIMAL(18,2) NOT NULL DEFAULT 0, "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_auditoria_regra_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_auditoria_regra_ativa_idx" ON "fato_auditoria_regra"("ativa");

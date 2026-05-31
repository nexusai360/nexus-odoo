-- B4 (comercial: cotação + comissão). Aditiva. Estruturais (0 reg hoje).

CREATE TABLE "raw_pedido_documento_cotacao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "raw_pedido_documento_cotacao_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_pedido_documento_cotacao_odoo_write_date_idx" ON "raw_pedido_documento_cotacao"("odoo_write_date");
CREATE INDEX "raw_pedido_documento_cotacao_raw_deleted_idx" ON "raw_pedido_documento_cotacao"("raw_deleted");

CREATE TABLE "raw_pedido_comissao" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "odoo_write_date" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "raw_pedido_comissao_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "raw_pedido_comissao_odoo_write_date_idx" ON "raw_pedido_comissao"("odoo_write_date");
CREATE INDEX "raw_pedido_comissao_raw_deleted_idx" ON "raw_pedido_comissao"("raw_deleted");

CREATE TABLE "fato_cotacao" (
    "odoo_id" INTEGER NOT NULL,
    "numero" TEXT,
    "status" TEXT,
    "eh_compra" BOOLEAN NOT NULL DEFAULT false,
    "empresa_id" INTEGER,
    "operacao_id" INTEGER,
    "operacao_nome" TEXT,
    "usuario_aprovador_id" INTEGER,
    "centro_resultado_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_cotacao_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_cotacao_status_idx" ON "fato_cotacao"("status");
CREATE INDEX "fato_cotacao_empresa_id_idx" ON "fato_cotacao"("empresa_id");

CREATE TABLE "fato_comissao" (
    "odoo_id" INTEGER NOT NULL,
    "pedido_id" INTEGER,
    "participante_id" INTEGER,
    "participante_nome" TEXT,
    "bc_comissao" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "al_comissao" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vr_comissao" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_comissao_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_comissao_pedido_id_idx" ON "fato_comissao"("pedido_id");
CREATE INDEX "fato_comissao_participante_id_idx" ON "fato_comissao"("participante_id");

-- O4 (onda Financeiro): fato de itens do lancamento (DRE gerencial). Aditiva.
CREATE TABLE "fato_financeiro_lancamento_item" (
    "odoo_id" INTEGER NOT NULL,
    "lancamento_id" INTEGER,
    "tipo" TEXT NOT NULL DEFAULT '',
    "conta_id" INTEGER,
    "conta_nome" TEXT,
    "centro_resultado_id" INTEGER,
    "centro_resultado_nome" TEXT,
    "descricao" TEXT,
    "pedido_id" INTEGER,
    "vr_documento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_pago_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "data_documento" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_financeiro_lancamento_item_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "ffli_conta_id_idx" ON "fato_financeiro_lancamento_item"("conta_id");
CREATE INDEX "ffli_centro_idx" ON "fato_financeiro_lancamento_item"("centro_resultado_id");
CREATE INDEX "ffli_tipo_idx" ON "fato_financeiro_lancamento_item"("tipo");
CREATE INDEX "ffli_data_idx" ON "fato_financeiro_lancamento_item"("data_documento");

-- O3 (onda Pedido): fato do historico de etapas. Aditiva (P1): so cria tabela nova.
CREATE TABLE "fato_pedido_historico" (
    "odoo_id" INTEGER NOT NULL,
    "pedido_id" INTEGER,
    "etapa_id" INTEGER,
    "etapa_nome" TEXT,
    "etapa_tipo" TEXT,
    "data_entrada" TIMESTAMP(3),
    "data_proxima" TIMESTAMP(3),
    "tempo_etapa_dias" INTEGER NOT NULL DEFAULT 0,
    "usuario_id" INTEGER,
    "criado_em" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_pedido_historico_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_pedido_historico_pedido_id_idx" ON "fato_pedido_historico"("pedido_id");
CREATE INDEX "fato_pedido_historico_etapa_id_idx" ON "fato_pedido_historico"("etapa_id");
CREATE INDEX "fato_pedido_historico_data_entrada_idx" ON "fato_pedido_historico"("data_entrada");

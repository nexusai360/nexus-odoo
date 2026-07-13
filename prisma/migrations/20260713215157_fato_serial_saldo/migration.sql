-- CreateTable
CREATE TABLE "fato_serial_saldo" (
    "id" UUID NOT NULL,
    "odoo_id" INTEGER NOT NULL,
    "serial" TEXT NOT NULL,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "local_id" INTEGER,
    "local_nome" TEXT,
    "classificacao" TEXT NOT NULL,
    "saldo" DECIMAL(18,4) NOT NULL,
    "valor_custo" DECIMAL(18,2),
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_serial_saldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fato_serial_saldo_odoo_id_key" ON "fato_serial_saldo"("odoo_id");

-- CreateIndex
CREATE INDEX "fato_serial_saldo_classificacao_idx" ON "fato_serial_saldo"("classificacao");

-- CreateIndex
CREATE INDEX "fato_serial_saldo_local_id_idx" ON "fato_serial_saldo"("local_id");

-- CreateIndex
CREATE INDEX "fato_serial_saldo_produto_id_idx" ON "fato_serial_saldo"("produto_id");

-- CreateIndex
CREATE INDEX "fato_serial_saldo_serial_idx" ON "fato_serial_saldo"("serial");

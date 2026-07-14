-- CreateTable
CREATE TABLE "fato_estoque_local" (
    "odoo_id" INTEGER NOT NULL,
    "nome" TEXT,
    "nome_completo" TEXT,
    "tipo" TEXT,
    "nivel" INTEGER,
    "local_superior_id" INTEGER,
    "estoque_em_maos" BOOLEAN NOT NULL DEFAULT false,
    "calcula_extrato_saldo" BOOLEAN NOT NULL DEFAULT false,
    "tem_proprietario" BOOLEAN NOT NULL DEFAULT false,
    "classificacao" TEXT NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_estoque_local_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "fato_estoque_local_classificacao_idx" ON "fato_estoque_local"("classificacao");

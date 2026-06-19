-- Snapshot diário do saldo de estoque (série histórica). Aditiva, baixo risco.
-- Uma foto por dia/produto/local, com valor, para comparar estoque entre datas.
CREATE TABLE "fato_estoque_saldo_snapshot" (
    "id" UUID NOT NULL,
    "data_ref" DATE NOT NULL,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "local_id" INTEGER,
    "local_nome" TEXT,
    "quantidade" DECIMAL(18,4),
    "vr_saldo" DECIMAL(18,2),
    "familia_id" INTEGER,
    "familia_nome" TEXT,
    "marca_id" INTEGER,
    "marca_nome" TEXT,
    "capturado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_estoque_saldo_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fato_estoque_saldo_snapshot_data_ref_idx" ON "fato_estoque_saldo_snapshot"("data_ref");

CREATE INDEX "fato_estoque_saldo_snapshot_produto_id_data_ref_idx" ON "fato_estoque_saldo_snapshot"("produto_id", "data_ref");

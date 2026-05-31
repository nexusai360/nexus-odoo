-- B1 (onda contábil): movimento contábil. Aditiva (P1): só cria tabelas novas.

-- CreateTable: raw do cabeçalho do lançamento (entra no MODEL_CATALOG e no painel).
CREATE TABLE "raw_contabil_lancamento" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    "odoo_write_date" TIMESTAMP(3),

    CONSTRAINT "raw_contabil_lancamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "raw_contabil_lancamento_raw_deleted_idx" ON "raw_contabil_lancamento"("raw_deleted");
CREATE INDEX "raw_contabil_lancamento_odoo_write_date_idx" ON "raw_contabil_lancamento"("odoo_write_date");

-- CreateTable: raw das partidas/itens do lançamento.
CREATE TABLE "raw_contabil_lancamento_item" (
    "odoo_id" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_deleted" BOOLEAN NOT NULL DEFAULT false,
    "odoo_write_date" TIMESTAMP(3),

    CONSTRAINT "raw_contabil_lancamento_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "raw_contabil_lancamento_item_raw_deleted_idx" ON "raw_contabil_lancamento_item"("raw_deleted");
CREATE INDEX "raw_contabil_lancamento_item_odoo_write_date_idx" ON "raw_contabil_lancamento_item"("odoo_write_date");

-- CreateTable: fato do plano REFERENCIAL SPED (de-para, 2216 reais).
CREATE TABLE "fato_contabil_conta_referencial" (
    "odoo_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT,
    "nome_completo" TEXT,
    "natureza" TEXT,
    "tipo" TEXT,
    "nivel" INTEGER,
    "parent_path" TEXT,
    "conta_superior_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_contabil_conta_referencial_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "fato_contabil_conta_referencial_codigo_idx" ON "fato_contabil_conta_referencial"("codigo");
CREATE INDEX "fato_contabil_conta_referencial_natureza_idx" ON "fato_contabil_conta_referencial"("natureza");

-- CreateTable: fato do cabeçalho do lançamento (estrutural).
CREATE TABLE "fato_contabil_lancamento" (
    "odoo_id" INTEGER NOT NULL,
    "codigo" TEXT,
    "tipo" TEXT,
    "data_lancamento" TIMESTAMP(3),
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valor_debito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valor_credito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "empresa_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_contabil_lancamento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "fato_contabil_lancamento_data_lancamento_idx" ON "fato_contabil_lancamento"("data_lancamento");

-- CreateTable: fato das partidas/itens (coração da contabilidade, estrutural).
CREATE TABLE "fato_contabil_lancamento_item" (
    "odoo_id" INTEGER NOT NULL,
    "lancamento_id" INTEGER,
    "lancamento_tipo" TEXT,
    "conta_id" INTEGER,
    "conta_codigo" TEXT,
    "conta_nome" TEXT,
    "conta_natureza" TEXT,
    "centro_custo_id" INTEGER,
    "centro_custo_nome" TEXT,
    "natureza" TEXT,
    "valor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valor_debito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valor_credito" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "data_lancamento" TIMESTAMP(3),
    "historico" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_contabil_lancamento_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX "fato_contabil_lancamento_item_data_lancamento_idx" ON "fato_contabil_lancamento_item"("data_lancamento");
CREATE INDEX "fato_contabil_lancamento_item_conta_id_idx" ON "fato_contabil_lancamento_item"("conta_id");
CREATE INDEX "fato_contabil_lancamento_item_conta_natureza_idx" ON "fato_contabil_lancamento_item"("conta_natureza");
CREATE INDEX "fato_contabil_lancamento_item_centro_custo_id_idx" ON "fato_contabil_lancamento_item"("centro_custo_id");
CREATE INDEX "fato_contabil_lancamento_item_lancamento_id_idx" ON "fato_contabil_lancamento_item"("lancamento_id");

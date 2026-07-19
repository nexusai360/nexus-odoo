-- CreateTable
CREATE TABLE "fato_lista_material_item" (
    "id" SERIAL NOT NULL,
    "produto_pai_id" INTEGER NOT NULL,
    "componente_produto_id" INTEGER NOT NULL,
    "componente_nome" TEXT,
    "quantidade" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tipo_item" TEXT,
    "lista_id" INTEGER,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_lista_material_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fato_lista_material_item_produto_pai_id_idx" ON "fato_lista_material_item"("produto_pai_id");

-- CreateIndex
CREATE INDEX "fato_lista_material_item_componente_produto_id_idx" ON "fato_lista_material_item"("componente_produto_id");

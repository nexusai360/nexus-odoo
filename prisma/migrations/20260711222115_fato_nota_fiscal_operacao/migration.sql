-- AlterTable
ALTER TABLE "fato_nota_fiscal" ADD COLUMN     "operacao_id" INTEGER,
ADD COLUMN     "operacao_nome" TEXT;

-- AlterTable
ALTER TABLE "fato_nota_fiscal_item" ADD COLUMN     "finalidade_nfe" TEXT,
ADD COLUMN     "operacao_id" INTEGER,
ADD COLUMN     "operacao_nome" TEXT;

-- CreateIndex
CREATE INDEX "fato_nota_fiscal_operacao_id_idx" ON "fato_nota_fiscal"("operacao_id");

-- CreateIndex
CREATE INDEX "fato_nota_fiscal_item_operacao_id_idx" ON "fato_nota_fiscal_item"("operacao_id");

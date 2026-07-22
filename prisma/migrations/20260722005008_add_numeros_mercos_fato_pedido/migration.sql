-- AlterTable
ALTER TABLE "fato_pedido" ADD COLUMN     "numeros_mercos" TEXT[];

-- CreateIndex
CREATE INDEX "fato_pedido_numeros_mercos_idx" ON "fato_pedido" USING GIN ("numeros_mercos");

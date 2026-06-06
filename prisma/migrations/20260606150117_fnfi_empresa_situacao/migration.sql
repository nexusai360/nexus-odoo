-- F1: desnormaliza empresaId e situacaoNfe no item da nota fiscal,
-- para corte por empresa e por operacao no nivel do item (CFOP) sem join.
-- Aditiva e idempotente: nenhuma coluna existente e tocada.
ALTER TABLE "fato_nota_fiscal_item" ADD COLUMN "empresa_id" INTEGER;
ALTER TABLE "fato_nota_fiscal_item" ADD COLUMN "situacao_nfe" TEXT;
CREATE INDEX "fato_nota_fiscal_item_empresa_id_idx" ON "fato_nota_fiscal_item"("empresa_id");

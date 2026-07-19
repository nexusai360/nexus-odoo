-- Modalidade de frete (codigo NF-e modFrete) no fato_pedido. Aditiva.
ALTER TABLE "fato_pedido" ADD COLUMN "modalidade_frete" TEXT;

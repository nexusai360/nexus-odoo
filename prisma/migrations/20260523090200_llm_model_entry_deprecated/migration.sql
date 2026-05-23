-- Marca modelos retirados do catalogo upstream sem deletar a referencia,
-- preservando a selecao do usuario e permitindo banner de aviso na UI.
ALTER TABLE "llm_model_entry"
  ADD COLUMN "deprecated_at" TIMESTAMP(3) NULL;

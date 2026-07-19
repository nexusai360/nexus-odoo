-- Ativacao da lista (header) no fato da BOM, para resolver kits multi-BOM. Aditiva.
ALTER TABLE "fato_lista_material_item" ADD COLUMN "lista_data_ativacao" TIMESTAMP;
ALTER TABLE "fato_lista_material_item" ADD COLUMN "lista_inativa" BOOLEAN NOT NULL DEFAULT false;

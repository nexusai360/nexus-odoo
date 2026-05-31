-- B5 (produção). Aditiva. raw_producao_processo já existe (onda anterior); aqui só o fato.
CREATE TABLE "fato_producao_processo" (
    "odoo_id" INTEGER NOT NULL,
    "ordem" INTEGER,
    "nome" TEXT,
    "descricao" TEXT,
    "tempo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fato_producao_processo_pkey" PRIMARY KEY ("odoo_id")
);
CREATE INDEX "fato_producao_processo_ordem_idx" ON "fato_producao_processo"("ordem");

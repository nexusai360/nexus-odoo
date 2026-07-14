-- AlterTable
ALTER TABLE "fato_financeiro_titulo" ADD COLUMN     "empresa_id" INTEGER,
ADD COLUMN     "forma_pagamento_nome" TEXT,
ADD COLUMN     "provisorio" BOOLEAN NOT NULL DEFAULT false;

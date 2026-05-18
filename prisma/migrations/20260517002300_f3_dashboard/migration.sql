-- CreateEnum
CREATE TYPE "ReportDomain" AS ENUM ('estoque', 'financeiro', 'fiscal', 'comercial');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'user_domains_changed';

-- AlterTable
ALTER TABLE "fato_estoque_saldo" ADD COLUMN     "familia_id" INTEGER,
ADD COLUMN     "familia_nome" TEXT,
ADD COLUMN     "marca_id" INTEGER,
ADD COLUMN     "marca_nome" TEXT,
ADD COLUMN     "vr_saldo" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "user_domain_access" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "domain" "ReportDomain" NOT NULL,
    "granted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_domain_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fato_estoque_movimento" (
    "odoo_id" INTEGER NOT NULL,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "local_id" INTEGER,
    "local_nome" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "mes" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "sentido" TEXT NOT NULL,
    "local_inverso_id" INTEGER,
    "origem" TEXT,

    CONSTRAINT "fato_estoque_movimento_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE "fato_produto_parado" (
    "saldo_hoje_id" INTEGER NOT NULL,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "local_id" INTEGER,
    "local_nome" TEXT,
    "saldo" DECIMAL(18,4) NOT NULL,
    "dias" INTEGER NOT NULL,
    "vr_saldo" DECIMAL(18,2) NOT NULL,
    "unidade" TEXT,

    CONSTRAINT "fato_produto_parado_pkey" PRIMARY KEY ("saldo_hoje_id")
);

-- CreateTable
CREATE TABLE "fato_build_state" (
    "fato" TEXT NOT NULL,
    "ultimo_build_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fato_build_state_pkey" PRIMARY KEY ("fato")
);

-- CreateIndex
CREATE INDEX "user_domain_access_user_id_idx" ON "user_domain_access"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_domain_access_user_id_domain_key" ON "user_domain_access"("user_id", "domain");

-- CreateIndex
CREATE INDEX "fato_estoque_movimento_mes_idx" ON "fato_estoque_movimento"("mes");

-- CreateIndex
CREATE INDEX "fato_estoque_movimento_produto_id_idx" ON "fato_estoque_movimento"("produto_id");

-- CreateIndex
CREATE INDEX "fato_estoque_movimento_local_id_idx" ON "fato_estoque_movimento"("local_id");

-- CreateIndex
CREATE INDEX "fato_estoque_movimento_sentido_idx" ON "fato_estoque_movimento"("sentido");

-- CreateIndex
CREATE INDEX "fato_produto_parado_dias_idx" ON "fato_produto_parado"("dias");

-- CreateIndex
CREATE INDEX "fato_produto_parado_produto_id_idx" ON "fato_produto_parado"("produto_id");

-- CreateIndex
CREATE INDEX "fato_estoque_saldo_familia_id_idx" ON "fato_estoque_saldo"("familia_id");

-- CreateIndex
CREATE INDEX "fato_estoque_saldo_marca_id_idx" ON "fato_estoque_saldo"("marca_id");

-- AddForeignKey
ALTER TABLE "user_domain_access" ADD CONSTRAINT "user_domain_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill F3: concede o domínio 'estoque' a todos os manager/viewer existentes.
INSERT INTO user_domain_access (id, user_id, domain, created_at)
SELECT gen_random_uuid(), id, 'estoque', now()
FROM users
WHERE platform_role IN ('manager', 'viewer');

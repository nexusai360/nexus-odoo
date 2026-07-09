
-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DiretoriaEventoTipo" AS ENUM ('reuniao', 'entrega', 'inventario', 'prospeccao', 'carregamento', 'organizacao_estoque', 'assembleia', 'visita');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'logout';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'api_key_updated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'api_key_rotated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'webhook_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'webhook_updated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'webhook_secret_rotated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'webhook_toggled';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'webhook_deleted';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'external_mcp_server_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'external_mcp_server_updated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'external_mcp_server_toggled';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'external_mcp_server_deleted';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'kb_document_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'kb_document_deleted';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'report_preset_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'report_preset_deleted';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'report_exported';

-- AlterTable
ALTER TABLE "fato_nota_fiscal" ADD COLUMN IF NOT EXISTS      "is_venda_externa" BOOLEAN;

-- AlterTable
ALTER TABLE "fato_pedido" ADD COLUMN IF NOT EXISTS      "bucket_demanda" TEXT,
ADD COLUMN IF NOT EXISTS      "categoria_operacao" TEXT,
ADD COLUMN IF NOT EXISTS      "pendencia_etapa" TEXT;

-- AlterTable
ALTER TABLE "message_feedback" ALTER COLUMN "comment" SET DATA TYPE VARCHAR(150);

-- AlterTable
ALTER TABLE "message_feedback_event" ALTER COLUMN "comment" SET DATA TYPE VARCHAR(150);

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS      "last_activity_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_diretoria_access" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "capability" TEXT NOT NULL,
    "granted_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_diretoria_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_diretoria_uf" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "uf" VARCHAR(2) NOT NULL,

    CONSTRAINT "user_diretoria_uf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "diretoria_evento" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "DiretoriaEventoTipo" NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "dia_inteiro" BOOLEAN NOT NULL DEFAULT false,
    "descricao" TEXT,
    "local" TEXT,
    "criado_por_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diretoria_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "diretoria_evento_colaborador" (
    "id" UUID NOT NULL,
    "evento_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "diretoria_evento_colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "diretoria_evento_anexo" (
    "id" UUID NOT NULL,
    "evento_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT,
    "tamanho" INTEGER,

    CONSTRAINT "diretoria_evento_anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "diretoria_relatorio" (
    "id" UUID NOT NULL,
    "tela" TEXT NOT NULL,
    "dono_user_id" UUID,
    "is_padrao" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diretoria_relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "diretoria_relatorio_bloco" (
    "id" UUID NOT NULL,
    "relatorio_id" UUID NOT NULL,
    "componente_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "largura_quartos" INTEGER NOT NULL,
    "altura_u" INTEGER NOT NULL,
    "config_json" JSONB,

    CONSTRAINT "diretoria_relatorio_bloco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fato_serial" (
    "odoo_id" INTEGER NOT NULL,
    "serial" TEXT,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "local_id" INTEGER,
    "local_nome" TEXT,
    "valor_custo" DECIMAL(18,4),
    "data_compra" TIMESTAMP(3),
    "data_saida" TIMESTAMP(3),
    "quantidade" DECIMAL(18,4),

    CONSTRAINT "fato_serial_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fato_compra" (
    "odoo_id" INTEGER NOT NULL,
    "numero" TEXT,
    "etapa_id" INTEGER,
    "etapa_nome" TEXT,
    "operacao_id" INTEGER,
    "operacao_nome" TEXT,
    "fornecedor_id" INTEGER,
    "fornecedor_nome" TEXT,
    "comprador_id" INTEGER,
    "comprador_nome" TEXT,
    "empresa_id" INTEGER,
    "empresa_nome" TEXT,
    "data_orcamento" TIMESTAMP(3),
    "data_prevista" TIMESTAMP(3),
    "data_aprovacao" TIMESTAMP(3),
    "vr_produtos" DECIMAL(18,4),
    "vr_nf" DECIMAL(18,4),
    "vr_pago" DECIMAL(18,4),
    "vr_saldo" DECIMAL(18,4),
    "recebida" BOOLEAN NOT NULL DEFAULT false,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "fato_compra_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "fato_pedido_item" (
    "odoo_id" INTEGER NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "produto_id" INTEGER,
    "produto_nome" TEXT,
    "familia_nome" TEXT,
    "marca_nome" TEXT,
    "quantidade" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cfop_id" INTEGER,
    "local_reserva_id" INTEGER,
    "vr_produtos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vr_custo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fato_pedido_item_pkey" PRIMARY KEY ("odoo_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_diretoria_access_user_id_idx" ON "user_diretoria_access"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_diretoria_access_user_id_capability_key" ON "user_diretoria_access"("user_id", "capability");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_diretoria_uf_user_id_idx" ON "user_diretoria_uf"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_diretoria_uf_user_id_uf_key" ON "user_diretoria_uf"("user_id", "uf");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "diretoria_evento_inicio_idx" ON "diretoria_evento"("inicio");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "diretoria_evento_colaborador_user_id_idx" ON "diretoria_evento_colaborador"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "diretoria_evento_colaborador_evento_id_user_id_key" ON "diretoria_evento_colaborador"("evento_id", "user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "diretoria_evento_anexo_evento_id_idx" ON "diretoria_evento_anexo"("evento_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "diretoria_relatorio_tela_idx" ON "diretoria_relatorio"("tela");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "diretoria_relatorio_dono_user_id_idx" ON "diretoria_relatorio"("dono_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "diretoria_relatorio_bloco_relatorio_id_idx" ON "diretoria_relatorio_bloco"("relatorio_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fato_serial_produto_id_idx" ON "fato_serial"("produto_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fato_compra_recebida_cancelada_idx" ON "fato_compra"("recebida", "cancelada");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fato_pedido_item_pedido_id_idx" ON "fato_pedido_item"("pedido_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fato_pedido_item_produto_id_idx" ON "fato_pedido_item"("produto_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fato_nota_fiscal_is_venda_externa_idx" ON "fato_nota_fiscal"("is_venda_externa");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fato_pedido_bucket_demanda_idx" ON "fato_pedido"("bucket_demanda");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fato_pedido_categoria_operacao_idx" ON "fato_pedido"("categoria_operacao");

-- AddForeignKey
ALTER TABLE "user_diretoria_access" ADD CONSTRAINT "user_diretoria_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_diretoria_uf" ADD CONSTRAINT "user_diretoria_uf_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diretoria_evento" ADD CONSTRAINT "diretoria_evento_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diretoria_evento_colaborador" ADD CONSTRAINT "diretoria_evento_colaborador_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "diretoria_evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diretoria_evento_colaborador" ADD CONSTRAINT "diretoria_evento_colaborador_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diretoria_evento_anexo" ADD CONSTRAINT "diretoria_evento_anexo_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "diretoria_evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diretoria_relatorio_bloco" ADD CONSTRAINT "diretoria_relatorio_bloco_relatorio_id_fkey" FOREIGN KEY ("relatorio_id") REFERENCES "diretoria_relatorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "conversation_entities_conv_tipo_chave_key" RENAME TO "conversation_entities_conversation_id_tipo_chave_canonica_key";

-- RenameIndex
ALTER INDEX "conversation_entities_conv_turno_idx" RENAME TO "conversation_entities_conversation_id_ultimo_turno_idx";


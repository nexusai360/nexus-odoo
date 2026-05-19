-- DropIndex
DROP INDEX "kb_documents_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "agent_settings" ADD COLUMN     "audio_credential_id" UUID,
ADD COLUMN     "image_credential_id" UUID,
ADD COLUMN     "suggestions_checkpoint" "FeatureCheckpoint" NOT NULL DEFAULT 'PRODUCTION';

-- AlterTable
ALTER TABLE "whatsapp_webhooks" ADD COLUMN     "methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "name" TEXT,
ADD COLUMN     "path" TEXT,
ADD COLUMN     "target_url" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_instances" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "graph_api_token" TEXT,
    "business_account_id" TEXT,
    "phone_number_id" TEXT,
    "response_mode" "WhatsappResponseMode" NOT NULL DEFAULT 'direct',
    "webhook_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_instances_webhook_id_idx" ON "whatsapp_instances"("webhook_id");

-- AddForeignKey
ALTER TABLE "whatsapp_instances" ADD CONSTRAINT "whatsapp_instances_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "whatsapp_webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RecreateIndex: o índice HNSW de pgvector não é modelado pelo Prisma; o
-- `migrate dev` o derruba (DropIndex acima) porque não o reconhece. Recriado
-- aqui para manter o estado do banco consistente (padrão das migrations
-- anteriores de embedding).
CREATE INDEX IF NOT EXISTS "kb_documents_embedding_hnsw_idx"
  ON "kb_documents"
  USING hnsw (embedding vector_cosine_ops);

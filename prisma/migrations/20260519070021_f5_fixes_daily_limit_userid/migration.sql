-- AlterTable: adiciona userId ao ProcessedWhatsappMessage para teto diário por usuário
ALTER TABLE "processed_whatsapp_messages" ADD COLUMN "user_id" TEXT;

-- CreateIndex
CREATE INDEX "processed_whatsapp_messages_user_id_processed_at_idx" ON "processed_whatsapp_messages"("user_id", "processed_at");

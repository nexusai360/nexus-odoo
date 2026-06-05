-- Arquivar conversa da bubble ("Limpar sessao"): null = ativa.
ALTER TABLE "conversations" ADD COLUMN "ended_at" TIMESTAMP(3);

-- Resolver a conversa ativa (endedAt IS NULL) por usuario/canal rapidamente.
CREATE INDEX "conversations_user_id_channel_ended_at_updated_at_idx"
  ON "conversations" ("user_id", "channel", "ended_at", "updated_at");

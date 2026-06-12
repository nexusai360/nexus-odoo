-- Onda M (Arquitetura 3.0) T4.1: memoria de entidades da conversa (anafora).
CREATE TABLE IF NOT EXISTS "conversation_entities" (
  "id" TEXT NOT NULL,
  "conversation_id" UUID NOT NULL,
  "tipo" TEXT NOT NULL,
  "chave_canonica" TEXT NOT NULL,
  "rotulo" TEXT NOT NULL,
  "ultimo_turno" INTEGER NOT NULL,
  "mencoes" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "conversation_entities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_entities_conversation_id_fkey" FOREIGN KEY ("conversation_id")
    REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_entities_conv_tipo_chave_key"
  ON "conversation_entities"("conversation_id", "tipo", "chave_canonica");
CREATE INDEX IF NOT EXISTS "conversation_entities_conv_turno_idx"
  ON "conversation_entities"("conversation_id", "ultimo_turno");

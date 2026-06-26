-- F6 , Chat do Construtor de relatorios: conversa + mensagens isoladas das do Nex.
-- Migration MANUAL e idempotente (F6 nunca usa `migrate dev`, que reseta o banco dev).

CREATE TABLE IF NOT EXISTS "builder_conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "saved_report_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    CONSTRAINT "builder_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "builder_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "steps" JSONB,
    "duration_ms" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "builder_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "builder_conversations_user_id_ended_at_updated_at_idx"
    ON "builder_conversations" ("user_id", "ended_at", "updated_at");

CREATE INDEX IF NOT EXISTS "builder_messages_conversation_id_created_at_idx"
    ON "builder_messages" ("conversation_id", "created_at");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'builder_conversations_user_id_fkey'
    ) THEN
        ALTER TABLE "builder_conversations"
            ADD CONSTRAINT "builder_conversations_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'builder_messages_conversation_id_fkey'
    ) THEN
        ALTER TABLE "builder_messages"
            ADD CONSTRAINT "builder_messages_conversation_id_fkey"
            FOREIGN KEY ("conversation_id") REFERENCES "builder_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

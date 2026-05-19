-- F5 Bloco 6: liga a sessão de playground a uma conversa (canal playground)
-- usada pelo runAgent para manter histórico/contexto. Migration aditiva.
ALTER TABLE "playground_sessions" ADD COLUMN "conversation_id" UUID;

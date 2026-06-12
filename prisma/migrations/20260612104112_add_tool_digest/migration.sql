-- Onda M (Arquitetura 3.0) T1.1: digest dos toolResults por mensagem.
-- Aditiva e nullable: segura para deploy antes do codigo novo.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "tool_digest" TEXT;

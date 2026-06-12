-- Onda M (Arquitetura 3.0) T3.1: working memory estruturada da conversa.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "foco_atual" JSONB;

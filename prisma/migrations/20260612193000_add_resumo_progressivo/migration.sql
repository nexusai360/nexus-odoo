-- Onda M (Arquitetura 3.0) T5.1: resumo progressivo da conversa (L2 da memoria).
-- resumo_dominios guarda os dominios dos dados contidos no resumo (RBAC lazy
-- da injecao: dominio revogado -> resumo nao injeta e e re-gerado).
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "resumo_progressivo" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "resumo_ate_mensagem_id" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "resumo_atualizado_em" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "resumo_dominios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Migration: f5_restore_kb_embedding
-- Restaura a coluna `embedding` (pgvector) de kb_documents e o índice HNSW.
-- A migration 20260519190029_f5_llm_usage_credential_kind derrubou a coluna
-- por engano: o `prisma migrate dev` não enxergava o tipo `vector` (fora do
-- schema Prisma) e gerou um DROP COLUMN. Resultado: erro 42703 em runtime
-- (`column "embedding" does not exist`) ao listar a base de conhecimento.
--
-- A partir daqui o schema declara `embedding Unsupported("vector(1536)")?`,
-- então o Prisma deixa de tentar derrubá-la em migrations futuras.
-- Idempotente: seguro tanto em deploy novo quanto em base já existente.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "kb_documents" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

CREATE INDEX IF NOT EXISTS "kb_documents_embedding_hnsw_idx"
  ON "kb_documents"
  USING hnsw (embedding vector_cosine_ops);

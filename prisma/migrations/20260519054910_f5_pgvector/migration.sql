-- Migration: f5_pgvector
-- Habilita a extensão pgvector e adiciona coluna embedding em kb_documents.
-- SQL raw pois Prisma não tem tipo nativo `vector`.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Índice HNSW para busca aproximada por similaridade cosseno em kb_documents.embedding
-- Elimina full scan sequencial em ORDER BY embedding <=> $1 (searchKb).
-- Requer pgvector >= 0.5 (presente na instância — confirmado em review 1-2-7).
CREATE INDEX IF NOT EXISTS "kb_documents_embedding_hnsw_idx"
  ON "kb_documents"
  USING hnsw (embedding vector_cosine_ops);

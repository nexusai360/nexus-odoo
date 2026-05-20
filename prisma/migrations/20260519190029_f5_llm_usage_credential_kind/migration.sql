/*
  Warnings:

  - You are about to drop the column `embedding` on the `kb_documents` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "kb_documents_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "kb_documents" DROP COLUMN "embedding";

-- AlterTable
ALTER TABLE "llm_usage" ADD COLUMN     "credential_id" UUID,
ADD COLUMN     "request_kind" TEXT NOT NULL DEFAULT 'texto';

-- CreateIndex
CREATE INDEX "llm_usage_credential_id_idx" ON "llm_usage"("credential_id");

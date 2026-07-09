-- F6 , tabela de fichas de relatorio dinamico do Construtor de Relatorios.
-- Migration manual idempotente (banco dev compartilhado tem drift pre-existente;
-- migrate dev quer resetar, entao aplicamos via db execute sem reset).

DO $$ BEGIN
  CREATE TYPE "SavedReportTipo" AS ENUM ('tela_cheia', 'widget');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SavedReportStatus" AS ENUM ('rascunho', 'publicado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "saved_reports" (
  "id" TEXT NOT NULL,
  "tipo" "SavedReportTipo" NOT NULL DEFAULT 'tela_cheia',
  "titulo" TEXT NOT NULL,
  "entry" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "status" "SavedReportStatus" NOT NULL DEFAULT 'rascunho',
  "criado_por" UUID NOT NULL,
  "visibilidade_consumo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "etag" TEXT NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "saved_reports_criado_por_status_idx"
  ON "saved_reports"("criado_por", "status");

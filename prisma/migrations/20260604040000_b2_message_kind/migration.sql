-- B2: coluna kind em Message (text|audio).
ALTER TABLE "messages" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'text';

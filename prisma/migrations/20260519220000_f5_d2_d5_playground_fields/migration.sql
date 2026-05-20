-- D2 — credentialId por sessão de playground
ALTER TABLE "playground_sessions"
  ADD COLUMN IF NOT EXISTS "credential_id" UUID;

-- D5 — provider/model/request_kind por mensagem de playground
ALTER TABLE "playground_messages"
  ADD COLUMN IF NOT EXISTS "provider"     TEXT,
  ADD COLUMN IF NOT EXISTS "model"        TEXT,
  ADD COLUMN IF NOT EXISTS "request_kind" TEXT;

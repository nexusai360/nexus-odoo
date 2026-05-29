-- Rollback manual (Prisma não roda down automaticamente).
-- Aplicar via: psql "$DATABASE_URL" -f down.sql
--
-- Restaura enum ReportDomain com rh/producao + dropa outcome.
-- Valores de UserDomainAccess removidos (rh/producao) precisam ser
-- restaurados manualmente via docs/migrations/2026-05-28-rbac-v2-snapshot.txt.
--
-- AuditAction.agent_permission_denied não é removível (Postgres limit;
-- valor não usado se rollback).

BEGIN;

ALTER TYPE "ReportDomain" RENAME TO "ReportDomain_v2";
CREATE TYPE "ReportDomain" AS ENUM (
  'estoque', 'financeiro', 'fiscal', 'comercial', 'cadastros',
  'contabil', 'rh', 'crm', 'producao'
);
ALTER TABLE "user_domain_access"
  ALTER COLUMN "domain" TYPE "ReportDomain"
  USING "domain"::text::"ReportDomain";
DROP TYPE "ReportDomain_v2";

ALTER TABLE "agent_router_decision" DROP COLUMN IF EXISTS "outcome";

COMMIT;

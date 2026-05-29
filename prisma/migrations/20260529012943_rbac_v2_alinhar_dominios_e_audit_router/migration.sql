-- RBAC v2 — alinha enum ReportDomain com vocabulário do Router R1 (drop rh/producao),
-- adiciona AuditAction.agent_permission_denied e AgentRouterDecision.outcome.
--
-- Pré-flight (script separado, NÃO faz parte da migration):
-- scripts/2026-05-28-pre-flight-rbac-v2.sh roda em PROD:
-- SELECT user_id, domain, granted_by_id FROM user_domain_access
-- WHERE domain IN ('rh', 'producao');
-- Saída salva em docs/migrations/2026-05-28-rbac-v2-snapshot.txt (commitada).
--
-- Spec: docs/superpowers/specs/2026-05-28-rbac-v2-gating-e-dominios-design.md §8.2.

BEGIN;

-- 1. AgentRouterDecision ganha outcome (TEXT NULL).
ALTER TABLE "agent_router_decision"
  ADD COLUMN IF NOT EXISTS "outcome" TEXT NULL;

-- 2. AuditAction ganha agent_permission_denied.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'agent_permission_denied';

-- 3. Deleta linhas órfãs de UserDomainAccess (rh/producao) e registra audit interno.
WITH deleted AS (
  DELETE FROM "user_domain_access"
  WHERE domain IN ('rh', 'producao')
  RETURNING user_id, domain
)
INSERT INTO "audit_logs" (id, user_id, action, target_type, target_id, details, created_at)
SELECT gen_random_uuid(), user_id, 'user_domains_changed', 'User', user_id::text,
       jsonb_build_object('removed', jsonb_build_array(domain), 'reason', 'rbac_v2_alignment'),
       NOW()
FROM deleted;

-- 4. Recria enum ReportDomain sem rh/producao (Postgres não permite drop de valor de enum).
ALTER TYPE "ReportDomain" RENAME TO "ReportDomain_old";
CREATE TYPE "ReportDomain" AS ENUM (
  'cadastros', 'comercial', 'contabil', 'crm',
  'estoque', 'financeiro', 'fiscal'
);
ALTER TABLE "user_domain_access"
  ALTER COLUMN "domain" TYPE "ReportDomain"
  USING "domain"::text::"ReportDomain";
DROP TYPE "ReportDomain_old";

COMMIT;

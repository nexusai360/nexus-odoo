"use server";

// RBAC v2 (SPEC §6, Onda F): metricas das recusas de permissao do Agente Nex.
// Le os AuditLog com action=agent_permission_denied gravados pelo fast-path
// (src/lib/agent/permission-denial.ts) e agrega para o card do painel
// /agente/monitoramento.

import { prisma } from "@/lib/prisma";
import { REPORT_DOMAINS } from "@/lib/reports/domains";

export type DenialPeriod = "24h" | "7d" | "30d";

const PERIOD_MS: Record<DenialPeriod, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

// Teto de linhas lidas por janela. A agregacao por dominio acontece em memoria
// porque `details` e jsonb (groupBy do Prisma nao alcanca chaves internas).
// Para os volumes esperados (<1000 recusas/janela) e seguro; acima disso o
// total seria subcontado , aceitavel para um painel de diagnostico (SPEC §6,
// nota F1).
const MAX_ROWS = 1000;

export interface DenialByDomain {
  domain: string;
  label: string;
  count: number;
}

export interface DenialRecent {
  userId: string | null;
  userName: string;
  questionSnippet: string;
  deniedDomains: string[];
  timestamp: Date;
}

export interface PermissionDenialStats {
  total: number;
  byDomain: DenialByDomain[];
  recent: DenialRecent[];
}

const LABEL_OF = new Map(REPORT_DOMAINS.map((d) => [d.id as string, d.label]));

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : [];
}

/**
 * Estatisticas de recusa de permissao no periodo:
 *  - `total`: numero de recusas na janela (limitado a MAX_ROWS);
 *  - `byDomain`: contagem por dominio negado, desc;
 *  - `recent`: ate 10 recusas mais recentes (com snippet sanitizado).
 */
export async function getPermissionDenialStats(
  period: DenialPeriod = "7d",
): Promise<PermissionDenialStats> {
  const cutoff = new Date(Date.now() - PERIOD_MS[period]);
  const rows = await prisma.auditLog.findMany({
    where: { action: "agent_permission_denied", createdAt: { gte: cutoff } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const counts = new Map<string, number>();
  for (const r of rows) {
    const details = (r.details ?? {}) as { deniedDomains?: unknown };
    for (const d of asStringArray(details.deniedDomains)) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }

  const byDomain: DenialByDomain[] = [...counts.entries()]
    .map(([domain, count]) => ({
      domain,
      label: LABEL_OF.get(domain) ?? domain,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const recent: DenialRecent[] = rows.slice(0, 10).map((r) => {
    const details = (r.details ?? {}) as {
      questionSnippet?: unknown;
      deniedDomains?: unknown;
    };
    return {
      userId: r.userId,
      userName: r.user?.name ?? "(desconhecido)",
      questionSnippet:
        typeof details.questionSnippet === "string"
          ? details.questionSnippet
          : "",
      deniedDomains: asStringArray(details.deniedDomains),
      timestamp: r.createdAt,
    };
  });

  return { total: rows.length, byDomain, recent };
}

/**
 * Queries server-side para a tela /agente/inteligencia.
 *
 * Scope visual: admin ve apenas conversas dentro do(s) dominio(s) ao qual tem
 * acesso (`UserDomainAccess`). Super-admin ve tudo.
 */

import "server-only";

import { prisma } from "@/lib/prisma";

export interface QualityKpis {
  total: number;
  avg: {
    aderencia: number | null;
    correcaoFactual: number | null;
    escolhaDeTools: number | null;
    clareza: number | null;
  };
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  coverage: {
    withFactual: number;
    withoutFactual: number;
  };
}

export async function getQualityKpis(): Promise<QualityKpis> {
  const rows = await prisma.conversationQualityEvaluation.findMany({
    select: {
      aderencia: true,
      correcaoFactual: true,
      escolhaDeTools: true,
      clareza: true,
    },
  });

  const total = rows.length;
  const sum = { ad: 0, cf: 0, et: 0, cl: 0 };
  const cnt = { ad: 0, cf: 0, et: 0, cl: 0 };
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let withFactual = 0;

  for (const r of rows) {
    if (r.aderencia != null) {
      sum.ad += r.aderencia;
      cnt.ad++;
      const k = r.aderencia as 1 | 2 | 3 | 4 | 5;
      if (k in dist) dist[k]++;
    }
    if (r.correcaoFactual != null) {
      sum.cf += r.correcaoFactual;
      cnt.cf++;
      withFactual++;
    }
    if (r.escolhaDeTools != null) {
      sum.et += r.escolhaDeTools;
      cnt.et++;
    }
    if (r.clareza != null) {
      sum.cl += r.clareza;
      cnt.cl++;
    }
  }

  return {
    total,
    avg: {
      aderencia: cnt.ad > 0 ? sum.ad / cnt.ad : null,
      correcaoFactual: cnt.cf > 0 ? sum.cf / cnt.cf : null,
      escolhaDeTools: cnt.et > 0 ? sum.et / cnt.et : null,
      clareza: cnt.cl > 0 ? sum.cl / cnt.cl : null,
    },
    distribution: dist,
    coverage: {
      withFactual,
      withoutFactual: total - withFactual,
    },
  };
}

export interface RecommendationRow {
  id: string;
  clusterKey: string;
  consolidatedText: string;
  occurrences: number;
  status: string;
  createdAt: Date;
}

export async function getTopRecommendations(limit = 20): Promise<RecommendationRow[]> {
  const rows = await prisma.promptRecommendation.findMany({
    orderBy: [{ status: "asc" }, { occurrences: "desc" }],
    take: limit,
  });
  return rows;
}

export interface LowAdherenceConversation {
  conversationId: string;
  evaluationId: string;
  aderencia: number;
  createdAt: Date;
}

export async function getLowAdherenceConversations(limit = 15): Promise<LowAdherenceConversation[]> {
  const rows = await prisma.conversationQualityEvaluation.findMany({
    where: { aderencia: { lte: 2 } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      conversationId: true,
      aderencia: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    conversationId: r.conversationId,
    evaluationId: r.id,
    aderencia: r.aderencia ?? 0,
    createdAt: r.createdAt,
  }));
}

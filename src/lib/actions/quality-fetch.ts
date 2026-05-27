"use server";

/**
 * Server actions de leitura para a tela /agente/qualidade.
 *
 * Wrappers de queries.ts com gate super_admin. Chamados pelo client.
 */

import { getCurrentUser } from "@/lib/auth";
import {
  getKpis,
  listEvaluations,
  getDistinctModels,
  getDailyCorrectness,
  getDistinctPatterns,
  getDistinctRodadas,
  getEvaluationDetail,
  type EvalStatus,
  type EvaluationFilters,
} from "@/lib/agent/quality/queries";

async function gate() {
  const user = await getCurrentUser();
  if (!user || user.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
}

export interface FilterInputs {
  periodStart: string;
  periodEnd: string;
  status?: EvalStatus[];
  models?: string[];
  patterns?: string[];
  search?: string;
  rodadas?: string[];
}

function toFilters(f: FilterInputs): EvaluationFilters {
  return {
    periodStart: new Date(f.periodStart),
    periodEnd: new Date(f.periodEnd),
    status: f.status,
    models: f.models,
    patterns: f.patterns,
    search: f.search,
    rodadas: f.rodadas,
  };
}

export async function fetchQualityKpis(f: FilterInputs) {
  await gate();
  return getKpis(toFilters(f));
}

export async function fetchQualityEvaluations(
  f: FilterInputs,
  pagination: { page: number; pageSize: number },
) {
  await gate();
  return listEvaluations(toFilters(f), pagination);
}

export async function fetchQualityDistinctModels() {
  await gate();
  return getDistinctModels();
}

export async function fetchQualityDailyCorrectness(f: FilterInputs) {
  await gate();
  return getDailyCorrectness(toFilters(f));
}

export async function fetchQualityTopPatterns(f: FilterInputs) {
  await gate();
  return getDistinctPatterns(toFilters(f));
}

export async function fetchQualityEvaluationDetail(id: string) {
  await gate();
  return getEvaluationDetail(id);
}

export async function fetchQualityDistinctRodadas(f: FilterInputs) {
  await gate();
  return getDistinctRodadas(toFilters(f));
}

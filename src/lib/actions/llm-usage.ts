"use server";

/**
 * Server Actions para consultas de uso de LLM , expostas para Client Components.
 *
 * Todas as actions validam que o usuário é super_admin ou admin antes de retornar
 * dados (consumo é informação sensível de custo , SPEC §8.2).
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getUsageStats,
  getUsageDetails,
  getDistinctProviders,
  getDistinctModels,
  getFirstUsageDate,
  type UsageSummaryV2,
  type UsageDetailsResult,
} from "@/lib/agent/llm/usage-stats";

// ---------------------------------------------------------------------------
// Guard RBAC
// ---------------------------------------------------------------------------

async function requireAdminOrSuper(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.platformRole !== "super_admin" && user.platformRole !== "admin")) {
    redirect("/dashboard");
  }
}

// ---------------------------------------------------------------------------
// Actions públicas
// ---------------------------------------------------------------------------

export async function fetchUsageStats(args: {
  start: string;
  end: string;
  provider?: string | null;
  model?: string | null;
  isPlayground?: boolean | null;
}): Promise<UsageSummaryV2> {
  await requireAdminOrSuper();
  return getUsageStats({
    start: new Date(args.start),
    end: new Date(args.end),
    provider: args.provider,
    model: args.model,
    isPlayground: args.isPlayground,
  });
}

export async function fetchUsageDetails(args: {
  start: string;
  end: string;
  limit?: number;
  offset?: number;
  provider?: string | null;
  model?: string | null;
  isPlayground?: boolean | null;
}): Promise<UsageDetailsResult> {
  await requireAdminOrSuper();
  return getUsageDetails({
    start: new Date(args.start),
    end: new Date(args.end),
    limit: args.limit,
    offset: args.offset,
    provider: args.provider,
    model: args.model,
    isPlayground: args.isPlayground,
  });
}

export async function fetchDistinctProviders(args: {
  start: string;
  end: string;
}): Promise<string[]> {
  await requireAdminOrSuper();
  return getDistinctProviders({ start: new Date(args.start), end: new Date(args.end) });
}

export async function fetchDistinctModels(args: {
  start: string;
  end: string;
  provider?: string | null;
}): Promise<string[]> {
  await requireAdminOrSuper();
  return getDistinctModels({
    start: new Date(args.start),
    end: new Date(args.end),
    provider: args.provider,
  });
}

export async function fetchFirstUsageDate(): Promise<string> {
  await requireAdminOrSuper();
  const date = await getFirstUsageDate();
  return date.toISOString();
}

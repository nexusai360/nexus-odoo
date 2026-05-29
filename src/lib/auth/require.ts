import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import type { AuthUser } from "@/lib/auth-helpers";
import { getCurrentUser } from "@/lib/auth";
import { PLATFORM_ROLE_HIERARCHY } from "@/lib/constants/roles";
import type { PlatformRole } from "@/generated/prisma/client";
import { getMyDomains, getUserDomains } from "@/lib/actions/domain-access";
import { seesAll, type ReportDomainId } from "@/lib/reports/domains";

const DEFAULT_REDIRECT = "/dashboard";

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireMinRole(
  min: PlatformRole,
  redirectTo: string = DEFAULT_REDIRECT,
): Promise<AuthUser> {
  const user = await requireAuth();
  const userRank = PLATFORM_ROLE_HIERARCHY[user.platformRole];
  const minRank = PLATFORM_ROLE_HIERARCHY[min];
  if (userRank < minRank) {
    redirect(`${redirectTo}?denied=${min}`);
  }
  return user;
}

export async function requireVisibleDomainsOrRedirect(
  redirectTo: string = DEFAULT_REDIRECT,
): Promise<{ user: AuthUser; domains: ReportDomainId[] }> {
  const user = await requireAuth();
  const domains = await getMyDomains();
  if (domains.length === 0) {
    redirect(`${redirectTo}?error=no_domains`);
  }
  return { user, domains };
}

type AgentAccessResult =
  | NextResponse
  | { user: AuthUser; allowedDomains: Set<string> | "all" };

export async function requireAgentAccessOrJson(): Promise<AgentAccessResult> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (seesAll(user.platformRole)) {
    return { user, allowedDomains: "all" };
  }
  const granted = await getUserDomains(user.id);
  if (granted.length === 0) {
    return NextResponse.json({ error: "AgentNotEnabled" }, { status: 403 });
  }
  return { user, allowedDomains: new Set<string>(granted) };
}

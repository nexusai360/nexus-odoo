// mcp/auth/user-context.ts
// Resolução do UserContext a partir do banco — identidade por sessão no MCP.
import type { PrismaClient, PlatformRole, ReportDomain } from "@/generated/prisma/client";

/** Contexto de identidade do usuário injetado em todo handler de tool. */
export interface UserContext {
  userId: string;
  role: PlatformRole;
  domains: ReportDomain[];
}

/**
 * Carrega o UserContext de um userId.
 * Retorna null se o usuário não existir ou estiver inativo (isActive=false).
 * Espelha a checagem de isActive de src/auth.ts.
 */
export async function resolveUserContext(
  prisma: PrismaClient,
  userId: string,
): Promise<UserContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, platformRole: true, isActive: true },
  });

  if (!user || !user.isActive) return null;

  const domainRows = await prisma.userDomainAccess.findMany({
    where: { userId },
    select: { domain: true },
  });

  return {
    userId: user.id,
    role: user.platformRole,
    domains: domainRows.map((r) => r.domain),
  };
}

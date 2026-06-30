import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Data ISO da sincronização incremental mais recente (qualquer modelo). Usada
 * pelo indicador "atualizado há X" das telas da Diretoria. O dado vem do cache
 * alimentado pelo worker; nenhuma leitura toca o Odoo ao vivo.
 */
export async function ultimaSyncIso(prisma: PrismaClient): Promise<string | null> {
  const r = await prisma.syncState.findFirst({
    where: { lastIncrementalAt: { not: null } },
    orderBy: { lastIncrementalAt: "desc" },
    select: { lastIncrementalAt: true },
  });
  return r?.lastIncrementalAt ? r.lastIncrementalAt.toISOString() : null;
}

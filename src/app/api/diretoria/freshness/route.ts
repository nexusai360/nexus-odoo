import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ultimaSyncIso } from "@/lib/diretoria/freshness";

export const dynamic = "force-dynamic";

/**
 * Timestamp da última sincronização (incremental) do cache. Consumido pelo
 * FreshnessBadge para refletir o ciclo nativo (incremental ~3-10min, snapshot
 * ~24h) automaticamente, sem o usuário dar refresh. Apenas leitura do cache.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ iso: null }, { status: 401 });
  }
  const iso = await ultimaSyncIso(prisma);
  return NextResponse.json({ iso });
}

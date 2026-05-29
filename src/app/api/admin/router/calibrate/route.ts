/**
 * R1 router de catalogo: endpoint de calibragem offline (Wave E4).
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §10.1.7.
 * Plan: docs/superpowers/plans/2026-05-28-router-catalogo-plan.md §E4.
 *
 * POST dispara runCalibration inline (foreground, ~30s, ~$0.003 em embeddings).
 * Roda pickDomains contra as 291 perguntas das rodadas R8-R23 e retorna os KPIs
 * (Top-1, Top-K, fallbacks, latencia) mais o flag de promocao (Top-1 >= 85%).
 *
 * Gate: apenas super_admin (mesma postura do kill-switch). NAO chama LLM de
 * chat, mas gera embeddings, entao exige credencial de embedding configurada.
 *
 * Rate limit: 3 calibragens / 5min por usuario (operacao cara). Via redis.
 * Audita em AuditLog com action `setting_updated`.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { runCalibration } from "@/lib/agent/router/calibrate";

// Calibragem pode levar ~30s. Garante que o runtime nao corte antes.
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  if (user.platformRole !== "super_admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // Rate limit: operacao cara (embeddings + ~30s). 3 por 5 minutos.
  const rl = await checkRateLimit(`router-calibrate:${user.id}`, 3, 300);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Limite de calibragens excedido. Tente novamente em ${rl.retryAfterSeconds ?? 300}s.`,
      },
      { status: 429 },
    );
  }

  let result;
  try {
    result = await runCalibration({ writeReport: true });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Falha desconhecida na calibragem";
    // Causa mais comum: credencial de embedding ausente / invalida.
    return NextResponse.json(
      {
        error: `Calibragem falhou: ${msg}. Verifique a credencial de embedding configurada.`,
      },
      { status: 502 },
    );
  }

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;
  await logAudit({
    userId: user.id,
    action: "setting_updated",
    targetType: "agent_settings",
    targetId: "global",
    ipAddress,
    userAgent,
    details: {
      setting: "router_calibration",
      via: "calibrate_endpoint",
      top1Accuracy: result.top1Accuracy,
      topKAccuracy: result.topKAccuracy,
      datasetSize: result.datasetSize,
      promotable: result.promotable,
    },
  });

  return NextResponse.json({ ok: true, result });
}

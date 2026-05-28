/**
 * R1 router de catalogo: endpoint de kill-switch (nivel 2 do §16 da SPEC v3).
 *
 * Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §16.2.
 *
 * Forca routerEnabled = false na linha global de AgentSettings, independente
 * do estado do painel admin. Usado quando a UI esta quebrada ou em
 * emergencia para reverter ativacao.
 *
 * Gate: apenas super_admin.
 *
 * Audita em AuditLog com action `setting_updated` (enum existente).
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  reason: z
    .string()
    .min(1, "reason obrigatorio")
    .max(500, "reason muito longo"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  // Kill-switch e' deliberadamente restrito a super_admin (mais estrito que
  // os endpoints de prompt-preview), porque desliga uma protecao do agente.
  if (user.platformRole !== "super_admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  // Parse e validacao do body.
  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    parsedBody = bodySchema.parse(raw);
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.message).join(", ")
        : "Body invalido";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Snapshot do estado anterior para audit.
  const before = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { routerEnabled: true },
  });
  const wasEnabled = before?.routerEnabled ?? false;

  // Desliga router de forma idempotente. Se ja estava em shadow, vira no-op
  // do ponto de vista do comportamento, mas a audit continua sendo gravada
  // (rastreabilidade do gesto).
  await prisma.agentSettings.update({
    where: { id: "global" },
    data: { routerEnabled: false },
  });

  // Audit log estruturado.
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
      setting: "router_enabled",
      previous: wasEnabled,
      next: false,
      reason: parsedBody.reason,
      via: "kill_switch_endpoint",
    },
  });

  return NextResponse.json({
    ok: true,
    routerEnabled: false,
    wasEnabled,
  });
}

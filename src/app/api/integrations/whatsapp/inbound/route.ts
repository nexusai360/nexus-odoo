/**
 * POST /api/integrations/whatsapp/inbound (rota fixa legada).
 *
 * Mantida por compatibilidade. O caminho canônico passou a ser o webhook com
 * SLUG definido pelo usuário (`/api/hooks/<slug>`, F5.1). Esta rota resolve o
 * primeiro webhook de entrada habilitado e delega ao handler compartilhado.
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { handleWhatsappInbound } from "@/lib/whatsapp/inbound-handler";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Fail-closed: sem webhook de entrada habilitado, recusa (nunca aceita sem secret).
  const inboundWebhook = await prisma.whatsappWebhook
    .findFirst({ where: { direction: "inbound", enabled: true } })
    .catch(() => null);

  if (!inboundWebhook) {
    return NextResponse.json({ error: "Canal WhatsApp não configurado" }, { status: 503 });
  }

  let secret: string;
  try {
    secret = decrypt(inboundWebhook.secret);
  } catch {
    return NextResponse.json({ error: "Configuração de segurança inválida" }, { status: 500 });
  }

  return handleWhatsappInbound(req, {
    secret,
    businessId: inboundWebhook.businessId ?? null,
  });
}

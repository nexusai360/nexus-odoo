/**
 * POST /api/hooks/<slug>
 *
 * Recebimento de mensagens WhatsApp por webhook com SLUG definido pelo usuário
 * (F5.1, opção B). O usuário cria um webhook de entrada, marca "Recebe dados do
 * WhatsApp" e define o slug; este endpoint resolve o webhook por esse slug,
 * valida o token (Authorization: Bearer) contra o secret DELE e alimenta o
 * agente, anexando o business_id (número da empresa) para rotear a resposta.
 *
 * Pode haver vários WhatsApps (vários webhooks com slugs/numeros distintos).
 */

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { handleWhatsappInbound } from "@/lib/whatsapp/inbound-handler";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const path = (Array.isArray(slug) ? slug.join("/") : String(slug ?? "")).trim();
  if (!path) {
    return NextResponse.json({ error: "Caminho ausente" }, { status: 404 });
  }

  // Resolve o webhook receptor de WhatsApp por slug (path). Fail-closed.
  const webhook = await prisma.whatsappWebhook
    .findFirst({
      where: { direction: "inbound", enabled: true, isWhatsappReceiver: true, path },
      select: { secret: true, businessId: true },
    })
    .catch(() => null);

  if (!webhook) {
    return NextResponse.json(
      { error: "Webhook de WhatsApp não encontrado para este caminho" },
      { status: 404 },
    );
  }

  let secret: string;
  try {
    secret = decrypt(webhook.secret);
  } catch {
    return NextResponse.json({ error: "Configuração de segurança inválida" }, { status: 500 });
  }

  return handleWhatsappInbound(req, { secret, businessId: webhook.businessId });
}

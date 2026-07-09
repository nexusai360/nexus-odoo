/**
 * Recebimento de mensagens de WhatsApp por webhook com SLUG definido pelo
 * usuário. Resolve o webhook pelo caminho, valida o token dele
 * (`Authorization: Bearer`) e alimenta o agente, anexando o número da empresa
 * (`businessId`) para rotear a resposta.
 *
 * Duas rotas usam este handler:
 *   - `/api/webhooks/<slug>`  , canônica (é a que a tela de criação mostra);
 *   - `/api/hooks/<slug>`     , apelido, mantido por compatibilidade.
 *
 * Ambas precisam estar em `src/lib/auth/public-paths.ts`, senão o middleware
 * redireciona a chamada externa para `/login` e a mensagem nunca chega.
 */
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { handleWhatsappInbound } from "@/lib/whatsapp/inbound-handler";

export async function handleSlugInbound(
  req: NextRequest,
  params: Promise<{ slug: string[] }>,
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

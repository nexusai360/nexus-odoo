/**
 * POST /api/webhooks/<slug> , rota CANÔNICA de recebimento.
 *
 * É o endereço que a tela de criação do webhook exibe. A lógica vive em
 * `src/lib/whatsapp/slug-inbound.ts`, compartilhada com o apelido `/api/hooks`.
 */
import type { NextRequest, NextResponse } from "next/server";
import { handleSlugInbound } from "@/lib/whatsapp/slug-inbound";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
): Promise<NextResponse> {
  return handleSlugInbound(req, params);
}

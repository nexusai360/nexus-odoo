/**
 * POST /api/integrations/whatsapp/inbound (rota fixa DESCONTINUADA).
 *
 * O recebimento de WhatsApp passou a ser exclusivo do webhook com SLUG definido
 * pelo usuário (`/api/webhooks/<slug>`): a rota fixa resolvia "o primeiro
 * webhook de entrada habilitado", o que é ambíguo com mais de uma Conexão e
 * impede o isolamento por conexão (SPEC 2026-07-09, A10).
 *
 * Responde `410 Gone` com corpo explicativo. O caminho PRECISA continuar em
 * `src/lib/auth/public-paths.ts`: fora da lista pública o middleware devolveria
 * um redirect de login (302), e quem ainda aponta para cá nunca veria o aviso.
 */

import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error:
        "Este endereço foi descontinuado. Use o endereço da sua Conexão com WhatsApp " +
        "(/api/webhooks/<endereço-da-conexão>), exibido na tela de Integrações.",
    },
    { status: 410 },
  );
}

// Gate de SERVIDOR do canal in-app (a bolha do Nex).
//
// Até 2026-07-09 o nível da bolha (`AgentSettings.bubbleAccessLevel`) só era lido
// no layout, que decidia se o botão aparecia. Nenhuma rota de API o consultava,
// então um usuário autenticado abaixo do nível conseguia conversar com o agente
// chamando `POST /api/agent/stream` direto. A interface escondia, o servidor não
// bloqueava. Este módulo fecha isso, no mesmo padrão do gate do WhatsApp
// (`src/lib/whatsapp/inbound-handler.ts`), que sempre foi checado no servidor.
//
// A fonte do nível é `getPublicAgentFlags()`, a MESMA que o layout usa, para que
// interface e servidor nunca discordem. Se o singleton de configuração não
// existir, ela devolve o default `viewer` (canal aberto), preservando o
// comportamento atual em base nova em vez de derrubar a bolha de todo mundo.
import { NextResponse } from "next/server";

import { getPublicAgentFlags } from "@/lib/actions/agent-config";
import { podeUsarBolha, podeTranscreverAudio } from "@/lib/agent/channel-access";
import type { PlatformRole } from "@/generated/prisma/client";

/** 403 padrão quando o canal está fechado para o perfil. */
function canalNegado(): NextResponse {
  return NextResponse.json({ error: "ChannelDisabled" }, { status: 403 });
}

/**
 * Bloqueia a requisição quando o perfil não alcança o nível da bolha.
 * Devolve `null` quando pode seguir.
 */
export async function blockIfBubbleClosed(role: PlatformRole): Promise<NextResponse | null> {
  const flags = await getPublicAgentFlags();
  return podeUsarBolha(role, flags.bubbleAccessLevel) ? null : canalNegado();
}

/**
 * Igual ao anterior, para a transcrição de áudio, que também serve o Playground
 * e o construtor de relatórios (ver `podeTranscreverAudio`).
 */
export async function blockIfAudioClosed(role: PlatformRole): Promise<NextResponse | null> {
  const flags = await getPublicAgentFlags();
  return podeTranscreverAudio(role, flags.bubbleAccessLevel) ? null : canalNegado();
}

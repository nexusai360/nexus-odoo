import type { PlatformRole, ChannelAccessLevel } from "@/generated/prisma/client";
import { PLATFORM_ROLE_HIERARCHY } from "@/lib/constants/roles";

/**
 * True quando o role do usuário satisfaz o nível mínimo do canal (com herança):
 * quem tem role >= o nível escolhido acessa. "off" bloqueia todos.
 */
export function roleMeetsChannelLevel(
  role: PlatformRole,
  level: ChannelAccessLevel,
): boolean {
  if (level === "off") return false;
  return PLATFORM_ROLE_HIERARCHY[role] >= PLATFORM_ROLE_HIERARCHY[level];
}

/** Perfis que acessam o Playground do agente (tela de administração). */
const PLAYGROUND_ROLES: ReadonlySet<PlatformRole> = new Set(["admin", "super_admin"]);

/**
 * Pode conversar com o Nex pelo chat in-app (a bolha)?
 *
 * Este é o gate de SERVIDOR do canal. Até 2026-07-09 o nível da bolha só era
 * consultado no layout, que apenas escondia o botão: quem chamasse
 * `POST /api/agent/stream` direto conversava com o agente mesmo abaixo do nível
 * configurado. A interface escondia, o servidor não bloqueava.
 */
export function podeUsarBolha(role: PlatformRole, bubbleLevel: ChannelAccessLevel): boolean {
  return roleMeetsChannelLevel(role, bubbleLevel);
}

/**
 * Pode usar a transcrição de áudio do agente?
 *
 * A rota `/api/agent/transcribe` serve três superfícies: a bolha, o Playground e
 * o construtor de relatórios. Restringi-la só pelo nível da bolha tiraria o
 * áudio do Playground de um admin sempre que a bolha estivesse em super_admin.
 * Por isso o gate é a união: quem alcança a bolha, ou quem tem o Playground.
 */
export function podeTranscreverAudio(
  role: PlatformRole,
  bubbleLevel: ChannelAccessLevel,
): boolean {
  return podeUsarBolha(role, bubbleLevel) || PLAYGROUND_ROLES.has(role);
}

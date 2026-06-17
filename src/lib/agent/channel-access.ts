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

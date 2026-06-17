import type { ChannelAccessLevel } from "@/generated/prisma/client";
import { PLATFORM_ROLE_LABELS, PLATFORM_ROLE_HIERARCHY } from "@/lib/constants/roles";

export interface ChannelLevelOption {
  value: ChannelAccessLevel;
  label: string;
}

/**
 * Opções do seletor de nível por canal: "Desativado" + os roles por hierarquia
 * crescente de exigência (viewer..super_admin). Derivado da fonte única de
 * roles, então acompanha mudanças no enum sem edição manual da UI.
 */
export function channelLevelOptions(): ChannelLevelOption[] {
  const roles = (
    Object.keys(PLATFORM_ROLE_HIERARCHY) as Array<keyof typeof PLATFORM_ROLE_HIERARCHY>
  ).sort((a, b) => PLATFORM_ROLE_HIERARCHY[a] - PLATFORM_ROLE_HIERARCHY[b]);
  return [
    { value: "off", label: "Desativado" },
    ...roles.map((r) => ({ value: r, label: PLATFORM_ROLE_LABELS[r] })),
  ];
}

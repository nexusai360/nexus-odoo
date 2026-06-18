import type { ChannelAccessLevel } from "@/generated/prisma/client";
import { PLATFORM_ROLE_LABELS, PLATFORM_ROLE_HIERARCHY } from "@/lib/constants/roles";

export interface ChannelLevelOption {
  value: ChannelAccessLevel;
  label: string;
}

/**
 * Opções do seletor de nível por canal: "Desativado" + os roles por hierarquia
 * DECRESCENTE de exigência (super_admin..viewer). A leitura é "quanto mais à
 * direita, menor a exigência de perfil e mais gente acessa": Desativado (ninguém)
 * → Super Admin (só ele) → ... → Visualizador (todos). Derivado da fonte única
 * de roles, então acompanha mudanças no enum sem edição manual da UI.
 */
export function channelLevelOptions(): ChannelLevelOption[] {
  const roles = (
    Object.keys(PLATFORM_ROLE_HIERARCHY) as Array<keyof typeof PLATFORM_ROLE_HIERARCHY>
  ).sort((a, b) => PLATFORM_ROLE_HIERARCHY[b] - PLATFORM_ROLE_HIERARCHY[a]);
  return [
    { value: "off", label: "Desativado" },
    ...roles.map((r) => ({ value: r, label: PLATFORM_ROLE_LABELS[r] })),
  ];
}

/**
 * Descrição breve e dinâmica do que um nível de canal libera (mostrada abaixo do
 * seletor, dentro de cada bloco). "off" não acessa; "viewer" (menor exigência)
 * libera todos; os demais listam os perfis com role >= o escolhido.
 */
export function channelLevelDescription(level: ChannelAccessLevel): string {
  if (level === "off") return "Nenhum perfil acessa este canal.";

  const threshold = PLATFORM_ROLE_HIERARCHY[level];
  const allowed = (
    Object.keys(PLATFORM_ROLE_HIERARCHY) as Array<keyof typeof PLATFORM_ROLE_HIERARCHY>
  )
    .filter((r) => PLATFORM_ROLE_HIERARCHY[r] >= threshold)
    .sort((a, b) => PLATFORM_ROLE_HIERARCHY[a] - PLATFORM_ROLE_HIERARCHY[b]);

  // viewer é o nível mínimo: libera todos os perfis.
  if (allowed.length === Object.keys(PLATFORM_ROLE_HIERARCHY).length) {
    return "Todos os perfis podem acessar.";
  }

  const labels = allowed.map((r) => PLATFORM_ROLE_LABELS[r]);
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
  return `Somente ${list}.`;
}

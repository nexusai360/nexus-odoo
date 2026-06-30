import type { PlatformRole } from "@/generated/prisma/client";

/** Áreas (telas) do menu Diretoria. */
export type DiretoriaArea =
  | "visao_geral"
  | "vendas"
  | "pedidos"
  | "estoque"
  | "agenda";

export const DIRETORIA_AREAS: DiretoriaArea[] = [
  "visao_geral",
  "vendas",
  "pedidos",
  "estoque",
  "agenda",
];

/**
 * Catálogo de capabilities do menu Diretoria. Strings namespaced por área e
 * ação. Extensível: sub-relatórios podem descer (ex "diretoria.vendas.pagamentos.view")
 * sem quebrar este catálogo. O conjunto fino é fechado na Onda 6.
 */
export const DIRETORIA_CAPABILITIES = [
  "diretoria.visao_geral.view",
  "diretoria.vendas.view",
  "diretoria.vendas.export",
  "diretoria.pedidos.view",
  "diretoria.pedidos.export",
  "diretoria.estoque.view",
  "diretoria.estoque.export",
  "diretoria.agenda.view",
  "diretoria.agenda.manage",
  "diretoria.sync.force",
] as const;

/** Extrai a área de uma capability de área (view/export/manage). Retorna null
 * para capabilities transversais como "diretoria.sync.force". */
export function areaFromCapability(cap: string): DiretoriaArea | null {
  const m = cap.match(/^diretoria\.([a-z_]+)\.(view|export|manage)$/);
  const area = m?.[1] as DiretoriaArea | undefined;
  return area && (DIRETORIA_AREAS as string[]).includes(area) ? area : null;
}

/**
 * Capabilities default por papel (na ausência de grants explícitos por usuário).
 * super_admin recebe tudo (bypass real é feito antes, em access.ts). Ajuste fino
 * dos defaults vem na Onda 6 com o detalhamento do usuário.
 */
export function defaultCapabilitiesFor(role: PlatformRole): string[] {
  switch (role) {
    case "super_admin":
      return [...DIRETORIA_CAPABILITIES];
    case "admin":
      return DIRETORIA_CAPABILITIES.filter(
        (c) =>
          c.endsWith(".view") ||
          c.endsWith(".export") ||
          c === "diretoria.sync.force",
      );
    case "manager":
      return [
        "diretoria.visao_geral.view",
        "diretoria.vendas.view",
        "diretoria.pedidos.view",
        "diretoria.estoque.view",
        "diretoria.agenda.view",
      ];
    case "viewer":
      return ["diretoria.visao_geral.view"];
    default:
      return [];
  }
}

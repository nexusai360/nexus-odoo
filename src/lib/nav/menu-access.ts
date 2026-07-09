// src/lib/nav/menu-access.ts
// Acesso ao BANCO para os niveis de menu (tabela `menu_access`). A logica PURA de
// decisao (podeVerMenu, defaults) vive em menu-catalog.ts. Espelha o padrao de
// src/lib/reports/acesso-relatorios2.ts.
import { prisma } from "@/lib/prisma";
import type { ChannelAccessLevel } from "@/generated/prisma/client";
import { MENU_CATALOG, defaultMenuAccess, type MenuAccessMap, type MenuKey } from "./menu-catalog";

/** Le os niveis salvos (com fallback no default de cada menu). */
export async function obterMenuAccess(): Promise<MenuAccessMap> {
  const linhas = await prisma.menuAccess
    .findMany()
    .catch(() => [] as { menuKey: string; accessLevel: ChannelAccessLevel }[]);
  const salvos = new Map(linhas.map((l) => [l.menuKey, l.accessLevel]));
  const out = defaultMenuAccess();
  for (const e of MENU_CATALOG) {
    const s = salvos.get(e.key);
    if (s) out[e.key] = s;
  }
  return out;
}

/** Grava o nivel de um menu (upsert). Menu travado nao pode ir abaixo de super_admin. */
export async function definirMenuAccess(
  menuKey: MenuKey,
  level: ChannelAccessLevel,
): Promise<ChannelAccessLevel> {
  const entry = MENU_CATALOG.find((e) => e.key === menuKey);
  if (!entry) throw new Error(`menuKey desconhecido: ${menuKey}`);
  // Trava anti-lockout: Configuracao nao pode ficar abaixo de super_admin.
  const efetivo: ChannelAccessLevel =
    entry.travadoSuperAdmin && level === "off" ? "super_admin" : level;
  await prisma.menuAccess.upsert({
    where: { menuKey },
    update: { accessLevel: efetivo },
    create: { menuKey, accessLevel: efetivo },
  });
  return efetivo;
}

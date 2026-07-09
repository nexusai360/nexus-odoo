// Trava de regressao da feature "Acesso aos menus": o nivel salvo em
// `menu_access` e a UNICA autoridade sobre quais menus de TOPO cada perfil ve.
//
// Antes desta trava, os itens de topo do sidebar carregavam gate estatico
// (`superAdminOnly` / `visibleTo`) e os layouts chamavam `requireMinRole` fixo.
// Resultado: a tela de Configuracao conseguia RESTRINGIR um menu, mas nunca
// LIBERAR (liberar Integracoes para admin nao surtia efeito, o item continuava
// oculto e a rota continuava bloqueada). Estes testes garantem que o gate
// estatico nao volte por descuido.
import { NAV_ITEMS, filterNav, type NavItem } from "@/lib/constants/nav";
import { MENU_CATALOG, defaultMenuAccess, podeVerMenu, menuKeyForPath } from "./menu-catalog";
import type { PlatformRole } from "@/generated/prisma/client";

const TOPO_GOVERNADO = NAV_ITEMS.filter((i) => menuKeyForPath(i.href) !== undefined);

/** Percorre item + descendentes. */
function todosOsNos(items: NavItem[]): NavItem[] {
  return items.flatMap((i) => [i, ...todosOsNos(i.children ?? [])]);
}

describe("menu_access e a unica autoridade do menu de topo", () => {
  it("todo menu do catalogo tem um item de topo correspondente no sidebar", () => {
    const hrefsTopo = new Set(NAV_ITEMS.map((i) => i.href));
    for (const entry of MENU_CATALOG) {
      expect(hrefsTopo.has(entry.href)).toBe(true);
    }
    expect(TOPO_GOVERNADO).toHaveLength(MENU_CATALOG.length);
  });

  it("nenhum item governado (nem seus submenus) carrega gate estatico de papel", () => {
    for (const no of todosOsNos(TOPO_GOVERNADO)) {
      expect(no.superAdminOnly).toBeUndefined();
      expect(no.visibleTo).toBeUndefined();
    }
  });

  it("filterNav nao remove menu de topo por papel: a decisao e do menu_access", () => {
    const papeis: PlatformRole[] = ["viewer", "manager", "admin", "super_admin"];
    for (const platformRole of papeis) {
      const nav = filterNav(NAV_ITEMS, { platformRole });
      expect(nav.map((i) => i.href).sort()).toEqual(NAV_ITEMS.map((i) => i.href).sort());
    }
  });

  it("liberar um menu administrativo para manager passa a surtir efeito", () => {
    const integracoes = MENU_CATALOG.find((e) => e.key === "integracoes")!;
    // padrao: manager nao ve
    expect(podeVerMenu(integracoes, defaultMenuAccess().integracoes, "manager")).toBe(false);
    // super_admin liberou para manager: agora ve
    expect(podeVerMenu(integracoes, "manager", "manager")).toBe(true);
  });

  it("restringir um menu comum para admin esconde de manager e viewer", () => {
    const dashboard = MENU_CATALOG.find((e) => e.key === "dashboard")!;
    expect(podeVerMenu(dashboard, "admin", "manager")).toBe(false);
    expect(podeVerMenu(dashboard, "admin", "viewer")).toBe(false);
    expect(podeVerMenu(dashboard, "admin", "admin")).toBe(true);
  });
});

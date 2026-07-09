import { filterNav, NAV_ITEMS } from "./nav";
import { defaultMenuAccess, menuEntry, podeVerMenu } from "@/lib/nav/menu-catalog";

describe("filterNav (não-regressão)", () => {
  it("mantém itens públicos (Dashboard, Relatórios, Diretoria) para super_admin", () => {
    const out = filterNav(NAV_ITEMS, { platformRole: "super_admin" });
    const hrefs = out.map((i) => i.href);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/relatorios");
    expect(hrefs).toContain("/diretoria");
  });

  it("os menus administrativos continuam escondidos de um viewer, agora via menu_access", () => {
    // filterNav não decide mais visibilidade de menu de topo (a Configuração
    // precisa poder liberar, não só restringir). Quem esconde é o nível padrão
    // do catálogo, aplicado na Sidebar e nos guards de rota.
    const out = filterNav(NAV_ITEMS, { platformRole: "viewer" });
    expect(out.map((i) => i.href)).toContain("/agente");

    const padrao = defaultMenuAccess();
    for (const key of ["agente", "usuarios", "integracoes", "configuracao"] as const) {
      expect(podeVerMenu(menuEntry(key)!, padrao[key], "viewer")).toBe(false);
      expect(podeVerMenu(menuEntry(key)!, padrao[key], "super_admin")).toBe(true);
    }
  });

  it("o item Diretoria mantém o slot (children resolvidos depois no layout)", () => {
    const out = filterNav(NAV_ITEMS, { platformRole: "viewer" });
    const diretoria = out.find((i) => i.href === "/diretoria");
    // filterNav não descarta /diretoria mesmo com children vazio aqui, porque o
    // submenu real é injetado pelo layout (diretoriaNavFor). O slot existe.
    expect(diretoria).toBeDefined();
  });

  it("ordem: Diretoria fica entre Dashboard e Relatórios", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs.indexOf("/diretoria")).toBeGreaterThan(hrefs.indexOf("/dashboard"));
    expect(hrefs.indexOf("/diretoria")).toBeLessThan(hrefs.indexOf("/relatorios"));
  });
});

import { filterNav, NAV_ITEMS } from "./nav";

describe("filterNav (não-regressão)", () => {
  it("mantém itens públicos (Dashboard, Relatórios, Diretoria) para super_admin", () => {
    const out = filterNav(NAV_ITEMS, { platformRole: "super_admin" });
    const hrefs = out.map((i) => i.href);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/relatorios");
    expect(hrefs).toContain("/diretoria");
  });

  it("esconde itens superAdminOnly de um viewer", () => {
    const out = filterNav(NAV_ITEMS, { platformRole: "viewer" });
    const hrefs = out.map((i) => i.href);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).not.toContain("/agente");
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

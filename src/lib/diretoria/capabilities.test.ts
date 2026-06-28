import {
  defaultCapabilitiesFor,
  DIRETORIA_CAPABILITIES,
  areaFromCapability,
} from "./capabilities";

describe("capabilities da Diretoria", () => {
  it("super_admin recebe todas as capabilities", () => {
    expect(defaultCapabilitiesFor("super_admin").sort()).toEqual(
      [...DIRETORIA_CAPABILITIES].sort(),
    );
  });

  it("viewer só vê a visão geral por default", () => {
    expect(defaultCapabilitiesFor("viewer")).toEqual([
      "diretoria.visao_geral.view",
    ]);
  });

  it("admin tem todas as .view e o sync.force, sem .manage", () => {
    const caps = defaultCapabilitiesFor("admin");
    expect(caps).toContain("diretoria.vendas.view");
    expect(caps).toContain("diretoria.vendas.export");
    expect(caps).toContain("diretoria.sync.force");
    expect(caps).not.toContain("diretoria.agenda.manage");
  });

  it("manager vê áreas operacionais, sem sync.force nem export", () => {
    const caps = defaultCapabilitiesFor("manager");
    expect(caps).toContain("diretoria.vendas.view");
    expect(caps).toContain("diretoria.estoque.view");
    expect(caps).not.toContain("diretoria.sync.force");
    expect(caps).not.toContain("diretoria.vendas.export");
  });

  it("mapeia capability de área para a área", () => {
    expect(areaFromCapability("diretoria.vendas.view")).toBe("vendas");
    expect(areaFromCapability("diretoria.estoque.export")).toBe("estoque");
    expect(areaFromCapability("diretoria.agenda.manage")).toBe("agenda");
  });

  it("capability transversal não tem área", () => {
    expect(areaFromCapability("diretoria.sync.force")).toBeNull();
    expect(areaFromCapability("lixo")).toBeNull();
  });
});

import { podeVerMenu, menuEntry } from "./menu-catalog";

const dashboard = menuEntry("dashboard")!;
const relatorios2 = menuEntry("relatorios2")!;
const agente = menuEntry("agente")!;
const configuracao = menuEntry("configuracao")!;

describe("podeVerMenu", () => {
  it("dashboard nivel viewer: todos os perfis veem", () => {
    expect(podeVerMenu(dashboard, "viewer", "viewer")).toBe(true);
    expect(podeVerMenu(dashboard, "viewer", "super_admin")).toBe(true);
  });

  it("nivel admin: manager NAO ve, admin e super_admin veem", () => {
    expect(podeVerMenu(relatorios2, "admin", "manager")).toBe(false);
    expect(podeVerMenu(relatorios2, "admin", "admin")).toBe(true);
    expect(podeVerMenu(relatorios2, "admin", "super_admin")).toBe(true);
  });

  it("nivel off: ninguem ve, EXCETO super_admin (para gerenciar)", () => {
    expect(podeVerMenu(agente, "off", "admin")).toBe(false);
    expect(podeVerMenu(agente, "off", "manager")).toBe(false);
    expect(podeVerMenu(agente, "off", "super_admin")).toBe(true);
  });

  it("Configuracao e TRAVADA: super_admin ve mesmo com nivel off (anti-lockout)", () => {
    expect(podeVerMenu(configuracao, "off", "super_admin")).toBe(true);
    expect(podeVerMenu(configuracao, "super_admin", "super_admin")).toBe(true);
    // demais perfis respeitam o nivel configurado
    expect(podeVerMenu(configuracao, "admin", "admin")).toBe(true);
    expect(podeVerMenu(configuracao, "off", "admin")).toBe(false);
  });
});

// Para onde mandar quem esbarra num menu que nao pode ver.
//
// O destino historico e /dashboard, mas o Dashboard tambem virou um menu
// configuravel: se ele estiver restrito acima do perfil, mandar o usuario pra la
// (a) exibe uma tela que ele nao deveria ver e (b) arrisca loop de redirect
// (ex.: Relatorios sem dominio manda pra /dashboard, que manda de volta).
// Fallback: /perfil, que nao e menu e nao tem guard de menu.
import { destinoQuandoBloqueado, defaultMenuAccess } from "./menu-catalog";

describe("destinoQuandoBloqueado", () => {
  it("manda para o dashboard quando o usuario pode ve-lo (padrao)", () => {
    expect(destinoQuandoBloqueado(defaultMenuAccess(), "viewer")).toBe("/dashboard");
    expect(destinoQuandoBloqueado(defaultMenuAccess(), "super_admin")).toBe("/dashboard");
  });

  it("manda para o perfil quando o dashboard foi restrito acima do perfil", () => {
    const acesso = { ...defaultMenuAccess(), dashboard: "admin" as const };
    expect(destinoQuandoBloqueado(acesso, "manager")).toBe("/perfil");
    expect(destinoQuandoBloqueado(acesso, "admin")).toBe("/dashboard");
  });

  it("dashboard desativado: so o super_admin continua caindo nele", () => {
    const acesso = { ...defaultMenuAccess(), dashboard: "off" as const };
    expect(destinoQuandoBloqueado(acesso, "admin")).toBe("/perfil");
    expect(destinoQuandoBloqueado(acesso, "super_admin")).toBe("/dashboard");
  });
});

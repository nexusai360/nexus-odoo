import { usuariosDoNivel, filtrarUsuarios, type UsuarioCompartilhavel } from "./compartilhamento";

const USERS: UsuarioCompartilhavel[] = [
  { id: "1", name: "Ana Admin", email: "ana@x.com", avatarUrl: null, platformRole: "admin" },
  { id: "2", name: "Gabi Gerente", email: "gabi@x.com", avatarUrl: null, platformRole: "manager" },
  { id: "3", name: "Vito Viewer", email: "vito@x.com", avatarUrl: null, platformRole: "viewer" },
  { id: "4", name: "Gui Gerente", email: "gui@x.com", avatarUrl: null, platformRole: "manager" },
];

describe("usuariosDoNivel", () => {
  it("marca EXATAMENTE os usuarios do nivel (sem heranca)", () => {
    expect(usuariosDoNivel(USERS, "manager").sort()).toEqual(["2", "4"]);
    expect(usuariosDoNivel(USERS, "admin")).toEqual(["1"]);
    expect(usuariosDoNivel(USERS, "viewer")).toEqual(["3"]);
  });
});

describe("filtrarUsuarios", () => {
  it("filtra por nome ou email, case-insensitive", () => {
    expect(filtrarUsuarios(USERS, "gerente").map((u) => u.id).sort()).toEqual(["2", "4"]);
    expect(filtrarUsuarios(USERS, "ANA@").map((u) => u.id)).toEqual(["1"]);
  });
  it("sem termo devolve tudo", () => {
    expect(filtrarUsuarios(USERS, "  ")).toHaveLength(4);
  });
});

import {
  podeAcessar,
  podeAcessarSubmenu,
  normalizarComTravas,
  type AcessoRelatorios2,
} from "./acesso-relatorios2";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const owner = { platformRole: "super_admin" as const, isOwner: true };
const superNaoDono = { platformRole: "super_admin" as const, isOwner: false };
const admin = { platformRole: "admin" as const, isOwner: false };
const gerente = { platformRole: "manager" as const, isOwner: false };
const viewer = { platformRole: "viewer" as const, isOwner: false };

describe("podeAcessar , heranca por nivel", () => {
  it("nivel admin libera admin e super_admin, barra gerente/viewer", () => {
    expect(podeAcessar("admin", admin)).toBe(true);
    expect(podeAcessar("admin", owner)).toBe(true);
    expect(podeAcessar("admin", gerente)).toBe(false);
    expect(podeAcessar("admin", viewer)).toBe(false);
  });

  it("nivel viewer libera todos", () => {
    expect(podeAcessar("viewer", viewer)).toBe(true);
    expect(podeAcessar("viewer", admin)).toBe(true);
  });

  it("nivel super_admin so super_admin", () => {
    expect(podeAcessar("super_admin", admin)).toBe(false);
    expect(podeAcessar("super_admin", superNaoDono)).toBe(true);
  });

  it("off some para todos exceto o super_admin dono", () => {
    expect(podeAcessar("off", owner)).toBe(true);
    expect(podeAcessar("off", superNaoDono)).toBe(false);
    expect(podeAcessar("off", admin)).toBe(false);
  });
});

describe("podeAcessarSubmenu , precisa do menu E do submenu", () => {
  const acesso: AcessoRelatorios2 = {
    menu: "admin",
    paineis: "viewer",
    meus: "admin",
    construtor: "super_admin",
  };
  it("gerente nao entra (menu admin barra gerente) mesmo com paineis=viewer", () => {
    expect(podeAcessarSubmenu(acesso, "paineis", gerente)).toBe(false);
  });
  it("admin entra em paineis e meus, mas nao no construtor (super_admin)", () => {
    expect(podeAcessarSubmenu(acesso, "paineis", admin)).toBe(true);
    expect(podeAcessarSubmenu(acesso, "meus", admin)).toBe(true);
    expect(podeAcessarSubmenu(acesso, "construtor", admin)).toBe(false);
  });
});

describe("normalizarComTravas , construtor puxa paineis/meus", () => {
  it("construtor=admin puxa paineis/meus mais restritos para admin", () => {
    const r = normalizarComTravas({
      menu: "admin",
      paineis: "super_admin",
      meus: "off",
      construtor: "admin",
    });
    expect(r.paineis).toBe("admin");
    expect(r.meus).toBe("admin");
  });
  it("nao mexe quando paineis/meus ja sao mais permissivos", () => {
    const r = normalizarComTravas({
      menu: "admin",
      paineis: "viewer",
      meus: "manager",
      construtor: "admin",
    });
    expect(r.paineis).toBe("viewer");
    expect(r.meus).toBe("manager");
  });
  it("construtor=off nao puxa nada", () => {
    const r = normalizarComTravas({
      menu: "admin",
      paineis: "super_admin",
      meus: "viewer",
      construtor: "off",
    });
    expect(r.paineis).toBe("super_admin");
    expect(r.meus).toBe("viewer");
  });
});

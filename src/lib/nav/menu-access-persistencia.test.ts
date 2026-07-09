// Contrato de gravacao dos niveis de menu (`definirMenuAccess`).
import { definirMenuAccess, obterMenuAccess } from "./menu-access";
import { defaultMenuAccess } from "./menu-catalog";

const upsert = jest.fn();
const findMany = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: {
    menuAccess: {
      upsert: (...a: unknown[]) => upsert(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({});
  findMany.mockReset().mockResolvedValue([]);
});

describe("definirMenuAccess", () => {
  it("grava o nivel escolhido nos menus normais", async () => {
    const efetivo = await definirMenuAccess("integracoes", "manager");
    expect(efetivo).toBe("manager");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { menuKey: "integracoes" },
        update: { accessLevel: "manager" },
      }),
    );
  });

  it("menu travado (Configuracao) fica fixo em super_admin, venha o que vier", async () => {
    expect(await definirMenuAccess("configuracao", "off")).toBe("super_admin");
    expect(await definirMenuAccess("configuracao", "viewer")).toBe("super_admin");
    for (const chamada of upsert.mock.calls) {
      expect(chamada[0].update.accessLevel).toBe("super_admin");
    }
  });

  it("menuKey desconhecido e recusado", async () => {
    // @ts-expect-error chave fora do catalogo
    await expect(definirMenuAccess("inexistente", "viewer")).rejects.toThrow(/desconhecido/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("obterMenuAccess", () => {
  it("sem linhas no banco devolve os defaults do catalogo", async () => {
    await expect(obterMenuAccess()).resolves.toEqual(defaultMenuAccess());
  });

  it("linha salva sobrescreve o default daquele menu", async () => {
    findMany.mockResolvedValue([{ menuKey: "integracoes", accessLevel: "manager" }]);
    const acesso = await obterMenuAccess();
    expect(acesso.integracoes).toBe("manager");
    expect(acesso.dashboard).toBe(defaultMenuAccess().dashboard);
  });

  it("linha de menuKey desconhecido no banco e ignorada", async () => {
    findMany.mockResolvedValue([{ menuKey: "lixo", accessLevel: "viewer" }]);
    await expect(obterMenuAccess()).resolves.toEqual(defaultMenuAccess());
  });
});

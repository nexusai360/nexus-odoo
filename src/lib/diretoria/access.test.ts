import type { AuthUser } from "@/lib/auth-helpers";

jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userDiretoriaAccess: { findMany: jest.fn() },
    userDiretoriaUf: { findMany: jest.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  seesAllDiretoria,
  userCapabilities,
  userUfs,
  diretoriaNavFor,
  canDiretoria,
} from "./access";

const su = { id: "1", platformRole: "super_admin" } as AuthUser;
const vw = { id: "2", platformRole: "viewer" } as AuthUser;

const accessFindMany = prisma.userDiretoriaAccess.findMany as jest.Mock;
const ufFindMany = prisma.userDiretoriaUf.findMany as jest.Mock;

beforeEach(() => {
  accessFindMany.mockReset();
  ufFindMany.mockReset();
});

describe("seesAllDiretoria", () => {
  it("só super_admin bypassa", () => {
    expect(seesAllDiretoria("super_admin")).toBe(true);
    expect(seesAllDiretoria("admin")).toBe(false);
    expect(seesAllDiretoria("manager")).toBe(false);
    expect(seesAllDiretoria("viewer")).toBe(false);
  });
});

describe("userCapabilities", () => {
  it("super_admin não consulta o banco e tem tudo", async () => {
    const caps = await userCapabilities(su);
    expect(caps.has("diretoria.vendas.view")).toBe(true);
    expect(caps.has("diretoria.sync.force")).toBe(true);
    expect(accessFindMany).not.toHaveBeenCalled();
  });

  it("viewer ganha vendas via grant explícito (default ∪ grant)", async () => {
    accessFindMany.mockResolvedValueOnce([
      { capability: "diretoria.vendas.view" },
    ]);
    const caps = await userCapabilities(vw);
    expect(caps.has("diretoria.visao_geral.view")).toBe(true); // default
    expect(caps.has("diretoria.vendas.view")).toBe(true); // grant
    expect(caps.has("diretoria.estoque.view")).toBe(false);
  });
});

describe("userUfs", () => {
  it("super_admin nunca é limitado por UF", async () => {
    expect(await userUfs(su)).toEqual([]);
    expect(ufFindMany).not.toHaveBeenCalled();
  });
  it("viewer com UFs retorna as siglas", async () => {
    ufFindMany.mockResolvedValueOnce([{ uf: "SP" }, { uf: "MG" }]);
    expect(await userUfs(vw)).toEqual(["SP", "MG"]);
  });
});

describe("diretoriaNavFor", () => {
  it("filtra o submenu por capability", async () => {
    accessFindMany.mockResolvedValueOnce([
      { capability: "diretoria.vendas.view" },
    ]);
    const nav = await diretoriaNavFor(vw);
    expect(nav.map((n) => n.href)).toEqual([
      "/diretoria/visao-geral",
      "/diretoria/vendas",
    ]);
  });
});

describe("canDiretoria", () => {
  it("respeita a capability pedida", async () => {
    accessFindMany.mockResolvedValue([]);
    expect(await canDiretoria(vw, "diretoria.visao_geral.view")).toBe(true);
    expect(await canDiretoria(vw, "diretoria.vendas.view")).toBe(false);
  });
});

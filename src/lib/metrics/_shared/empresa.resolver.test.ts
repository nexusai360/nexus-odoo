import { resolverEmpresa } from "./empresa";
import type { PrismaClient } from "../../../generated/prisma/client";

function mkPrisma(over: { findUnique?: jest.Mock; findMany?: jest.Mock }): PrismaClient {
  return {
    dimEmpresaGrupo: {
      findUnique: over.findUnique ?? jest.fn(),
      findMany: over.findMany ?? jest.fn(),
    },
  } as unknown as PrismaClient;
}

const emp = (odooId: number, nome: string, cnpj: string | null = null, tipo = "filial") => ({
  odooId,
  nome,
  cnpj,
  tipo,
  uf: null,
  ativo: true,
  atualizadoEm: new Date(),
});

describe("resolverEmpresa", () => {
  it("(a) ref de digitos (<=9) que existe como odooId resolve unica", async () => {
    const prisma = mkPrisma({ findUnique: jest.fn().mockResolvedValue(emp(9, "Jht Filial SE")) });
    const r = await resolverEmpresa(prisma, "9");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.empresa.odooId).toBe(9);
  });

  it("(b) ref de 14 digitos compara so digitos do CNPJ", async () => {
    const prisma = mkPrisma({
      findMany: jest.fn().mockResolvedValue([
        emp(8, "Matriz DF", "34.161.829/0001-98"),
        emp(9, "Filial SE", "34.161.829/0004-30"),
      ]),
    });
    const r = await resolverEmpresa(prisma, "34161829000198");
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.empresa.odooId).toBe(8);
  });

  it("(c) texto que casa 1 por contains resolve unica", async () => {
    const prisma = mkPrisma({ findMany: jest.fn().mockResolvedValue([emp(8, "Matriz DF")]) });
    const r = await resolverEmpresa(prisma, "Matriz");
    expect(r.status).toBe("unica");
  });

  it("(d) texto que casa 2+ retorna ambigua com top 3", async () => {
    const prisma = mkPrisma({
      findMany: jest.fn().mockResolvedValue([emp(1, "Jht A"), emp(2, "Jht B"), emp(3, "Jht C"), emp(4, "Jht D")]),
    });
    const r = await resolverEmpresa(prisma, "Jht");
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") expect(r.candidatas).toHaveLength(3);
  });

  it("(e) texto sem match retorna nenhuma", async () => {
    const prisma = mkPrisma({ findMany: jest.fn().mockResolvedValue([]) });
    const r = await resolverEmpresa(prisma, "Inexistente");
    expect(r.status).toBe("nenhuma");
  });

  it("(f) digitos (<=9) que nao existe como odooId cai para nome e retorna nenhuma", async () => {
    const prisma = mkPrisma({
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    });
    const r = await resolverEmpresa(prisma, "999");
    expect(r.status).toBe("nenhuma");
  });
});

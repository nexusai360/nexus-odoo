import { describe, it, expect, jest } from "@jest/globals";

const resolverEmpresa = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("@/lib/metrics/_shared/empresa.js", () => ({
  resolverEmpresa: (...args: unknown[]) => resolverEmpresa(...args),
}));

import { montarEscopoEmpresa } from "./escopo.js";

const prisma = {} as never;

describe("montarEscopoEmpresa (escopo-empresa dominio-neutro, F4 Onda 3.2)", () => {
  it("sem empresaRef: ramo grupo, sem desambiguar", async () => {
    const r = await montarEscopoEmpresa(prisma);
    expect(r.desambiguar).toBe(false);
    expect(r.empresaId).toBeUndefined();
    expect(r.escopo.tipo).toBe("grupo");
    expect(r.escopo.aviso).toMatch(/grupo todo/);
  });

  it("empresa unica: resolve empresaId e aviso", async () => {
    resolverEmpresa.mockResolvedValueOnce({
      status: "unica",
      empresa: { odooId: 7, nome: "JHT Brasilia", cnpj: "07.390.039/0001-01" },
    });
    const r = await montarEscopoEmpresa(prisma, "JHT");
    expect(r.empresaId).toBe(7);
    expect(r.desambiguar).toBe(false);
    expect(r.escopo.tipo).toBe("empresa");
    expect(r.escopo.empresaNome).toBe("JHT Brasilia");
    expect(r.escopo.aviso).toMatch(/JHT Brasilia/);
  });

  it("ambigua: pede desambiguacao com candidatas", async () => {
    resolverEmpresa.mockResolvedValueOnce({
      status: "ambigua",
      candidatas: [
        { odooId: 1, nome: "A", cnpj: null },
        { odooId: 2, nome: "B", cnpj: "x" },
      ],
    });
    const r = await montarEscopoEmpresa(prisma, "filial");
    expect(r.desambiguar).toBe(true);
    expect(r.empresaId).toBeUndefined();
    expect(r.escopo.tipo).toBe("ambigua");
    expect(r.escopo.candidatas).toHaveLength(2);
  });

  it("nao encontrada: cai para grupo todo", async () => {
    resolverEmpresa.mockResolvedValueOnce({ status: "nenhuma" });
    const r = await montarEscopoEmpresa(prisma, "inexistente");
    expect(r.desambiguar).toBe(false);
    expect(r.escopo.tipo).toBe("nenhuma");
    expect(r.escopo.aviso).toMatch(/Nao encontrei/);
  });
});

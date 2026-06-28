import {
  queryIndicadoresEstoque,
  queryEstoquePorFamilia,
  queryComprasPorFornecedor,
} from "./estoque";

describe("queryIndicadoresEstoque (A4)", () => {
  it("soma valor e itens, conta produtos e locais distintos", async () => {
    const prisma = {
      fatoEstoqueSaldo: {
        findMany: jest.fn().mockResolvedValue([
          { quantidade: 10, vrSaldo: 1000, produtoId: 1, localId: 1 },
          { quantidade: 5, vrSaldo: 500, produtoId: 2, localId: 1 },
          { quantidade: 3, vrSaldo: 300, produtoId: 1, localId: 2 },
        ]),
      },
    } as unknown as Parameters<typeof queryIndicadoresEstoque>[0];
    const r = await queryIndicadoresEstoque(prisma);
    expect(r.valorTotal).toBe(1800);
    expect(r.itens).toBe(18);
    expect(r.produtos).toBe(2);
    expect(r.locais).toBe(2);
  });
});

describe("queryEstoquePorFamilia (A5)", () => {
  it("agrupa valor por família, ordenado desc", async () => {
    const prisma = {
      fatoEstoqueSaldo: {
        findMany: jest.fn().mockResolvedValue([
          { familiaNome: "Cardio", quantidade: 2, vrSaldo: 100 },
          { familiaNome: "Força", quantidade: 1, vrSaldo: 400 },
          { familiaNome: "Cardio", quantidade: 3, vrSaldo: 50 },
          { familiaNome: null, quantidade: 1, vrSaldo: 10 },
        ]),
      },
    } as unknown as Parameters<typeof queryEstoquePorFamilia>[0];
    const r = await queryEstoquePorFamilia(prisma);
    expect(r.valorGeral).toBe(560);
    expect(r.linhas[0]).toEqual({ chave: "Força", quantidade: 1, valorTotal: 400 });
    expect(r.linhas[1]).toEqual({ chave: "Cardio", quantidade: 5, valorTotal: 150 });
    expect(r.linhas.find((l) => l.chave === "Sem família")).toBeDefined();
  });
});

describe("queryComprasPorFornecedor (A8)", () => {
  it("agrupa notas de entrada por fornecedor", async () => {
    const prisma = {
      fatoDfe: {
        findMany: jest.fn().mockResolvedValue([
          { fornecedorNome: "Fornecedor X", vrNf: 1000 },
          { fornecedorNome: "Fornecedor Y", vrNf: 3000 },
          { fornecedorNome: "Fornecedor X", vrNf: 500 },
        ]),
      },
    } as unknown as Parameters<typeof queryComprasPorFornecedor>[0];
    const r = await queryComprasPorFornecedor(prisma, {});
    expect(r.valorGeral).toBe(4500);
    expect(r.linhas[0]).toEqual({ fornecedor: "Fornecedor Y", notas: 1, valorTotal: 3000 });
    expect(r.linhas[1]).toEqual({ fornecedor: "Fornecedor X", notas: 2, valorTotal: 1500 });
  });
});

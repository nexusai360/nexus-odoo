import {
  queryIndicadoresEstoque,
  queryEstoquePorFamilia,
  queryComprasPorFornecedor,
  queryComprasAtivas,
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

describe("queryComprasAtivas (A7)", () => {
  const hoje = new Date("2026-06-28T00:00:00Z");

  it("soma valor, conta total e calcula contagem regressiva quando há data prevista", async () => {
    const prisma = {
      fatoCompra: {
        findMany: jest.fn().mockResolvedValue([
          {
            numero: "OC-0001",
            fornecedorNome: "Johnson",
            compradorNome: "Thiago",
            etapaNome: "Aprovado",
            vrNf: 1000,
            dataOrcamento: new Date("2026-06-01T00:00:00Z"),
            dataPrevista: new Date("2026-07-10T00:00:00Z"),
          },
          {
            numero: "OC-0002",
            fornecedorNome: "Rotha",
            compradorNome: "Edson",
            etapaNome: "Em cotação/provisório",
            vrNf: 500,
            dataOrcamento: new Date("2026-06-10T00:00:00Z"),
            dataPrevista: new Date("2026-06-20T00:00:00Z"), // já passou → atrasada
          },
        ]),
      },
    } as unknown as Parameters<typeof queryComprasAtivas>[0];
    const r = await queryComprasAtivas(prisma, hoje);
    expect(r.total).toBe(2);
    expect(r.valorTotal).toBe(1500);
    expect(r.atrasadas).toBe(1);
    expect(r.linhas[0].numero).toBe("OC-0001");
    expect(r.linhas[0].diasRestantes).toBe(12);
    expect(r.linhas[0].statusPrazo).toBe("no_prazo");
    expect(r.linhas[1].statusPrazo).toBe("atrasado");
  });

  it("data prevista null → diasRestantes/statusPrazo null (sem previsão)", async () => {
    const prisma = {
      fatoCompra: {
        findMany: jest.fn().mockResolvedValue([
          {
            numero: "OC-0003",
            fornecedorNome: "Johnson",
            compradorNome: "Thiago",
            etapaNome: "Aprovado",
            vrNf: 2000,
            dataOrcamento: new Date("2026-05-14T00:00:00Z"),
            dataPrevista: null,
          },
        ]),
      },
    } as unknown as Parameters<typeof queryComprasAtivas>[0];
    const r = await queryComprasAtivas(prisma, hoje);
    expect(r.linhas[0].diasRestantes).toBeNull();
    expect(r.linhas[0].statusPrazo).toBeNull();
    expect(r.linhas[0].dataPrevista).toBeNull();
    expect(r.atrasadas).toBe(0);
  });
});

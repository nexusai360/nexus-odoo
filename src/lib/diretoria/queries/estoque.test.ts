import {
  queryIndicadoresEstoque,
  queryEstoquePorFamilia,
  queryComprasPorFornecedor,
  queryComprasAtivas,
  queryCatalogoEstoque,
  queryResumoCompras,
  queryIndicadoresAvancadosEstoque,
  queryComprasSerie,
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

describe("queryComprasSerie (A-10, série temporal)", () => {
  it("agrega NF de entrada por dia e por mês, ordenado crescente", async () => {
    const prisma = {
      fatoDfe: {
        findMany: jest.fn().mockResolvedValue([
          { dataEmissao: new Date("2026-06-22T10:00:00Z"), vrNf: 1000 },
          { dataEmissao: new Date("2026-06-22T18:00:00Z"), vrNf: 500 },
          { dataEmissao: new Date("2026-06-24T09:00:00Z"), vrNf: 2000 },
          { dataEmissao: new Date("2026-05-15T09:00:00Z"), vrNf: 800 },
          { dataEmissao: null, vrNf: 999 },
        ]),
      },
    } as unknown as Parameters<typeof queryComprasSerie>[0];
    const r = await queryComprasSerie(prisma);
    // Diária: ignora dataEmissao null; soma valor e conta notas por dia.
    expect(r.diaria).toEqual([
      { data: "2026-05-15", valor: 800, notas: 1 },
      { data: "2026-06-22", valor: 1500, notas: 2 },
      { data: "2026-06-24", valor: 2000, notas: 1 },
    ]);
    // Mensal: agrega por YYYY-MM.
    expect(r.mensal).toEqual([
      { data: "2026-05", valor: 800, notas: 1 },
      { data: "2026-06", valor: 3500, notas: 3 },
    ]);
  });

  it("retorna séries vazias quando não há notas", async () => {
    const prisma = {
      fatoDfe: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryComprasSerie>[0];
    const r = await queryComprasSerie(prisma);
    expect(r.diaria).toEqual([]);
    expect(r.mensal).toEqual([]);
  });
});

describe("queryCatalogoEstoque (A3)", () => {
  it("agrega por produto: soma qtd/valor e conta locais distintos", async () => {
    const prisma = {
      fatoEstoqueSaldo: {
        findMany: jest.fn().mockResolvedValue([
          { produtoId: 1, produtoNome: "Esteira X", familiaNome: "Cardio", marcaNome: "Matrix", localId: 10, quantidade: 2, vrSaldo: 1000 },
          { produtoId: 1, produtoNome: "Esteira X", familiaNome: "Cardio", marcaNome: "Matrix", localId: 20, quantidade: 3, vrSaldo: 1500 },
          { produtoId: 2, produtoNome: "Bike Y", familiaNome: "Cardio", marcaNome: "Johnson", localId: 10, quantidade: 1, vrSaldo: 800 },
        ]),
      },
    } as unknown as Parameters<typeof queryCatalogoEstoque>[0];
    const r = await queryCatalogoEstoque(prisma);
    expect(r.total).toBe(2);
    expect(r.valorGeral).toBe(3300);
    expect(r.linhas[0]).toEqual({
      produto: "Esteira X",
      familia: "Cardio",
      marca: "Matrix",
      quantidade: 5,
      valorTotal: 2500,
      locais: 2,
    });
    expect(r.linhas[1].produto).toBe("Bike Y");
    expect(r.linhas[1].locais).toBe(1);
  });

  it("agrupa por nome quando produtoId é null", async () => {
    const prisma = {
      fatoEstoqueSaldo: {
        findMany: jest.fn().mockResolvedValue([
          { produtoId: null, produtoNome: "Avulso", familiaNome: null, marcaNome: null, localId: null, quantidade: 1, vrSaldo: 50 },
          { produtoId: null, produtoNome: "Avulso", familiaNome: null, marcaNome: null, localId: null, quantidade: 2, vrSaldo: 100 },
        ]),
      },
    } as unknown as Parameters<typeof queryCatalogoEstoque>[0];
    const r = await queryCatalogoEstoque(prisma);
    expect(r.total).toBe(1);
    expect(r.linhas[0].quantidade).toBe(3);
    expect(r.linhas[0].valorTotal).toBe(150);
    expect(r.linhas[0].locais).toBe(0);
  });
});

describe("queryIndicadoresAvancadosEstoque (A4)", () => {
  const hoje = new Date("2026-06-28T00:00:00Z");
  it("calcula idade média, cobertura e giro", async () => {
    const prisma = {
      fatoEstoqueSaldo: { findMany: jest.fn().mockResolvedValue([
        { quantidade: 300, vrSaldo: 3000, produtoId: 1 },
        { quantidade: 300, vrSaldo: 1000, produtoId: 2 },
      ]) },
      fatoNotaFiscalItem: { findMany: jest.fn().mockResolvedValue([
        { quantidade: 30 }, { quantidade: 30 },
      ]) }, // 60 em 30 dias = 2/dia
      fatoSerial: { findMany: jest.fn().mockResolvedValue([
        { dataCompra: new Date("2026-06-18T00:00:00Z") }, // 10 dias
        { dataCompra: new Date("2026-06-08T00:00:00Z") }, // 20 dias
      ]) },
    } as unknown as Parameters<typeof queryIndicadoresAvancadosEstoque>[0];
    const r = await queryIndicadoresAvancadosEstoque(prisma, hoje);
    expect(r.idadeMediaDias).toBe(15);
    expect(r.coberturaDias).toBe(300); // 600 estoque / 2 por dia
    expect(r.giroAnual).toBe(1.2); // 60*12/600
    expect(r.valorMedioProduto).toBe(2000); // 4000/2
  });

  it("cobertura/giro null quando não há demanda/estoque", async () => {
    const prisma = {
      fatoEstoqueSaldo: { findMany: jest.fn().mockResolvedValue([]) },
      fatoNotaFiscalItem: { findMany: jest.fn().mockResolvedValue([]) },
      fatoSerial: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Parameters<typeof queryIndicadoresAvancadosEstoque>[0];
    const r = await queryIndicadoresAvancadosEstoque(prisma, hoje);
    expect(r.idadeMediaDias).toBeNull();
    expect(r.coberturaDias).toBeNull();
    expect(r.giroAnual).toBeNull();
    expect(r.valorMedioProduto).toBe(0);
  });
});

describe("queryResumoCompras (A8)", () => {
  const hoje = new Date("2026-06-28T00:00:00Z");
  it("agrega por fornecedor, soma totais e conta ativas/atrasadas", async () => {
    const prisma = {
      fatoCompra: {
        findMany: jest.fn().mockResolvedValue([
          { fornecedorNome: "Johnson", vrNf: 1000, vrPago: 400, recebida: false, dataPrevista: null },
          { fornecedorNome: "Johnson", vrNf: 500, vrPago: 0, recebida: false, dataPrevista: new Date("2026-06-01T00:00:00Z") },
          { fornecedorNome: "Rotha", vrNf: 200, vrPago: 200, recebida: true, dataPrevista: null },
        ]),
      },
    } as unknown as Parameters<typeof queryResumoCompras>[0];
    const r = await queryResumoCompras(prisma, hoje);
    expect(r.totalComprado).toBe(1700);
    expect(r.totalPago).toBe(600);
    expect(r.totalAPagar).toBe(1100);
    expect(r.comprasAtivas).toBe(2); // 2 Johnson não recebidas
    expect(r.atrasadas).toBe(1); // a 2ª Johnson, prevista vencida
    expect(r.fornecedores[0]).toEqual({ fornecedor: "Johnson", ativas: 2, comprado: 1500, pago: 400, aPagar: 1100, atrasadas: 1 });
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

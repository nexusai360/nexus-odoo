import { faturamentoPorClienteCanon } from "./faturamento-por-cliente-canon";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma(): PrismaClient {
  return {
    fatoNotaFiscalItem: {
      groupBy: jest.fn().mockResolvedValue([
        { documentoId: 100, cfopId: 1, _sum: { vrProdutos: 2000 }, _count: 2 }, // externo
        { documentoId: 200, cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 1 }, // intragrupo (pid 11)
        { documentoId: 300, cfopId: 9, _sum: { vrProdutos: 500 }, _count: 1 },  // transferencia (nao receita)
      ]),
      findMany: jest.fn().mockResolvedValue([
        { cfopId: 1, cfopNome: "5102 - Venda" },
        { cfopId: 9, cfopNome: "5152 - Transferencia" },
      ]),
    },
    fatoNotaFiscal: {
      findMany: jest.fn().mockResolvedValue([
        { odooId: 100, participanteId: 50, participanteNome: "Cliente Externo", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-03-10T00:00:00Z") },
        { odooId: 200, participanteId: 11, participanteNome: "Jds Matriz", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-04-10T00:00:00Z") },
        { odooId: 300, participanteId: 11, participanteNome: "Jds Matriz", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-04-10T00:00:00Z") },
      ]),
    },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

describe("faturamentoPorClienteCanon", () => {
  it("ranqueia clientes externos e separa o total intragrupo", async () => {
    const r = await faturamentoPorClienteCanon(mockPrisma(), {
      periodoDe: "2025-01-01",
      periodoAte: "2025-12-31",
      limit: 10,
      offset: 0,
    });
    expect(r.linhas[0].participanteNome).toBe("Cliente Externo");
    expect(r.linhas[0].valorTotal).toBe(2000);
    expect(r.linhas.some((l) => l.participanteNome === "Jds Matriz")).toBe(false);
    expect(r.totalIntragrupo).toBe(1000);
    expect(r.totalExterno).toBe(2000);
    expect(r.total).toBe(1);
    expect(r.topClienteExterno).toBe("Cliente Externo");
  });

  it("pagina os clientes externos", async () => {
    const r = await faturamentoPorClienteCanon(mockPrisma(), { limit: 0, offset: 0 });
    expect(r.linhas).toHaveLength(0);
    expect(r.total).toBe(1); // total de clientes externos distintos, independente da pagina
  });
});

// B3 Cobertura Cliente: CNPJ por linha + agrupamento por raiz.
describe("faturamentoPorClienteCanon , CNPJ (B3)", () => {
  function mockComDocs(): PrismaClient {
    const p = mockPrisma() as unknown as Record<string, { findMany?: jest.Mock; groupBy?: jest.Mock }>;
    (p.fatoNotaFiscal!.findMany as jest.Mock).mockResolvedValue([
      { odooId: 100, participanteId: 50, participanteNome: "Filial A", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2026-03-10T00:00:00Z") },
      { odooId: 200, participanteId: 51, participanteNome: "Filial B", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2026-04-10T00:00:00Z") },
      { odooId: 300, participanteId: 60, participanteNome: "Outro Cliente", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2026-04-10T00:00:00Z") },
    ]);
    (p.fatoNotaFiscalItem!.groupBy as jest.Mock).mockResolvedValue([
      { documentoId: 100, cfopId: 1, _sum: { vrProdutos: 2000 }, _count: 1 },
      { documentoId: 200, cfopId: 1, _sum: { vrProdutos: 1500 }, _count: 1 },
      { documentoId: 300, cfopId: 1, _sum: { vrProdutos: 700 }, _count: 1 },
    ]);
    (p.fatoParceiro!.findMany as jest.Mock).mockResolvedValue([
      { odooId: 50, documento: "BR-11.222.333/0001-44", documentoDigits: "11222333000144" },
      { odooId: 51, documento: "BR-11.222.333/0002-25", documentoDigits: "11222333000225" },
      { odooId: 60, documento: "BR-99.888.777/0001-66", documentoDigits: "99888777000166" },
    ]);
    return p as unknown as PrismaClient;
  }

  it("linha ganha documento (CNPJ formatado) no modo cliente", async () => {
    const r = await faturamentoPorClienteCanon(mockComDocs(), { limit: 10, offset: 0 });
    expect(r.linhas[0].documento).toBe("11.222.333/0001-44");
  });

  it("agruparPor cnpj_raiz agrega matriz+filiais pela raiz de 8 digitos", async () => {
    const r = await faturamentoPorClienteCanon(mockComDocs(), { limit: 10, offset: 0, agruparPor: "cnpj_raiz" });
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0].valorTotal).toBe(3500); // 2000+1500 da raiz 11222333
    expect(r.linhas[0].documento).toBe("11.222.333");
    expect(r.linhas[0].participanteNome).toBe("Filial A"); // nome de maior valor da raiz
  });
});

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

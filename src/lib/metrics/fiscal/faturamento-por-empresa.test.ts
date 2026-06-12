import { faturamentoPorEmpresa } from "./faturamento-por-empresa";
import type { PrismaClient } from "../../../generated/prisma/client";

// Onda humanizacao 2026-06-12: a metrica migrou para a base canonica
// (carregarItensVendaComGrupo: itens vrProdutos + ehReceita por CFOP).
// O mock segue o mesmo desenho do faturamento-por-cliente-canon.test.ts.
function mockPrisma(): PrismaClient {
  return {
    fatoNotaFiscalItem: {
      groupBy: jest.fn().mockResolvedValue([
        // empresa 8: duas notas de venda (uma externa, uma intragrupo) , ambas
        // sao RECEITA e entram no comparativo individual por empresa.
        { documentoId: 100, cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 1 },
        { documentoId: 101, cfopId: 1, _sum: { vrProdutos: 400 }, _count: 1 },
        // empresa 9: uma venda
        { documentoId: 200, cfopId: 1, _sum: { vrProdutos: 600 }, _count: 1 },
        // empresa 8: transferencia (nao-receita por CFOP) , fica FORA
        { documentoId: 102, cfopId: 9, _sum: { vrProdutos: 9999 }, _count: 1 },
        // nota sem empresa
        { documentoId: 300, cfopId: 1, _sum: { vrProdutos: 50 }, _count: 1 },
      ]),
      findMany: jest.fn().mockResolvedValue([
        { cfopId: 1, cfopNome: "5102 - Venda" },
        { cfopId: 9, cfopNome: "5152 - Transferencia" },
      ]),
    },
    fatoNotaFiscal: {
      findMany: jest.fn().mockResolvedValue([
        { odooId: 100, participanteId: 50, participanteNome: "Cliente A", empresaId: 8, empresaNome: "Jds Comércio - Filial SE", dataEmissao: new Date("2026-01-10T00:00:00Z") },
        { odooId: 101, participanteId: 51, participanteNome: "Cliente B", empresaId: 8, empresaNome: "Jds Comércio - Filial SE", dataEmissao: new Date("2026-01-11T00:00:00Z") },
        { odooId: 102, participanteId: 51, participanteNome: "Cliente B", empresaId: 8, empresaNome: "Jds Comércio - Filial SE", dataEmissao: new Date("2026-01-12T00:00:00Z") },
        { odooId: 200, participanteId: 52, participanteNome: "Cliente C", empresaId: 9, empresaNome: "Jib DF Comércio - Matriz", dataEmissao: new Date("2026-01-13T00:00:00Z") },
        { odooId: 300, participanteId: 53, participanteNome: "Cliente D", empresaId: null, empresaNome: null, dataEmissao: new Date("2026-01-14T00:00:00Z") },
      ]),
    },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

describe("faturamentoPorEmpresa", () => {
  it("agrupa receita canonica (CFOP) por empresaId, nome da NOTA, null por ultimo", async () => {
    const r = await faturamentoPorEmpresa(mockPrisma(), {
      periodoDe: "2026-01-01",
      periodoAte: "2026-01-31",
    });

    // transferencia (cfop 9) NAO conta; total = 1000+400+600+50
    expect(r.totalGrupo).toBe(2050);
    expect(r.empresasComFaturamento).toBe(2);
    expect(r.valorSemEmpresa).toBe(50);
    expect(r.totalNotasSemEmpresa).toBe(1);
    // nome vem da NOTA, nao do dim (que rotularia errado)
    expect(r.linhas[0]).toEqual({
      empresaId: 8,
      empresaNome: "Jds Comércio - Filial SE",
      totalNotas: 2,
      valor: 1400,
    });
    expect(r.linhas[r.linhas.length - 1].empresaId).toBeNull();
  });
});

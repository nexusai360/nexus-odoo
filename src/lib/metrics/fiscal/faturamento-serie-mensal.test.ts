import { faturamentoSerieMensal } from "./faturamento-serie-mensal";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma(): PrismaClient {
  return {
    fatoNotaFiscalItem: {
      groupBy: jest.fn().mockResolvedValue([
        { documentoId: 100, cfopId: 1, _sum: { vrProdutos: 2000 }, _count: 2 }, // venda externa, mes 3
        { documentoId: 200, cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 1 }, // venda intragrupo, mes 4
        { documentoId: 300, cfopId: 9, _sum: { vrProdutos: 500 }, _count: 1 },  // transferencia, mes 4
      ]),
      findMany: jest.fn().mockResolvedValue([
        { cfopId: 1, cfopNome: "5102 - Venda" },
        { cfopId: 9, cfopNome: "5152 - Transferencia" },
      ]),
    },
    fatoNotaFiscal: {
      findMany: jest.fn().mockResolvedValue([
        { odooId: 100, participanteId: 50, participanteNome: "Externo", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-03-10T00:00:00Z") },
        { odooId: 200, participanteId: 11, participanteNome: "Jds Matriz", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-04-10T00:00:00Z") },
        { odooId: 300, participanteId: 11, participanteNome: "Jds Matriz", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-04-10T00:00:00Z") },
      ]),
    },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

describe("faturamentoSerieMensal", () => {
  it("agrupa por mes separando externa de intragrupo eliminavel", async () => {
    const r = await faturamentoSerieMensal(mockPrisma(), { ano: 2025 });
    const m3 = r.serie.find((s) => s.mes === 3)!;
    const m4 = r.serie.find((s) => s.mes === 4)!;
    expect(m3.externa).toBe(2000);
    expect(m3.individual).toBe(2000);
    expect(m3.notasExternas).toBe(1);
    expect(m4.externa).toBe(0);
    expect(m4.individual).toBe(1000);
    expect(m4.intragrupoEliminavel).toBe(1000);
  });

  it("agrega os totais do ano (externa, individual, notas externas)", async () => {
    const r = await faturamentoSerieMensal(mockPrisma(), { ano: 2025 });
    expect(r.totalExternaAno).toBe(2000);
    expect(r.totalIndividualAno).toBe(3000);
    expect(r.totalNotasExternasAno).toBe(1);
    expect(r.serie).toHaveLength(12);
  });

  it("respeita mesLimite (serie ate o mes corrente)", async () => {
    const r = await faturamentoSerieMensal(mockPrisma(), { ano: 2025, mesLimite: 4 });
    expect(r.serie).toHaveLength(4);
  });
});

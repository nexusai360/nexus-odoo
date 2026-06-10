import { receitaConsolidada } from "./receita-consolidada";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma() {
  // 2 notas: 100 (intragrupo, participante 11), 200 (externo, participante 99)
  const itemGroupBy = jest.fn().mockResolvedValue([
    { documentoId: 100, cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 2 }, // venda intragrupo
    { documentoId: 200, cfopId: 1, _sum: { vrProdutos: 3000 }, _count: 3 }, // venda externa
    { documentoId: 200, cfopId: 2, _sum: { vrProdutos: 500 }, _count: 1 }, // transferencia externa (nao receita)
  ]);
  const itemFindMany = jest.fn().mockResolvedValue([
    { cfopId: 1, cfopNome: "5102 - Venda" },
    { cfopId: 2, cfopNome: "6152 - Transferencia" },
  ]);
  const notaFindMany = jest.fn().mockResolvedValue([
    { odooId: 100, empresaId: 1, empresaNome: "Emp A", participanteId: 11, participanteNome: "Grupo X 34.161.829/0001-00" },
    { odooId: 200, empresaId: 1, empresaNome: "Emp A", participanteId: 99, participanteNome: "Cliente Externo" },
  ]);
  const parceiroFindMany = jest.fn().mockResolvedValue([{ odooId: 11, documentoDigits: "34161829000100" }]);
  const prisma = {
    fatoNotaFiscalItem: { groupBy: itemGroupBy, findMany: itemFindMany },
    fatoNotaFiscal: { findMany: notaFindMany },
    fatoParceiro: { findMany: parceiroFindMany },
  } as unknown as PrismaClient;
  return prisma;
}

describe("receitaConsolidada", () => {
  it("separa receita externa de intragrupo eliminavel e fecha o invariante", async () => {
    const r = await receitaConsolidada(mockPrisma(), {});
    expect(r.receitaExterna).toBe(3000); // venda externa
    expect(r.receitaIntragrupoEliminavel).toBe(1000); // venda intragrupo
    expect(r.receitaIndividualTotal).toBe(4000);
    expect(r.receitaExterna + r.receitaIntragrupoEliminavel).toBe(r.receitaIndividualTotal);
    expect(r.intercompanyBrutoVrProdutos).toBe(1000); // todas operacoes da nota 100
    expect(r.notasIntragrupo).toBe(1);
    expect(r.notasExternas).toBe(1);
    expect(r.receitaIntragrupoEliminavel).toBeLessThanOrEqual(r.intercompanyBrutoVrProdutos);
  });
});

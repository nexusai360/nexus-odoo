import { carregarItensVendaComGrupo } from "./_itens-venda-grupo";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma(): PrismaClient {
  return {
    fatoNotaFiscalItem: {
      groupBy: jest.fn().mockResolvedValue([
        { documentoId: 100, cfopId: 1, _sum: { vrProdutos: 2000 }, _count: 2 }, // venda externa
        { documentoId: 200, cfopId: 1, _sum: { vrProdutos: 1000 }, _count: 1 }, // venda intragrupo (pid 11 = whitelist)
        { documentoId: 300, cfopId: 9, _sum: { vrProdutos: 500 }, _count: 1 },  // transferencia (nao receita), intragrupo
      ]),
      findMany: jest.fn().mockResolvedValue([
        { cfopId: 1, cfopNome: "5102 - Venda de mercadoria" },
        { cfopId: 9, cfopNome: "5152 - Transferencia de mercadoria" },
      ]),
    },
    fatoNotaFiscal: {
      findMany: jest.fn().mockResolvedValue([
        { odooId: 100, participanteId: 50, participanteNome: "Cliente Externo Ltda", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-03-10T00:00:00Z") },
        { odooId: 200, participanteId: 11, participanteNome: "Jds Matriz", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-04-10T00:00:00Z") },
        { odooId: 300, participanteId: 11, participanteNome: "Jds Matriz", empresaId: 4, empresaNome: "Jds", dataEmissao: new Date("2025-04-10T00:00:00Z") },
      ]),
    },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

describe("carregarItensVendaComGrupo", () => {
  it("retorna itens com flag intragrupo, ehReceita e mesEmissao corretos", async () => {
    const r = await carregarItensVendaComGrupo(mockPrisma(), { periodoDe: "2025-01-01", periodoAte: "2025-12-31" });
    const ext = r.itens.find((i) => i.documentoId === 100)!;
    const intraVenda = r.itens.find((i) => i.documentoId === 200)!;
    const transfer = r.itens.find((i) => i.documentoId === 300)!;
    expect(ext.intragrupo).toBe(false);
    expect(ext.ehReceita).toBe(true);
    expect(ext.mesEmissao).toBe(3);
    expect(intraVenda.intragrupo).toBe(true); // pid 11 na whitelist
    expect(intraVenda.ehReceita).toBe(true);
    expect(intraVenda.mesEmissao).toBe(4);
    expect(transfer.ehReceita).toBe(false); // transferencia nao e receita
    expect(transfer.intragrupo).toBe(true);
  });

  it("preenche marcacaoPorNota por odooId (uma entrada por nota)", async () => {
    const r = await carregarItensVendaComGrupo(mockPrisma(), { periodoDe: "2025-01-01", periodoAte: "2025-12-31" });
    expect(r.marcacaoPorNota.get(100)!.intragrupo).toBe(false);
    expect(r.marcacaoPorNota.get(200)!.intragrupo).toBe(true);
    expect(r.marcacaoPorNota.get(100)!.empresaNome).toBe("Jds");
    expect(r.marcacaoPorNota.size).toBe(3);
  });
});

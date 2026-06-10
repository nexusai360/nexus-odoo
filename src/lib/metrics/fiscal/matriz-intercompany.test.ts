import { matrizIntercompany } from "./matriz-intercompany";
import type { PrismaClient } from "../../../generated/prisma/client";

function mockPrisma() {
  const notaFindMany = jest.fn().mockResolvedValue([
    { odooId: 100, empresaId: 1, empresaNome: "Emp A", participanteId: 11, participanteNome: "Grupo B 34.161.829/0001-00", vrProdutos: 1000 },
    { odooId: 101, empresaId: 1, empresaNome: "Emp A", participanteId: 11, participanteNome: "Grupo B 34.161.829/0001-00", vrProdutos: 500 },
    { odooId: 200, empresaId: 1, empresaNome: "Emp A", participanteId: 99, participanteNome: "Cliente Externo", vrProdutos: 9999 },
  ]);
  const parceiroFindMany = jest.fn().mockResolvedValue([{ odooId: 11, documentoDigits: "34161829000100" }]);
  return {
    fatoNotaFiscal: { findMany: notaFindMany },
    fatoParceiro: { findMany: parceiroFindMany },
  } as unknown as PrismaClient;
}

describe("matrizIntercompany", () => {
  it("agrega pares vendedor x comprador apenas para notas intragrupo", async () => {
    const r = await matrizIntercompany(mockPrisma(), {});
    expect(r.linhas).toHaveLength(1); // so o par intragrupo
    expect(r.linhas[0]).toMatchObject({ vendedorNome: "Emp A", valor: 1500, totalNotas: 2 });
    expect(r.total).toBe(1500);
    expect(r.totalPares).toBe(1);
  });
});

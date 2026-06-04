// src/lib/reports/queries/fiscal-complementar.test.ts
import { queryCertificados } from "./fiscal-complementar";

describe("queryCertificados", () => {
  it("lista certificados ordenados por validade (mais próximo de vencer primeiro)", async () => {
    const mockPrisma = {
      fatoCertificado: {
        findMany: jest.fn().mockResolvedValue([
          {
            odooId: 25,
            tipo: "A1",
            numeroSerie: "72866",
            proprietario: "JMF",
            cnpjCpf: "45.424.185/0001-08",
            dataInicioValidade: new Date("2026-05-12T12:16:06"),
            dataFimValidade: new Date("2027-05-12T12:16:06"),
            dataVencimentoUtil: new Date("2027-05-12T00:00:00"),
            nomeArquivo: "JMF.pfx",
            atualizadoEm: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as Parameters<typeof queryCertificados>[0];

    const result = await queryCertificados(mockPrisma);
    expect(result.total).toBe(1);
    expect(result.linhas[0]?.proprietario).toBe("JMF");
    expect(result.linhas[0]?.dataFimValidade).toBe("2027-05-12");
    const call = (mockPrisma.fatoCertificado.findMany as jest.Mock).mock.calls[0][0];
    // Alavanca 2b: orderBy estavel com desempate por odooId.
    expect(call.orderBy).toEqual([{ dataFimValidade: "asc" }, { odooId: "asc" }]);
  });

  it("tolera datas nulas", async () => {
    const mockPrisma = {
      fatoCertificado: {
        findMany: jest.fn().mockResolvedValue([
          {
            odooId: 1, tipo: null, numeroSerie: null, proprietario: null,
            cnpjCpf: null, dataInicioValidade: null, dataFimValidade: null,
            dataVencimentoUtil: null, nomeArquivo: null, atualizadoEm: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as Parameters<typeof queryCertificados>[0];

    const result = await queryCertificados(mockPrisma);
    expect(result.linhas[0]?.dataFimValidade).toBeNull();
  });
});

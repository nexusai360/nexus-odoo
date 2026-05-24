// src/lib/reports/queries/referencia.test.ts
import { queryReferenciaBuscar } from "./referencia";

describe("queryReferenciaBuscar", () => {
  it("filtra por tabela e busca termo em codigo/descricao", async () => {
    const mockPrisma = {
      fatoReferencia: {
        findMany: jest.fn().mockResolvedValue([
          { tabela: "cfop", codigo: "5102", descricao: "Venda de mercadoria" },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as Parameters<typeof queryReferenciaBuscar>[0];

    const r = await queryReferenciaBuscar(mockPrisma, { tabela: "cfop", termo: "5102" });
    expect(r.total).toBe(1);
    expect(r.linhas[0]?.codigo).toBe("5102");
    expect(r.truncado).toBe(false);
    const call = (mockPrisma.fatoReferencia.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.tabela).toBe("cfop");
    expect(call.where.OR).toHaveLength(2); // codigo + descricao
  });

  it("sem termo, lista a tabela inteira (sem OR)", async () => {
    const mockPrisma = {
      fatoReferencia: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as Parameters<typeof queryReferenciaBuscar>[0];

    await queryReferenciaBuscar(mockPrisma, { tabela: "estado" });
    const call = (mockPrisma.fatoReferencia.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.tabela).toBe("estado");
    expect(call.where.OR).toBeUndefined();
  });
});

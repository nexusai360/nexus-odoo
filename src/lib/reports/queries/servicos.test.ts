// src/lib/reports/queries/servicos.test.ts

import { queryContarServicos } from "./servicos";

describe("queryContarServicos", () => {
  it("retorna o total de serviços do catálogo via count", async () => {
    const mockPrisma = {
      fatoServico: {
        count: jest.fn().mockResolvedValue(336),
      },
    } as unknown as Parameters<typeof queryContarServicos>[0];

    const result = await queryContarServicos(mockPrisma);
    expect(result.total).toBe(336);
    expect(mockPrisma.fatoServico.count).toHaveBeenCalledTimes(1);
  });
});

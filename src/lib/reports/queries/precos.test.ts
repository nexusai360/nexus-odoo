// src/lib/reports/queries/precos.test.ts

import { queryContarRegrasPreco } from "./precos";

describe("queryContarRegrasPreco", () => {
  it("retorna o total de regras de preço via count", async () => {
    const mockPrisma = {
      fatoPreco: {
        count: jest.fn().mockResolvedValue(1280),
      },
    } as unknown as Parameters<typeof queryContarRegrasPreco>[0];

    const result = await queryContarRegrasPreco(mockPrisma);
    expect(result.total).toBe(1280);
    expect(mockPrisma.fatoPreco.count).toHaveBeenCalledTimes(1);
  });
});

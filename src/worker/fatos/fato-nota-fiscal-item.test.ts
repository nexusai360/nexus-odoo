// src/worker/fatos/fato-nota-fiscal-item.test.ts

import { chunk, mapNotaFiscalItemRow, CHUNK_SIZE } from "./fato-nota-fiscal-item";

// ─── chunk ─────────────────────────────────────────────────────────────────────

describe("chunk", () => {
  it("fatia array de 12 em size=5 → 3 chunks [5,5,2]", () => {
    const arr = Array.from({ length: 12 }, (_, i) => i);
    const result = chunk(arr, 5);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(5);
    expect(result[1]).toHaveLength(5);
    expect(result[2]).toHaveLength(2);
  });

  it("array vazio → array vazio", () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it("array menor que size → 1 chunk com todos os elementos", () => {
    const arr = [1, 2, 3];
    const result = chunk(arr, 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([1, 2, 3]);
  });

  it("array exatamente igual a size → 1 chunk", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = chunk(arr, 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(5);
  });
});

// ─── mapNotaFiscalItemRow ──────────────────────────────────────────────────────

describe("mapNotaFiscalItemRow", () => {
  const notaInfoMap = new Map([
    [42, { dataEmissao: new Date("2024-01-15T00:00:00"), entradaSaida: "1" }],
  ]);

  const baseRaw: Record<string, unknown> = {
    id: 99,
    documento_id: [42, "NF-001"],
    produto_id: [7, "Esteira Ergométrica"],
    cfop_id: [3, "5102"],
    quantidade: "2.000",
    vr_unitario: "500.00",
    vr_produtos: "1000.00",
    vr_nf: "1000.00",
    vr_icms_proprio: "120.00",
    vr_pis_proprio: "16.50",
    vr_cofins_proprio: "76.00",
  };

  it("mapeia odooId e relações corretamente", () => {
    const row = mapNotaFiscalItemRow(baseRaw, notaInfoMap);
    expect(row.odooId).toBe(99);
    expect(row.documentoId).toBe(42);
    expect(row.produtoId).toBe(7);
    expect(row.produtoNome).toBe("Esteira Ergométrica");
    expect(row.cfopId).toBe(3);
    expect(row.cfopNome).toBe("5102");
  });

  it("mapeia valores monetários como Number", () => {
    const row = mapNotaFiscalItemRow(baseRaw, notaInfoMap);
    expect(row.quantidade).toBe(2);
    expect(row.vrUnitario).toBe(500);
    expect(row.vrProdutos).toBe(1000);
    expect(row.vrNf).toBe(1000);
    expect(row.vrIcmsProprio).toBe(120);
    expect(row.vrPisProprio).toBe(16.5);
    expect(row.vrCofinsProprio).toBe(76);
  });

  it("desnormaliza dataEmissao e entradaSaida da nota-mãe via notaInfoMap", () => {
    const row = mapNotaFiscalItemRow(baseRaw, notaInfoMap);
    expect(row.dataEmissao).toEqual(new Date("2024-01-15T00:00:00"));
    expect(row.entradaSaida).toBe("1");
  });

  it("dataEmissao e entradaSaida null quando documentoId não está no map", () => {
    const row = mapNotaFiscalItemRow({ ...baseRaw, documento_id: [999, "NF-X"] }, notaInfoMap);
    expect(row.dataEmissao).toBeNull();
    expect(row.entradaSaida).toBeNull();
  });

  it("valores monetários default 0 quando ausentes", () => {
    const row = mapNotaFiscalItemRow({ id: 1 }, notaInfoMap);
    expect(row.quantidade).toBe(0);
    expect(row.vrNf).toBe(0);
  });

  it("não produz atualizadoEm", () => {
    const row = mapNotaFiscalItemRow(baseRaw, notaInfoMap);
    expect("atualizadoEm" in row).toBe(false);
  });
});

// ─── rebuildFatoNotaFiscalItem ─────────────────────────────────────────────────
//
// O builder usa batch transactions (sem $transaction interativa global):
//   deleteMany → loop cursor (prisma.rawSpedDocumentoItem.findMany, take:5000) →
//   createMany por chunk → markFatoBuilt.
// Os mocks espelham essa estrutura: rawSpedDocumentoItem e fatoNotaFiscalItem
// ficam todos no prisma mock flat (sem mockTx separado).

describe("rebuildFatoNotaFiscalItem", () => {
  /**
   * Cria um mock de PrismaClient para o builder de streaming por cursor.
   * rawSpedDocumentoItem.findMany simula paginação por cursor (take, cursor, skip:1).
   * Retorna o mock object (não tipado como PrismaClient) para acesso direto às fns.
   */
  function makeMocks(
    rawNotas: { data: Record<string, unknown> }[],
    allItems: { odooId: number; data: Record<string, unknown> }[],
  ) {
    const paginateFn = jest.fn().mockImplementation(
      (args: { take?: number; cursor?: { odooId: number }; skip?: number }) => {
        const take = args.take ?? allItems.length;
        let startIdx = 0;
        if (args.cursor) {
          const cursorIdx = allItems.findIndex((i) => i.odooId === args.cursor!.odooId);
          startIdx = cursorIdx + (args.skip ?? 0);
        }
        return Promise.resolve(allItems.slice(startIdx, startIdx + take));
      },
    );

    const mocks = {
      rawSpedDocumentoFindMany: jest.fn().mockResolvedValue(rawNotas),
      rawSpedDocumentoItemFindMany: paginateFn,
      fatoNotaFiscalItemDeleteMany: jest.fn().mockResolvedValue({}),
      fatoNotaFiscalItemCreateMany: jest.fn().mockResolvedValue({}),
      fatoBuildStateUpsert: jest.fn().mockResolvedValue({}),
    };

    const mockPrisma = {
      rawSpedDocumento: { findMany: mocks.rawSpedDocumentoFindMany },
      rawSpedDocumentoItem: { findMany: mocks.rawSpedDocumentoItemFindMany },
      fatoNotaFiscalItem: {
        deleteMany: mocks.fatoNotaFiscalItemDeleteMany,
        createMany: mocks.fatoNotaFiscalItemCreateMany,
      },
      fatoBuildState: { upsert: mocks.fatoBuildStateUpsert },
    };

    return { mocks, mockPrisma };
  }

  it("streaming: deleteMany, 1 createMany e markFatoBuilt para 12 itens (1 página)", async () => {
    const { rebuildFatoNotaFiscalItem } = await import("./fato-nota-fiscal-item");

    const allItems = Array.from({ length: 12 }, (_, i) => ({
      odooId: i + 1,
      data: { id: i + 1, documento_id: [1, "NF-001"] as unknown },
    }));

    const { mocks, mockPrisma } = makeMocks(
      [{ data: { id: 1, data_emissao: "2024-01-15", entrada_saida: "1" } }],
      allItems,
    );

    const count = await rebuildFatoNotaFiscalItem(
      mockPrisma as unknown as Parameters<typeof rebuildFatoNotaFiscalItem>[0],
    );
    expect(count).toBe(12);
    expect(mocks.fatoNotaFiscalItemDeleteMany).toHaveBeenCalledWith({});
    // 12 itens < CHUNK_SIZE (5000) → 1 página → createMany 1 vez
    expect(mocks.fatoNotaFiscalItemCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.fatoBuildStateUpsert).toHaveBeenCalled();
  });

  it("streaming multi-página: 2*CHUNK_SIZE+7 itens → createMany chamado 3 vezes", async () => {
    const { rebuildFatoNotaFiscalItem } = await import("./fato-nota-fiscal-item");

    const totalItems = CHUNK_SIZE * 2 + 7;
    const allItems = Array.from({ length: totalItems }, (_, i) => ({
      odooId: i + 1,
      data: { id: i + 1, documento_id: null as unknown },
    }));

    const { mocks, mockPrisma } = makeMocks([], allItems);

    const count = await rebuildFatoNotaFiscalItem(
      mockPrisma as unknown as Parameters<typeof rebuildFatoNotaFiscalItem>[0],
    );
    expect(count).toBe(totalItems);
    // 3 páginas: CHUNK_SIZE + CHUNK_SIZE + 7
    expect(mocks.fatoNotaFiscalItemCreateMany).toHaveBeenCalledTimes(3);
    expect(mocks.fatoBuildStateUpsert).toHaveBeenCalled();
  });

  it("sem dados → nenhum createMany; deleteMany e markFatoBuilt rodam", async () => {
    const { rebuildFatoNotaFiscalItem } = await import("./fato-nota-fiscal-item");

    const { mocks, mockPrisma } = makeMocks([], []);

    const count = await rebuildFatoNotaFiscalItem(
      mockPrisma as unknown as Parameters<typeof rebuildFatoNotaFiscalItem>[0],
    );
    expect(count).toBe(0);
    expect(mocks.fatoNotaFiscalItemCreateMany).not.toHaveBeenCalled();
    expect(mocks.fatoNotaFiscalItemDeleteMany).toHaveBeenCalledWith({});
    expect(mocks.fatoBuildStateUpsert).toHaveBeenCalled();
  });

  it("exceção em createMany propaga e markFatoBuilt não roda", async () => {
    const { rebuildFatoNotaFiscalItem } = await import("./fato-nota-fiscal-item");

    let markFatoBuiltCalled = false;
    const mockPrisma = {
      rawSpedDocumento: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 1, data_emissao: "2024-01-15", entrada_saida: "1" } },
        ]),
      },
      rawSpedDocumentoItem: {
        findMany: jest.fn().mockResolvedValue([{ odooId: 1, data: { id: 1 } }]),
      },
      fatoNotaFiscalItem: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockRejectedValue(new Error("DB error simulado")),
      },
      fatoBuildState: {
        upsert: jest.fn().mockImplementation(() => {
          markFatoBuiltCalled = true;
          return Promise.resolve({});
        }),
      },
    };

    await expect(
      rebuildFatoNotaFiscalItem(
        mockPrisma as unknown as Parameters<typeof rebuildFatoNotaFiscalItem>[0],
      ),
    ).rejects.toThrow("DB error simulado");
    expect(markFatoBuiltCalled).toBe(false);
  });
});

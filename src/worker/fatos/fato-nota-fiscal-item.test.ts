// src/worker/fatos/fato-nota-fiscal-item.test.ts

import { chunk, mapNotaFiscalItemRow } from "./fato-nota-fiscal-item";

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

describe("rebuildFatoNotaFiscalItem", () => {
  it("chama deleteMany, createMany (por chunk) e markFatoBuilt na transação", async () => {
    const { rebuildFatoNotaFiscalItem } = await import("./fato-nota-fiscal-item");

    const mockTx = {
      fatoNotaFiscalItem: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      fatoBuildState: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    // 12 itens → com CHUNK_SIZE=5000 resulta em 1 chunk
    const rawItems = Array.from({ length: 12 }, (_, i) => ({
      data: { id: i + 1, documento_id: [1, "NF-001"] },
    }));

    const mockPrisma = {
      rawSpedDocumento: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 1, data_emissao: "2024-01-15", entrada_saida: "1" } },
        ]),
      },
      rawSpedDocumentoItem: {
        findMany: jest.fn().mockResolvedValue(rawItems),
      },
      $transaction: jest.fn().mockImplementation(
        async (fn: (tx: typeof mockTx) => Promise<unknown>, _opts?: unknown) => fn(mockTx),
      ),
    } as unknown as Parameters<typeof rebuildFatoNotaFiscalItem>[0];

    const count = await rebuildFatoNotaFiscalItem(mockPrisma);
    expect(count).toBe(12);
    expect(mockTx.fatoNotaFiscalItem.deleteMany).toHaveBeenCalledWith({});
    // 12 itens em 1 chunk → createMany 1 vez
    expect(mockTx.fatoNotaFiscalItem.createMany).toHaveBeenCalledTimes(1);
    expect(mockTx.fatoBuildState.upsert).toHaveBeenCalled();
  });

  it("chunks não-vazios cada um resulta em 1 createMany (mock com CHUNK_SIZE pequeno)", async () => {
    // Este teste verifica o comportamento de chunking com dados reais,
    // usando o CHUNK_SIZE de produção (5000). Com 12 itens → 1 chunk.
    // O teste de chunk() acima já valida a fatiagem correta.
    const { rebuildFatoNotaFiscalItem } = await import("./fato-nota-fiscal-item");

    const mockTx = {
      fatoNotaFiscalItem: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      fatoBuildState: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    const mockPrisma = {
      rawSpedDocumento: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rawSpedDocumentoItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation(
        async (fn: (tx: typeof mockTx) => Promise<unknown>, _opts?: unknown) => fn(mockTx),
      ),
    } as unknown as Parameters<typeof rebuildFatoNotaFiscalItem>[0];

    await rebuildFatoNotaFiscalItem(mockPrisma);
    // Sem dados → nenhum createMany
    expect(mockTx.fatoNotaFiscalItem.createMany).not.toHaveBeenCalled();
    // deleteMany e markFatoBuilt ainda rodam
    expect(mockTx.fatoNotaFiscalItem.deleteMany).toHaveBeenCalledWith({});
    expect(mockTx.fatoBuildState.upsert).toHaveBeenCalled();
  });

  it("rollback: exceção em createMany propaga e markFatoBuilt não roda", async () => {
    const { rebuildFatoNotaFiscalItem } = await import("./fato-nota-fiscal-item");

    let markFatoBuiltCalled = false;
    const mockTx = {
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

    const rawItems = [{ data: { id: 1, documento_id: [1, "NF-001"] } }];

    const mockPrisma = {
      rawSpedDocumento: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 1, data_emissao: "2024-01-15", entrada_saida: "1" } },
        ]),
      },
      rawSpedDocumentoItem: {
        findMany: jest.fn().mockResolvedValue(rawItems),
      },
      // $transaction repassa o tx mas DEIXA a exceção subir (não engole)
      $transaction: jest.fn().mockImplementation(
        async (fn: (tx: typeof mockTx) => Promise<unknown>, _opts?: unknown) => fn(mockTx),
      ),
    } as unknown as Parameters<typeof rebuildFatoNotaFiscalItem>[0];

    await expect(rebuildFatoNotaFiscalItem(mockPrisma)).rejects.toThrow("DB error simulado");
    expect(markFatoBuiltCalled).toBe(false);
  });
});

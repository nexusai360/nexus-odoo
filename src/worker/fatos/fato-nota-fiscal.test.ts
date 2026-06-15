// src/worker/fatos/fato-nota-fiscal.test.ts
import { derivarTipoMovimento, mapNotaFiscalRow } from "./fato-nota-fiscal";

describe("derivarTipoMovimento", () => {
  it("\"1\" → \"saida\"", () => {
    expect(derivarTipoMovimento("1")).toBe("saida");
  });

  it("\"0\" → \"entrada\"", () => {
    expect(derivarTipoMovimento("0")).toBe("entrada");
  });

  it("outro valor → \"outro\"", () => {
    expect(derivarTipoMovimento("2")).toBe("outro");
    expect(derivarTipoMovimento("")).toBe("outro");
  });

  it("null → \"outro\"", () => {
    expect(derivarTipoMovimento(null as unknown as string)).toBe("outro");
  });

  it("undefined → \"outro\"", () => {
    expect(derivarTipoMovimento(undefined as unknown as string)).toBe("outro");
  });
});

describe("mapNotaFiscalRow", () => {
  const baseRaw: Record<string, unknown> = {
    id: 42,
    numero: "001",
    serie: "1",
    modelo: "55",
    situacao_nfe: "autorizada",
    finalidade_nfe: "normal",
    chave: "35240112345678000199550010000000421000000042",
    entrada_saida: "1",
    participante_id: [10, "Empresa Teste"],
    natureza_operacao_id: [5, "Venda de Mercadoria"],
    empresa_id: [1, "Matrix Fitness"],
    data_emissao: "2024-01-15",
    data_entrada_saida: "2024-01-15",
    data_autorizacao: "2024-01-15",
    vr_nf: "1500.00",
    vr_produtos: "1400.00",
    vr_fatura: "1500.00",
    vr_ibpt: "200.00",
    vr_icms_proprio: "120.00",
    vr_desconto: "0.00",
  };

  it("mapeia campos escalares corretamente", () => {
    const row = mapNotaFiscalRow(baseRaw);
    expect(row.odooId).toBe(42);
    expect(row.numero).toBe("001");
    expect(row.serie).toBe("1");
    expect(row.modelo).toBe("55");
    expect(row.situacaoNfe).toBe("autorizada");
    expect(row.finalidadeNfe).toBe("normal");
    expect(row.chave).toBe("35240112345678000199550010000000421000000042");
    expect(row.entradaSaida).toBe("1");
  });

  it("tipoMovimento é \"saida\" para entrada_saida=\"1\"", () => {
    const row = mapNotaFiscalRow(baseRaw);
    expect(row.tipoMovimento).toBe("saida");
  });

  it("tipoMovimento é \"entrada\" para entrada_saida=\"0\"", () => {
    const row = mapNotaFiscalRow({ ...baseRaw, entrada_saida: "0" });
    expect(row.tipoMovimento).toBe("entrada");
  });

  it("tipoMovimento é \"outro\" para valor não mapeado", () => {
    const row = mapNotaFiscalRow({ ...baseRaw, entrada_saida: "X" });
    expect(row.tipoMovimento).toBe("outro");
  });

  it("tipoMovimento nunca é null", () => {
    const row = mapNotaFiscalRow({ ...baseRaw, entrada_saida: null });
    expect(row.tipoMovimento).not.toBeNull();
    expect(row.tipoMovimento).toBe("outro");
  });

  it("mapeia relações M2O corretamente", () => {
    const row = mapNotaFiscalRow(baseRaw);
    expect(row.participanteId).toBe(10);
    expect(row.participanteNome).toBe("Empresa Teste");
    expect(row.naturezaOperacaoId).toBe(5);
    expect(row.naturezaOperacaoNome).toBe("Venda de Mercadoria");
    expect(row.empresaId).toBe(1);
    expect(row.empresaNome).toBe("Matrix Fitness");
  });

  it("mapeia datas com sufixo T00:00:00", () => {
    const row = mapNotaFiscalRow(baseRaw);
    expect(row.dataEmissao).toEqual(new Date("2024-01-15T00:00:00Z"));
    expect(row.dataEntradaSaida).toEqual(new Date("2024-01-15T00:00:00Z"));
    expect(row.dataAutorizacao).toEqual(new Date("2024-01-15T00:00:00Z"));
  });

  it("datas null quando campo ausente", () => {
    const row = mapNotaFiscalRow({ ...baseRaw, data_emissao: null, data_entrada_saida: false, data_autorizacao: undefined });
    expect(row.dataEmissao).toBeNull();
    expect(row.dataEntradaSaida).toBeNull();
    expect(row.dataAutorizacao).toBeNull();
  });

  it("valores monetários convertidos para number", () => {
    const row = mapNotaFiscalRow(baseRaw);
    expect(row.vrNf).toBe(1500);
    expect(row.vrProdutos).toBe(1400);
    expect(row.vrIbpt).toBe(200);
    expect(row.vrIcmsProprio).toBe(120);
    expect(row.vrDesconto).toBe(0);
  });

  it("valores monetários default para 0 quando ausentes", () => {
    const row = mapNotaFiscalRow({ id: 1 });
    expect(row.vrNf).toBe(0);
    expect(row.vrProdutos).toBe(0);
  });

  it("não produz atualizadoEm", () => {
    const row = mapNotaFiscalRow(baseRaw);
    expect("atualizadoEm" in row).toBe(false);
  });
});

describe("rebuildFatoNotaFiscal", () => {
  it("chama deleteMany, createMany e markFatoBuilt dentro de $transaction", async () => {
    const { rebuildFatoNotaFiscal } = await import("./fato-nota-fiscal");
    const mockTx = {
      fatoNotaFiscal: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      fatoBuildState: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const mockPrisma = {
      rawSpedDocumento: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 1, entrada_saida: "1", numero: "001", vr_nf: "100.00" } },
        ]),
      },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    } as unknown as Parameters<typeof rebuildFatoNotaFiscal>[0];

    const count = await rebuildFatoNotaFiscal(mockPrisma);
    expect(count).toBe(1);
    expect(mockTx.fatoNotaFiscal.deleteMany).toHaveBeenCalledWith({});
    expect(mockTx.fatoNotaFiscal.createMany).toHaveBeenCalledTimes(1);
    expect(mockTx.fatoBuildState.upsert).toHaveBeenCalled();
  });

  it("não chama createMany quando não há dados (guard mapped.length)", async () => {
    const { rebuildFatoNotaFiscal } = await import("./fato-nota-fiscal");
    const mockTx = {
      fatoNotaFiscal: {
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
      $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    } as unknown as Parameters<typeof rebuildFatoNotaFiscal>[0];

    await rebuildFatoNotaFiscal(mockPrisma);
    expect(mockTx.fatoNotaFiscal.createMany).not.toHaveBeenCalled();
  });
});

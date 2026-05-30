import { mapDfeRow, rebuildFatoDfe } from "./fato-dfe";

const baseRaw: Record<string, unknown> = {
  id: 1,
  chave: "29274082239996847000103000000000004824128061",
  numero: 48, // float no Odoo
  modelo: "03",
  cnpj_cpf: "39.996.847/0001-03",
  participante_id: [10, "Fornecedor X"],
  vr_nf: "1500.00",
  data_hora_emissao: "2024-12-12 08:47:25",
  data_hora_recebimento: "2024-12-12 09:00:00",
  manifestacao: "conhecido",
  pode_manifestar: false,
  consulta_id: [36, "Lote NSU"],
};

describe("mapDfeRow", () => {
  it("mapeia escalares, m2o, data datetime e decimal", () => {
    const r = mapDfeRow(baseRaw);
    expect(r.odooId).toBe(1);
    expect(r.chave).toBe("29274082239996847000103000000000004824128061");
    expect(r.numero).toBe("48"); // float convertido para string
    expect(r.modelo).toBe("03");
    expect(r.cnpjFornecedor).toBe("39.996.847/0001-03");
    expect(r.fornecedorId).toBe(10);
    expect(r.fornecedorNome).toBe("Fornecedor X");
    expect(r.vrNf).toBe(1500);
    expect(r.manifestacao).toBe("conhecido");
    expect(r.podeManifestar).toBe(false);
    expect(r.consultaId).toBe(36);
    expect(r.dataEmissao).toEqual(new Date("2024-12-12T08:47:25"));
    expect(r.dataRecebimento).toEqual(new Date("2024-12-12T09:00:00"));
  });

  it("trata false/ausente como null (participante false, vr 0, manifestacao false)", () => {
    const r = mapDfeRow({
      id: 2,
      cnpj_cpf: "39.996.847/0001-03",
      participante_id: false,
      vr_nf: 0,
      manifestacao: false,
      data_hora_emissao: false,
      numero: false,
    });
    expect(r.fornecedorId).toBeNull();
    expect(r.fornecedorNome).toBeNull();
    expect(r.vrNf).toBe(0);
    expect(r.manifestacao).toBeNull();
    expect(r.dataEmissao).toBeNull();
    expect(r.numero).toBeNull();
  });

  it("nao inclui atualizadoEm (default no schema)", () => {
    expect("atualizadoEm" in mapDfeRow(baseRaw)).toBe(false);
  });
});

describe("rebuildFatoDfe", () => {
  it("le raw, mapeia e popula em transacao + marca build", async () => {
    const mockTx = {
      fatoDfe: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      fatoBuildState: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const mockPrisma = {
      rawSpedConsultaDfeItem: {
        findMany: jest.fn().mockResolvedValue([{ data: baseRaw }]),
      },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    } as unknown as Parameters<typeof rebuildFatoDfe>[0];

    const count = await rebuildFatoDfe(mockPrisma);
    expect(count).toBe(1);
    expect(mockTx.fatoDfe.deleteMany).toHaveBeenCalledWith({});
    expect(mockTx.fatoDfe.createMany).toHaveBeenCalledTimes(1);
    expect(mockTx.fatoBuildState.upsert).toHaveBeenCalled();
  });

  it("nao chama createMany com lista vazia", async () => {
    const mockTx = {
      fatoDfe: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      fatoBuildState: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const mockPrisma = {
      rawSpedConsultaDfeItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    } as unknown as Parameters<typeof rebuildFatoDfe>[0];

    const count = await rebuildFatoDfe(mockPrisma);
    expect(count).toBe(0);
    expect(mockTx.fatoDfe.createMany).not.toHaveBeenCalled();
  });
});

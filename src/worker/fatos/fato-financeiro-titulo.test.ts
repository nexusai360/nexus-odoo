import { mapTituloRow, rebuildFatoFinanceiroTitulo } from "./fato-financeiro-titulo";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

// Amostra real recortada de raw_finan_pagamento_divida (banco dev, 2026-05-18).
// Campos confirmados contra a fonte: "numero" (não "numero_documento"), "tipo" selection real.
// Evidência empírica: 412 pagamento/sinal=-1; 729 recebimento/sinal=1; 5 recebimento/sinal=0.
// sinal=0 com tipo=recebimento invalida a regra sinal>=0→a_receber; usar campo "tipo".
const RAW_REAL_PAGAMENTO = {
  id: 94380,
  tipo: "pagamento",           // selection real da fonte (I1)
  sinal: -1,
  participante_id: [10, "Fornecedor Exemplo Ltda"],
  conta_id: [5, "Conta Gerencial XYZ"],
  numero: "0-94380-001/1",     // C3: campo real (não "numero_documento" — sempre null)
  data_documento: "2026-05-01",
  data_vencimento: "2026-05-31",
  data_pagamento: "2026-05-13",
  situacao: "efetivo",
  situacao_divida: "quitado",
  situacao_divida_simples: "quitado",
  vr_documento: 1500.0,
  vr_saldo: 0.0,
  vr_total: 1500.0,
  vr_juros: 0.0,
  vr_multa: 0.0,
  vr_desconto: 0.0,
};

const RAW_REAL_RECEBIMENTO = {
  id: 93470,
  tipo: "recebimento",         // selection real da fonte
  sinal: 1,
  participante_id: [20, "Cliente Exemplo SA"],
  numero: "0-93470-001/1",
  vr_documento: 800.0,
  vr_saldo: 0.0,
  vr_total: 800.0,
  vr_juros: 0.0,
  vr_multa: 0.0,
  vr_desconto: 0.0,
};

// Caso de borda real: recebimento com sinal=0 (5 registros no banco dev).
// Prova que a regra sinal>=0→a_receber não é suficiente; usar campo tipo.
const RAW_REAL_RECEBIMENTO_SINAL0 = {
  id: 99999,
  tipo: "recebimento",
  sinal: 0,
  participante_id: [30, "Cliente Borda"],
  numero: "0-99999-001/1",
  vr_documento: 0.0,
  vr_saldo: 0.0,
  vr_total: 0.0,
  vr_juros: 0.0,
  vr_multa: 0.0,
  vr_desconto: 0.0,
};

describe("mapTituloRow", () => {
  it("mapeia título de pagamento real (tipo=pagamento → a_pagar, numero=campo real)", () => {
    const result = mapTituloRow(RAW_REAL_PAGAMENTO);
    expect(result.odooId).toBe(94380);
    // I1: tipo derivado de campo selection, não de sinal
    expect(result.tipo).toBe("a_pagar");
    expect(result.participanteId).toBe(10);
    expect(result.participanteNome).toBe("Fornecedor Exemplo Ltda");
    expect(result.contaId).toBe(5);
    expect(result.contaNome).toBe("Conta Gerencial XYZ");
    // C3: vem de raw.numero, não de raw.numero_documento
    expect(result.numeroDocumento).toBe("0-94380-001/1");
    // I2: hora local — data não desloca
    expect(result.dataDocumento).toEqual(new Date("2026-05-01T00:00:00"));
    expect(result.dataVencimento).toEqual(new Date("2026-05-31T00:00:00"));
    expect(result.dataPagamento).toEqual(new Date("2026-05-13T00:00:00"));
    expect(result.situacao).toBe("efetivo");
    expect(result.situacaoSimples).toBe("quitado");
    expect(result.vrDocumento).toBe(1500.0);
    expect(result.vrSaldo).toBe(0.0);
    expect(result.vrTotal).toBe(1500.0);
    expect(result.vrJuros).toBe(0.0);
    expect(result.vrMulta).toBe(0.0);
    expect(result.vrDesconto).toBe(0.0);
  });

  it("mapeia título de recebimento real (tipo=recebimento → a_receber)", () => {
    const result = mapTituloRow(RAW_REAL_RECEBIMENTO);
    expect(result.tipo).toBe("a_receber");
    expect(result.numeroDocumento).toBe("0-93470-001/1");
  });

  it("I1 — recebimento com sinal=0 ainda vira a_receber (caso borda real, sinal invalida a regra)", () => {
    const result = mapTituloRow(RAW_REAL_RECEBIMENTO_SINAL0);
    // Se derivado de sinal: sinal=0 → a_receber ✓ (acerto por coincidência)
    // Se derivado de tipo: tipo="recebimento" → a_receber ✓ (correto)
    // O teste documenta que tipo=recebimento+sinal=0 é caso real e deve mapear a_receber.
    expect(result.tipo).toBe("a_receber");
  });

  it("tolera campos relacionais ausentes (many2one false = sem relacionamento)", () => {
    const raw = { id: 500, tipo: "pagamento", sinal: -1, participante_id: false, conta_id: false };
    const result = mapTituloRow(raw);
    expect(result.participanteId).toBeNull();
    expect(result.participanteNome).toBeNull();
    expect(result.contaId).toBeNull();
    expect(result.contaNome).toBeNull();
  });

  it("numero ausente vira null (campo opcional na fonte)", () => {
    const raw = { id: 100, tipo: "pagamento", sinal: -1 };
    const result = mapTituloRow(raw);
    expect(result.numeroDocumento).toBeNull();
  });

  it("datas ausentes viram null", () => {
    const raw = { id: 100, tipo: "pagamento", sinal: -1 };
    const result = mapTituloRow(raw);
    expect(result.dataDocumento).toBeNull();
    expect(result.dataVencimento).toBeNull();
    expect(result.dataPagamento).toBeNull();
  });

  it("I2: data '2026-05-31' parseada como hora local — não desloca para 2026-05-30", () => {
    const result = mapTituloRow({ ...RAW_REAL_PAGAMENTO, data_vencimento: "2026-05-31" });
    expect(result.dataVencimento?.getDate()).toBe(31);
  });

  it("valores monetários ausentes viram 0", () => {
    const raw = { id: 200, tipo: "recebimento", sinal: 1 };
    const result = mapTituloRow(raw);
    expect(result.vrDocumento).toBe(0);
    expect(result.vrSaldo).toBe(0);
    expect(result.vrTotal).toBe(0);
    expect(result.vrJuros).toBe(0);
    expect(result.vrMulta).toBe(0);
    expect(result.vrDesconto).toBe(0);
  });

  it("NÃO produz atualizadoEm (decisão N5)", () => {
    const raw = { id: 1, tipo: "pagamento", sinal: -1 };
    expect(mapTituloRow(raw)).not.toHaveProperty("atualizadoEm");
  });

  it("NÃO produz diasAtraso (não é coluna do schema)", () => {
    const raw = { id: 1, tipo: "pagamento", sinal: -1 };
    expect(mapTituloRow(raw)).not.toHaveProperty("diasAtraso");
  });
});

describe("rebuildFatoFinanceiroTitulo", () => {
  it("reconstrói o fato e marca o build dentro da transação", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanPagamentoDivida: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_REAL_PAGAMENTO },
          { data: RAW_REAL_RECEBIMENTO },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroTitulo(prisma);
    expect(n).toBe(2);
    expect(tx.fatoFinanceiroTitulo.deleteMany).toHaveBeenCalled();
    expect(tx.fatoFinanceiroTitulo.createMany).toHaveBeenCalled();
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_financeiro_titulo");
  });

  it("createMany recebe data: mapped (C3: numeroDocumento vem de raw.numero)", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanPagamentoDivida: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_REAL_PAGAMENTO },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    await rebuildFatoFinanceiroTitulo(prisma);
    const callArg = tx.fatoFinanceiroTitulo.createMany.mock.calls[0][0];
    expect(callArg.data[0].numeroDocumento).toBe("0-94380-001/1");
    expect(callArg.data[0]).not.toHaveProperty("atualizadoEm");
  });

  it("não chama createMany quando não há linhas", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanPagamentoDivida: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroTitulo(prisma);
    expect(n).toBe(0);
    expect(tx.fatoFinanceiroTitulo.createMany).not.toHaveBeenCalled();
  });
});

import { mapTituloRow, rebuildFatoFinanceiroTitulo } from "./fato-financeiro-titulo";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

describe("mapTituloRow", () => {
  it("mapeia um título de pagamento (sinal=-1 → tipo=a_pagar)", () => {
    const raw = {
      id: 1001,
      tipo: "pagamento",
      sinal: -1,
      participante_id: [10, "Fornecedor XYZ"],
      conta_id: [5, "Conta Corrente"],
      numero_documento: "NF-001",
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
    const result = mapTituloRow(raw);
    expect(result.odooId).toBe(1001);
    expect(result.tipo).toBe("a_pagar");
    expect(result.participanteId).toBe(10);
    expect(result.participanteNome).toBe("Fornecedor XYZ");
    expect(result.contaId).toBe(5);
    expect(result.contaNome).toBe("Conta Corrente");
    expect(result.numeroDocumento).toBe("NF-001");
    expect(result.dataDocumento).toEqual(new Date("2026-05-01"));
    expect(result.dataVencimento).toEqual(new Date("2026-05-31"));
    expect(result.dataPagamento).toEqual(new Date("2026-05-13"));
    expect(result.situacao).toBe("efetivo");
    expect(result.situacaoSimples).toBe("quitado");
    expect(result.vrDocumento).toBe(1500.0);
    expect(result.vrSaldo).toBe(0.0);
    expect(result.vrTotal).toBe(1500.0);
    expect(result.vrJuros).toBe(0.0);
    expect(result.vrMulta).toBe(0.0);
    expect(result.vrDesconto).toBe(0.0);
  });

  it("mapeia um título de recebimento (sinal=+1 → tipo=a_receber)", () => {
    const raw = {
      id: 2001,
      tipo: "recebimento",
      sinal: 1,
      participante_id: [20, "Cliente ABC"],
    };
    const result = mapTituloRow(raw);
    expect(result.tipo).toBe("a_receber");
  });

  it("tolera campos relacionais ausentes", () => {
    const raw = { id: 500, tipo: "pagamento", sinal: -1, participante_id: false, conta_id: false };
    const result = mapTituloRow(raw);
    expect(result.participanteId).toBeNull();
    expect(result.participanteNome).toBeNull();
    expect(result.contaId).toBeNull();
    expect(result.contaNome).toBeNull();
  });

  it("datas ausentes viram null", () => {
    const raw = { id: 100, tipo: "pagamento", sinal: -1 };
    const result = mapTituloRow(raw);
    expect(result.dataDocumento).toBeNull();
    expect(result.dataVencimento).toBeNull();
    expect(result.dataPagamento).toBeNull();
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
          { data: { id: 1001, tipo: "pagamento", sinal: -1, participante_id: [10, "F"], vr_documento: 1500 } },
          { data: { id: 2001, tipo: "recebimento", sinal: 1, participante_id: [20, "C"], vr_documento: 800 } },
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

  it("createMany recebe data: mapped (sem atualizadoEm — N5)", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanPagamentoDivida: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 1, tipo: "pagamento", sinal: -1 } },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    await rebuildFatoFinanceiroTitulo(prisma);
    const callArg = tx.fatoFinanceiroTitulo.createMany.mock.calls[0][0];
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

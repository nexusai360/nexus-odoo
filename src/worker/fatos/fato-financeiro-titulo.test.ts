import { mapTituloRow, rebuildFatoFinanceiroTitulo } from "./fato-financeiro-titulo";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

// ---------------------------------------------------------------------------
// Fixtures , formato real de finan.lancamento (bug R1 , fonte trocada 2026-05-18)
// Dados confirmados contra o banco real:
//   tipo='a_receber' situacao_divida_simples='aberto': 120 títulos, R$ 1.164.266,36
//   tipo='a_pagar'  situacao_divida_simples='aberto':  18 títulos, R$    95.694,95
// Para título aberto: vr_saldo == vr_documento == vr_total (valor real a receber/pagar).
// data_pagamento vem false (não string) quando não pago.
// ---------------------------------------------------------------------------

const RAW_LANCAMENTO_A_RECEBER_ABERTO = {
  id: 10001,
  tipo: "a_receber",              // campo direto (não derivado)
  participante_id: [20, "Cliente Exemplo SA"],
  conta_id: [3, "Conta Clientes"],
  numero: "NF-001/1",
  data_documento: "2026-04-01",
  data_vencimento: "2026-05-31",
  data_pagamento: false,          // false = não pago → null no fato
  situacao: "aberto",
  situacao_divida: "aberto",
  situacao_divida_simples: "aberto",
  vr_documento: 9700.50,
  vr_saldo: 9700.50,              // igual a vr_documento quando aberto
  vr_total: 9700.50,
  vr_juros: 0.0,
  vr_multa: 0.0,
  vr_desconto: 0.0,
};

const RAW_LANCAMENTO_A_PAGAR_ABERTO = {
  id: 20001,
  tipo: "a_pagar",
  participante_id: [10, "Fornecedor Exemplo Ltda"],
  conta_id: [5, "Conta Fornecedores"],
  numero: "BOL-002/1",
  data_documento: "2026-04-15",
  data_vencimento: "2026-05-15",
  data_pagamento: false,
  situacao: "aberto",
  situacao_divida: "aberto",
  situacao_divida_simples: "aberto",
  vr_documento: 5314.75,
  vr_saldo: 5314.75,
  vr_total: 5314.75,
  vr_juros: 0.0,
  vr_multa: 0.0,
  vr_desconto: 0.0,
};

const RAW_LANCAMENTO_A_RECEBER_QUITADO = {
  id: 10002,
  tipo: "a_receber",
  participante_id: [21, "Cliente Quitado Ltda"],
  conta_id: [3, "Conta Clientes"],
  numero: "NF-002/1",
  data_documento: "2026-03-01",
  data_vencimento: "2026-04-01",
  data_pagamento: "2026-04-05",   // string = pago
  situacao: "efetivo",
  situacao_divida: "quitado",
  situacao_divida_simples: "quitado",
  vr_documento: 1200.00,
  vr_saldo: 0.0,                  // vr_saldo=0 quando quitado
  vr_total: 1200.00,
  vr_juros: 0.0,
  vr_multa: 0.0,
  vr_desconto: 0.0,
};

// Tipo de lançamento de caixa , deve ser DESCARTADO pelo builder
const RAW_LANCAMENTO_RECEBIMENTO_CAIXA = {
  id: 30001,
  tipo: "recebimento",            // lançamento de caixa , NÃO é título
  participante_id: [20, "Cliente Exemplo SA"],
  conta_id: [1, "Caixa"],
  numero: false,
  data_documento: "2026-05-01",
  data_vencimento: false,
  data_pagamento: "2026-05-01",
  situacao: "efetivo",
  situacao_divida: "quitado",
  situacao_divida_simples: "quitado",
  vr_documento: 9700.50,
  vr_saldo: 0.0,
  vr_total: 9700.50,
  vr_juros: 0.0,
  vr_multa: 0.0,
  vr_desconto: 0.0,
};

const RAW_LANCAMENTO_PAGAMENTO_CAIXA = {
  id: 30002,
  tipo: "pagamento",              // lançamento de caixa , NÃO é título
  participante_id: [10, "Fornecedor Exemplo Ltda"],
  conta_id: [1, "Caixa"],
  numero: false,
  data_documento: "2026-05-10",
  data_vencimento: false,
  data_pagamento: "2026-05-10",
  situacao: "efetivo",
  situacao_divida: "quitado",
  situacao_divida_simples: "quitado",
  vr_documento: 5314.75,
  vr_saldo: 0.0,
  vr_total: 5314.75,
  vr_juros: 0.0,
  vr_multa: 0.0,
  vr_desconto: 0.0,
};

// ---------------------------------------------------------------------------
// mapTituloRow
// ---------------------------------------------------------------------------

describe("mapTituloRow", () => {
  it("mapeia título a_receber aberto corretamente (tipo direto, data_pagamento=false→null)", () => {
    const result = mapTituloRow(RAW_LANCAMENTO_A_RECEBER_ABERTO);
    expect(result.odooId).toBe(10001);
    // tipo é campo direto da fonte , não derivado
    expect(result.tipo).toBe("a_receber");
    expect(result.participanteId).toBe(20);
    expect(result.participanteNome).toBe("Cliente Exemplo SA");
    expect(result.contaId).toBe(3);
    expect(result.contaNome).toBe("Conta Clientes");
    expect(result.numeroDocumento).toBe("NF-001/1");
    // I2: hora local , data não desloca
    expect(result.dataDocumento).toEqual(new Date("2026-04-01T00:00:00Z"));
    expect(result.dataVencimento).toEqual(new Date("2026-05-31T00:00:00Z"));
    // data_pagamento=false → null
    expect(result.dataPagamento).toBeNull();
    expect(result.situacao).toBe("aberto");
    expect(result.situacaoSimples).toBe("aberto");
    // vrSaldo == vrDocumento == vrTotal quando aberto
    expect(result.vrDocumento).toBeCloseTo(9700.50);
    expect(result.vrSaldo).toBeCloseTo(9700.50);
    expect(result.vrTotal).toBeCloseTo(9700.50);
    expect(result.vrJuros).toBe(0);
    expect(result.vrMulta).toBe(0);
    expect(result.vrDesconto).toBe(0);
  });

  it("mapeia título a_pagar aberto corretamente", () => {
    const result = mapTituloRow(RAW_LANCAMENTO_A_PAGAR_ABERTO);
    expect(result.tipo).toBe("a_pagar");
    expect(result.participanteNome).toBe("Fornecedor Exemplo Ltda");
    expect(result.vrSaldo).toBeCloseTo(5314.75);
    expect(result.dataPagamento).toBeNull();
    expect(result.situacaoSimples).toBe("aberto");
  });

  it("mapeia título a_receber quitado: vrSaldo=0, dataPagamento preenchida", () => {
    const result = mapTituloRow(RAW_LANCAMENTO_A_RECEBER_QUITADO);
    expect(result.tipo).toBe("a_receber");
    expect(result.situacaoSimples).toBe("quitado");
    expect(result.vrSaldo).toBe(0);
    expect(result.dataPagamento).toEqual(new Date("2026-04-05T00:00:00Z"));
  });

  it("tolera campos relacionais ausentes (many2one false = sem relacionamento)", () => {
    const raw = { id: 500, tipo: "a_receber", participante_id: false, conta_id: false };
    const result = mapTituloRow(raw);
    expect(result.participanteId).toBeNull();
    expect(result.participanteNome).toBeNull();
    expect(result.contaId).toBeNull();
    expect(result.contaNome).toBeNull();
  });

  it("numero ausente/false vira null", () => {
    const raw = { id: 100, tipo: "a_receber", numero: false };
    const result = mapTituloRow(raw);
    expect(result.numeroDocumento).toBeNull();
  });

  it("datas ausentes/false viram null", () => {
    const raw = { id: 100, tipo: "a_pagar", data_documento: false, data_vencimento: false, data_pagamento: false };
    const result = mapTituloRow(raw);
    expect(result.dataDocumento).toBeNull();
    expect(result.dataVencimento).toBeNull();
    expect(result.dataPagamento).toBeNull();
  });

  it("I2: data '2026-05-31' parseada como UTC , dia não desloca (getUTCDate=31)", () => {
    const result = mapTituloRow({ ...RAW_LANCAMENTO_A_RECEBER_ABERTO, data_vencimento: "2026-05-31" });
    expect(result.dataVencimento?.getUTCDate()).toBe(31);
  });

  it("valores monetários ausentes viram 0", () => {
    const raw = { id: 200, tipo: "a_receber" };
    const result = mapTituloRow(raw);
    expect(result.vrDocumento).toBe(0);
    expect(result.vrSaldo).toBe(0);
    expect(result.vrTotal).toBe(0);
    expect(result.vrJuros).toBe(0);
    expect(result.vrMulta).toBe(0);
    expect(result.vrDesconto).toBe(0);
  });

  it("NÃO produz atualizadoEm (decisão N5)", () => {
    const raw = { id: 1, tipo: "a_receber" };
    expect(mapTituloRow(raw)).not.toHaveProperty("atualizadoEm");
  });

  it("NÃO produz diasAtraso (não é coluna do schema)", () => {
    const raw = { id: 1, tipo: "a_receber" };
    expect(mapTituloRow(raw)).not.toHaveProperty("diasAtraso");
  });
});

// ---------------------------------------------------------------------------
// rebuildFatoFinanceiroTitulo
// ---------------------------------------------------------------------------

describe("rebuildFatoFinanceiroTitulo", () => {
  it("lê de rawFinanLancamento (não rawFinanPagamentoDivida) e reconstrói o fato", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanLancamento: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_LANCAMENTO_A_RECEBER_ABERTO },
          { data: RAW_LANCAMENTO_A_PAGAR_ABERTO },
        ]),
      },
      // origensDeNota(): sem NF no cache, nenhum pedido consta como faturado.
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroTitulo(prisma);
    expect(n).toBe(2);
    expect(tx.fatoFinanceiroTitulo.deleteMany).toHaveBeenCalled();
    expect(tx.fatoFinanceiroTitulo.createMany).toHaveBeenCalled();
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_financeiro_titulo");
  });

  it("descarta lançamentos de caixa (tipo='recebimento' e tipo='pagamento')", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanLancamento: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_LANCAMENTO_A_RECEBER_ABERTO },     // título → inclui
          { data: RAW_LANCAMENTO_RECEBIMENTO_CAIXA },    // caixa → descarta
          { data: RAW_LANCAMENTO_A_PAGAR_ABERTO },       // título → inclui
          { data: RAW_LANCAMENTO_PAGAMENTO_CAIXA },      // caixa → descarta
        ]),
      },
      // origensDeNota(): sem NF no cache, nenhum pedido consta como faturado.
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroTitulo(prisma);
    // Apenas 2 títulos (a_receber + a_pagar); os 2 de caixa foram filtrados
    expect(n).toBe(2);
    const callArg = tx.fatoFinanceiroTitulo.createMany.mock.calls[0][0];
    const tipos = callArg.data.map((r: { tipo: string }) => r.tipo);
    expect(tipos).toContain("a_receber");
    expect(tipos).toContain("a_pagar");
    expect(tipos).not.toContain("recebimento");
    expect(tipos).not.toContain("pagamento");
  });

  it("título a_receber aberto aparece no createMany com vrSaldo correto", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanLancamento: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_LANCAMENTO_A_RECEBER_ABERTO },
        ]),
      },
      // origensDeNota(): sem NF no cache, nenhum pedido consta como faturado.
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    await rebuildFatoFinanceiroTitulo(prisma);
    const callArg = tx.fatoFinanceiroTitulo.createMany.mock.calls[0][0];
    expect(callArg.data[0].tipo).toBe("a_receber");
    expect(callArg.data[0].situacaoSimples).toBe("aberto");
    expect(callArg.data[0].vrSaldo).toBeCloseTo(9700.50);
    expect(callArg.data[0]).not.toHaveProperty("atualizadoEm");
  });

  it("título quitado ainda entra no fato (filtro de situação é responsabilidade das queries)", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanLancamento: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_LANCAMENTO_A_RECEBER_QUITADO },
        ]),
      },
      // origensDeNota(): sem NF no cache, nenhum pedido consta como faturado.
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroTitulo(prisma);
    // O builder não filtra por situação , apenas por tipo; o quitado entra
    expect(n).toBe(1);
  });

  it("não chama createMany quando não há linhas com tipo de título", async () => {
    const tx = {
      fatoFinanceiroTitulo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanLancamento: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_LANCAMENTO_RECEBIMENTO_CAIXA },
          { data: RAW_LANCAMENTO_PAGAMENTO_CAIXA },
        ]),
      },
      // origensDeNota(): sem NF no cache, nenhum pedido consta como faturado.
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroTitulo(prisma);
    expect(n).toBe(0);
    expect(tx.fatoFinanceiroTitulo.createMany).not.toHaveBeenCalled();
  });
});

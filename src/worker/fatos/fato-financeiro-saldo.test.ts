import { mapSaldoFinanceiroRow, rebuildFatoFinanceiroSaldo } from "./fato-financeiro-saldo";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

describe("mapSaldoFinanceiroRow", () => {
  it("extrai os campos do registro raw de saldo bancário", () => {
    const raw = {
      id: 2,
      banco_id: [2, "Banco do Brasil"],
      tipo: "corrente",
      data_referencia: "2026-05-17",
      saldo_anterior: 1000.5,
      entrada: 500.25,
      saida: 200.75,
      saldo: 1300.0,
    };
    const result = mapSaldoFinanceiroRow(raw);
    expect(result).toEqual({
      bancoId: 2,
      bancoNome: "Banco do Brasil",
      tipo: "corrente",
      dataReferencia: new Date("2026-05-17"),
      saldoAnterior: 1000.5,
      entrada: 500.25,
      saida: 200.75,
      saldo: 1300.0,
    });
  });

  it("tolera campos ausentes — valores monetários viram 0", () => {
    const raw = { id: 5, banco_id: false };
    const result = mapSaldoFinanceiroRow(raw);
    expect(result.bancoId).toBe(5);
    expect(result.bancoNome).toBeNull();
    expect(result.tipo).toBeNull();
    expect(result.dataReferencia).toBeNull();
    expect(result.saldoAnterior).toBe(0);
    expect(result.entrada).toBe(0);
    expect(result.saida).toBe(0);
    expect(result.saldo).toBe(0);
  });

  it("NÃO produz atualizadoEm (decisão N5 — @default(now()) no schema)", () => {
    const raw = { id: 1, banco_id: [1, "Caixa"] };
    const result = mapSaldoFinanceiroRow(raw);
    expect(result).not.toHaveProperty("atualizadoEm");
  });
});

describe("rebuildFatoFinanceiroSaldo", () => {
  it("reconstrói o fato e marca o build dentro da transação", async () => {
    const tx = {
      fatoFinanceiroSaldo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanBancoSaldoHoje: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 2, banco_id: [2, "BB"], tipo: "corrente", saldo: 1300.0 } },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroSaldo(prisma);
    expect(n).toBe(1);
    expect(tx.fatoFinanceiroSaldo.deleteMany).toHaveBeenCalled();
    expect(tx.fatoFinanceiroSaldo.createMany).toHaveBeenCalled();
    // markFatoBuilt dentro da transação (achado I3)
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_financeiro_saldo");
  });

  it("createMany recebe data: mapped (sem atualizadoEm injetado — N5)", async () => {
    const tx = {
      fatoFinanceiroSaldo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanBancoSaldoHoje: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 3, banco_id: [3, "Itaú"], saldo: 500 } },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    await rebuildFatoFinanceiroSaldo(prisma);
    const callArg = tx.fatoFinanceiroSaldo.createMany.mock.calls[0][0];
    expect(callArg.data[0]).not.toHaveProperty("atualizadoEm");
  });

  it("não chama createMany quando não há linhas", async () => {
    const tx = {
      fatoFinanceiroSaldo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanBancoSaldoHoje: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroSaldo(prisma);
    expect(n).toBe(0);
    expect(tx.fatoFinanceiroSaldo.createMany).not.toHaveBeenCalled();
  });
});

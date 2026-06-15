import { mapMovimentoRow, rebuildFatoFinanceiroMovimento } from "./fato-financeiro-movimento";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

describe("mapMovimentoRow", () => {
  it("extrai os campos de uma linha de fluxo de caixa", () => {
    const raw = {
      id: 518648,
      data: "2026-05-10",
      conta_id: [5, "Conta Corrente BB"],
      centro_resultado_id: [2, "Operações"],
      entrada: 0.0,
      saida: 0.0,
      valor: 0.0,
      entrada_prevista: 1237.5,
      saida_prevista: 0.0,
      valor_previsto: 1237.5,
    };
    const result = mapMovimentoRow(raw);
    expect(result).toEqual({
      odooId: 518648,
      data: new Date("2026-05-10T00:00:00Z"),
      contaId: 5,
      contaNome: "Conta Corrente BB",
      centroResultadoId: 2,
      centroResultadoNome: "Operações",
      entrada: 0.0,
      saida: 0.0,
      valor: 0.0,
      entradaPrevista: 1237.5,
      saidaPrevista: 0.0,
      valorPrevisto: 1237.5,
    });
  });

  it("tolera campos relacionais ausentes (false)", () => {
    const raw = { id: 1, conta_id: false, centro_resultado_id: false };
    const result = mapMovimentoRow(raw);
    expect(result.odooId).toBe(1);
    expect(result.contaId).toBeNull();
    expect(result.contaNome).toBeNull();
    expect(result.centroResultadoId).toBeNull();
    expect(result.centroResultadoNome).toBeNull();
    expect(result.data).toBeNull();
    expect(result.entrada).toBe(0);
    expect(result.saida).toBe(0);
  });

  it("NÃO produz atualizadoEm (decisão N5 , @default(now()) no schema)", () => {
    const raw = { id: 1 };
    const result = mapMovimentoRow(raw);
    expect(result).not.toHaveProperty("atualizadoEm");
  });

  it("NÃO produz campo natureza (realizado e previsto coexistem , decisão #IM-2)", () => {
    const raw = { id: 1 };
    const result = mapMovimentoRow(raw);
    expect(result).not.toHaveProperty("natureza");
  });
});

describe("rebuildFatoFinanceiroMovimento", () => {
  it("reconstrói o fato e marca o build dentro da transação", async () => {
    const tx = {
      fatoFinanceiroMovimento: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanFluxoCaixa: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 518648, conta_id: [5, "BB"], entrada: 100 } },
          { data: { id: 518649, conta_id: [6, "Itaú"], saida: 50 } },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroMovimento(prisma);
    expect(n).toBe(2);
    expect(tx.fatoFinanceiroMovimento.deleteMany).toHaveBeenCalled();
    expect(tx.fatoFinanceiroMovimento.createMany).toHaveBeenCalled();
    expect(markFatoBuilt).toHaveBeenCalledWith(tx, "fato_financeiro_movimento");
  });

  it("createMany recebe data: mapped (sem atualizadoEm injetado , N5)", async () => {
    const tx = {
      fatoFinanceiroMovimento: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanFluxoCaixa: {
        findMany: jest.fn().mockResolvedValue([
          { data: { id: 1, conta_id: false } },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    await rebuildFatoFinanceiroMovimento(prisma);
    const callArg = tx.fatoFinanceiroMovimento.createMany.mock.calls[0][0];
    expect(callArg.data[0]).not.toHaveProperty("atualizadoEm");
  });

  it("não chama createMany quando não há linhas", async () => {
    const tx = {
      fatoFinanceiroMovimento: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanFluxoCaixa: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    const n = await rebuildFatoFinanceiroMovimento(prisma);
    expect(n).toBe(0);
    expect(tx.fatoFinanceiroMovimento.createMany).not.toHaveBeenCalled();
  });
});

import { mapSaldoFinanceiroRow, rebuildFatoFinanceiroSaldo } from "./fato-financeiro-saldo";

jest.mock("./fato-build-state", () => ({ markFatoBuilt: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { markFatoBuilt } = require("./fato-build-state");

// Amostra real recortada de raw_finan_banco_saldo_hoje (discovery/output + banco dev, 2026-05-18).
// banco_id é many2one [id, nome]; raw.id é o id da linha do snapshot (não é PK lógica).
const RAW_REAL_SALDO = {
  id: 1142,
  banco_id: [4, "Itaú / Corrente / 1584 / 55755-5 / Jht DF Comércio - Matriz DF 10.557.556/0001-37"],
  tipo: "corrente",
  data: "2026-05-14",      // C2: campo real (não "data_referencia")
  anterior: -978197.61,    // C2: campo real (não "saldo_anterior")
  entrada: 12000.0,
  saida: 5000.0,
  saldo: -971197.61,
};

describe("mapSaldoFinanceiroRow", () => {
  it("extrai os campos do registro raw real de saldo bancário (C1+C2 — fonte real)", () => {
    const result = mapSaldoFinanceiroRow(RAW_REAL_SALDO);
    // C1: bancoId vem de banco_id[0], não de raw.id (1142 seria errado).
    expect(result.bancoId).toBe(4);
    expect(result.bancoNome).toBe("Itaú / Corrente / 1584 / 55755-5 / Jht DF Comércio - Matriz DF 10.557.556/0001-37");
    expect(result.tipo).toBe("corrente");
    // C2: dataReferencia vem de raw.data; I2: hora local não desloca data.
    expect(result.dataReferencia).toEqual(new Date("2026-05-14T00:00:00"));
    // C2: saldoAnterior vem de raw.anterior.
    expect(result.saldoAnterior).toBe(-978197.61);
    expect(result.entrada).toBe(12000.0);
    expect(result.saida).toBe(5000.0);
    expect(result.saldo).toBe(-971197.61);
  });

  it("tolera campos ausentes — valores monetários viram 0", () => {
    // banco_id false = many2one vazio no Odoo (sem relacionamento)
    const raw = { id: 5, banco_id: false };
    const result = mapSaldoFinanceiroRow(raw);
    // C1: relId(false) retorna null → coalesce para 0
    expect(result.bancoId).toBe(0);
    expect(result.bancoNome).toBeNull();
    expect(result.tipo).toBeNull();
    expect(result.dataReferencia).toBeNull();
    expect(result.saldoAnterior).toBe(0);
    expect(result.entrada).toBe(0);
    expect(result.saida).toBe(0);
    expect(result.saldo).toBe(0);
  });

  it("NÃO produz atualizadoEm (decisão N5 — @default(now()) no schema)", () => {
    const result = mapSaldoFinanceiroRow(RAW_REAL_SALDO);
    expect(result).not.toHaveProperty("atualizadoEm");
  });

  it("I2: data '2026-05-14' parseada como hora local — não desloca para 2026-05-13", () => {
    const result = mapSaldoFinanceiroRow({ ...RAW_REAL_SALDO, data: "2026-05-14" });
    expect(result.dataReferencia?.getDate()).toBe(14);
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
          { data: RAW_REAL_SALDO },
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

  it("createMany recebe data: mapped com bancoId=banco_id[0] (C1 — não raw.id)", async () => {
    const tx = {
      fatoFinanceiroSaldo: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      rawFinanBancoSaldoHoje: {
        findMany: jest.fn().mockResolvedValue([
          { data: RAW_REAL_SALDO },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as never;

    await rebuildFatoFinanceiroSaldo(prisma);
    const callArg = tx.fatoFinanceiroSaldo.createMany.mock.calls[0][0];
    expect(callArg.data[0].bancoId).toBe(4);      // banco_id[0], não raw.id (1142)
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

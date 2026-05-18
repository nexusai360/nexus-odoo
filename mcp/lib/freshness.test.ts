// mcp/lib/freshness.test.ts
// Testes de estadoPreparando e withFreshness.
// Jest roda com transform CJS (ts-jest, sem --experimental-vm-modules).

import { estadoPreparando, withFreshness } from "./freshness.js";

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    fatoBuildState: {
      findMany: jest.fn(),
    },
    syncState: {
      findMany: jest.fn(),
    },
    ...overrides,
  };
}

describe("estadoPreparando", () => {
  it("retorna true se qualquer fato não tem FatoBuildState", async () => {
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: new Date("2026-05-01T00:00:00Z") },
      // fato_produto_parado ausente
    ]);
    const result = await estadoPreparando(prisma as never, ["fato_estoque_saldo", "fato_produto_parado"]);
    expect(result).toBe(true);
  });

  it("retorna false se todos os fatos têm FatoBuildState", async () => {
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: new Date("2026-05-01T00:00:00Z") },
      { fato: "fato_produto_parado", ultimoBuildAt: new Date("2026-05-01T00:00:00Z") },
    ]);
    const result = await estadoPreparando(prisma as never, ["fato_estoque_saldo", "fato_produto_parado"]);
    expect(result).toBe(false);
  });
});

describe("withFreshness", () => {
  it("retorna { estado: 'preparando' } e não executa fn quando algum fato não tem build", async () => {
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]); // nenhum build
    const fn = jest.fn();
    const result = await withFreshness(prisma as never, ["fato_estoque_saldo"], fn);
    expect(result).toEqual({ estado: "preparando" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("retorna estado 'ok' com dados populados quando linhas tem itens", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: now },
    ]);
    (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    const fn = jest.fn().mockResolvedValue({ linhas: [{ id: 1 }] });
    const result = await withFreshness(prisma as never, ["fato_estoque_saldo"], fn);
    expect(result).toMatchObject({
      estado: "ok",
      dados: { linhas: [{ id: 1 }] },
      atualizadoEm: now.toISOString(),
      fonteStatus: { status: "ok", ultimaSyncEm: now.toISOString() },
    });
  });

  it("retorna estado 'vazio' quando o primeiro array de dados está vazio", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: now },
    ]);
    (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    const fn = jest.fn().mockResolvedValue({ linhas: [] });
    const result = await withFreshness(prisma as never, ["fato_estoque_saldo"], fn);
    expect(result).toMatchObject({ estado: "vazio" });
  });

  it("retorna estado 'ok' quando dados é escalar (sem array)", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_financeiro_saldo", ultimoBuildAt: now },
    ]);
    (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "finan.banco.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    const fn = jest.fn().mockResolvedValue({ entrada: 100, saida: 50, saldo: 50 });
    const result = await withFreshness(prisma as never, ["fato_financeiro_saldo"], fn);
    expect(result).toMatchObject({ estado: "ok", dados: { entrada: 100, saida: 50, saldo: 50 } });
  });

  it("usa lastIncrementalAt para fonte incremental (N4)", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_movimento", ultimoBuildAt: now },
    ]);
    (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.extrato", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
    ]);
    const fn = jest.fn().mockResolvedValue({ serie: [{ mes: "2026-05" }] });
    const result = await withFreshness(prisma as never, ["fato_estoque_movimento"], fn);
    expect(result).toMatchObject({
      fonteStatus: { ultimaSyncEm: now.toISOString() },
    });
  });

  it("IMP-1: fonte nula iterada antes de fonte com data resulta em ultimaSyncEm=null", async () => {
    // Reproduz exatamente o cenário do bug: fato_estoque_movimento (incremental,
    // lastIncrementalAt=null) é processado antes de fato_estoque_saldo (snapshot,
    // com data válida). O resultado deve ser null, não a data do segundo fato.
    const now = new Date("2026-05-01T12:00:00Z");
    const older = new Date("2026-04-01T12:00:00Z");
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_movimento", ultimoBuildAt: now },
      { fato: "fato_estoque_saldo",     ultimoBuildAt: older },
    ]);
    (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      // fato_estoque_movimento → estoque.extrato, incremental, nunca sincronizou
      { model: "estoque.extrato",      lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: null },
      // fato_estoque_saldo → estoque.saldo.hoje, snapshot, com data válida
      { model: "estoque.saldo.hoje",   lastStatus: "ok", lastSnapshotAt: now,  lastIncrementalAt: null },
    ]);
    const fn = jest.fn().mockResolvedValue({ linhas: [{ id: 1 }], serie: [{ mes: "2026-05" }] });
    // A ordem dos fatos garante que a fonte nula é iterada primeiro
    const result = await withFreshness(
      prisma as never,
      ["fato_estoque_movimento", "fato_estoque_saldo"],
      fn,
    );
    expect(result).toMatchObject({
      fonteStatus: { ultimaSyncEm: null },
    });
  });

  it("usa lastSnapshotAt para fonte snapshot (N4)", async () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const prisma = makePrisma();
    (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: now },
    ]);
    (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
      { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
    ]);
    const fn = jest.fn().mockResolvedValue({ linhas: [{ id: 1 }] });
    const result = await withFreshness(prisma as never, ["fato_estoque_saldo"], fn);
    expect(result).toMatchObject({
      fonteStatus: { ultimaSyncEm: now.toISOString() },
    });
  });

  // E-1: isVazio custom — contabil_estrutura_conta (conta === null → vazio)
  describe("isVazio custom (E-1)", () => {
    const isVazioConta = (d: { conta: { id: number } | null; filhas: unknown[] }) => d.conta === null;

    it("retorna estado 'vazio' quando predicado isVazio custom retorna true (conta=null)", async () => {
      const now = new Date("2026-05-01T12:00:00Z");
      const prisma = makePrisma();
      (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
        { fato: "fato_conta_contabil", ultimoBuildAt: now },
      ]);
      (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
        { model: "contabil.conta", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
      ]);
      // conta inexistente → predicado retorna true → estado "vazio"
      const fn = jest.fn().mockResolvedValue({ conta: null, filhas: [], aviso: "" });
      const result = await withFreshness(
        prisma as never,
        ["fato_conta_contabil"],
        fn,
        isVazioConta,
      );
      expect(result).toMatchObject({ estado: "vazio" });
    });

    it("retorna estado 'ok' quando predicado isVazio custom retorna false (conta encontrada)", async () => {
      const now = new Date("2026-05-01T12:00:00Z");
      const prisma = makePrisma();
      (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
        { fato: "fato_conta_contabil", ultimoBuildAt: now },
      ]);
      (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
        { model: "contabil.conta", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
      ]);
      // conta encontrada, sem filhas (conta-folha) → predicado retorna false → estado "ok" (P-M1)
      const fn = jest.fn().mockResolvedValue({
        conta: { odooId: 42, codigo: "1.1.1", nome: "Caixa", tipo: "A", contaPaiNome: "Ativo" },
        filhas: [],
        aviso: "",
      });
      const result = await withFreshness(
        prisma as never,
        ["fato_conta_contabil"],
        fn,
        isVazioConta,
      );
      expect(result).toMatchObject({ estado: "ok" });
    });

    it("retorna estado 'ok' quando conta encontrada tem filhas", async () => {
      const now = new Date("2026-05-01T12:00:00Z");
      const prisma = makePrisma();
      (prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
        { fato: "fato_conta_contabil", ultimoBuildAt: now },
      ]);
      (prisma.syncState.findMany as jest.Mock).mockResolvedValue([
        { model: "contabil.conta", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
      ]);
      const fn = jest.fn().mockResolvedValue({
        conta: { odooId: 10, codigo: "1", nome: "Ativo", tipo: "S", contaPaiNome: null },
        filhas: [{ odooId: 42, codigo: "1.1", nome: "Ativo Circulante", tipo: "S" }],
        aviso: "",
      });
      const result = await withFreshness(
        prisma as never,
        ["fato_conta_contabil"],
        fn,
        isVazioConta,
      );
      expect(result).toMatchObject({ estado: "ok" });
    });
  });
});

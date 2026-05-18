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
});

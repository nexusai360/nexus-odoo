import {
  runBuilders,
  FATO_BUILDERS,
  MARCADOR_CICLO,
  __resetSkipGateBootParaTeste,
} from "./registry";
import type { PrismaClient } from "@/generated/prisma/client";

describe("FATO_BUILDERS", () => {
  it("é um array de entradas com nome, cycle e run", () => {
    expect(Array.isArray(FATO_BUILDERS)).toBe(true);
    for (const entry of FATO_BUILDERS) {
      expect(typeof entry.nome).toBe("string");
      expect(["snapshot", "incremental"]).toContain(entry.cycle);
      expect(typeof entry.run).toBe("function");
    }
  });
});

describe("runBuilders", () => {
  // O marcador de fim de ciclo e gravado em fato_build_state, entao o mock precisa dele.
  // O skip-gate tambem le findMany (estado) e escreve updateMany (verificado/metrica);
  // $queryRawUnsafe so e chamado para builders MAPEADOS (os de teste nao sao).
  const upsert = jest.fn().mockResolvedValue(undefined);
  const findMany = jest.fn().mockResolvedValue([]);
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const queryRawUnsafe = jest.fn().mockResolvedValue([{ sujo: true }]);
  const prisma = {
    fatoBuildState: { upsert, findMany, updateMany },
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaClient;

  beforeEach(() => {
    upsert.mockClear();
    findMany.mockClear();
    updateMany.mockClear();
    queryRawUnsafe.mockClear();
    __resetSkipGateBootParaTeste();
  });

  it("grava o marcador de FIM DE CICLO depois de todos os builders", async () => {
    const ordem: string[] = [];
    upsert.mockImplementation(async (args: { where: { fato: string } }) => {
      ordem.push(`marcador:${args.where.fato}`);
    });
    const builders = [
      { nome: "fato_a", cycle: "incremental" as const, run: jest.fn(async () => { ordem.push("fato_a"); return 1; }) },
      { nome: "fato_b", cycle: "incremental" as const, run: jest.fn(async () => { ordem.push("fato_b"); return 2; }) },
    ];
    await runBuilders(prisma, "incremental", builders);
    // O carimbo que a tela observa so pode aparecer com o dado ja inteiro.
    expect(ordem).toEqual(["fato_a", "fato_b", `marcador:${MARCADOR_CICLO}`]);
  });

  it("executa apenas os builders do cycle dado", async () => {
    const snapshotFn = jest.fn().mockResolvedValue(5);
    const incrementalFn = jest.fn().mockResolvedValue(3);
    const builders = [
      { nome: "fato_a", cycle: "snapshot" as const, run: snapshotFn },
      { nome: "fato_b", cycle: "incremental" as const, run: incrementalFn },
    ];
    await runBuilders(prisma, "snapshot", builders);
    expect(snapshotFn).toHaveBeenCalledWith(prisma);
    expect(incrementalFn).not.toHaveBeenCalled();
  });

  it("uma exceção num builder não impede os demais", async () => {
    const failFn = jest.fn().mockRejectedValue(new Error("falha simulada"));
    const okFn = jest.fn().mockResolvedValue(2);
    const builders = [
      { nome: "fato_fail", cycle: "incremental" as const, run: failFn },
      { nome: "fato_ok", cycle: "incremental" as const, run: okFn },
    ];
    await expect(runBuilders(prisma, "incremental", builders)).resolves.not.toThrow();
    expect(failFn).toHaveBeenCalled();
    expect(okFn).toHaveBeenCalled();
  });

  it("loga sucesso via console.log e erro via console.error", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const builders = [
      { nome: "fato_ok", cycle: "snapshot" as const, run: jest.fn().mockResolvedValue(7) },
      { nome: "fato_bad", cycle: "snapshot" as const, run: jest.fn().mockRejectedValue(new Error("boom")) },
    ];
    await runBuilders(prisma, "snapshot", builders);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("fato_ok"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("7 linhas"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("fato_bad"), expect.any(Error));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("devolve o status por builder (ok e linhas)", async () => {
    const builders = [
      { nome: "fato_a", cycle: "incremental" as const, run: async () => 3 },
      { nome: "fato_b", cycle: "incremental" as const, run: async () => { throw new Error("x"); } },
    ];
    const st = await runBuilders(prisma, "incremental", builders);
    expect(st).toEqual([
      { nome: "fato_a", ok: true, linhas: 3, ms: expect.any(Number) },
      { nome: "fato_b", ok: false, linhas: null, ms: expect.any(Number) },
    ]);
  });

  it("mede a duração (ms) de cada builder no status", async () => {
    const builders = [
      { nome: "fato_a", cycle: "incremental" as const, run: async () => 1 },
    ];
    const st = await runBuilders(prisma, "incremental", builders);
    expect(st[0].ms).toBeGreaterThanOrEqual(0);
    expect(typeof st[0].ms).toBe("number");
  });

  it("skip-gate: força tudo no 1º ciclo (boot) e PULA builder mapeado sem mudança no 2º", async () => {
    const runFn = jest.fn().mockResolvedValue(5);
    const builders = [
      { nome: "fato_nota_fiscal_item", cycle: "incremental" as const, run: runFn },
    ];
    // 1º ciclo (boot): força, roda incondicional.
    findMany.mockResolvedValueOnce([]);
    await runBuilders(prisma, "incremental", builders);
    expect(runFn).toHaveBeenCalledTimes(1);

    // 2º ciclo (não-boot): já tem ultimoBuildAt e a raw NÃO mudou (sujo=false) => pula.
    findMany.mockResolvedValueOnce([
      { fato: "fato_nota_fiscal_item", ultimoBuildAt: new Date("2026-07-23T10:00:00Z") },
    ]);
    queryRawUnsafe.mockResolvedValueOnce([{ sujo: false }]);
    const st = await runBuilders(prisma, "incremental", builders);
    expect(runFn).toHaveBeenCalledTimes(1); // NÃO rodou de novo
    expect(st[0].pulado).toBe(true);
    expect(st[0].ok).toBe(true);
    expect(updateMany).toHaveBeenCalled(); // marcou verificado (freshness fresca)
  });

  it("skip-gate: builder mapeado roda no 2º ciclo se a raw mudou", async () => {
    const runFn = jest.fn().mockResolvedValue(9);
    const builders = [
      { nome: "fato_nota_fiscal_item", cycle: "incremental" as const, run: runFn },
    ];
    findMany.mockResolvedValueOnce([]);
    await runBuilders(prisma, "incremental", builders); // boot
    findMany.mockResolvedValueOnce([
      { fato: "fato_nota_fiscal_item", ultimoBuildAt: new Date("2026-07-23T10:00:00Z") },
    ]);
    queryRawUnsafe.mockResolvedValueOnce([{ sujo: true }]); // raw mudou
    const st = await runBuilders(prisma, "incremental", builders);
    expect(runFn).toHaveBeenCalledTimes(2);
    expect(st[0].pulado).toBeFalsy();
  });

  it("F2: full no 1º ciclo (boot), runIncremental no 2º (delta, não-boot)", async () => {
    const runFull = jest.fn().mockResolvedValue(100);
    const runInc = jest.fn().mockResolvedValue(3);
    const builders = [
      {
        nome: "fato_nota_fiscal_item",
        cycle: "incremental" as const,
        run: runFull,
        runIncremental: runInc,
      },
    ];
    // 1º ciclo (boot): FULL, nunca incremental.
    findMany.mockResolvedValueOnce([]);
    await runBuilders(prisma, "incremental", builders);
    expect(runFull).toHaveBeenCalledTimes(1);
    expect(runInc).not.toHaveBeenCalled();

    // 2º ciclo (raw mudou, não-boot): INCREMENTAL com o ultimoBuildAt como âncora.
    const build = new Date("2026-07-23T10:00:00Z");
    findMany.mockResolvedValueOnce([{ fato: "fato_nota_fiscal_item", ultimoBuildAt: build }]);
    queryRawUnsafe.mockResolvedValueOnce([{ sujo: true }]);
    await runBuilders(prisma, "incremental", builders);
    expect(runInc).toHaveBeenCalledTimes(1);
    expect(runInc).toHaveBeenCalledWith(prisma, build);
    expect(runFull).toHaveBeenCalledTimes(1); // full NÃO rodou de novo
  });
});

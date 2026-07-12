import { runBuilders, FATO_BUILDERS, MARCADOR_CICLO } from "./registry";
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
  const upsert = jest.fn().mockResolvedValue(undefined);
  const prisma = { fatoBuildState: { upsert } } as unknown as PrismaClient;

  beforeEach(() => upsert.mockClear());

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
});

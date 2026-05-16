import { processIncrementalCycle } from "./processors";

describe("processIncrementalCycle", () => {
  it("roda só os modelos de modo incremental do catálogo", async () => {
    const vistos: string[] = [];
    const fakeRun = jest.fn(async (_deps, model: string) => {
      vistos.push(model);
    });
    const catalog = [
      { odooModel: "a", mode: "incremental" as const },
      { odooModel: "b", mode: "snapshot" as const },
      { odooModel: "c", mode: "incremental" as const },
    ];
    await processIncrementalCycle(
      { prisma: {} as never, client: {} as never },
      catalog,
      fakeRun as never,
    );
    expect(vistos.sort()).toEqual(["a", "c"]);
  });
});

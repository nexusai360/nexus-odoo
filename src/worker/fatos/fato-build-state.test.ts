import { markFatoBuilt } from "./fato-build-state";

describe("markFatoBuilt", () => {
  it("faz upsert do FatoBuildState com a data atual", async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const prisma = { fatoBuildState: { upsert } } as never;
    await markFatoBuilt(prisma, "fato_estoque_saldo");
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ fato: "fato_estoque_saldo" });
    expect(arg.create.fato).toBe("fato_estoque_saldo");
    expect(arg.create.ultimoBuildAt).toBeInstanceOf(Date);
    expect(arg.update.ultimoBuildAt).toBeInstanceOf(Date);
  });
});

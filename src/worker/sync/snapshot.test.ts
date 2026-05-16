import { syncSnapshot } from "./snapshot";

function fakeClient(records: unknown[]) {
  return { searchReadPaged: jest.fn().mockResolvedValue(records) } as never;
}

describe("syncSnapshot", () => {
  it("apaga tudo e recria dentro de uma transação", async () => {
    const raw = { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) };
    const tx = jest.fn(async (fn) => fn({ rawX: raw }));
    const prisma = { $transaction: tx } as never;
    const client = fakeClient([{ id: 1, x: "a" }, { id: 2, x: "b" }]);
    const n = await syncSnapshot(client, prisma, "rawX", "estoque.saldo.hoje");
    expect(n).toBe(2);
    expect(raw.deleteMany).toHaveBeenCalledWith({});
    expect(raw.createMany).toHaveBeenCalledTimes(1);
    expect(raw.createMany.mock.calls[0][0].data).toHaveLength(2);
  });
});

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

  it("CR-02: pull vazio com cache não-vazio NÃO apaga a tabela e lança erro", async () => {
    const raw = { deleteMany: jest.fn(), createMany: jest.fn() };
    const tx = jest.fn(async (fn) => fn({ rawX: raw }));
    const prisma = {
      $transaction: tx,
      rawX: { count: jest.fn().mockResolvedValue(42) },
    } as never;
    const client = fakeClient([]);
    await expect(syncSnapshot(client, prisma, "rawX", "estoque.saldo.hoje")).rejects.toThrow(
      /refresh abortado/,
    );
    expect(raw.deleteMany).not.toHaveBeenCalled();
    expect(tx).not.toHaveBeenCalled();
  });

  it("CR-02: pull vazio com cache vazio retorna 0 sem wipe", async () => {
    const raw = { deleteMany: jest.fn(), createMany: jest.fn() };
    const tx = jest.fn(async (fn) => fn({ rawX: raw }));
    const prisma = {
      $transaction: tx,
      rawX: { count: jest.fn().mockResolvedValue(0) },
    } as never;
    const client = fakeClient([]);
    const n = await syncSnapshot(client, prisma, "rawX", "estoque.saldo.hoje");
    expect(n).toBe(0);
    expect(raw.deleteMany).not.toHaveBeenCalled();
    expect(tx).not.toHaveBeenCalled();
  });

  it("CR-02: createMany é feito em lotes de 1000", async () => {
    const raw = { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) };
    const tx = jest.fn(async (fn) => fn({ rawX: raw }));
    const prisma = { $transaction: tx } as never;
    const records = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1 }));
    const client = fakeClient(records);
    const n = await syncSnapshot(client, prisma, "rawX", "estoque.saldo.hoje");
    expect(n).toBe(2500);
    expect(raw.createMany).toHaveBeenCalledTimes(3);
    expect(raw.createMany.mock.calls[0][0].data).toHaveLength(1000);
    expect(raw.createMany.mock.calls[2][0].data).toHaveLength(500);
  });
});

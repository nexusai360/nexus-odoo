import { reconcileModel } from "./reconcile";

describe("reconcileModel", () => {
  it("marca rawDeleted nos ids que sumiram do Odoo", async () => {
    const client = { searchIds: jest.fn().mockResolvedValue([1, 3]) } as never;
    const raw = {
      findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }, { odooId: 3 }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const n = await reconcileModel(client, raw as never, "res.partner");
    expect(raw.updateMany).toHaveBeenCalledWith({
      where: { odooId: { in: [2] } },
      data: { rawDeleted: true },
    });
    expect(n).toBe(1);
  });

  it("não chama updateMany quando nada sumiu", async () => {
    const client = { searchIds: jest.fn().mockResolvedValue([1, 2]) } as never;
    const raw = {
      findMany: jest.fn().mockResolvedValue([{ odooId: 1 }, { odooId: 2 }]),
      updateMany: jest.fn(),
    };
    const n = await reconcileModel(client, raw as never, "res.partner");
    expect(raw.updateMany).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });
});

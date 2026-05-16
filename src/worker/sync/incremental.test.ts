import { syncIncremental } from "./incremental";

function fakeClient(records: unknown[]) {
  return { searchReadPaged: jest.fn().mockResolvedValue(records) } as never;
}
function fakeRawTable() {
  return { upsert: jest.fn().mockResolvedValue({}) };
}

describe("syncIncremental", () => {
  it("filtra por write_date quando há lastIncrementalAt", async () => {
    const client = fakeClient([]);
    const raw = fakeRawTable();
    await syncIncremental(client, raw as never, "res.partner", new Date("2026-05-01T00:00:00Z"));
    const domain = (client as never as { searchReadPaged: jest.Mock }).searchReadPaged.mock.calls[0][1];
    expect(domain).toEqual([["write_date", ">", "2026-05-01 00:00:00"]]);
  });

  it("usa domínio vazio (backfill) quando lastIncrementalAt é null", async () => {
    const client = fakeClient([]);
    const raw = fakeRawTable();
    await syncIncremental(client, raw as never, "res.partner", null);
    expect((client as never as { searchReadPaged: jest.Mock }).searchReadPaged.mock.calls[0][1]).toEqual([]);
  });

  it("faz upsert de cada registro e retorna a contagem", async () => {
    const client = fakeClient([
      { id: 1, name: "A", write_date: "2026-05-02 10:00:00" },
      { id: 2, name: "B", write_date: false },
    ]);
    const raw = fakeRawTable();
    const n = await syncIncremental(client, raw as never, "res.partner", null);
    expect(n).toBe(2);
    expect(raw.upsert).toHaveBeenCalledTimes(2);
    const primeiro = raw.upsert.mock.calls[0][0];
    expect(primeiro.where).toEqual({ odooId: 1 });
    expect(primeiro.create.odooWriteDate).toBeInstanceOf(Date);
    const segundo = raw.upsert.mock.calls[1][0];
    expect(segundo.create.odooWriteDate).toBeNull();
  });
});

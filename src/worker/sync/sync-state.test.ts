import { markRunning, markOk, markError, ensureSyncState } from "./sync-state";

function fakePrisma() {
  return {
    syncState: {
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
  } as never;
}

describe("sync-state", () => {
  it("markRunning grava lastStatus rodando", async () => {
    const p = fakePrisma();
    await markRunning(p, "res.partner");
    expect((p as never as { syncState: { update: jest.Mock } }).syncState.update)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          where: { model: "res.partner" },
          data: { lastStatus: "rodando" },
        }),
      );
  });

  it("markOk grava status ok, contagem e o campo de timestamp do ciclo", async () => {
    const p = fakePrisma();
    await markOk(p, "res.partner", "incremental", 12);
    const call = (p as never as { syncState: { update: jest.Mock } }).syncState.update.mock.calls[0][0];
    expect(call.data.lastStatus).toBe("ok");
    expect(call.data.recordCount).toBe(12);
    expect(call.data.lastIncrementalAt).toBeInstanceOf(Date);
  });

  it("CR-01: markOk persiste o watermark passado em vez de new Date()", async () => {
    const p = fakePrisma();
    const watermark = new Date("2026-05-10T08:00:00Z");
    await markOk(p, "res.partner", "incremental", 5, watermark);
    const call = (p as never as { syncState: { update: jest.Mock } }).syncState.update.mock.calls[0][0];
    expect(call.data.lastIncrementalAt).toBe(watermark);
  });

  it("markError grava status erro e mensagem truncada", async () => {
    const p = fakePrisma();
    await markError(p, "res.partner", "x".repeat(900));
    const call = (p as never as { syncState: { update: jest.Mock } }).syncState.update.mock.calls[0][0];
    expect(call.data.lastStatus).toBe("erro");
    expect(call.data.lastError.length).toBeLessThanOrEqual(500);
  });

  it("ensureSyncState faz upsert da linha do modelo (WR-03)", async () => {
    const p = fakePrisma();
    await ensureSyncState(p, "res.partner", "incremental");
    const call = (p as never as { syncState: { upsert: jest.Mock } }).syncState.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ model: "res.partner" });
    expect(call.create).toEqual({ model: "res.partner", mode: "incremental" });
  });
});

import { readSyncConfig, SYNC_CONFIG_DEFAULTS } from "./sync-config";

const fakePrisma = (rows: { key: string; value: unknown }[]) =>
  ({ appSetting: { findMany: jest.fn().mockResolvedValue(rows) } }) as never;

describe("readSyncConfig", () => {
  it("usa os defaults quando não há linhas", async () => {
    const cfg = await readSyncConfig(fakePrisma([]));
    expect(cfg).toEqual(SYNC_CONFIG_DEFAULTS);
  });

  it("sobrescreve com os valores de AppSetting", async () => {
    const cfg = await readSyncConfig(
      fakePrisma([{ key: "sync.incremental_interval_min", value: 10 }]),
    );
    expect(cfg.incrementalIntervalMin).toBe(10);
    expect(cfg.snapshotIntervalMin).toBe(SYNC_CONFIG_DEFAULTS.snapshotIntervalMin);
  });

  it("WR-09: valor corrompido cai no default sem propagar NaN", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const cfg = await readSyncConfig(
      fakePrisma([
        { key: "sync.incremental_interval_min", value: "abc" },
        { key: "sync.snapshot_interval_min", value: -5 },
        { key: "sync.reconcile_interval_min", value: { foo: 1 } },
      ]),
    );
    expect(cfg).toEqual(SYNC_CONFIG_DEFAULTS);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

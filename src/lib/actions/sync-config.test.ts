jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));

import { syncConfigSchema } from "@/lib/validations/sync-config";

describe("syncConfigSchema", () => {
  it("aceita intervalos inteiros positivos", () => {
    const r = syncConfigSchema.safeParse({
      incrementalIntervalMin: 3,
      snapshotIntervalMin: 1440,
      reconcileIntervalMin: 1440,
    });
    expect(r.success).toBe(true);
  });

  it("rejeita intervalo menor que 1", () => {
    const r = syncConfigSchema.safeParse({
      incrementalIntervalMin: 0,
      snapshotIntervalMin: 1440,
      reconcileIntervalMin: 1440,
    });
    expect(r.success).toBe(false);
  });
});

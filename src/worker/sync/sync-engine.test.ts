import { runModelCycle } from "./sync-engine";

describe("runModelCycle , isolamento de falha", () => {
  it("erro num modelo vira markError, não lança", async () => {
    const deps = {
      prisma: {} as never,
      client: {} as never,
      markRunning: jest.fn(),
      markOk: jest.fn(),
      markError: jest.fn(),
      markNoAccess: jest.fn(),
      runner: jest.fn().mockRejectedValue(new Error("timeout")),
    };
    await expect(runModelCycle(deps as never, "res.partner")).resolves.toBeUndefined();
    expect(deps.markError).toHaveBeenCalledWith(expect.anything(), "res.partner", "timeout");
    expect(deps.markOk).not.toHaveBeenCalled();
  });

  it("AccessError vira markNoAccess", async () => {
    const { OdooRpcFault } = await import("../odoo/errors");
    const deps = {
      prisma: {} as never,
      client: {} as never,
      markRunning: jest.fn(),
      markOk: jest.fn(),
      markError: jest.fn(),
      markNoAccess: jest.fn(),
      runner: jest.fn().mockRejectedValue(new OdooRpcFault({ data: { name: "AccessError" } })),
    };
    await runModelCycle(deps as never, "res.partner");
    expect(deps.markNoAccess).toHaveBeenCalled();
    expect(deps.markError).not.toHaveBeenCalled();
  });

  it("sucesso vira markOk com a contagem e o watermark do runner", async () => {
    const watermark = new Date("2026-05-10T08:00:00Z");
    const deps = {
      prisma: {} as never,
      client: {} as never,
      cycle: "incremental" as const,
      markRunning: jest.fn(),
      markOk: jest.fn(),
      markError: jest.fn(),
      markNoAccess: jest.fn(),
      runner: jest.fn().mockResolvedValue({ count: 7, watermark }),
    };
    await runModelCycle(deps as never, "res.partner");
    expect(deps.markOk).toHaveBeenCalledWith(
      expect.anything(),
      "res.partner",
      "incremental",
      7,
      watermark,
    );
  });

  it("WR-02: um mark* que lança no catch não escapa do ciclo", async () => {
    const deps = {
      prisma: {} as never,
      client: {} as never,
      cycle: "incremental" as const,
      markRunning: jest.fn(),
      markOk: jest.fn(),
      markError: jest.fn().mockRejectedValue(new Error("P2025")),
      markNoAccess: jest.fn(),
      runner: jest.fn().mockRejectedValue(new Error("falha no runner")),
    };
    await expect(runModelCycle(deps as never, "res.partner")).resolves.toBeUndefined();
  });
});

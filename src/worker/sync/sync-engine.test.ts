import { runModelCycle } from "./sync-engine";

describe("runModelCycle — isolamento de falha", () => {
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

  it("sucesso vira markOk com a contagem do runner", async () => {
    const deps = {
      prisma: {} as never,
      client: {} as never,
      cycle: "incremental" as const,
      markRunning: jest.fn(),
      markOk: jest.fn(),
      markError: jest.fn(),
      markNoAccess: jest.fn(),
      runner: jest.fn().mockResolvedValue(7),
    };
    await runModelCycle(deps as never, "res.partner");
    expect(deps.markOk).toHaveBeenCalledWith(expect.anything(), "res.partner", expect.anything(), 7);
  });
});

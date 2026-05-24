// mcp/health/__tests__/health.test.ts
// TDD para o handler de health check (Bloco I).
import { buildHealthHandler } from "../handler.js";
import type { HealthDeps } from "../handler.js";

function makeDeps(overrides: Partial<HealthDeps> = {}): HealthDeps {
  return {
    queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    redisPing: jest.fn().mockResolvedValue("PONG"),
    odooAuthenticate: jest.fn().mockResolvedValue(1),
    getQueueCounts: jest.fn().mockResolvedValue({ active: 0, waiting: 1, delayed: 0, failed: 0, completed: 0 }),
    getCacheFreshnessSeconds: jest.fn().mockResolvedValue(120),
    getCommit: jest.fn().mockReturnValue("abc1234"),
    ...overrides,
  };
}

describe("health handler", () => {
  it("retorna healthy quando tudo ok e freshness < 600", async () => {
    const handler = buildHealthHandler(makeDeps());
    const result = await handler();

    expect(result.status).toBe("healthy");
    expect(result.checks.postgres).toBe("ok");
    expect(result.checks.redis).toBe("ok");
    expect(result.checks.cache_freshness_seconds).toBe(120);
    expect(result.version).toBe("0.1.0");
    expect(result.commit).toBe("abc1234");
    expect(result.protocol_version).toBe("2025-06-18");
    expect(typeof result.timestamp).toBe("string");
  });

  it("retorna degraded quando freshness entre 600 e 3600", async () => {
    const deps = makeDeps({ getCacheFreshnessSeconds: jest.fn().mockResolvedValue(1800) });
    const handler = buildHealthHandler(deps);
    const result = await handler();
    expect(result.status).toBe("degraded");
  });

  it("retorna unhealthy quando freshness > 3600", async () => {
    const deps = makeDeps({ getCacheFreshnessSeconds: jest.fn().mockResolvedValue(4000) });
    const handler = buildHealthHandler(deps);
    const result = await handler();
    expect(result.status).toBe("unhealthy");
  });

  it("retorna degraded quando postgres falha", async () => {
    const deps = makeDeps({ queryRaw: jest.fn().mockRejectedValue(new Error("connection refused")) });
    const handler = buildHealthHandler(deps);
    const result = await handler();
    expect(result.status).toBe("unhealthy"); // postgres fail = unhealthy
    expect(result.checks.postgres).toBe("fail");
  });

  it("retorna unhealthy quando redis falha", async () => {
    const deps = makeDeps({ redisPing: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) });
    const handler = buildHealthHandler(deps);
    const result = await handler();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.redis).toBe("fail");
  });

  it("marca odoo como skip quando odooAuthenticate é null", async () => {
    const deps = makeDeps({ odooAuthenticate: null });
    const handler = buildHealthHandler(deps);
    const result = await handler();
    expect(result.checks.odoo_read).toBe("skip");
    expect(result.checks.odoo_write).toBe("skip");
  });

  it("marca odoo como fail quando autenticação falha", async () => {
    const deps = makeDeps({ odooAuthenticate: jest.fn().mockRejectedValue(new Error("timeout")) });
    const handler = buildHealthHandler(deps);
    const result = await handler();
    expect(result.checks.odoo_read).toBe("fail");
    expect(result.checks.odoo_write).toBe("fail");
    expect(result.status).toBe("degraded");
  });

  it("inclui worker_queue_depth com a soma dos jobs pendentes", async () => {
    const deps = makeDeps({
      getQueueCounts: jest.fn().mockResolvedValue({ active: 2, waiting: 3, delayed: 1, failed: 0, completed: 10 }),
    });
    const handler = buildHealthHandler(deps);
    const result = await handler();
    // depth = active + waiting + delayed = 6
    expect(result.checks.worker_queue_depth).toBe(6);
  });

  it("retorna degraded quando algum check é fail mas postgres e redis ok e freshness ok", async () => {
    const deps = makeDeps({ odooAuthenticate: jest.fn().mockRejectedValue(new Error("timeout")) });
    const handler = buildHealthHandler(deps);
    const result = await handler();
    expect(result.status).toBe("degraded");
  });
});

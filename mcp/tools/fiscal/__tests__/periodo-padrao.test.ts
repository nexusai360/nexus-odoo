// mcp/tools/fiscal/__tests__/periodo-padrao.test.ts
import { resolverPeriodoFiscal } from "../_periodo-padrao";

describe("resolverPeriodoFiscal", () => {
  const hoje = new Date("2026-06-09T12:00:00Z");

  it("usa o periodo informado quando de E ate vem", () => {
    const r = resolverPeriodoFiscal("2025-01-01", "2025-12-31", hoje);
    expect(r.assumido).toBe(false);
    expect(r.periodoDe).toBe("2025-01-01");
    expect(r.periodoAte).toBe("2025-12-31");
  });

  it("assume o ANO CORRENTE quando nenhum periodo vem (evita acumular anos)", () => {
    const r = resolverPeriodoFiscal(undefined, undefined, hoje);
    expect(r.assumido).toBe(true);
    expect(r.periodoDe).toBe("2026-01-01");
    expect(r.periodoAte).toBe("2026-06-09");
    expect(r.label).toContain("2026");
  });

  it("assume ano corrente se vier so um dos limites (par incompleto)", () => {
    const r = resolverPeriodoFiscal("2025-01-01", undefined, hoje);
    expect(r.assumido).toBe(true);
    expect(r.periodoDe).toBe("2026-01-01");
  });
});

// mcp/tools/fiscal/__tests__/periodo-padrao.test.ts
import { resolverPeriodoFiscal, TEXTO_HONESTO_PRE_CORTE } from "../_periodo-padrao";

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

  // Limpa 2026+ T7a: honestidade pre-corte (spec §5)
  it("periodo inteiramente antes do corte => preCorte=true", () => {
    const r = resolverPeriodoFiscal("2025-01-01", "2025-12-31", hoje);
    expect(r.preCorte).toBe(true);
  });

  it("periodo cruzando o corte NAO e preCorte (tem dado 2026 consultavel)", () => {
    const r = resolverPeriodoFiscal("2025-12-01", "2026-01-31", hoje);
    expect(r.preCorte).toBe(false);
  });

  it("periodo assumido (ano corrente) nunca e preCorte", () => {
    const r = resolverPeriodoFiscal(undefined, undefined, hoje);
    expect(r.preCorte).toBe(false);
  });

  it("texto honesto e o da spec §5 (cache so 2026+, Odoo guarda o resto)", () => {
    expect(TEXTO_HONESTO_PRE_CORTE).toContain("2026 em diante");
    expect(TEXTO_HONESTO_PRE_CORTE).toContain("Odoo");
    expect(TEXTO_HONESTO_PRE_CORTE).not.toContain(String.fromCharCode(0x2014)); // sem travessao
  });
});

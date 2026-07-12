// mcp/tools/fiscal/__tests__/periodo-padrao.test.ts
import { resolverPeriodoFiscal, textoHonestoPreCorte } from "../_periodo-padrao";

describe("resolverPeriodoFiscal", () => {
  const hoje = new Date("2026-06-09T12:00:00Z");

  // O inicio pedido e GRAMPEADO ao corte de dados (marco zero configurado na tela): a
  // plataforma nao tem documento antes disso, e a resposta diz isso no rotulo.
  it("periodo informado antes do corte e puxado para o corte", () => {
    const r = resolverPeriodoFiscal("2025-01-01", "2026-05-31", hoje);
    expect(r.assumido).toBe(false);
    expect(r.periodoDe).toBe("2026-03-16");
    expect(r.periodoAte).toBe("2026-05-31");
    expect(r.label).toContain("16/03/2026");
  });

  it("periodo informado dentro da janela e usado como veio", () => {
    const r = resolverPeriodoFiscal("2026-04-01", "2026-04-30", hoje);
    expect(r.assumido).toBe(false);
    expect(r.periodoDe).toBe("2026-04-01");
    expect(r.periodoAte).toBe("2026-04-30");
  });

  it("assume o ANO CORRENTE quando nenhum periodo vem (evita acumular anos)", () => {
    const r = resolverPeriodoFiscal(undefined, undefined, hoje);
    expect(r.assumido).toBe(true);
    expect(r.periodoDe).toBe("2026-03-16");
    expect(r.periodoAte).toBe("2026-06-09");
    expect(r.label).toContain("2026");
  });

  it("assume ano corrente se vier so um dos limites (par incompleto)", () => {
    const r = resolverPeriodoFiscal("2025-01-01", undefined, hoje);
    expect(r.assumido).toBe(true);
    expect(r.periodoDe).toBe("2026-03-16");
  });

  // Limpa 2026+ T7a: honestidade pre-corte (spec §5)
  it("periodo inteiramente antes do corte => preCorte=true", () => {
    const r = resolverPeriodoFiscal("2025-01-01", "2025-12-31", hoje);
    expect(r.preCorte).toBe(true);
  });

  it("periodo cruzando o corte NAO e preCorte (tem dado consultavel depois do corte)", () => {
    const r = resolverPeriodoFiscal("2025-12-01", "2026-05-31", hoje);
    expect(r.preCorte).toBe(false);
  });

  it("periodo assumido (ano corrente) nunca e preCorte", () => {
    const r = resolverPeriodoFiscal(undefined, undefined, hoje);
    expect(r.preCorte).toBe(false);
  });

  it("texto honesto cita a data do corte configurada e explica que o Odoo guarda o resto", () => {
    expect(textoHonestoPreCorte()).toContain("16/03/2026");
    expect(textoHonestoPreCorte()).toContain("Odoo");
    expect(textoHonestoPreCorte()).not.toContain(String.fromCharCode(0x2014)); // sem travessao
  });
});

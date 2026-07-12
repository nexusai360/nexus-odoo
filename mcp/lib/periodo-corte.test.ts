import { describe, it, expect } from "@jest/globals";
import { resolverPeriodoCorte, mesesDoPeriodoCorte } from "./periodo-corte";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

// O cache de processo do corte comeca no padrao (2026-03-16) e nenhum teste aqui chama
// getCorteDados, entao o corte vigente e o padrao.
const CORTE = CORTE_DADOS_PADRAO; // 2026-03-16
const HOJE = new Date("2026-07-12T12:00:00Z");

describe("resolverPeriodoCorte", () => {
  it("sem periodo nenhum, aplica o PISO do corte (nao varre o historico)", () => {
    const p = resolverPeriodoCorte(undefined, undefined, HOJE);
    expect(p.periodoDe).toBe(CORTE);
    expect(p.periodoAte).toBe("2026-07-12");
    expect(p.assumido).toBe(true);
    expect(p.cortado).toBe(false);
    expect(p.aviso).toContain("16/03/2026");
  });

  it("periodo que comeca antes do corte e grampeado e marcado como cortado", () => {
    const p = resolverPeriodoCorte("2024-01-01", "2026-06-30", HOJE);
    expect(p.periodoDe).toBe(CORTE);
    expect(p.periodoAte).toBe("2026-06-30");
    expect(p.cortado).toBe(true);
    expect(p.preCorte).toBe(false);
    expect(p.label).toContain("16/03/2026");
    expect(p.aviso).toBeDefined();
  });

  it("periodo inteiramente anterior ao corte e sinalizado com preCorte", () => {
    const p = resolverPeriodoCorte("2024-01-01", "2024-12-31", HOJE);
    expect(p.preCorte).toBe(true);
    expect(p.cortado).toBe(true);
    expect(p.aviso).toBeDefined();
  });

  it("periodo posterior ao corte passa intacto e sem aviso", () => {
    const p = resolverPeriodoCorte("2026-05-01", "2026-05-31", HOJE);
    expect(p.periodoDe).toBe("2026-05-01");
    expect(p.periodoAte).toBe("2026-05-31");
    expect(p.cortado).toBe(false);
    expect(p.assumido).toBe(false);
    expect(p.aviso).toBeUndefined();
  });

  it("so `de` informado: fecha o par com hoje, grampeando o inicio", () => {
    const p = resolverPeriodoCorte("2025-01-01", undefined, HOJE);
    expect(p.periodoDe).toBe(CORTE);
    expect(p.periodoAte).toBe("2026-07-12");
    expect(p.cortado).toBe(true);
  });

  it("so `ate` informado: o inicio vira o corte", () => {
    const p = resolverPeriodoCorte(undefined, "2026-04-30", HOJE);
    expect(p.periodoDe).toBe(CORTE);
    expect(p.periodoAte).toBe("2026-04-30");
    expect(p.assumido).toBe(false);
  });

  it("mesesDoPeriodoCorte devolve o eixo mensal do periodo coberto", () => {
    const p = resolverPeriodoCorte("2024-01-01", "2026-06-30", HOJE);
    expect(mesesDoPeriodoCorte(p)).toEqual({ mesDe: "2026-03", mesAte: "2026-06" });
  });
});

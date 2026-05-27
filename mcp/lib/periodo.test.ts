import { describe, it, expect } from "@jest/globals";
import { resolverPeriodo } from "./periodo";

// Ancora: quarta-feira 27/05/2026 ao meio-dia BR.
const HOJE = new Date("2026-05-27T12:00:00-03:00");

describe("resolverPeriodo", () => {
  it("hoje retorna periodoDe=periodoAte=27/05/2026", () => {
    const p = resolverPeriodo({ periodoNome: "hoje", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-27");
    expect(p.periodoAte).toBe("2026-05-27");
  });

  it("amanha retorna 28/05/2026", () => {
    const p = resolverPeriodo({ periodoNome: "amanha", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-28");
    expect(p.periodoAte).toBe("2026-05-28");
  });

  it("essa_semana retorna seg-dom (25/05 a 31/05)", () => {
    const p = resolverPeriodo({ periodoNome: "essa_semana", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-25");
    expect(p.periodoAte).toBe("2026-05-31");
  });

  it("semana_passada retorna 18/05 a 24/05", () => {
    const p = resolverPeriodo({ periodoNome: "semana_passada", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-18");
    expect(p.periodoAte).toBe("2026-05-24");
  });

  it("mes_corrente retorna 01/05 a 27/05", () => {
    const p = resolverPeriodo({ periodoNome: "mes_corrente", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-05-01");
    expect(p.periodoAte).toBe("2026-05-27");
  });

  it("mes_anterior retorna 01/04 a 30/04", () => {
    const p = resolverPeriodo({ periodoNome: "mes_anterior", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-04-01");
    expect(p.periodoAte).toBe("2026-04-30");
  });

  it("mes_passado e alias de mes_anterior", () => {
    const a = resolverPeriodo({ periodoNome: "mes_anterior", hoje: HOJE });
    const b = resolverPeriodo({ periodoNome: "mes_passado", hoje: HOJE });
    expect(a).toEqual(b);
  });

  it("ano_corrente retorna 01/01 a 27/05", () => {
    const p = resolverPeriodo({ periodoNome: "ano_corrente", hoje: HOJE });
    expect(p.periodoDe).toBe("2026-01-01");
    expect(p.periodoAte).toBe("2026-05-27");
  });

  it("aceita periodoDe/periodoAte literais e bypassa periodoNome", () => {
    const p = resolverPeriodo({
      periodoDe: "2025-12-15",
      periodoAte: "2026-01-31",
      hoje: HOJE,
    });
    expect(p.periodoDe).toBe("2025-12-15");
    expect(p.periodoAte).toBe("2026-01-31");
  });

  it("virada de mes: hoje=30/04 + mes_corrente = 01/04 a 30/04", () => {
    const trinta = new Date("2026-04-30T12:00:00-03:00");
    const p = resolverPeriodo({ periodoNome: "mes_corrente", hoje: trinta });
    expect(p.periodoDe).toBe("2026-04-01");
    expect(p.periodoAte).toBe("2026-04-30");
  });

  it("ano bissexto: hoje=29/02/2028 + mes_anterior=01/01 a 31/01/2028", () => {
    const bissexto = new Date("2028-02-29T12:00:00-03:00");
    const p = resolverPeriodo({ periodoNome: "mes_anterior", hoje: bissexto });
    expect(p.periodoDe).toBe("2028-01-01");
    expect(p.periodoAte).toBe("2028-01-31");
  });

  // HIGH-G v1: testes de fronteira de semana
  it("essa_semana em domingo retorna seg-dom (semana ISO terminando hoje)", () => {
    const domingo = new Date("2026-05-31T12:00:00-03:00");
    const p = resolverPeriodo({ periodoNome: "essa_semana", hoje: domingo });
    expect(p.periodoDe).toBe("2026-05-25");
    expect(p.periodoAte).toBe("2026-05-31");
  });

  it("essa_semana em segunda retorna a propria segunda como inicio", () => {
    const segunda = new Date("2026-05-25T12:00:00-03:00");
    const p = resolverPeriodo({ periodoNome: "essa_semana", hoje: segunda });
    expect(p.periodoDe).toBe("2026-05-25");
    expect(p.periodoAte).toBe("2026-05-31");
  });

  // CRIT-A v1: container UTC nao confunde dia BR a noite
  it("toIsoDate trata 23h BR como mesmo dia (nao pula para o dia UTC seguinte)", () => {
    const tardeBR = new Date("2026-05-27T23:30:00-03:00");
    const p = resolverPeriodo({ periodoNome: "hoje", hoje: tardeBR });
    expect(p.periodoDe).toBe("2026-05-27");
    expect(p.periodoAte).toBe("2026-05-27");
  });

  it("virada de ano: hoje=15/01/2027 + mes_anterior=01/12 a 31/12/2026", () => {
    const janeiro = new Date("2027-01-15T12:00:00-03:00");
    const p = resolverPeriodo({ periodoNome: "mes_anterior", hoje: janeiro });
    expect(p.periodoDe).toBe("2026-12-01");
    expect(p.periodoAte).toBe("2026-12-31");
  });
});

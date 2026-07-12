import { resolverPeriodoDir } from "./periodo";

// 2026-06-28 é um domingo.
const hoje = new Date("2026-06-28T12:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("resolverPeriodoDir", () => {
  it("hoje cobre só o dia atual", () => {
    const r = resolverPeriodoDir({ periodo: "hoje" }, hoje);
    expect(iso(r.de)).toBe("2026-06-28");
    expect(iso(r.ate)).toBe("2026-06-28");
  });

  it("esta semana vai de segunda a domingo", () => {
    const r = resolverPeriodoDir({ periodo: "semana" }, hoje);
    expect(iso(r.de)).toBe("2026-06-22"); // segunda
    expect(iso(r.ate)).toBe("2026-06-28"); // domingo
  });

  it("este mês cobre junho inteiro", () => {
    const r = resolverPeriodoDir({ periodo: "este_mes" }, hoje);
    expect(iso(r.de)).toBe("2026-06-01");
    expect(iso(r.ate)).toBe("2026-06-30");
  });

  // O inicio de qualquer periodo e grampeado ao CORTE DE DADOS (marco zero configurado na
  // tela, 16/03/2026 por padrao): a plataforma nao tem documento antes disso, e mostrar um
  // periodo maior daria a impressao de cobrir um intervalo que ela nao cobre.
  it("ano atual comeca no corte de dados, nao em 1o de janeiro", () => {
    const r = resolverPeriodoDir({ periodo: "ano_atual" }, hoje);
    expect(iso(r.de)).toBe("2026-03-16");
    expect(iso(r.ate)).toBe("2026-12-31");
  });

  it("ano anterior (todo antes do corte) e puxado para o corte", () => {
    const r = resolverPeriodoDir({ periodo: "ano_anterior" }, hoje);
    expect(iso(r.de)).toBe("2026-03-16");
    expect(iso(r.ate)).toBe("2025-12-31");
  });

  it("últimos 7 dias termina hoje", () => {
    const r = resolverPeriodoDir({ periodo: "ultimos_7" }, hoje);
    expect(iso(r.de)).toBe("2026-06-21");
    expect(iso(r.ate)).toBe("2026-06-28");
  });

  it("últimos 90 dias termina hoje", () => {
    const r = resolverPeriodoDir({ periodo: "ultimos_90" }, hoje);
    expect(iso(r.ate)).toBe("2026-06-28");
    expect(iso(r.de)).toBe("2026-03-30");
  });

  it("custom lê de/ate dos params (e grampeia o inicio ao corte)", () => {
    const r = resolverPeriodoDir(
      { periodo: "custom", de: "2026-04-01", ate: "2026-04-15" },
      hoje,
    );
    expect(iso(r.de)).toBe("2026-04-01");
    expect(iso(r.ate)).toBe("2026-04-15");
    expect(r.preset).toBe("custom");
  });

  it("preset inválido cai em este_mes", () => {
    const r = resolverPeriodoDir({ periodo: "xpto" }, hoje);
    expect(r.preset).toBe("este_mes");
    expect(iso(r.de)).toBe("2026-06-01");
  });
});

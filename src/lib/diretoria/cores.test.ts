import { classeDelta, formatarDelta, statusPrazo, diasRestantes } from "./cores";

describe("classeDelta", () => {
  it("classifica positivo/negativo/neutro", () => {
    expect(classeDelta(5)).toBe("positivo");
    expect(classeDelta(-5)).toBe("negativo");
    expect(classeDelta(0)).toBe("neutro");
  });
});

describe("formatarDelta", () => {
  it("variação positiva", () => {
    const d = formatarDelta(120, 100);
    expect(d.classe).toBe("positivo");
    expect(d.simbolo).toBe("▲");
    expect(Math.round(d.pct)).toBe(20);
  });
  it("variação negativa", () => {
    const d = formatarDelta(80, 100);
    expect(d.classe).toBe("negativo");
    expect(d.simbolo).toBe("▼");
    expect(Math.round(d.pct)).toBe(-20);
  });
  it("anterior zero não divide por zero", () => {
    const d = formatarDelta(50, 0);
    expect(d.pct).toBe(0);
    expect(d.classe).toBe("positivo");
  });
});

describe("diasRestantes", () => {
  it("conta dias até a data prevista", () => {
    expect(diasRestantes(new Date("2026-07-01"), new Date("2026-06-28"))).toBe(3);
    expect(diasRestantes(new Date("2026-06-20"), new Date("2026-06-28"))).toBe(-8);
  });
});

describe("statusPrazo", () => {
  const hoje = new Date("2026-06-28");
  it("atrasado quando já passou", () => {
    expect(statusPrazo(new Date("2026-06-20"), hoje)).toBe("atrasado");
  });
  it("atenção quando vence em até 3 dias", () => {
    expect(statusPrazo(new Date("2026-06-30"), hoje)).toBe("atencao");
  });
  it("no prazo quando falta mais que o limiar", () => {
    expect(statusPrazo(new Date("2026-07-15"), hoje)).toBe("no_prazo");
  });
});

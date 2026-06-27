import {
  CHART_COLORS,
  CHART_PALETTE,
  CORES_SELECIONAVEIS,
  colorAt,
  corResolvida,
  paletaApartirDe,
} from "./colors";

describe("colors", () => {
  it("expõe a paleta com pelo menos 5 cores distintas", () => {
    expect(CHART_PALETTE.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CHART_PALETTE).size).toBe(CHART_PALETTE.length);
  });

  it("todas as cores são hex válidos", () => {
    for (const cor of Object.values(CHART_COLORS)) {
      expect(cor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("colorAt cicla a paleta", () => {
    expect(colorAt(0)).toBe(CHART_PALETTE[0]);
    expect(colorAt(CHART_PALETTE.length)).toBe(CHART_PALETTE[0]);
    expect(colorAt(1)).toBe(CHART_PALETTE[1]);
  });

  it("colorAt trata índices inválidos com fallback", () => {
    expect(colorAt(-1)).toBe(CHART_PALETTE[0]);
    expect(colorAt(Number.NaN)).toBe(CHART_PALETTE[0]);
  });

  describe("CORES_SELECIONAVEIS", () => {
    it("expõe ao menos 6 cores com token, label e hex válidos", () => {
      expect(CORES_SELECIONAVEIS.length).toBeGreaterThanOrEqual(6);
      for (const c of CORES_SELECIONAVEIS) {
        expect(typeof c.token).toBe("string");
        expect(c.label.length).toBeGreaterThan(0);
        expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
        expect(CHART_COLORS[c.token]).toBe(c.hex);
      }
    });
  });

  describe("corResolvida", () => {
    it("retorna null para ausente/vazio/invalido", () => {
      expect(corResolvida(undefined)).toBeNull();
      expect(corResolvida("")).toBeNull();
      expect(corResolvida("   ")).toBeNull();
      expect(corResolvida("roxo-magico")).toBeNull();
      expect(corResolvida("#zzzzzz")).toBeNull();
    });

    it("resolve token da paleta para hex", () => {
      expect(corResolvida("violet")).toBe(CHART_COLORS.violet);
      expect(corResolvida("emerald")).toBe(CHART_COLORS.emerald);
    });

    it("aceita hex direto (6 digitos)", () => {
      expect(corResolvida("#123abc")).toBe("#123abc");
      expect(corResolvida("#FFFFFF")).toBe("#FFFFFF");
    });
  });

  describe("paletaApartirDe", () => {
    it("sem cor retorna a paleta padrao", () => {
      expect(paletaApartirDe(undefined)).toEqual(CHART_PALETTE);
      expect(paletaApartirDe("invalida")).toEqual(CHART_PALETTE);
    });

    it("rotaciona a paleta para a cor escolhida liderar", () => {
      const p = paletaApartirDe("emerald");
      expect(p[0]).toBe(CHART_COLORS.emerald);
      // mantem todas as cores da paleta (sem perder nenhuma)
      expect(new Set(p)).toEqual(new Set(CHART_PALETTE));
      expect(p.length).toBe(CHART_PALETTE.length);
    });

    it("prefixa cor custom fora da paleta", () => {
      const p = paletaApartirDe("#abcdef");
      expect(p[0]).toBe("#abcdef");
      expect(p.length).toBe(CHART_PALETTE.length + 1);
    });
  });
});

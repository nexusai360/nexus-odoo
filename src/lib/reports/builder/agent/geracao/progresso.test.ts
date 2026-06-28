import { FAIXAS, FRASES, pctBase, pctAlvo, frasesDe, FASES_ORDEM } from "./progresso";

describe("progresso , faixas pesadas por duracao", () => {
  it("faixas sao monotonicas e terminam em 100", () => {
    let anterior = 0;
    for (const fase of FASES_ORDEM) {
      expect(FAIXAS[fase].de).toBeGreaterThanOrEqual(anterior);
      expect(FAIXAS[fase].ate).toBeGreaterThan(FAIXAS[fase].de);
      anterior = FAIXAS[fase].ate;
    }
    expect(FAIXAS[FASES_ORDEM[FASES_ORDEM.length - 1]].ate).toBe(100);
  });

  it("a fase blueprint (a que pensa) domina a faixa; build/validacao sao caudas curtas", () => {
    const llm = FAIXAS.blueprint.ate - FAIXAS.blueprint.de;
    const cauda = (FAIXAS.build.ate - FAIXAS.build.de) + (FAIXAS.validacao.ate - FAIXAS.validacao.de);
    expect(llm).toBeGreaterThan(cauda * 3);
  });

  it("pctBase/pctAlvo refletem a faixa", () => {
    expect(pctBase("blueprint")).toBe(FAIXAS.blueprint.de);
    expect(pctAlvo("validacao")).toBe(100);
  });

  it("cada fase tem frases especificas e nao vazias (sem termos tecnicos)", () => {
    for (const fase of FASES_ORDEM) {
      const fs = frasesDe(fase);
      expect(fs.length).toBeGreaterThan(0);
      for (const f of fs) {
        expect(f.trim().length).toBeGreaterThan(0);
        expect(f.toLowerCase()).not.toContain("blueprint");
        expect(f.toLowerCase()).not.toContain("pipeline");
      }
    }
    expect(FRASES.blueprint).toBeDefined();
  });
});

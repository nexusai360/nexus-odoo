import { montarCapabilityMap, capabilityComoTextoPrompt } from "./capabilities";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("capability map", () => {
  it("escopo cita estoque; naoSuportado cita vendas/faturamento/pedido", () => {
    const c = montarCapabilityMap();
    expect(c.escopoAtual.toLowerCase()).toContain("estoque");
    expect(c.naoSuportado.some((n) => /venda|faturamento|pedido/i.test(n.pedido))).toBe(true);
  });

  it("cada fonte tem rotulo, KPIs curados e visualizacao recomendada", () => {
    const c = montarCapabilityMap();
    expect(c.fontes.length).toBeGreaterThanOrEqual(8);
    for (const f of c.fontes) {
      expect(f.rotulo).toBeTruthy();
      expect(f.kpisSugeridos.length).toBeGreaterThan(0);
      expect(f.visualizacaoRecomendada.length).toBeGreaterThan(0);
    }
    expect(c.fontes.find((f) => f.fato === "fato_estoque_parados")?.kpisSugeridos).toEqual(
      expect.arrayContaining([expect.stringMatching(/imobilizado/i)]),
    );
  });

  it("toda fonte do capability map existe no registry real", () => {
    const c = montarCapabilityMap();
    // nao inventa fonte: todo fato curado tem contrato no registry
    for (const f of c.fontes) {
      expect(typeof f.fato).toBe("string");
      expect(f.fato.startsWith("fato_")).toBe(true);
    }
  });

  it("naoSuportado usa 'ainda', nunca 'impossivel/nao da'", () => {
    for (const n of montarCapabilityMap().naoSuportado) {
      expect(n.frase.toLowerCase()).toContain("ainda");
      expect(n.frase.toLowerCase()).not.toMatch(/imposs|n[aã]o d[aá]/);
      expect(n.caminhoProximo.length).toBeGreaterThan(0);
    }
  });

  it("texto do prompt inclui escopo e um fato", () => {
    const t = capabilityComoTextoPrompt();
    expect(t).toContain("estoque");
    expect(t).toContain("fato_estoque_saldo");
  });
});

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { templatePadrao } from "./template-padrao";
import { listarMetricas } from "./metric-catalog";
import { planoSchema } from "./plano-types";
import { revisarPlano } from "./revisor";
import { buildFichaDoPlano } from "./build-plano";

const metricas = listarMetricas({ dominiosPermitidos: ["estoque"] });

describe("templatePadrao (estoque)", () => {
  it("produz um Plano valido no schema", () => {
    expect(() => planoSchema.parse(templatePadrao("estoque", metricas))).not.toThrow();
  });

  it("passa pelo revisor SEM ajustes (ja e coerente por construcao)", () => {
    const { ajustes } = revisarPlano(templatePadrao("estoque", metricas), { metricas, amostra: [] });
    expect(ajustes).toEqual([]);
  });

  it("constroi a ficha sem omitidos", () => {
    const { omitidos, ficha } = buildFichaDoPlano(templatePadrao("estoque", metricas), metricas);
    expect(omitidos).toEqual([]);
    expect(ficha.secoes.length).toBeGreaterThanOrEqual(3);
  });
});

describe("templatePadrao por dominio (gerar-ja 0 LLM) , mostra os componentes novos", () => {
  const casos: { dominio: string; templatesEsperados: string[] }[] = [
    { dominio: "financeiro", templatesEsperados: ["Combo", "Waterfall"] },
    { dominio: "comercial", templatesEsperados: ["Funnel"] },
    { dominio: "fiscal", templatesEsperados: ["Treemap"] },
  ];

  for (const { dominio, templatesEsperados } of casos) {
    const ms = listarMetricas({ dominiosPermitidos: [dominio] });

    it(`${dominio}: plano valido no schema e revisor sem ajustes`, () => {
      const plano = templatePadrao(dominio, ms);
      expect(() => planoSchema.parse(plano)).not.toThrow();
      expect(plano.blocos.length).toBeGreaterThan(0);
      const { ajustes } = revisarPlano(plano, { metricas: ms, amostra: [] });
      expect(ajustes).toEqual([]);
    });

    it(`${dominio}: build sem omitidos e mostra ${templatesEsperados.join("+")}`, () => {
      const { omitidos, ficha } = buildFichaDoPlano(templatePadrao(dominio, ms), ms);
      expect(omitidos).toEqual([]);
      const tpls = ficha.secoes.map((s) => s.template);
      for (const t of templatesEsperados) expect(tpls).toContain(t);
    });
  }
});

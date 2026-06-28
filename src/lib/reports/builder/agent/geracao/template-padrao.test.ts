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

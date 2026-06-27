jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { parseBlueprint, promptBlueprint } from "./blueprint";

describe("parseBlueprint", () => {
  it("valida secoes viaveis e descarta as inviaveis em omitidos", () => {
    const raw = {
      titulo: "Estoque por armazem",
      objetivo: "acompanhar saldo e repor",
      secoes: [
        { template: "KPIRow", fato: "fato_estoque_saldo", config: { titulo: "Visao geral" } },
        { template: "BarChart", fato: "fato_estoque_saldo", config: {} },
        { template: "LineChart", fato: "fato_estoque_saldo", config: {} }, // saldo nao tem serieTemporal
        { template: "BarChart", fato: "fato_vendas", config: {} }, // fora do catalogo
      ],
    };
    const { blueprint, omitidos } = parseBlueprint(raw);
    expect(blueprint.secoes).toHaveLength(2);
    expect(omitidos).toHaveLength(2);
    // shapeDerivado e resolvido a partir do template quando ausente.
    expect(blueprint.secoes[0].shapeDerivado).toBe("kpis");
    expect(blueprint.secoes[1].shapeDerivado).toBe("agregacaoCategorica");
  });

  it("aceita JSON em string", () => {
    const raw = JSON.stringify({
      titulo: "t", objetivo: "o",
      secoes: [{ template: "DataTable", fato: "fato_estoque_saldo", config: {} }],
    });
    const { blueprint } = parseBlueprint(raw);
    expect(blueprint.secoes).toHaveLength(1);
  });

  it("lanca quando o JSON nao casa o schema basico", () => {
    expect(() => parseBlueprint({ foo: 1 })).toThrow();
  });
});

describe("promptBlueprint", () => {
  it("inclui o catalogo de capacidades e a intencao coletada", () => {
    const msgs = promptBlueprint({
      entendimento: "saldo por armazem",
      intencao: { secoes: [{ fato: "fato_estoque_saldo", template: "BarChart" }] },
      historico: [],
      user: { id: "u" },
    });
    const txt = msgs.map((m) => m.content).join("\n");
    expect(txt.toLowerCase()).toContain("estoque");
    expect(txt).toContain("saldo por armazem");
  });
});

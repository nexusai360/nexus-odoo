jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { parseCritico, promptCritico } from "./critico";
import { listarMetricas } from "./metric-catalog";
import type { IntencaoCurada } from "../../journey/intencao-curada";
import type { Plano } from "./plano-types";

const metricas = listarMetricas({ dominiosPermitidos: ["estoque"] });
const intencao: IntencaoCurada = { dominio: "estoque", objetivo: "risco de ruptura", recortes: [] };
const plano: Plano = {
  titulo: "x",
  objetivo: "y",
  dominio: "estoque",
  blocos: [{ tipo: "KpiStrip", metricas: ["estoque.negativos"] }],
  filtrosIniciais: {},
};

describe("parseCritico", () => {
  it("valida o plano ajustado e extrai a justificativa", () => {
    const raw = JSON.stringify({
      justificativa: "troquei valor por negativos pois a intencao e risco",
      plano: {
        titulo: "Risco de ruptura",
        objetivo: "risco",
        blocos: [{ tipo: "KpiStrip", metricas: ["estoque.negativos"] }],
      },
    });
    const out = parseCritico(raw, metricas);
    expect(out.plano.blocos).toHaveLength(1);
    expect(out.justificativa).toContain("risco");
  });

  it("promptCritico instrui juizo semantico e inclui o plano e a amostra", () => {
    const msgs = promptCritico(intencao, plano, [{ metricaId: "estoque.negativos", escalar: 172 }]);
    const txt = msgs.map((m) => m.content).join("\n");
    expect(txt).toContain("risco de ruptura");
    expect(txt.toLowerCase()).toContain("intencao");
  });
});

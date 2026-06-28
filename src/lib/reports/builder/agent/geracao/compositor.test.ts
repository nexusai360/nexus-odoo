jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { parseCompositor, promptCompositor } from "./compositor";
import { listarMetricas } from "./metric-catalog";
import type { IntencaoCurada } from "../../journey/intencao-curada";

const metricas = listarMetricas({ dominiosPermitidos: ["estoque"] });
const intencao: IntencaoCurada = { dominio: "estoque", objetivo: "saude do estoque", recortes: ["armazem"] };

describe("parseCompositor", () => {
  it("aceita um JSON canonico e devolve o Plano", () => {
    const raw = JSON.stringify({
      titulo: "Panorama",
      objetivo: "saude",
      blocos: [
        { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos"] },
        { tipo: "Ranking", metrica: "estoque.valor_armazem", recorte: "armazem" },
      ],
    });
    const { plano, omitidos } = parseCompositor(raw, metricas);
    expect(plano.blocos).toHaveLength(2);
    expect(plano.dominio).toBe("estoque");
    expect(omitidos).toEqual([]);
  });

  it("descarta bloco com metrica fora do catalogo (-> omitidos)", () => {
    const raw = JSON.stringify({
      titulo: "x",
      objetivo: "y",
      blocos: [
        { tipo: "Ranking", metrica: "vendas.faturamento", recorte: "x" },
        { tipo: "Tabela", metrica: "estoque.saldo_produto" },
      ],
    });
    const { plano, omitidos } = parseCompositor(raw, metricas);
    expect(plano.blocos.map((b) => b.tipo)).toEqual(["Tabela"]);
    expect(omitidos.length).toBe(1);
  });

  it("promptCompositor inclui o objetivo e a gramatica", () => {
    const msgs = promptCompositor(intencao, metricas);
    expect(msgs[0].role).toBe("system");
    expect(msgs.map((m) => m.content).join("\n")).toContain("saude do estoque");
  });
});

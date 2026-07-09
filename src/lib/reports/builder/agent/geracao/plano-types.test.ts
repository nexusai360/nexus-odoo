import { planoSchema, papelDoBloco } from "./plano-types";
import type { Bloco } from "./plano-types";

describe("planoSchema / papelDoBloco", () => {
  it("aceita um plano valido e classifica os papeis", () => {
    const p = {
      titulo: "Panorama do estoque",
      objetivo: "Ver saude e composicao",
      dominio: "estoque",
      blocos: [
        { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos"] },
        { tipo: "Ranking", metrica: "estoque.valor_armazem", recorte: "armazem" },
        { tipo: "Tabela", metrica: "estoque.saldo_produto" },
      ],
      filtrosIniciais: {},
    };
    const out = planoSchema.parse(p);
    expect(out.blocos).toHaveLength(3);
    expect(papelDoBloco(out.blocos[0] as Bloco)).toBe("panorama");
    expect(papelDoBloco(out.blocos[1] as Bloco)).toBe("analise");
    expect(papelDoBloco(out.blocos[2] as Bloco)).toBe("detalhe");
  });

  it("aceita o bloco composto TendenciaDistribuicao e o classifica como analise", () => {
    const bloco = {
      tipo: "TendenciaDistribuicao",
      metricaSerie: "estoque.movimento",
      metricaComposicao: "estoque.valor_marca",
    };
    const out = planoSchema.parse({
      titulo: "x",
      objetivo: "y",
      dominio: "estoque",
      blocos: [bloco],
      filtrosIniciais: {},
    });
    expect(papelDoBloco(out.blocos[0] as Bloco)).toBe("analise");
  });

  it("rejeita bloco de tipo desconhecido", () => {
    expect(() =>
      planoSchema.parse({
        titulo: "x",
        objetivo: "y",
        dominio: "estoque",
        blocos: [{ tipo: "Galaxia" }],
        filtrosIniciais: {},
      }),
    ).toThrow();
  });
});

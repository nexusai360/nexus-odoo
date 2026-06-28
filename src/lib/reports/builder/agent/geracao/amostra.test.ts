import { resolverAmostra } from "./amostra";
import type { Metrica } from "./metric-catalog";

function metrica(p: Partial<Metrica> & Pick<Metrica, "id" | "fato" | "shape">): Metrica {
  return {
    dominio: "estoque",
    campoKpi: undefined,
    rotulo: p.id,
    descricao: "",
    pergunta: "",
    formato: "contagem",
    dimensoes: [],
    temSerieTemporal: false,
    chartPreferido: "KPIRow",
    chartsValidos: ["KPIRow"],
    ...p,
  } as Metrica;
}

describe("resolverAmostra", () => {
  it("escalar de KPI vem do campoKpi certo (3 medidas do mesmo fato, valores distintos)", async () => {
    const metricas = [
      metrica({ id: "estoque.valor_total", fato: "fato_estoque_saldo", shape: "kpis", campoKpi: "valorTotal" }),
      metrica({ id: "estoque.produtos", fato: "fato_estoque_saldo", shape: "kpis", campoKpi: "totalProdutos" }),
      metrica({ id: "estoque.negativos", fato: "fato_estoque_saldo", shape: "kpis", campoKpi: "produtosNegativos" }),
    ];
    const resolver = jest.fn().mockResolvedValue({
      linhas: [],
      kpis: { valorTotal: 49447434.34, totalProdutos: 1894, produtosNegativos: 172 },
    });
    const out = await resolverAmostra(metricas, { resolver });
    expect(out.map((a) => a.escalar)).toEqual([49447434.34, 1894, 172]);
    // mesmo (fato,shape) resolvido UMA vez (cache), nao 3
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("agregacaoCategorica devolve cardinalidade e topN (top 5 por valor desc)", async () => {
    const linhas = Array.from({ length: 8 }, (_, i) => ({ rotulo: `c${i}`, valor: i }));
    const resolver = jest.fn().mockResolvedValue({ linhas });
    const out = await resolverAmostra(
      [metrica({ id: "estoque.valor_marca", fato: "fato_estoque_marca", shape: "agregacaoCategorica" })],
      { resolver },
    );
    expect(out[0].cardinalidade).toBe(8);
    expect(out[0].topN).toHaveLength(5);
    expect(out[0].topN?.[0]).toEqual({ rotulo: "c7", valor: 7 });
  });

  it("serieTemporal devolve nPontosSerie", async () => {
    const resolver = jest.fn().mockResolvedValue({ linhas: [{}, {}, {}, {}, {}] });
    const out = await resolverAmostra(
      [metrica({ id: "estoque.movimento", fato: "fato_estoque_movimento", shape: "serieTemporal", temSerieTemporal: true })],
      { resolver },
    );
    expect(out[0].nPontosSerie).toBe(5);
  });
});

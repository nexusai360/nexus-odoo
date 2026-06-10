import { ponteFaturamento } from "./ponte-faturamento";

// A metrica COMPÕE faturamentoPorCfop + receitaConsolidada. Mockamos os modulos.
jest.mock("./faturamento-por-cfop", () => ({ faturamentoPorCfop: jest.fn() }));
jest.mock("./receita-consolidada", () => ({ receitaConsolidada: jest.fn() }));
import { faturamentoPorCfop } from "./faturamento-por-cfop";
import { receitaConsolidada } from "./receita-consolidada";

describe("ponteFaturamento", () => {
  it("monta a ponte (bruto -> deducoes -> individual -> intragrupo -> externa) e reconcilia", async () => {
    (faturamentoPorCfop as jest.Mock).mockResolvedValue({
      totalProdutos: 1000,
      totalReceita: 700,
      totalNaoReceita: 300,
      linhas: [
        { categoria: "venda", rotulo: "Venda", ehReceita: true, valorProdutos: 700 },
        { categoria: "transferencia", rotulo: "Transferencia", ehReceita: false, valorProdutos: 200 },
        { categoria: "remessa", rotulo: "Remessa", ehReceita: false, valorProdutos: 100 },
      ],
    });
    (receitaConsolidada as jest.Mock).mockResolvedValue({
      receitaIndividualTotal: 700,
      receitaIntragrupoEliminavel: 250,
      receitaExterna: 450,
    });

    const r = await ponteFaturamento({} as never, {});
    expect(r.brutoProdutos).toBe(1000);
    expect(r.totalNaoReceita).toBe(300);
    expect(r.receitaIndividual).toBe(700);
    expect(r.intragrupoEliminavel).toBe(250);
    expect(r.receitaExterna).toBe(450);
    // deducoes ordenadas desc, so nao-receita
    expect(r.deducoesNaoReceita.map((d) => d.categoria)).toEqual(["transferencia", "remessa"]);
    expect(r.deducoesNaoReceita[0].valor).toBe(200);
    // identidade: bruto - naoReceita - intragrupo == externa
    expect(r.reconciliado).toBe(true);
  });

  it("reconciliado=false quando a identidade nao fecha (drift entre metricas)", async () => {
    (faturamentoPorCfop as jest.Mock).mockResolvedValue({
      totalProdutos: 1000, totalReceita: 700, totalNaoReceita: 300, linhas: [],
    });
    (receitaConsolidada as jest.Mock).mockResolvedValue({
      receitaIndividualTotal: 999, receitaIntragrupoEliminavel: 250, receitaExterna: 450,
    });
    const r = await ponteFaturamento({} as never, {});
    expect(r.reconciliado).toBe(false); // 700 != 999
  });
});

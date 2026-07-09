jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  intencaoInicial,
  registrarSeccaoPretendida,
  removerSeccao,
  declararSemKpi,
} from "./intencao";

describe("registrarSeccaoPretendida", () => {
  it("aceita seccao viavel e a anexa", () => {
    const r = registrarSeccaoPretendida(intencaoInicial(), {
      fato: "fato_estoque_saldo",
      template: "BarChart",
      recorte: "por armazem",
    });
    expect("intencao" in r).toBe(true);
    if ("intencao" in r) expect(r.intencao.secoes).toHaveLength(1);
  });

  it("descarta seccao inviavel (fora do catalogo) com erro", () => {
    const r = registrarSeccaoPretendida(intencaoInicial(), {
      fato: "fato_vendas",
      template: "BarChart",
    });
    expect("erro" in r).toBe(true);
  });

  it("descarta template incompativel com a fonte", () => {
    const r = registrarSeccaoPretendida(intencaoInicial(), {
      fato: "fato_estoque_saldo",
      template: "LineChart", // saldo nao oferece serieTemporal
    });
    expect("erro" in r).toBe(true);
  });
});

describe("removerSeccao / declararSemKpi", () => {
  it("remove a seccao pelo indice", () => {
    const i1 = registrarSeccaoPretendida(intencaoInicial(), {
      fato: "fato_estoque_saldo",
      template: "BarChart",
    });
    if (!("intencao" in i1)) throw new Error("setup");
    expect(removerSeccao(i1.intencao, 0).secoes).toHaveLength(0);
  });

  it("declararSemKpi marca a flag", () => {
    expect(declararSemKpi(intencaoInicial()).semKpiDeclarado).toBe(true);
  });
});

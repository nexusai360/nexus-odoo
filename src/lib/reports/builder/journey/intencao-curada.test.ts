import { intencaoCuradaDeColeta } from "./intencao-curada";
import type { IntencaoColeta } from "./intencao";

describe("intencaoCuradaDeColeta", () => {
  it("mapeia objetivo e recortes unicos, dominio estoque na onda 1", () => {
    const coleta: IntencaoColeta = {
      secoes: [
        { fato: "fato_estoque_armazem", template: "BarChart", recorte: "por armazem" },
        { fato: "fato_estoque_marca", template: "BarChart", recorte: "por marca" },
        { fato: "fato_estoque_marca", template: "PieChart", recorte: "por marca" },
      ],
    };
    const cur = intencaoCuradaDeColeta(coleta, "saude do estoque por armazem e marca");
    expect(cur.dominio).toBe("estoque");
    expect(cur.objetivo).toBe("saude do estoque por armazem e marca");
    expect(cur.recortes.slice().sort()).toEqual(["por armazem", "por marca"]);
  });

  it("recortes vazio quando nenhuma secao tem recorte", () => {
    const cur = intencaoCuradaDeColeta(
      { secoes: [{ fato: "fato_estoque_saldo", template: "KPIRow" }] },
      "panorama geral",
    );
    expect(cur.recortes).toEqual([]);
  });
});

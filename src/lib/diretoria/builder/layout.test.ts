import { normalizar, spanColunas, spanLinhas, type BlocoLayout } from "./layout";

describe("normalizar layout", () => {
  it("descarta componente inexistente no catálogo", () => {
    const blocos: BlocoLayout[] = [
      { componenteId: "ZZ-99", ordem: 0, largura: 2, altura: 2 },
      { componenteId: "A-01", ordem: 1, largura: 2, altura: 1 },
    ];
    const r = normalizar(blocos);
    expect(r).toHaveLength(1);
    expect(r[0].componenteId).toBe("A-01");
  });

  it("ordena por ordem", () => {
    const blocos: BlocoLayout[] = [
      { componenteId: "A-02", ordem: 5, largura: 2, altura: 2 },
      { componenteId: "A-01", ordem: 1, largura: 1, altura: 1 },
    ];
    const r = normalizar(blocos);
    expect(r.map((b) => b.componenteId)).toEqual(["A-01", "A-02"]);
  });

  it("clampa largura de KPI ao máximo 2", () => {
    // A-01 é kpi (largura 1-2). largura 4 deve virar 2.
    const r = normalizar([{ componenteId: "A-01", ordem: 0, largura: 4, altura: 1 }]);
    expect(r[0].largura).toBe(2);
  });

  it("clampa altura inválida (5) para valor do conjunto permitido", () => {
    // A-03 é grafico (altura 2-4). altura 5 não está no conjunto {1,2,3,4,6};
    // dentro de [2,4] o mais próximo de 5 é 4.
    const r = normalizar([{ componenteId: "A-03", ordem: 0, largura: 2, altura: 5 }]);
    expect(r[0].altura).toBe(4);
  });

  it("clampa largura de gráfico abaixo do mínimo (1 -> 2)", () => {
    const r = normalizar([{ componenteId: "A-03", ordem: 0, largura: 1, altura: 2 }]);
    expect(r[0].largura).toBe(2);
  });

  it("lista vazia retorna vazia", () => {
    expect(normalizar([])).toEqual([]);
  });

  it("spans: largura em quartos vira span de 3 colunas; altura = span de linhas", () => {
    expect(spanColunas(1)).toBe(3);
    expect(spanColunas(4)).toBe(12);
    expect(spanLinhas(2)).toBe(2);
  });
});

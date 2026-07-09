import { normalizar, type BlocoLayout } from "./layout";

describe("normalizar layout (grid 8x8)", () => {
  it("descarta componente inexistente no catálogo", () => {
    const blocos: BlocoLayout[] = [
      { componenteId: "ZZ-99", ordem: 0, largura: 2, altura: 2, x: 0, y: 0 },
      { componenteId: "A-01", ordem: 1, largura: 2, altura: 2, x: 0, y: 0 },
    ];
    const r = normalizar(blocos);
    expect(r).toHaveLength(1);
    expect(r[0].componenteId).toBe("A-01");
  });

  it("ordena por ordem", () => {
    const blocos: BlocoLayout[] = [
      { componenteId: "A-02", ordem: 5, largura: 4, altura: 3, x: 0, y: 0 },
      { componenteId: "A-01", ordem: 1, largura: 2, altura: 2, x: 0, y: 0 },
    ];
    const r = normalizar(blocos);
    expect(r.map((b) => b.componenteId)).toEqual(["A-01", "A-02"]);
  });

  it("aceita gráfico até 8×8 (trava ampliada , cliente)", () => {
    // A-03 é grafico (agora 3-8 em ambos os eixos). 8×8 deve ser preservado.
    const r = normalizar([{ componenteId: "A-03", ordem: 0, largura: 8, altura: 8, x: 0, y: 0 }]);
    expect(r[0].largura).toBe(8);
    expect(r[0].altura).toBe(8);
  });

  it("clampa largura de gráfico abaixo do mínimo (2 -> 3)", () => {
    // A-03 é grafico (largura mín 3). largura 2 deve virar 3.
    const r = normalizar([{ componenteId: "A-03", ordem: 0, largura: 2, altura: 3, x: 0, y: 0 }]);
    expect(r[0].largura).toBe(3);
  });

  it("clampa x para caber no grid de 8 colunas", () => {
    // largura 4 em x=6 estouraria (6+4>8); x deve virar 4.
    const r = normalizar([{ componenteId: "A-02", ordem: 0, largura: 4, altura: 3, x: 6, y: 2 }]);
    expect(r[0].x).toBe(4);
    expect(r[0].y).toBe(2);
  });

  it("nunca aceita tamanho 1 (mínimo é 2)", () => {
    const r = normalizar([{ componenteId: "A-01", ordem: 0, largura: 1, altura: 1, x: 0, y: 0 }]);
    expect(r[0].largura).toBeGreaterThanOrEqual(2);
    expect(r[0].altura).toBeGreaterThanOrEqual(2);
  });

  it("lista vazia retorna vazia", () => {
    expect(normalizar([])).toEqual([]);
  });
});

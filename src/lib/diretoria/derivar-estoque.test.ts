import {
  filtrarEstoque,
  opcoesEstoque,
  derivarIndicadores,
  derivarCatalogo,
  derivarEstoque,
  temFiltro,
  FILTROS_VAZIOS,
  type LinhaEstoqueGranular,
} from "./derivar-estoque";

const LINHAS: LinhaEstoqueGranular[] = [
  { produtoId: 1, produto: "Esteira X", familia: "Cardio", marca: "Matrix", local: "SP", quantidade: 2, valor: 1000 },
  { produtoId: 1, produto: "Esteira X", familia: "Cardio", marca: "Matrix", local: "RJ", quantidade: 3, valor: 1500 },
  { produtoId: 2, produto: "Bike Y", familia: "Cardio", marca: "Johnson", local: "SP", quantidade: 1, valor: 800 },
  { produtoId: 3, produto: "Anilha Z", familia: "Força", marca: "Matrix", local: "MG", quantidade: 10, valor: 500 },
];

describe("filtrarEstoque", () => {
  it("AND entre dimensões", () => {
    expect(filtrarEstoque(LINHAS, { familia: "Cardio", marca: "Matrix", local: null })).toHaveLength(2);
    expect(filtrarEstoque(LINHAS, { familia: "Cardio", marca: "Matrix", local: "SP" })).toHaveLength(1);
    expect(filtrarEstoque(LINHAS, { familia: "Força", marca: null, local: null })).toHaveLength(1);
  });
  it("sem filtro retorna tudo", () => {
    expect(filtrarEstoque(LINHAS, FILTROS_VAZIOS)).toHaveLength(4);
  });
});

describe("temFiltro", () => {
  it("detecta qualquer dimensão ativa", () => {
    expect(temFiltro(FILTROS_VAZIOS)).toBe(false);
    expect(temFiltro({ familia: "Cardio", marca: null, local: null })).toBe(true);
  });
});

describe("opcoesEstoque", () => {
  it("distintos ordenados por dimensão", () => {
    const o = opcoesEstoque(LINHAS);
    expect(o.familias).toEqual(["Cardio", "Força"]);
    expect(o.marcas).toEqual(["Johnson", "Matrix"]);
    expect(o.locais).toEqual(["MG", "RJ", "SP"]);
  });
});

describe("derivarIndicadores", () => {
  it("soma valor/itens e conta produtos e locais distintos", () => {
    const i = derivarIndicadores(LINHAS);
    expect(i.valorTotal).toBe(3800);
    expect(i.itens).toBe(16);
    expect(i.produtos).toBe(3);
    expect(i.locais).toBe(3);
  });
});

describe("derivarCatalogo", () => {
  it("agrega por produto e conta locais distintos", () => {
    const c = derivarCatalogo(LINHAS);
    expect(c.total).toBe(3);
    const esteira = c.linhas.find((l) => l.produto === "Esteira X")!;
    expect(esteira.quantidade).toBe(5);
    expect(esteira.valorTotal).toBe(2500);
    expect(esteira.locais).toBe(2);
  });
});

describe("derivarEstoque (cruzado)", () => {
  it("filtra por família e recomputa donut de marca consistente", () => {
    const d = derivarEstoque(LINHAS, { familia: "Cardio", marca: null, local: null });
    // Só Cardio: Matrix (2500) + Johnson (800)
    expect(d.porMarca.linhas.map((l) => l.chave)).toEqual(["Matrix", "Johnson"]);
    expect(d.indicadores.valorTotal).toBe(3300);
    expect(d.catalogo.total).toBe(2);
  });
});

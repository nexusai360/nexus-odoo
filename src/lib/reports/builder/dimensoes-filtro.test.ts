import {
  extrairDimensoes,
  dimensoesDisponiveis,
  type LinhaDimensao,
} from "./dimensoes-filtro";

describe("extrairDimensoes", () => {
  const linhas: LinhaDimensao[] = [
    { localId: 5, localNome: "WH/Estoque", familiaId: 2, familiaNome: "Cardio" },
    { localId: 5, localNome: "WH/Estoque", familiaId: 3, familiaNome: "Força" },
    { localId: 1, localNome: "WH/Proprio", familiaId: 2, familiaNome: "Cardio" },
    // linhas incompletas sao ignoradas
    { localId: null, localNome: "Sem id", familiaId: null, familiaNome: null },
    { localId: 9, localNome: null, familiaId: 9, familiaNome: null },
  ];

  it("deduplica por id e ordena por nome (pt-BR)", () => {
    const { armazens, familias } = extrairDimensoes(linhas);
    // Estoque (id 5) antes de Proprio (id 1) na ordem alfabetica
    expect(armazens.map((a) => a.nome)).toEqual(["WH/Estoque", "WH/Proprio"]);
    expect(armazens.map((a) => a.id)).toEqual([5, 1]);
    expect(familias).toEqual([
      { id: 2, nome: "Cardio" },
      { id: 3, nome: "Força" },
    ]);
  });

  it("nao inclui dimensao sem id ou sem nome", () => {
    const { armazens, familias } = extrairDimensoes(linhas);
    expect(armazens.some((a) => a.id === 9)).toBe(false);
    expect(familias.some((f) => f.id === 9)).toBe(false);
  });

  it("vazio quando nao ha linhas", () => {
    expect(extrairDimensoes([])).toEqual({ armazens: [], familias: [] });
  });
});

describe("dimensoesDisponiveis", () => {
  it("saldo libera armazem e familia", () => {
    expect(dimensoesDisponiveis(["fato_estoque_saldo"])).toEqual({
      armazem: true,
      familia: true,
    });
  });

  it("parados/movimento liberam so armazem", () => {
    expect(dimensoesDisponiveis(["fato_estoque_parados"])).toEqual({
      armazem: true,
      familia: false,
    });
    expect(dimensoesDisponiveis(["fato_estoque_movimento"])).toEqual({
      armazem: true,
      familia: false,
    });
  });

  it("marca pura nao libera nenhuma das duas", () => {
    expect(dimensoesDisponiveis(["fato_estoque_marca"])).toEqual({
      armazem: false,
      familia: false,
    });
  });
});

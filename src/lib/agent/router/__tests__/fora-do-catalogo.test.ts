import { decideForaDoCatalogo } from "../fora-do-catalogo";

describe("decideForaDoCatalogo", () => {
  it("retrieval vazio acima do limiar + fora dos dominios => fora_de_escopo", () => {
    expect(
      decideForaDoCatalogo({
        retrievalVazio: true,
        topScore: 0.1,
        limiar: 0.3,
        assuntoForaDosDominios: true,
        dadoExisteNoEscopo: false,
      }),
    ).toBe("fora_de_escopo");
  });

  it("dado no escopo mas inexistente => falta_honesta", () => {
    expect(
      decideForaDoCatalogo({
        retrievalVazio: false,
        topScore: 0.5,
        limiar: 0.3,
        assuntoForaDosDominios: false,
        dadoExisteNoEscopo: false,
      }),
    ).toBe("falta_honesta");
  });

  it("tem tool e dado existe => prosseguir", () => {
    expect(
      decideForaDoCatalogo({
        retrievalVazio: false,
        topScore: 0.6,
        limiar: 0.3,
        assuntoForaDosDominios: false,
        dadoExisteNoEscopo: true,
      }),
    ).toBe("prosseguir");
  });

  it("retrieval vazio mas assunto DENTRO dos dominios => nao recusa (prosseguir/falta)", () => {
    const r = decideForaDoCatalogo({
      retrievalVazio: true,
      topScore: 0.05,
      limiar: 0.3,
      assuntoForaDosDominios: false,
      dadoExisteNoEscopo: true,
    });
    expect(r).not.toBe("fora_de_escopo");
  });

  it("score acima do limiar nao classifica como fora de escopo mesmo sem retrieval", () => {
    expect(
      decideForaDoCatalogo({
        retrievalVazio: true,
        topScore: 0.9,
        limiar: 0.3,
        assuntoForaDosDominios: true,
        dadoExisteNoEscopo: true,
      }),
    ).toBe("prosseguir");
  });
});

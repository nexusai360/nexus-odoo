import { detectarVerbosidade } from "./verbosidade";

describe("detectarVerbosidade", () => {
  it("sem sinal -> undefined (stand-by)", () => {
    expect(detectarVerbosidade(["qual o faturamento de maio?", "e o estoque?"])).toBeUndefined();
  });

  it("pedidos de detalhe dominantes -> detalhado", () => {
    expect(
      detectarVerbosidade(["detalha isso pra mim", "quero o completo", "explica melhor"]),
    ).toBe("detalhado");
  });

  it("pedidos de concisao dominantes -> curto", () => {
    expect(
      detectarVerbosidade(["resume aí", "direto ao ponto", "só o total por favor"]),
    ).toBe("curto");
  });

  it("1 ocorrencia so (abaixo do minimo) -> undefined", () => {
    expect(detectarVerbosidade(["detalha isso"])).toBeUndefined();
  });

  it("empate/sem dominancia -> undefined", () => {
    // detalhe=2 (detalhado, completo) x curto=2 (resume, curto) -> share 0.5, sem dominancia
    expect(detectarVerbosidade(["detalhado e completo", "resume e curto"])).toBeUndefined();
  });
});

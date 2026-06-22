import { detectarFormato } from "./formato";

describe("detectarFormato", () => {
  it("sem sinal -> undefined (stand-by)", () => {
    expect(detectarFormato(["qual o faturamento de maio?", "e o estoque?"])).toBeUndefined();
  });
  it("pedidos de tabela dominantes -> tabela", () => {
    expect(detectarFormato(["me da em tabela", "prefiro em tabela", "manda a planilha"])).toBe("tabela");
  });
  it("pedidos de lista dominantes -> lista", () => {
    expect(detectarFormato(["lista os produtos", "em topicos por favor", "manda em bullets"])).toBe("lista");
  });
  it("1 ocorrencia (abaixo do minimo) -> undefined", () => {
    expect(detectarFormato(["me da em tabela"])).toBeUndefined();
  });
  it("sem dominancia -> undefined", () => {
    expect(detectarFormato(["em tabela", "em lista"])).toBeUndefined();
  });
});

import { classifyIntent } from "../classify-intent";

describe("classifyIntent", () => {
  it("exaustiva: 'todos'/'lista completa'", () => {
    expect(classifyIntent("quais sao todos os produtos")).toBe("exaustiva");
    expect(classifyIntent("me lista tudo")).toBe("exaustiva");
    expect(classifyIntent("quero ver todos os clientes")).toBe("exaustiva");
  });

  it("ranking: 'top N'/'N maiores'", () => {
    expect(classifyIntent("top 5 clientes por valor")).toBe("ranking");
    expect(classifyIntent("os 10 maiores fornecedores")).toBe("ranking");
    expect(classifyIntent("top dez produtos")).toBe("ranking");
  });

  it("amostragem: 'um exemplo'/'alguns'", () => {
    expect(classifyIntent("me da um exemplo de produto parado")).toBe("amostragem");
    expect(classifyIntent("mostra alguns clientes novos")).toBe("amostragem");
  });

  it("pontual: consulta de valor unico (default)", () => {
    expect(classifyIntent("qual o faturamento de maio")).toBe("pontual");
    expect(classifyIntent("quanto temos a receber")).toBe("pontual");
  });

  it("precedencia: ranking vence exaustiva ('quais sao os 5 maiores')", () => {
    expect(classifyIntent("quais sao os 5 maiores clientes")).toBe("ranking");
  });

  it("precedencia: ranking vence amostragem ('alguns dos 5 maiores')", () => {
    expect(classifyIntent("me mostra alguns dos 5 maiores clientes")).toBe("ranking");
  });

  it("precedencia: amostragem vence exaustiva ('um exemplo de cada')", () => {
    expect(classifyIntent("me da um exemplo dentre todos os produtos")).toBe("amostragem");
  });

  it("robusto a acento/caixa", () => {
    expect(classifyIntent("TOP 3 PRODUTOS")).toBe("ranking");
    expect(classifyIntent("listar tudo")).toBe("exaustiva");
  });
});

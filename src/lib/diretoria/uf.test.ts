import { siglaDeUf } from "./uf";

describe("siglaDeUf", () => {
  it("converte nome com sufixo de país para sigla", () => {
    expect(siglaDeUf("São Paulo (BR)")).toBe("SP");
    expect(siglaDeUf("Minas Gerais (BR)")).toBe("MG");
    expect(siglaDeUf("Distrito Federal (BR)")).toBe("DF");
    expect(siglaDeUf("Mato Grosso do Sul (BR)")).toBe("MS");
  });

  it("aceita já-sigla", () => {
    expect(siglaDeUf("SP")).toBe("SP");
    expect(siglaDeUf("rj")).toBe("RJ");
  });

  it("lida com acentos e caixa", () => {
    expect(siglaDeUf("Ceará")).toBe("CE");
    expect(siglaDeUf("GOIÁS")).toBe("GO");
    expect(siglaDeUf("Pará (BR)")).toBe("PA");
  });

  it("retorna null para nulo/desconhecido", () => {
    expect(siglaDeUf(null)).toBeNull();
    expect(siglaDeUf("")).toBeNull();
    expect(siglaDeUf("Lisboa (PT)")).toBeNull();
  });
});

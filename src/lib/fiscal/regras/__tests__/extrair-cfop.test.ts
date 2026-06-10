// src/lib/fiscal/regras/__tests__/extrair-cfop.test.ts
import { extrairCfop } from "../extrair-cfop";

describe("extrairCfop", () => {
  it("extrai os 4 digitos do inicio do nome com codigo", () => {
    expect(extrairCfop("5102 - Venda de mercadoria adquirida")).toBe("5102");
    expect(extrairCfop("6152 - Transferencia de mercadoria")).toBe("6152");
  });
  it("aceita cfop sem separador e com espacos", () => {
    expect(extrairCfop("  6108  Venda")).toBe("6108");
    expect(extrairCfop("7101")).toBe("7101");
  });
  it("retorna null para nome sem 4 digitos iniciais", () => {
    expect(extrairCfop("Venda de mercadoria")).toBeNull();
    expect(extrairCfop("510 - parcial")).toBeNull();
  });
  it("retorna null para nulo/vazio", () => {
    expect(extrairCfop(null)).toBeNull();
    expect(extrairCfop("")).toBeNull();
    expect(extrairCfop("   ")).toBeNull();
  });
});

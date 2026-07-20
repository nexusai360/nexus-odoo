import { corEtapaValida } from "./etapa-cor";

describe("corEtapaValida", () => {
  it("aceita hex de 6 digitos", () => {
    expect(corEtapaValida("#fa7e1e")).toBe("#fa7e1e");
  });
  it("aceita hex de 3 digitos", () => {
    expect(corEtapaValida("#0a0")).toBe("#0a0");
  });
  it("trata false (sem cor no Odoo) como null", () => {
    expect(corEtapaValida(false)).toBeNull();
  });
  it("trata numero/objeto/null/undefined como null", () => {
    expect(corEtapaValida(3)).toBeNull();
    expect(corEtapaValida(null)).toBeNull();
    expect(corEtapaValida(undefined)).toBeNull();
    expect(corEtapaValida({})).toBeNull();
  });
  it("rejeita string que nao e hex", () => {
    expect(corEtapaValida("laranja")).toBeNull();
    expect(corEtapaValida("#zzz")).toBeNull();
  });
  it("apara espacos ao redor", () => {
    expect(corEtapaValida("  #00b159 ")).toBe("#00b159");
  });
});

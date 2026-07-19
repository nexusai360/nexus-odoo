import { describe, it, expect } from "@jest/globals";
import { extrairNumeroMercos } from "./numero-mercos";

describe("extrairNumeroMercos", () => {
  it("extrai o número do formato padrão PEDIDO MERCOS: NNNNN", () => {
    expect(extrairNumeroMercos("PEDIDO MERCOS: 43203")).toBe("43203");
    expect(extrairNumeroMercos("PEDIDO MERCOS: 3095")).toBe("3095");
  });

  it("é case-insensitive e tolera variações de espaçamento", () => {
    expect(extrairNumeroMercos("Pedido Mercos 44142")).toBe("44142");
    expect(extrairNumeroMercos("mercos:31737")).toBe("31737");
    expect(extrairNumeroMercos("PEDIDOMERCOS:45110")).toBe("45110");
  });

  it("não extrai quando não há número após 'mercos' (ex.: DEMONSTRAÇÃO)", () => {
    expect(extrairNumeroMercos("PEDIDO MERCOS: DEMONSTRAÇÃO")).toBeNull();
  });

  it("não confunde 'mercosul' com Mercos", () => {
    expect(extrairNumeroMercos("Operacao Mercosul 12345")).toBeNull();
    expect(extrairNumeroMercos("MERCOSUL 12345")).toBeNull();
    // mas extrai o Mercos real quando ambos aparecem
    expect(extrairNumeroMercos("Mercosul 12345 e MERCOS 55555")).toBe("55555");
  });

  it("devolve null para obs sem mercos, nulo ou vazio", () => {
    expect(extrairNumeroMercos("Pedido normal sem referencia")).toBeNull();
    expect(extrairNumeroMercos(null)).toBeNull();
    expect(extrairNumeroMercos(undefined)).toBeNull();
    expect(extrairNumeroMercos("")).toBeNull();
  });
});

import { describe, it, expect } from "@jest/globals";
import { subtipoDemonstracao } from "./subtipo-demonstracao";
import { SHOWROOM_ODOO_ID } from "./classificacao-local";

describe("subtipoDemonstracao", () => {
  it("locais sob raiz Próprio (showroom, JDSDEMO) são 'nosso'", () => {
    expect(subtipoDemonstracao("Próprio / Showroom", SHOWROOM_ODOO_ID)).toBe("nosso");
    expect(subtipoDemonstracao("Próprio / JDS DEMO SÃO PAULO", 999)).toBe("nosso");
  });

  it("locais sob Terceiros / Demonstração são 'cliente'", () => {
    expect(
      subtipoDemonstracao("Terceiros / Demonstração / Jds Comércio - Academia X", 260),
    ).toBe("cliente");
  });

  it("o showroom é 'nosso' pelo id, mesmo com nome inesperado", () => {
    expect(subtipoDemonstracao(null, SHOWROOM_ODOO_ID)).toBe("nosso");
  });

  it("nome nulo sem ser showroom cai em 'cliente' (fail-safe: fora da raiz Próprio)", () => {
    expect(subtipoDemonstracao(null, 12345)).toBe("cliente");
  });
});

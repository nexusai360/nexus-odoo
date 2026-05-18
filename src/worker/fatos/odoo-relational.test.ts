import { relId, relNome } from "./odoo-relational";

describe("relId", () => {
  it("extrai o id de um many2one [id, nome]", () => {
    expect(relId([14410, "Esteira X"])).toBe(14410);
  });
  it("retorna null para false", () => {
    expect(relId(false)).toBeNull();
  });
  it("retorna null para undefined", () => {
    expect(relId(undefined)).toBeNull();
  });
});

describe("relNome", () => {
  it("extrai o nome de um many2one [id, nome]", () => {
    expect(relNome([14410, "Esteira X"])).toBe("Esteira X");
  });
  it("retorna null para false", () => {
    expect(relNome(false)).toBeNull();
  });
  it("retorna null quando o nome é false ([id, false])", () => {
    expect(relNome([14410, false])).toBeNull();
  });
  it("retorna null para undefined", () => {
    expect(relNome(undefined)).toBeNull();
  });
});

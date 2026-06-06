import { soDigitos, classificarDocumento } from "../_documento";

describe("soDigitos", () => {
  it("descarta BR- e mascara de CNPJ", () => expect(soDigitos("BR-07.390.039/0001-01")).toBe("07390039000101"));
  it("mascara sem prefixo", () => expect(soDigitos("07.390.039/0001-01")).toBe("07390039000101"));
  it("idempotente (so digitos)", () => expect(soDigitos("07390039000101")).toBe("07390039000101"));
  it("BR- sem digitos vira string vazia", () => expect(soDigitos("BR-")).toBe(""));
});

describe("classificarDocumento", () => {
  it("14 digitos = cnpj", () => expect(classificarDocumento("07.390.039/0001-01")).toBe("cnpj"));
  it("11 digitos = cpf", () => expect(classificarDocumento("123.456.789-09")).toBe("cpf"));
  it("outro tamanho = null", () => expect(classificarDocumento("123")).toBe(null));
});

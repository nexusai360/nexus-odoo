import { OdooRpcFault, isAccessError, OdooAuthError } from "./errors";

describe("erros do Odoo", () => {
  it("OdooRpcFault extrai a mensagem de data.message", () => {
    const fault = new OdooRpcFault({ data: { message: "campo X inválido" } });
    expect(fault.message).toBe("campo X inválido");
  });

  it("isAccessError detecta AccessError pelo texto", () => {
    const fault = new OdooRpcFault({ data: { name: "odoo.exceptions.AccessError" } });
    expect(isAccessError(fault)).toBe(true);
  });

  it("isAccessError é false para erro comum", () => {
    expect(isAccessError(new Error("timeout"))).toBe(false);
  });

  it("OdooAuthError é um OdooError", () => {
    expect(new OdooAuthError("falhou")).toBeInstanceOf(Error);
  });
});

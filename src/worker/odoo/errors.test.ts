import { OdooRpcFault, isAccessError, OdooAuthError, OdooError, redactSecret } from "./errors";

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
    const err = new OdooAuthError("falhou");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OdooError);
  });

  it("isAccessError detecta AccessError via data.debug", () => {
    const fault = new OdooRpcFault({
      data: { message: "erro genérico", debug: "Traceback... odoo.exceptions.AccessError: ..." },
    });
    expect(isAccessError(fault)).toBe(true);
  });

  it("redactSecret substitui todas as ocorrências do segredo", () => {
    expect(redactSecret("token=s3nh4 user=x token=s3nh4", "s3nh4")).toBe(
      "token=*** user=x token=***",
    );
  });

  it("redactSecret é no-op quando o segredo é vazio/undefined", () => {
    expect(redactSecret("nada a redigir", "")).toBe("nada a redigir");
    expect(redactSecret("nada a redigir", undefined)).toBe("nada a redigir");
  });

  it("CR-03: OdooRpcFault redige a senha da mensagem e do debug do payload", () => {
    const fault = new OdooRpcFault(
      {
        data: {
          message: "execute_kw falhou com senha s3nh4",
          debug: 'Traceback: object.execute_kw(["db", 1, "s3nh4", ...])',
        },
      },
      "s3nh4",
    );
    expect(fault.message).not.toContain("s3nh4");
    expect(fault.message).toContain("***");
    expect(JSON.stringify(fault.payload)).not.toContain("s3nh4");
  });
});

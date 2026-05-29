import { tipoErroRpc, classificarComErro } from "./error-kind";
import {
  OdooError,
  OdooAccessError,
  OdooPoolExhaustedError,
  OdooUnavailableError,
  OdooMissingError,
  OdooInternalError,
  OdooRpcFault,
} from "@/worker/odoo/client";

describe("tipoErroRpc", () => {
  it("OdooAccessError -> acesso_negado", () => {
    expect(tipoErroRpc(new OdooAccessError("not allowed"))).toBe("acesso_negado");
  });
  it("pool/unavailable -> transitorio", () => {
    expect(tipoErroRpc(new OdooPoolExhaustedError("pool"))).toBe("transitorio");
    expect(tipoErroRpc(new OdooUnavailableError("503"))).toBe("transitorio");
  });
  it("OdooError puro (rede/timeout após retries) -> transitorio", () => {
    expect(tipoErroRpc(new OdooError("falhou após 3 tentativas"))).toBe("transitorio");
  });
  it("fault de servidor persistente não-acesso -> abstract", () => {
    expect(tipoErroRpc(new OdooMissingError("não existe"))).toBe("abstract");
    expect(tipoErroRpc(new OdooInternalError("erro"))).toBe("abstract");
    expect(tipoErroRpc(new OdooRpcFault({ data: { name: "X" } }))).toBe("abstract");
  });
  it("erro desconhecido (não-Odoo) -> transitorio", () => {
    expect(tipoErroRpc(new Error("network"))).toBe("transitorio");
  });

  // O OdooClient embrulha faults mapeados num OdooError genérico após retries
  // (descoberto no E2E do R2): a mensagem embrulhada carrega o texto do servidor.
  it("OdooError embrulhado de acesso ('not allowed') -> acesso_negado", () => {
    expect(
      tipoErroRpc(
        new OdooError(
          "object.execute_kw falhou após 3 tentativas: You are not allowed to access 'sped.pessoa'",
        ),
      ),
    ).toBe("acesso_negado");
  });
  it("OdooError embrulhado de inexistente -> abstract", () => {
    expect(
      tipoErroRpc(new OdooError('falhou após 3 tentativas: O registro "rh.cargo" não existe')),
    ).toBe("abstract");
    expect(
      tipoErroRpc(new OdooError('falhou após 3 tentativas: ERRO: relação "x" não existe')),
    ).toBe("abstract");
    expect(
      tipoErroRpc(new OdooError('falhou após 3 tentativas: O registro “rh.cargo” não foi encontrado')),
    ).toBe("abstract");
  });
  it("OdooError embrulhado de rede pura -> transitorio", () => {
    expect(
      tipoErroRpc(new OdooError("falhou após 3 tentativas: The operation was aborted")),
    ).toBe("transitorio");
  });
});

describe("classificarComErro", () => {
  it("acesso_negado -> C", () => {
    expect(classificarComErro("acesso_negado")).toEqual({
      balde: "C",
      motivo: "acesso_negado",
    });
  });
  it("abstract -> C", () => {
    expect(classificarComErro("abstract")).toEqual({
      balde: "C",
      motivo: "abstract_ou_inexistente",
    });
  });
  it("transitorio -> null (vai para nao_classificados)", () => {
    expect(classificarComErro("transitorio")).toBeNull();
  });
});

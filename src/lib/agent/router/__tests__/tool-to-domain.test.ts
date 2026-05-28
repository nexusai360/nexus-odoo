import { describe, expect, it } from "@jest/globals";
import {
  TOOL_TO_DOMAIN_OVERRIDE,
  UNKNOWN_DOMAIN,
  getToolDomain,
  getToolDomains,
} from "../tool-to-domain";

describe("tool-to-domain: getToolDomain()", () => {
  it("derives 'fiscal' from 'fiscal_notas_emitidas_por_cliente'", () => {
    expect(getToolDomain("fiscal_notas_emitidas_por_cliente")).toBe("fiscal");
  });

  it("derives 'financeiro' from 'financeiro_contas_a_pagar'", () => {
    expect(getToolDomain("financeiro_contas_a_pagar")).toBe("financeiro");
  });

  it("derives 'comercial' from 'comercial_pedidos_listar_top_valor'", () => {
    expect(getToolDomain("comercial_pedidos_listar_top_valor")).toBe(
      "comercial",
    );
  });

  it("derives 'estoque' from 'estoque_saldo'", () => {
    expect(getToolDomain("estoque_saldo")).toBe("estoque");
  });

  it("derives 'cadastros' from 'cadastros_clientes_listar'", () => {
    expect(getToolDomain("cadastros_clientes_listar")).toBe("cadastros");
  });

  it("derives 'caminho3' from 'caminho3_bi_consulta_avancada'", () => {
    expect(getToolDomain("caminho3_bi_consulta_avancada")).toBe("caminho3");
  });

  it("returns UNKNOWN_DOMAIN for tool com prefixo desconhecido", () => {
    expect(getToolDomain("xyzdesconhecido_alguma_coisa")).toBe(UNKNOWN_DOMAIN);
  });

  it("returns UNKNOWN_DOMAIN para tool sem underscore", () => {
    expect(getToolDomain("toolxyz")).toBe(UNKNOWN_DOMAIN);
  });

  it("override map vazio nao quebra (regra 1 nao aplica)", () => {
    // Confirma que TOOL_TO_DOMAIN_OVERRIDE comecca vazio.
    expect(Object.keys(TOOL_TO_DOMAIN_OVERRIDE)).toHaveLength(0);
  });

  it("retorna UNKNOWN_DOMAIN para string vazia", () => {
    expect(getToolDomain("")).toBe(UNKNOWN_DOMAIN);
  });
});

describe("tool-to-domain: getToolDomains() (batch)", () => {
  it("preserves order", () => {
    expect(
      getToolDomains([
        "fiscal_notas",
        "financeiro_saldo",
        "estoque_saldo",
      ]),
    ).toEqual(["fiscal", "financeiro", "estoque"]);
  });

  it("empty array stays empty", () => {
    expect(getToolDomains([])).toEqual([]);
  });
});

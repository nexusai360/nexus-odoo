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

  // Tools REAIS sao 'cadastro_*' (singular), mas o dominio e' 'cadastros'
  // (plural). Alias de prefixo garante o mapeamento (pericia 2026-06-01).
  it("derives 'cadastros' from real tool 'cadastro_contar_parceiros' (singular)", () => {
    expect(getToolDomain("cadastro_contar_parceiros")).toBe("cadastros");
  });
  it("derives 'cadastros' from 'cadastro_buscar_parceiro'", () => {
    expect(getToolDomain("cadastro_buscar_parceiro")).toBe("cadastros");
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

  it("override map mapeia registrar_lacuna -> dominios-vazios", () => {
    expect(TOOL_TO_DOMAIN_OVERRIDE.registrar_lacuna).toBe("dominios-vazios");
    expect(getToolDomain("registrar_lacuna")).toBe("dominios-vazios");
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

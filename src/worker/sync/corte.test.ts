// Limpa 2026+ , corteDomain (T2a).
import { describe, it, expect } from "@jest/globals";
import { corteDomain, CORTE_DADOS_ISO } from "./corte";

describe("corteDomain", () => {
  it("modelo transacional com corte gera clausula >= 2026-01-01", () => {
    expect(corteDomain("sped.documento")).toEqual([["data_emissao", ">=", CORTE_DADOS_ISO]]);
  });
  it("mestre sem corte gera clausula vazia", () => {
    expect(corteDomain("res.partner")).toEqual([]);
  });
  it("titulo (corteEspecial) NAO recebe clausula de data (divida viva entra sempre)", () => {
    expect(corteDomain("finan.lancamento")).toEqual([]);
  });
  it("modelo desconhecido gera vazia", () => {
    expect(corteDomain("nao.existe")).toEqual([]);
  });
});

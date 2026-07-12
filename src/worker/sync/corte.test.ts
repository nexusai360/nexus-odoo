// Corte TECNICO da ingestao (T2a) , fixo, independente da data de inicio das analises.
import { describe, it, expect } from "@jest/globals";
import { corteDomain, CORTE_INGESTAO_ISO } from "./corte";

describe("corteDomain", () => {
  it("o corte da ingestao e FIXO em 2026-01-01 (nao e a data da tela)", () => {
    expect(CORTE_INGESTAO_ISO).toBe("2026-01-01");
  });

  it("nao depende da data de inicio das analises (mover a tela nao muda a ingestao)", async () => {
    const { corteAtual } = await import("../../lib/corte-dados");
    // A data da tela (padrao 16/03) nao pode vazar para o dominio do Odoo: se vazasse, o
    // worker pararia de puxar janeiro a marco e a reconciliacao apagaria o historico.
    expect(corteDomain("sped.documento")[0][2]).not.toBe(corteAtual());
    expect(corteDomain("sped.documento")).toEqual([["data_emissao", ">=", "2026-01-01"]]);
  });

  it("modelo transacional com corte gera clausula >= 2026-01-01", () => {
    expect(corteDomain("sped.documento")).toEqual([["data_emissao", ">=", CORTE_INGESTAO_ISO]]);
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

import { describe, it, expect } from "@jest/globals";
import { contemMarcadorNaoOperado, contemAfirmacaoFactual } from "../marcadores";

describe("marcadores de nao-operado", () => {
  it("reconhece textos reais de nao-operado", () => {
    expect(contemMarcadorNaoOperado("O MDF-e ainda nao e operado no Odoo da Matrix (sem manifestos).")).toBe(true);
    expect(contemMarcadorNaoOperado("Nao ha parametros de minimo/maximo cadastrados no Odoo ainda.")).toBe(true);
    expect(contemMarcadorNaoOperado("Infelizmente nao tenho dados suficientes pra te responder sobre isso.")).toBe(true);
    expect(contemMarcadorNaoOperado("As comissoes ainda nao sao operadas no Odoo da Matrix (sem comissoes).")).toBe(true);
  });
  it("nao marca uma resposta com dado real", () => {
    expect(contemMarcadorNaoOperado("Saldo geral: R$ 1.234,56 em 9 contas/bancos.")).toBe(false);
  });
  it("detecta afirmacao factual (numero) p/ a sub-classe A", () => {
    expect(contemAfirmacaoFactual("A folha foi R$ 50.000,00 no mes.")).toBe(true);
    expect(contemAfirmacaoFactual("Nao tenho dados suficientes sobre RH.")).toBe(false);
  });
});

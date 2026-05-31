import { mapRetornoItemRow } from "./fato-retorno-item";
import { mapRetornoBancarioRow } from "./fato-retorno-bancario";
import { mapRemessaBancariaRow } from "./fato-remessa-bancaria";
import { mapCarteiraCobrancaRow } from "./fato-carteira-cobranca";
import { mapChequeRow } from "./fato-cheque";
import { mapPixRow } from "./fato-pix";

describe("B3 , builders de cobrança bancária", () => {
  it("retorno.item mapeia valores e m2o (participante/banco)", () => {
    const r = mapRetornoItemRow({
      id: 10,
      retorno_id: [3, "Retorno 3"],
      situacao: "liquidado",
      nosso_numero: "0001",
      data_pagamento: "2026-05-20",
      vr_documento: 100.5,
      vr_juros: 1.25,
      vr_total: 101.75,
      divida_participante_id: [7, "Cliente X"],
      banco_id: [1, "Itaú"],
    });
    expect(r).toMatchObject({
      odooId: 10,
      retornoId: 3,
      situacao: "liquidado",
      vrDocumento: 100.5,
      vrJuros: 1.25,
      vrTotal: 101.75,
      dividaParticipanteId: 7,
      dividaParticipanteNome: "Cliente X",
      bancoNome: "Itaú",
    });
    expect(r.dataPagamento).toBeInstanceOf(Date);
  });

  it("retorno (cabeçalho) mapeia totais e datas", () => {
    const r = mapRetornoBancarioRow({
      id: 3, tipo: "ofx", banco_id: [1, "Itaú"], numero: "55",
      data: "2026-05-20 08:00:00", total_entradas: 500, total_saidas: 0, saldo: 500,
      caixa_fechado: true,
    });
    expect(r).toMatchObject({ odooId: 3, bancoNome: "Itaú", totalEntradas: 500, saldo: 500, caixaFechado: true });
  });

  it("remessa converte número float→string e confirmada", () => {
    const r = mapRemessaBancariaRow({ id: 7, numero: 102, confirmada: true, banco_id: [2, "BB"] });
    expect(r).toMatchObject({ odooId: 7, numero: "102", confirmada: true, bancoNome: "BB" });
  });

  it("carteira NÃO traz credenciais (só negócio)", () => {
    const r = mapCarteiraCobrancaRow({
      id: 1, nome: "Cobrança Itaú", banco: "itau", carteira: "109",
      al_juros: 1, taxa_emissao: 2.5, dias_protesto: 30,
      itau_token: "SEGREDO", bradesco_certificado: "X", sicredi_password: "Y",
    } as Record<string, unknown>);
    expect(r).toMatchObject({ odooId: 1, nome: "Cobrança Itaú", carteira: "109", diasProtesto: 30 });
    expect(JSON.stringify(r)).not.toContain("SEGREDO");
    expect(Object.keys(r)).not.toContain("itauToken");
  });

  it("cheque e pix mapeiam defensivamente (campos ausentes → null/0)", () => {
    const c = mapChequeRow({ id: 1, numero: "9", valor: 50 });
    expect(c).toMatchObject({ odooId: 1, numero: "9", valor: 50, banco: null, participanteId: null });
    const p = mapPixRow({ id: 2, txid: "abc", status: "pago" });
    expect(p).toMatchObject({ odooId: 2, txid: "abc", status: "pago", vrTarifas: 0 });
  });
});

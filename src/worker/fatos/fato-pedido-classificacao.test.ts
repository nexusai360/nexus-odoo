import { bucketDoPedido } from "./fato-pedido-classificacao";

describe("bucketDoPedido , whitelist autoritativa + gates de tipo e operacao", () => {
  const venda = { entraDemanda: true, tipo: "venda", finalizaPedidoCancelando: false };

  it("etapa na whitelist + venda + operacao valida => ABERTA", () => {
    expect(bucketDoPedido({ ...venda, etapaId: 130 })).toBe("ABERTA");
  });

  it("226 (Nota emitida e nao entregue) esta na whitelist => ABERTA mesmo tendo nota", () => {
    // A excecao antiga por NOME sai; a whitelist cobre 226 diretamente.
    expect(bucketDoPedido({ ...venda, etapaId: 226 })).toBe("ABERTA");
  });

  it("Cancelado (6) fora da whitelist => FECHADA/IGNORAR (some o vazamento)", () => {
    // No dado real a etapa Cancelado tem finaliza_pedido_cancelando=false; a whitelist elimina.
    expect(bucketDoPedido({ ...venda, etapaId: 6, finalizaPedidoCancelando: false })).toBe("FECHADA");
    // e com o flag verdadeiro tambem nao vira ABERTA:
    expect(bucketDoPedido({ ...venda, etapaId: 6, finalizaPedidoCancelando: true })).toBe("IGNORAR");
  });

  it("etapa de cauda longa fora da whitelist (ex.: AJUSTE FRACIONADO) => NUNCA ABERTA", () => {
    expect(bucketDoPedido({ ...venda, etapaId: 999 })).toBe("FECHADA");
  });

  it("whitelist VENCE flags: etapa 187 na whitelist => ABERTA (bucket nao olha finaliza_faturamento)", () => {
    expect(bucketDoPedido({ ...venda, etapaId: 187 })).toBe("ABERTA");
  });

  it("gate de TIPO: pedido tipo != 'venda' na mesma etapa => IGNORAR", () => {
    expect(bucketDoPedido({ ...venda, tipo: "romaneio", etapaId: 226 })).toBe("IGNORAR");
    expect(bucketDoPedido({ ...venda, tipo: "producao", etapaId: 130 })).toBe("IGNORAR");
  });

  it("gate de OPERACAO: intragrupo/remessa (entraDemanda=false) => IGNORAR mesmo na whitelist", () => {
    expect(bucketDoPedido({ ...venda, entraDemanda: false, etapaId: 130 })).toBe("IGNORAR");
  });

  it("etapaId nulo, venda, dentro da operacao => nunca ABERTA (sem etapa nao ha pertenca)", () => {
    expect(bucketDoPedido({ ...venda, etapaId: null })).toBe("FECHADA");
  });
});

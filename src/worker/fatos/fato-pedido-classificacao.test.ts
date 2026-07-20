import { bucketDoPedido, classificarPedidosDoRaw } from "./fato-pedido-classificacao";

function makePrisma(opts: {
  etapas: { odoo_id: number; nome: string; fin_fat: boolean; fin_conf: boolean; fin_canc: boolean;
            apr_ped: boolean; apr_fin: boolean; apr_est: boolean; apr_fat: boolean; fin_fin: boolean; fin_est: boolean }[];
  pedidos: { odoo_id: number; etapa_id: number | null; participante_id: number | null;
             participante_nome: string | null; cfop: string | null; tipo: string | null }[];
}) {
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce(opts.etapas) // 1a chamada: etapas
    .mockResolvedValueOnce(opts.pedidos); // 2a chamada: pedidos
  return {
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) }, // sem intragrupo
    $queryRaw: queryRaw,
  } as never;
}

const etapaBase = { fin_fat: false, fin_conf: false, fin_canc: false, apr_ped: false,
  apr_fin: false, apr_est: false, apr_fat: false, fin_fin: false, fin_est: false };

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

describe("classificarPedidosDoRaw , whitelist + tipo aplicados de ponta a ponta", () => {
  it("venda com CFOP de venda na etapa 130 => ABERTA; romaneio na mesma etapa => IGNORAR", async () => {
    const prisma = makePrisma({
      etapas: [{ odoo_id: 130, nome: "Aguardando Autorizacao", ...etapaBase }],
      pedidos: [
        { odoo_id: 1, etapa_id: 130, participante_id: 5010, participante_nome: "Cliente X", cfop: "5102", tipo: "venda" },
        { odoo_id: 2, etapa_id: 130, participante_id: 5010, participante_nome: "Cliente X", cfop: "5102", tipo: "romaneio" },
      ],
    });
    const out = await classificarPedidosDoRaw(prisma);
    expect(out.get(1)!.bucketDemanda).toBe("ABERTA");
    expect(out.get(2)!.bucketDemanda).toBe("IGNORAR");
  });

  it("venda com CFOP de venda na etapa Cancelado (6, fora da whitelist) => nao e ABERTA", async () => {
    const prisma = makePrisma({
      etapas: [{ odoo_id: 6, nome: "Cancelado", ...etapaBase }],
      pedidos: [{ odoo_id: 3, etapa_id: 6, participante_id: 5010, participante_nome: "Cliente X", cfop: "5102", tipo: "venda" }],
    });
    const out = await classificarPedidosDoRaw(prisma);
    expect(out.get(3)!.bucketDemanda).not.toBe("ABERTA");
  });
});

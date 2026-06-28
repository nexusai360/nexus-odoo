// src/worker/fatos/fato-compra.test.ts
import { mapCompraRow } from "./fato-compra";

const rawBase: Record<string, unknown> = {
  id: 1893,
  numero: "OC-0028/26",
  tipo: "compra",
  etapa_id: [43, "Aprovado"],
  operacao_id: [60, "Compra Johnson (compra)"],
  participante_id: [1012, "Johnson Indústrial do Brasil Ltda"],
  comprador_id: [26, "Thiago Nóbrega"],
  empresa_id: [4, "Jds Comércio - Matriz DF"],
  data_orcamento: "2026-05-14",
  data_prevista: false,
  data_aprovacao: "2026-05-14",
  vr_produtos: 1783147.5,
  vr_nf: 1783147.5,
  vr_pago: 0,
  vr_saldo: -1783147.5,
  estoque_finalizado: false,
  finaliza_pedido_cancelando: false,
};

describe("mapCompraRow", () => {
  it("mapeia campos básicos", () => {
    const r = mapCompraRow(rawBase);
    expect(r.odooId).toBe(1893);
    expect(r.numero).toBe("OC-0028/26");
    expect(r.etapaId).toBe(43);
    expect(r.etapaNome).toBe("Aprovado");
  });

  it("mapeia fornecedor (participante), comprador e empresa", () => {
    const r = mapCompraRow(rawBase);
    expect(r.fornecedorId).toBe(1012);
    expect(r.fornecedorNome).toBe("Johnson Indústrial do Brasil Ltda");
    expect(r.compradorId).toBe(26);
    expect(r.compradorNome).toBe("Thiago Nóbrega");
    expect(r.empresaId).toBe(4);
  });

  it("parseia datas e trata false como null", () => {
    const r = mapCompraRow(rawBase);
    expect(r.dataOrcamento).toEqual(new Date("2026-05-14T00:00:00Z"));
    expect(r.dataAprovacao).toEqual(new Date("2026-05-14T00:00:00Z"));
    expect(r.dataPrevista).toBeNull();
  });

  it("mapeia valores monetários", () => {
    const r = mapCompraRow(rawBase);
    expect(r.vrProdutos).toBe(1783147.5);
    expect(r.vrNf).toBe(1783147.5);
    expect(r.vrPago).toBe(0);
    expect(r.vrSaldo).toBe(-1783147.5);
  });

  it("recebida = estoque_finalizado; cancelada = finaliza_pedido_cancelando", () => {
    expect(mapCompraRow(rawBase).recebida).toBe(false);
    expect(mapCompraRow(rawBase).cancelada).toBe(false);
    const recebida = { ...rawBase, estoque_finalizado: true };
    expect(mapCompraRow(recebida).recebida).toBe(true);
    const cancelada = { ...rawBase, finaliza_pedido_cancelando: true };
    expect(mapCompraRow(cancelada).cancelada).toBe(true);
  });

  it("valores ausentes viram 0 e relações vazias viram null", () => {
    const raw = {
      id: 5,
      numero: false,
      etapa_id: false,
      participante_id: false,
      comprador_id: false,
      vr_produtos: undefined,
    };
    const r = mapCompraRow(raw as Record<string, unknown>);
    expect(r.numero).toBeNull();
    expect(r.etapaId).toBeNull();
    expect(r.fornecedorId).toBeNull();
    expect(r.compradorId).toBeNull();
    expect(r.vrProdutos).toBe(0);
  });
});

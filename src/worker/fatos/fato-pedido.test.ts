// src/worker/fatos/fato-pedido.test.ts
import { mapPedidoRow } from "./fato-pedido";

const ETAPA_FINALIZA_MAP = new Map<number, boolean>([
  [10, true],
  [20, false],
]);

const rawBase: Record<string, unknown> = {
  id: 42,
  numero: "PED-0042",
  tipo: "venda",
  etapa_id: [10, "Concluído"],
  operacao_id: [5, "Venda Padrão"],
  participante_id: [100, "Cliente X"],
  vendedor_id: [3, "João"],
  empresa_id: [1, "Matrix Fitness"],
  data_orcamento: "2024-01-15",
  data_aprovacao: "2024-01-16",
  data_validade: "2024-02-15",
  data_prevista: "2024-02-20",
  vr_produtos: "1000.00",
  vr_nf: "1050.00",
};

describe("mapPedidoRow", () => {
  it("mapeia campos básicos corretamente", () => {
    const result = mapPedidoRow(rawBase, ETAPA_FINALIZA_MAP);
    expect(result.odooId).toBe(42);
    expect(result.numero).toBe("PED-0042");
    expect(result.tipo).toBe("venda");
  });

  it("mapeia etapaId, etapaNome e etapaFinaliza=true quando etapa está no map", () => {
    const result = mapPedidoRow(rawBase, ETAPA_FINALIZA_MAP);
    expect(result.etapaId).toBe(10);
    expect(result.etapaNome).toBe("Concluído");
    expect(result.etapaFinaliza).toBe(true);
  });

  it("etapaFinaliza=false quando etapa não está no map", () => {
    const raw = { ...rawBase, etapa_id: [99, "Rascunho"] };
    const result = mapPedidoRow(raw as Record<string, unknown>, ETAPA_FINALIZA_MAP);
    expect(result.etapaFinaliza).toBe(false);
  });

  it("etapaFinaliza=false quando etapa_id é false", () => {
    const raw = { ...rawBase, etapa_id: false };
    const result = mapPedidoRow(raw as Record<string, unknown>, ETAPA_FINALIZA_MAP);
    expect(result.etapaId).toBeNull();
    expect(result.etapaFinaliza).toBe(false);
  });

  it("mapeia relações m2o corretamente", () => {
    const result = mapPedidoRow(rawBase, ETAPA_FINALIZA_MAP);
    expect(result.operacaoId).toBe(5);
    expect(result.operacaoNome).toBe("Venda Padrão");
    expect(result.participanteId).toBe(100);
    expect(result.participanteNome).toBe("Cliente X");
    expect(result.vendedorId).toBe(3);
    expect(result.vendedorNome).toBe("João");
    expect(result.empresaId).toBe(1);
    expect(result.empresaNome).toBe("Matrix Fitness");
  });

  it("parseia datas com T00:00:00", () => {
    const result = mapPedidoRow(rawBase, ETAPA_FINALIZA_MAP);
    expect(result.dataOrcamento).toEqual(new Date("2024-01-15T00:00:00"));
    expect(result.dataAprovacao).toEqual(new Date("2024-01-16T00:00:00"));
    expect(result.dataValidade).toEqual(new Date("2024-02-15T00:00:00"));
    expect(result.dataPrevista).toEqual(new Date("2024-02-20T00:00:00"));
  });

  it("datas null quando campo não é string", () => {
    const raw = { ...rawBase, data_orcamento: false, data_aprovacao: null };
    const result = mapPedidoRow(raw as Record<string, unknown>, ETAPA_FINALIZA_MAP);
    expect(result.dataOrcamento).toBeNull();
    expect(result.dataAprovacao).toBeNull();
  });

  it("converte valores monetários para number", () => {
    const result = mapPedidoRow(rawBase, ETAPA_FINALIZA_MAP);
    expect(result.vrProdutos).toBe(1000);
    expect(result.vrNf).toBe(1050);
  });

  it("valores monetários default 0 quando ausentes", () => {
    const raw = { ...rawBase, vr_produtos: undefined, vr_nf: null };
    const result = mapPedidoRow(raw as Record<string, unknown>, ETAPA_FINALIZA_MAP);
    expect(result.vrProdutos).toBe(0);
    expect(result.vrNf).toBe(0);
  });

  it("não produz campo atualizadoEm", () => {
    const result = mapPedidoRow(rawBase, ETAPA_FINALIZA_MAP);
    expect("atualizadoEm" in result).toBe(false);
  });

  it("tipo vazio quando campo não é string", () => {
    const raw = { ...rawBase, tipo: null };
    const result = mapPedidoRow(raw as Record<string, unknown>, ETAPA_FINALIZA_MAP);
    expect(result.tipo).toBe("");
  });
});

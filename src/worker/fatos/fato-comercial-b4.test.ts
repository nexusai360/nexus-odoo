import { mapCotacaoRow } from "./fato-cotacao";
import { mapComissaoRow } from "./fato-comissao";

describe("B4 , builders de cotação e comissão", () => {
  it("cotação mapeia status, ehCompra e operação (m2o)", () => {
    const r = mapCotacaoRow({
      id: 5, numero: "C-5", status: "rascunho", eh_compra: true,
      empresa_id: [1, "Matriz"], operacao_id: [9, "Compra de insumo"],
      usuario_aprovador_id: [3, "Fulano"], centro_resultado_id: [2, "CR"],
    });
    expect(r).toMatchObject({
      odooId: 5, numero: "C-5", status: "rascunho", ehCompra: true,
      empresaId: 1, operacaoId: 9, operacaoNome: "Compra de insumo",
      usuarioAprovadorId: 3, centroResultadoId: 2,
    });
  });

  it("cotação defensiva: campos ausentes → null/false", () => {
    const r = mapCotacaoRow({ id: 1 });
    expect(r).toMatchObject({ odooId: 1, numero: null, status: null, ehCompra: false, operacaoNome: null });
  });

  it("comissão mapeia base/alíquota/valor e participante", () => {
    const r = mapComissaoRow({
      id: 7, pedido_id: [100, "PED-100"], participante_id: [42, "Vendedor X"],
      bc_comissao: 1000, al_comissao: 5, vr_comissao: 50,
    });
    expect(r).toMatchObject({
      odooId: 7, pedidoId: 100, participanteId: 42, participanteNome: "Vendedor X",
      bcComissao: 1000, alComissao: 5, vrComissao: 50,
    });
  });

  it("comissão defensiva: valores ausentes → 0", () => {
    const r = mapComissaoRow({ id: 2 });
    expect(r).toMatchObject({ odooId: 2, bcComissao: 0, alComissao: 0, vrComissao: 0, participanteId: null });
  });
});

import { progressLabel } from "./progress-labels";

describe("progressLabel", () => {
  test("traduz tool fiscal para rótulo de faturamento", () => {
    expect(progressLabel("fiscal_faturamento_periodo")).toBe("faturamento");
  });

  test("traduz tool de estoque", () => {
    expect(progressLabel("estoque_saldo_produto")).toBe("estoque");
  });

  test("traduz tool de preços", () => {
    expect(progressLabel("preco_produto")).toBe("preços");
  });

  test("traduz tool de cadastros (singular e plural)", () => {
    expect(progressLabel("cadastro_buscar_parceiro")).toBe("cadastros");
    expect(progressLabel("cadastros_listar")).toBe("cadastros");
  });

  test("tool desconhecida cai no rótulo neutro", () => {
    expect(progressLabel("qualquer_coisa_nova")).toBe("dados da operação");
  });

  test("nunca devolve o id cru (sem underscore)", () => {
    for (const id of [
      "preco_produto",
      "fiscal_faturamento_periodo",
      "comercial_contar_pedidos",
      "registrar_lacuna",
      "bi_consulta_avancada",
    ]) {
      expect(progressLabel(id)).not.toContain("_");
    }
  });
});

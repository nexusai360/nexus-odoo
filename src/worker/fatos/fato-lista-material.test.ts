import { mapListaMaterialRow } from "./fato-lista-material";

describe("mapListaMaterialRow", () => {
  it("mapeia pai, componente, quantidade e tipo (m2o [id, nome])", () => {
    const r = mapListaMaterialRow({
      produto_produzido_id: [37, "[37] U-ES-LED Bicicleta"],
      produto_id: [160, "[1453] ESTR P/ BICICLETA"],
      lista_id: [42, "CKE-0035/25"],
      quantidade: 2,
      tipo_item: "P",
    })!;
    expect(r.produtoPaiId).toBe(37);
    expect(r.componenteProdutoId).toBe(160);
    expect(r.componenteNome).toBe("[1453] ESTR P/ BICICLETA");
    expect(r.quantidade).toBe(2);
    expect(r.tipoItem).toBe("P");
    expect(r.listaId).toBe(42);
  });

  it("preenche a ativacao da lista a partir do Map do header", () => {
    const ativacao = new Map([
      [42, { dataAtivacao: new Date("2025-11-24T00:00:00Z"), inativa: false }],
    ]);
    const r = mapListaMaterialRow(
      { produto_produzido_id: [1, "pai"], produto_id: [2, "comp"], lista_id: [42, "L"] },
      ativacao,
    )!;
    expect(r.listaDataAtivacao).toEqual(new Date("2025-11-24T00:00:00Z"));
    expect(r.listaInativa).toBe(false);
  });

  it("lista sem entrada no Map: ativacao null, nao inativa", () => {
    const r = mapListaMaterialRow(
      { produto_produzido_id: [1, "pai"], produto_id: [2, "comp"], lista_id: [99, "L"] },
      new Map(),
    )!;
    expect(r.listaDataAtivacao).toBeNull();
    expect(r.listaInativa).toBe(false);
  });

  it("descarta linha sem pai ou sem componente", () => {
    expect(mapListaMaterialRow({ produto_produzido_id: false, produto_id: [1, "x"] })).toBeNull();
    expect(mapListaMaterialRow({ produto_produzido_id: [1, "x"], produto_id: false })).toBeNull();
  });

  it("quantidade defensiva: false do Odoo vira 0", () => {
    const r = mapListaMaterialRow({
      produto_produzido_id: [1, "pai"],
      produto_id: [2, "comp"],
      quantidade: false,
    })!;
    expect(r.quantidade).toBe(0);
  });

  it("guarda PRD-R (peça real, não filtra no builder)", () => {
    const r = mapListaMaterialRow({
      produto_produzido_id: [1, "pai"],
      produto_id: [2, "estrutura"],
      quantidade: 1,
      tipo_item: "PRD-R",
    })!;
    expect(r.tipoItem).toBe("PRD-R");
  });
});

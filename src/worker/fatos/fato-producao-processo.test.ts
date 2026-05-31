import { mapProducaoProcessoRow } from "./fato-producao-processo";

describe("B5 , builder de processo de produção", () => {
  it("mapeia ordem/nome/descricao/tempo", () => {
    const r = mapProducaoProcessoRow({
      id: 3, ordem: 2, nome: "Montagem", descricao: "Etapa de montagem", tempo: 1.5,
    });
    expect(r).toMatchObject({
      odooId: 3, ordem: 2, nome: "Montagem", descricao: "Etapa de montagem", tempo: 1.5,
    });
  });

  it("defensivo: ausentes → null/0", () => {
    const r = mapProducaoProcessoRow({ id: 1 });
    expect(r).toMatchObject({ odooId: 1, ordem: null, nome: null, descricao: null, tempo: 0 });
  });
});

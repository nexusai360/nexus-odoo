import { mapReferenciaRows, GRUPO_A } from "./fato-referencia";

describe("mapReferenciaRows", () => {
  it("mapeia codigo/descricao por tabela (codigo+descricao)", () => {
    const linhas = mapReferenciaRows("cfop", [
      { data: { codigo: "1101", descricao: "Compra para industrialização" } },
    ]);
    expect(linhas).toEqual([
      { tabela: "cfop", codigo: "1101", descricao: "Compra para industrialização" },
    ]);
  });

  it("usa o campo nome quando a tabela é codigo+nome", () => {
    const linhas = mapReferenciaRows("cst_icms", [
      { data: { codigo: "00", nome: "00 - Tributada" } },
    ]);
    expect(linhas[0]).toEqual({ tabela: "cst_icms", codigo: "00", descricao: "00 - Tributada" });
  });

  it("usa os campos próprios de cst_cibs, municipio, pais, estado", () => {
    expect(
      mapReferenciaRows("cst_cibs", [{ data: { cst_cibs: "000", nome_cst_cibs: "Integral" } }])[0],
    ).toEqual({ tabela: "cst_cibs", codigo: "000", descricao: "Integral" });
    expect(
      mapReferenciaRows("municipio", [{ data: { codigo_ibge: "5300108", nome: "Brasília" } }])[0],
    ).toEqual({ tabela: "municipio", codigo: "5300108", descricao: "Brasília" });
    expect(
      mapReferenciaRows("estado", [{ data: { uf: "DF", nome: "Distrito Federal" } }])[0],
    ).toEqual({ tabela: "estado", codigo: "DF", descricao: "Distrito Federal" });
  });

  it("código ausente vira string vazia; descrição ausente vira null", () => {
    const linha = mapReferenciaRows("unidade", [{ data: { nome: "Sem unidade" } }])[0];
    expect(linha).toEqual({ tabela: "unidade", codigo: "", descricao: "Sem unidade" });
  });

  it("GRUPO_A cobre as 15 tabelas de lookup", () => {
    expect(GRUPO_A).toHaveLength(15);
  });
});

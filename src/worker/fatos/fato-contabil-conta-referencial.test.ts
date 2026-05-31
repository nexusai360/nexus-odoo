import { mapContabilContaReferencialRow } from "./fato-contabil-conta-referencial";

describe("mapContabilContaReferencialRow", () => {
  it("mapeia uma conta referencial real (amostra de produção)", () => {
    const raw = {
      id: 1,
      codigo: "1",
      nome: "ATIVO",
      nome_completo: "1 - ATIVO",
      natureza: "01",
      tipo: "A",
      nivel: 1,
      parent_path: "1/",
      conta_superior_id: false,
    };
    const row = mapContabilContaReferencialRow(raw);
    expect(row.odooId).toBe(1);
    expect(row.codigo).toBe("1");
    expect(row.nome).toBe("ATIVO");
    expect(row.nomeCompleto).toBe("1 - ATIVO");
    expect(row.natureza).toBe("01");
    expect(row.tipo).toBe("A");
    expect(row.nivel).toBe(1);
    expect(row.parentPath).toBe("1/");
    expect(row.contaSuperiorId).toBeNull();
  });

  it("extrai o id do M2O conta_superior_id e trata vazios", () => {
    const raw = {
      id: 3,
      codigo: "1.01.01",
      nome: "DISPONIBILIDADES",
      conta_superior_id: [2, "ATIVO CIRCULANTE"],
    };
    const row = mapContabilContaReferencialRow(raw as Record<string, unknown>);
    expect(row.contaSuperiorId).toBe(2);
    expect(row.nomeCompleto).toBeNull();
    expect(row.natureza).toBeNull();
    expect(row.nivel).toBeNull();
  });
});

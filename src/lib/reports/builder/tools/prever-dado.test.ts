import { toolPreverDado } from "./prever-dado";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("toolPreverDado", () => {
  it("devolve os campos do shape tabela de fato_estoque_saldo", () => {
    const r = toolPreverDado({ fato: "fato_estoque_saldo", shapeDerivado: "tabela" });
    expect("campos" in r).toBe(true);
    if ("campos" in r) {
      expect(r.campos.map((c) => c.key)).toContain("produtoNome");
    }
  });

  it("erro quando a fonte nao existe", () => {
    expect(toolPreverDado({ fato: "nada", shapeDerivado: "tabela" })).toEqual({
      erro: "fonte_desconhecida",
    });
  });

  it("erro quando a fonte nao oferece o shape", () => {
    expect(
      toolPreverDado({ fato: "fato_estoque_saldo", shapeDerivado: "serieTemporal" }),
    ).toEqual({ erro: "shape_nao_oferecido" });
  });
});

import {
  toolListarComponentes,
  toolDescreverComponente,
  toolListarFontes,
} from "./read-tools";

// source-registry importa "@/lib/prisma" (client com import.meta) no topo.
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("read-tools", () => {
  it("toolListarComponentes lista DataTable com o shape exigido", () => {
    const r = toolListarComponentes();
    const dt = r.find((c) => c.chave === "DataTable");
    expect(dt).toBeDefined();
    expect(dt!.shapeDerivadoExigido).toBe("tabela");
  });

  it("toolDescreverComponente devolve a entrada ou erro", () => {
    expect(toolDescreverComponente({ chave: "DataTable" })).toMatchObject({
      chave: "DataTable",
    });
    expect(toolDescreverComponente({ chave: "Nada" })).toEqual({
      erro: "componente_desconhecido",
    });
  });

  it("toolListarFontes lista fato_estoque_saldo com seus shapes", () => {
    const r = toolListarFontes();
    const f = r.find((x) => x.fato === "fato_estoque_saldo");
    expect(f).toBeDefined();
    expect(f!.shapes).toContain("tabela");
  });
});

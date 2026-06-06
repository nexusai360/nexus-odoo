import { buildEmpresaWhere, buildEmpresaSqlFragment } from "./empresa";

describe("buildEmpresaWhere", () => {
  it("undefined retorna objeto vazio", () => {
    expect(buildEmpresaWhere(undefined)).toEqual({});
  });

  it("id presente retorna filtro empresaId", () => {
    expect(buildEmpresaWhere(7)).toEqual({ empresaId: 7 });
  });
});

describe("buildEmpresaSqlFragment", () => {
  it("undefined retorna fragmento e params vazios", () => {
    expect(buildEmpresaSqlFragment(undefined, "nf", 3)).toEqual({ sql: "", params: [] });
  });

  it("id presente monta AND alias.empresa_id = $N com alias e indice dados", () => {
    expect(buildEmpresaSqlFragment(7, "nf", 3)).toEqual({ sql: "AND nf.empresa_id = $3", params: [7] });
  });

  it("respeita alias e indice diferentes (item, $4)", () => {
    expect(buildEmpresaSqlFragment(12, "fnfi", 4)).toEqual({ sql: "AND fnfi.empresa_id = $4", params: [12] });
  });
});

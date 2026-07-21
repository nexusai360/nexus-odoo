// Testes do motor de filtro genérico portado (Onda 0).
import {
  testaNo,
  OPERADORES,
  LABEL_CONECTOR,
  type CampoLike,
  type GrupoRegras,
} from "./motor-filtro";

type Row = { cliente: string; valor: number; data: string; uf: string; tags: string[] };
const campoBy: Record<string, CampoLike> = {
  cliente: { tipo: "texto", get: ((r: Row) => r.cliente) as CampoLike["get"] },
  valor: { tipo: "numero", get: ((r: Row) => r.valor) as CampoLike["get"] },
  data: { tipo: "data", get: ((r: Row) => r.data) as CampoLike["get"] },
  uf: { tipo: "opcao", get: ((r: Row) => r.uf) as CampoLike["get"] },
  tags: { tipo: "tags", get: ((r: Row) => r.tags) as CampoLike["get"] },
};
const row: Row = { cliente: "Smartfit SP", valor: 5000, data: "2026-07-15", uf: "SP", tags: ["Urgente"] };

function g(conector: "todas" | "qualquer", ...filhos: GrupoRegras["filhos"]): GrupoRegras {
  return { id: "g", tipo: "grupo", conector, filhos };
}
const r = (campo: string, op: string, valor: string, valor2?: string) =>
  ({ id: `${campo}-${op}`, tipo: "regra", campo, op, valor, valor2 }) as const;

describe("motor-filtro , testaNo", () => {
  it("grupo vazio passa tudo", () => {
    expect(testaNo(row, g("todas"), campoBy)).toBe(true);
  });
  it("texto: contem / naocontem / comeca (case-insensitive)", () => {
    expect(testaNo(row, g("todas", r("cliente", "contem", "smart")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("cliente", "naocontem", "bike")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("cliente", "comeca", "smart")), campoBy)).toBe(true);
  });
  it("numero: maior / menor / entre", () => {
    expect(testaNo(row, g("todas", r("valor", "maior", "1000")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("valor", "menor", "1000")), campoBy)).toBe(false);
    expect(testaNo(row, g("todas", r("valor", "entre", "1000", "9000")), campoBy)).toBe(true);
  });
  it("data: antes / depois / em (ISO)", () => {
    expect(testaNo(row, g("todas", r("data", "depois", "2026-07-10")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("data", "antes", "2026-07-10")), campoBy)).toBe(false);
    expect(testaNo(row, g("todas", r("data", "em", "2026-07-15")), campoBy)).toBe(true);
  });
  it("opcao: igual / diferente", () => {
    expect(testaNo(row, g("todas", r("uf", "igual", "sp")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("uf", "diferente", "rj")), campoBy)).toBe(true);
  });
  it("tags: contemtag / naocontemtag", () => {
    expect(testaNo(row, g("todas", r("tags", "contemtag", "urgente")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("tags", "naocontemtag", "urgente")), campoBy)).toBe(false);
  });
  it("todas (E) exige todas; qualquer (OU) basta uma", () => {
    const cond = [r("uf", "igual", "SP"), r("valor", "menor", "100")] as GrupoRegras["filhos"];
    expect(testaNo(row, g("todas", ...cond), campoBy)).toBe(false);
    expect(testaNo(row, g("qualquer", ...cond), campoBy)).toBe(true);
  });
  it("grupos aninhados", () => {
    const arvore = g("todas", r("uf", "igual", "SP"), g("qualquer", r("valor", "maior", "9999"), r("cliente", "contem", "smart")));
    expect(testaNo(row, arvore, campoBy)).toBe(true);
  });
  it("LABEL_CONECTOR mapeia para E/OU (decisão D1)", () => {
    expect(LABEL_CONECTOR.todas).toBe("E");
    expect(LABEL_CONECTOR.qualquer).toBe("OU");
  });
  it("OPERADORES cobre os 5 tipos", () => {
    expect(Object.keys(OPERADORES)).toEqual(["texto", "opcao", "numero", "data", "tags"]);
  });
});

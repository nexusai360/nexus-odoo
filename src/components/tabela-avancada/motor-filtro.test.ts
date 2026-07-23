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

  // Conector POR PAR de irmãos (E/OU misto no mesmo nível), avaliação left-associative.
  // `rc` = regra com `conectorAntes` explícito (o operador com o irmão anterior).
  const rc = (
    conectorAntes: "todas" | "qualquer",
    campo: string,
    op: string,
    valor: string,
    valor2?: string,
  ): GrupoRegras["filhos"][number] => ({ ...r(campo, op, valor, valor2), conectorAntes });

  it("conector por par: A E B OU C mistura no mesmo grupo", () => {
    // ((SP[true] E valor<100[false]) OU cliente~smart[true]) = (false OU true) = true
    const arvore = g(
      "todas",
      r("uf", "igual", "SP"),
      rc("todas", "valor", "menor", "100"),
      rc("qualquer", "cliente", "contem", "smart"),
    );
    expect(testaNo(row, arvore, campoBy)).toBe(true);
  });

  it("conector por par: avaliação é left-associative, não por precedência", () => {
    // ((SP[true] OU valor<100[false]) E cliente~bike[false]) = (true E false) = false.
    // Com precedência (E antes de OU) daria true; provamos que é left-associative.
    const arvore = g(
      "todas",
      r("uf", "igual", "SP"),
      rc("qualquer", "valor", "menor", "100"),
      rc("todas", "cliente", "contem", "bike"),
    );
    expect(testaNo(row, arvore, campoBy)).toBe(false);
  });

  it("compat: filho sem conectorAntes cai no conector do grupo", () => {
    // Sem conectorAntes em nenhum filho, um grupo "qualquer" ainda é OU de todos.
    const cond = [r("uf", "igual", "SP"), r("valor", "menor", "100")] as GrupoRegras["filhos"];
    expect(testaNo(row, g("qualquer", ...cond), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", ...cond), campoBy)).toBe(false);
  });
  it("LABEL_CONECTOR mapeia para E/OU (decisão D1)", () => {
    expect(LABEL_CONECTOR.todas).toBe("E");
    expect(LABEL_CONECTOR.qualquer).toBe("OU");
  });
  it("texto: novos operadores termina / não termina / diferente / não começa", () => {
    expect(testaNo(row, g("todas", r("cliente", "termina", "sp")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("cliente", "naotermina", "sp")), campoBy)).toBe(false);
    expect(testaNo(row, g("todas", r("cliente", "diferente", "outra coisa")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("cliente", "naocomeca", "bike")), campoBy)).toBe(true);
  });
  it("numero: novos operadores diferente / >= / <=", () => {
    expect(testaNo(row, g("todas", r("valor", "diferente", "5000")), campoBy)).toBe(false);
    expect(testaNo(row, g("todas", r("valor", "diferente", "10")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("valor", "maiorigual", "5000")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("valor", "menorigual", "5000")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("valor", "menorigual", "4999")), campoBy)).toBe(false);
  });
  it("data: novos operadores em-ou-antes / em-ou-depois / diferente", () => {
    expect(testaNo(row, g("todas", r("data", "antesigual", "2026-07-15")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("data", "depoisigual", "2026-07-15")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("data", "diferente", "2026-07-15")), campoBy)).toBe(false);
  });
  it("preenchido / vazio em texto, opcao e tags", () => {
    expect(testaNo(row, g("todas", r("cliente", "definido", "")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("cliente", "vazio", "")), campoBy)).toBe(false);
    expect(testaNo(row, g("todas", r("uf", "definido", "")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("tags", "definido", "")), campoBy)).toBe(true);
    expect(testaNo(row, g("todas", r("tags", "vazio", "")), campoBy)).toBe(false);
  });
  it("OPERADORES cobre os 5 tipos", () => {
    expect(Object.keys(OPERADORES)).toEqual(["texto", "opcao", "numero", "data", "tags"]);
  });
});

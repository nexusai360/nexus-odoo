import { rankearPorNome } from "../_ranking";

const O = { topN: 3, limiarFuzzy: 0.8, margemFolga: 0.1 };
const ent = (nome: string) => ({ nome });

describe("rankearPorNome", () => {
  it("lista vazia = nenhuma", () => {
    expect(rankearPorNome<{ nome: string }>([], "x", (c) => c.nome, O)).toEqual({ status: "nenhuma" });
  });

  it("unico match acima do limiar = unica", () => {
    const r = rankearPorNome([ent("esteira ergometrica")], "esteira ergometrica", (c) => c.nome, O);
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.score).toBe(1);
  });

  it("top abaixo do limiar = nenhuma (nao chuta)", () => {
    const r = rankearPorNome([ent("cadeira de rodas")], "esteira", (c) => c.nome, O);
    expect(r.status).toBe("nenhuma");
  });

  it("top com folga sobre o segundo = unica", () => {
    const r = rankearPorNome([ent("esteira pro"), ent("xxxxxxxxxxxx")], "esteira pro", (c) => c.nome, O);
    expect(r.status).toBe("unica");
  });

  it("dois proximos sem folga = ambigua top-N", () => {
    const r = rankearPorNome([ent("esteira pro a"), ent("esteira pro b"), ent("esteira pro c"), ent("esteira pro d")], "esteira pro x", (c) => c.nome, O);
    expect(r.status).toBe("ambigua");
    if (r.status === "ambigua") {
      expect(r.criterio).toBe("nome");
      expect(r.candidatas.length).toBeLessThanOrEqual(3);
    }
  });

  it("usa scorePre quando fornecido (penalizacao de inativo)", () => {
    const itens: { nome: string }[] = [ent("a"), ent("b")];
    const r = rankearPorNome(itens, "a", (c) => c.nome, O, "nome", (c) => (c.nome === "a" ? 1 : 0.5));
    expect(r.status).toBe("unica");
    if (r.status === "unica") expect(r.entidade.nome).toBe("a");
  });
});

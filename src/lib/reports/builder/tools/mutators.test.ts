import {
  criarRelatorio,
  adicionarSecao,
  editarSecao,
  removerSecao,
} from "./mutators";
import { validarReportEntry } from "../report-entry-schema";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("mutators", () => {
  it("criarRelatorio devolve uma ficha vazia valida", () => {
    const ficha = criarRelatorio({ titulo: "Estoque" });
    expect(ficha.tipo).toBe("tela_cheia");
    expect(ficha.secoes).toEqual([]);
    expect(validarReportEntry(ficha).ok).toBe(true);
  });

  it("adicionarSecao compativel adiciona a secao", () => {
    const ficha = criarRelatorio({ titulo: "Estoque" });
    const r = adicionarSecao(ficha, {
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
    });
    expect("ficha" in r).toBe(true);
    if ("ficha" in r) expect(r.ficha.secoes).toHaveLength(1);
  });

  it("adicionarSecao incompativel e rejeitada", () => {
    const ficha = criarRelatorio({ titulo: "Estoque" });
    const r = adicionarSecao(ficha, {
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "serieTemporal",
      config: {},
    });
    expect("erro" in r).toBe(true);
  });

  it("removerSecao remove pela id", () => {
    let ficha = criarRelatorio({ titulo: "Estoque" });
    const add = adicionarSecao(ficha, {
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: {},
    });
    if (!("ficha" in add)) throw new Error("esperava ficha");
    ficha = add.ficha;
    const secaoId = ficha.secoes[0].id;
    const rem = removerSecao(ficha, { secaoId });
    expect(rem.ficha.secoes).toHaveLength(0);
  });

  it("editarSecao altera a config de uma secao existente", () => {
    let ficha = criarRelatorio({ titulo: "Estoque" });
    const add = adicionarSecao(ficha, {
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: { colunas: [] },
    });
    if (!("ficha" in add)) throw new Error("esperava ficha");
    ficha = add.ficha;
    const secaoId = ficha.secoes[0].id;
    const r = editarSecao(ficha, { secaoId, patch: { config: { searchable: true } } });
    expect("ficha" in r).toBe(true);
    if ("ficha" in r) {
      expect(r.ficha.secoes[0].config).toEqual({ searchable: true });
    }
  });
});

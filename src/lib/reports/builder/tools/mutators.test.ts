import {
  criarRelatorio,
  adicionarSecao,
  editarSecao,
  removerSecao,
  moverSecao,
  definirTitulo,
  definirTituloSecao,
} from "./mutators";
import { validarReportEntry } from "../report-entry-schema";
import type { BuilderReportEntry } from "../types";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("mutators", () => {
  it("criarRelatorio devolve uma ficha vazia valida", () => {
    const ficha = criarRelatorio({ titulo: "Estoque" });
    expect(ficha.tipo).toBe("tela_cheia");
    expect(ficha.secoes).toEqual([]);
    expect(validarReportEntry(ficha).ok).toBe(true);
  });

  function fichaTresSecoes(): BuilderReportEntry {
    return {
      id: "rascunho",
      titulo: "Estoque",
      dominio: "estoque",
      schemaVersion: 1,
      tipo: "tela_cheia",
      parametros: [],
      secoes: [
        { id: "a", template: "KPIRow", fato: "fato_estoque_saldo", shapeDerivado: "kpis", config: {}, filtros: [] },
        { id: "b", template: "BarChart", fato: "fato_estoque_saldo", shapeDerivado: "agregacaoCategorica", config: {}, filtros: [] },
        { id: "c", template: "DataTable", fato: "fato_estoque_saldo", shapeDerivado: "tabela", config: {}, filtros: [] },
      ],
    };
  }

  it("moverSecao reordena por direcao e por posicao", () => {
    const f = fichaTresSecoes();
    const sobe = moverSecao(f, { secaoId: "c", direcao: "cima" });
    expect("ficha" in sobe && sobe.ficha.secoes.map((s) => s.id)).toEqual(["a", "c", "b"]);
    const pos = moverSecao(f, { secaoId: "c", posicao: 1 });
    expect("ficha" in pos && pos.ficha.secoes.map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(moverSecao(f, { secaoId: "x", direcao: "cima" })).toEqual({ erro: "secao_inexistente" });
  });

  it("definirTitulo renomeia o relatorio (rejeita vazio)", () => {
    const f = fichaTresSecoes();
    const r = definirTitulo(f, { titulo: "  Estoque por armazem  " });
    expect("ficha" in r && r.ficha.titulo).toBe("Estoque por armazem");
    expect(definirTitulo(f, { titulo: "  " })).toEqual({ erro: "titulo_vazio" });
  });

  it("definirTituloSecao grava config.titulo", () => {
    const f = fichaTresSecoes();
    const r = definirTituloSecao(f, { secaoId: "b", titulo: "Top categorias" });
    expect("ficha" in r && r.ficha.secoes[1].config.titulo).toBe("Top categorias");
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

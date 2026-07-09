import { validarReportEntry } from "./report-entry-schema";

const fichaMinima = {
  id: "draft-1",
  titulo: "Saldo por produto",
  dominio: "estoque",
  schemaVersion: 1,
  tipo: "tela_cheia",
  parametros: [],
  secoes: [
    {
      id: "s1",
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: {
        colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }],
      },
      filtros: [],
    },
  ],
};

describe("validarReportEntry", () => {
  it("aceita ficha minima de DataTable de estoque (descricao/icone/modeloFonte opcionais)", () => {
    const r = validarReportEntry(fichaMinima);
    expect(r.ok).toBe(true);
  });

  it("rejeita template fora do enum", () => {
    const r = validarReportEntry({
      ...fichaMinima,
      secoes: [{ ...fichaMinima.secoes[0], template: "Hologram" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejeita icone fora do set fechado", () => {
    const r = validarReportEntry({ ...fichaMinima, icone: "Foguete" });
    expect(r.ok).toBe(false);
  });

  it("rejeita shapeDerivado invalido na secao", () => {
    const r = validarReportEntry({
      ...fichaMinima,
      secoes: [{ ...fichaMinima.secoes[0], shapeDerivado: "magica" }],
    });
    expect(r.ok).toBe(false);
  });
});

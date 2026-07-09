import { carregarRelatorioDinamico } from "./carregar-relatorio-dinamico";

const obterRascunho = jest.fn();
const resolveSecao = jest.fn();

jest.mock("./saved-report-repo", () => ({
  obterRascunho: (...a: unknown[]) => obterRascunho(...a),
}));
jest.mock("./resolve-source", () => ({
  resolveSecao: (...a: unknown[]) => resolveSecao(...a),
}));

const fichaValida = {
  id: "draft-1",
  titulo: "Saldo",
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
      config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
      filtros: [],
    },
  ],
};

const user = { userId: "u1", role: "admin" };

beforeEach(() => {
  obterRascunho.mockReset();
  resolveSecao.mockReset();
});

describe("carregarRelatorioDinamico", () => {
  it("notfound quando o rascunho nao existe ou e de outro dono", async () => {
    obterRascunho.mockResolvedValue(null);
    expect(await carregarRelatorioDinamico("x", user)).toEqual({ tipo: "notfound" });
  });

  it("invalida (erro explicito) quando a ficha salva nao passa no schema atual", async () => {
    obterRascunho.mockResolvedValue({ entry: { id: "x", titulo: "y" } });
    const r = await carregarRelatorioDinamico("x", user);
    expect(r.tipo).toBe("invalida");
  });

  it("ok resolve as secoes da ficha valida", async () => {
    obterRascunho.mockResolvedValue({ entry: fichaValida });
    resolveSecao.mockResolvedValue({ estado: "ok", dado: [{ produtoNome: "Esteira" }] });
    const r = await carregarRelatorioDinamico("x", user);
    expect(r.tipo).toBe("ok");
    if (r.tipo === "ok") {
      expect(r.dados.s1.estado).toBe("ok");
      expect(resolveSecao).toHaveBeenCalledTimes(1);
    }
  });
});

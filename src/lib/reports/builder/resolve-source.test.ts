import { resolveSecao } from "./resolve-source";
import type { BuilderSection } from "./types";

const obterProdutor = jest.fn();
jest.mock("./source-registry", () => ({
  obterProdutor: (...a: unknown[]) => obterProdutor(...a),
  obterContrato: () => ({ dominio: "estoque" }),
}));

beforeEach(() => obterProdutor.mockReset());

const secaoTabela: BuilderSection = {
  id: "s1",
  template: "DataTable",
  fato: "fato_estoque_saldo",
  shapeDerivado: "tabela",
  config: {},
  filtros: [],
};

describe("resolveSecao", () => {
  it("resolve DataTable/tabela em linhas com estado ok", async () => {
    obterProdutor.mockReturnValue(async () => ({
      linhas: [{ produtoNome: "Esteira", valorTotal: 1000 }],
      freshness: null,
    }));
    const r = await resolveSecao(secaoTabela, {});
    expect(r.erro).toBeUndefined();
    expect(r.dado).toEqual([{ produtoNome: "Esteira", valorTotal: 1000 }]);
    expect(r.estado).toBe("ok");
  });

  it("estado vazio quando a fonte nao tem linhas", async () => {
    obterProdutor.mockReturnValue(async () => ({ linhas: [], freshness: null }));
    const r = await resolveSecao(secaoTabela, {});
    expect(r.estado).toBe("vazio");
  });

  it("retorna erro quando nao ha produtor para o par (fato, shape)", async () => {
    obterProdutor.mockReturnValue(undefined);
    const r = await resolveSecao(secaoTabela, {});
    expect(r.erro).toBe("fonte_indisponivel");
  });
});

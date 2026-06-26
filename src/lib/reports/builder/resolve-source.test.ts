import { resolveSecao } from "./resolve-source";
import type { BuilderSection } from "./types";

const obterProdutor = jest.fn();
const guardDominio = jest.fn();
jest.mock("./source-registry", () => ({
  obterProdutor: (...a: unknown[]) => obterProdutor(...a),
  obterContrato: () => ({ dominio: "estoque" }),
}));
jest.mock("@/lib/reports/guard", () => ({
  guardDominio: (...a: unknown[]) => guardDominio(...a),
}));

beforeEach(() => {
  obterProdutor.mockReset();
  guardDominio.mockReset();
  guardDominio.mockResolvedValue(undefined);
});

const secaoTabela: BuilderSection = {
  id: "s1",
  template: "DataTable",
  fato: "fato_estoque_saldo",
  shapeDerivado: "tabela",
  config: {},
  filtros: [],
};

describe("resolveSecao , filtros da secao", () => {
  it("converte secao.filtros (faixaDias) em FiltrosFonte e passa ao produtor", async () => {
    const prod = jest.fn().mockResolvedValue({ linhas: [{ a: 1 }], freshness: null });
    obterProdutor.mockReturnValue(prod);
    const secao: BuilderSection = {
      id: "p",
      template: "DataTable",
      fato: "fato_estoque_parados",
      shapeDerivado: "tabela",
      config: {},
      filtros: [{ tipo: "faixaDias", default: "90" }],
    };
    await resolveSecao(secao, {});
    expect(prod).toHaveBeenCalledWith(expect.objectContaining({ faixaDias: 90 }));
  });

  it("filtro de runtime tem precedencia sobre o filtro da secao", async () => {
    const prod = jest.fn().mockResolvedValue({ linhas: [{ a: 1 }], freshness: null });
    obterProdutor.mockReturnValue(prod);
    const secao: BuilderSection = {
      id: "t",
      template: "BarChart",
      fato: "fato_estoque_top_movimentados",
      shapeDerivado: "agregacaoCategorica",
      config: {},
      filtros: [{ tipo: "sentido", default: "entrada" }],
    };
    await resolveSecao(secao, { sentido: "saida" });
    expect(prod).toHaveBeenCalledWith(expect.objectContaining({ sentido: "saida" }));
  });
});

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

  it("nega quando o usuario nao tem acesso ao dominio da fonte", async () => {
    guardDominio.mockRejectedValue(new Error("Sem acesso ao dominio"));
    obterProdutor.mockReturnValue(async () => ({ linhas: [{ x: 1 }], freshness: null }));
    const r = await resolveSecao(secaoTabela, {});
    expect(r.erro).toBe("sem_acesso_dominio");
  });
});

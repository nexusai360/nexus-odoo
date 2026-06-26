import { BUILDER_TOOLS, executarTool, validarFicha } from "./index";
import { criarRelatorio } from "./mutators";
import type { BuilderReportEntry } from "../types";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const fichaComSecao: BuilderReportEntry = {
  id: "rascunho",
  titulo: "Estoque",
  dominio: "estoque",
  schemaVersion: 1,
  tipo: "tela_cheia" as const,
  parametros: [],
  secoes: [
    {
      id: "s1",
      template: "DataTable" as const,
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela" as const,
      config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
      filtros: [],
    },
  ],
};

describe("builder tools index", () => {
  it("BUILDER_TOOLS expoe as 10 tools com inputSchema", () => {
    const nomes = BUILDER_TOOLS.map((t) => t.name);
    expect(nomes).toEqual(
      expect.arrayContaining([
        "listar_componentes",
        "descrever_componente",
        "listar_fontes",
        "prever_dado",
        "criar_relatorio",
        "adicionar_secao",
        "editar_secao",
        "remover_secao",
        "definir_filtro",
        "validar",
      ]),
    );
    expect(BUILDER_TOOLS).toHaveLength(10);
  });

  it("validarFicha aprova ficha valida e compativel", () => {
    expect(validarFicha(fichaComSecao)).toEqual({ ok: true });
  });

  it("validarFicha reprova secao incompativel", () => {
    const ruim = {
      ...fichaComSecao,
      secoes: [{ ...fichaComSecao.secoes[0], shapeDerivado: "serieTemporal" as const }],
    };
    const r = validarFicha(ruim);
    expect(r.ok).toBe(false);
  });

  it("executarTool roteia leitura e mutacao", () => {
    const leitura = executarTool("listar_componentes", {}, null);
    expect(leitura.tipo).toBe("leitura");

    const cria = executarTool("criar_relatorio", { titulo: "X" }, null);
    expect(cria.tipo).toBe("ficha");

    const ficha = criarRelatorio({ titulo: "X" });
    const erro = executarTool(
      "adicionar_secao",
      { template: "DataTable", fato: "fato_estoque_saldo", shapeDerivado: "serieTemporal" },
      ficha,
    );
    expect(erro.tipo).toBe("erro");
  });
});

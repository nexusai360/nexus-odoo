/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportRenderer, agruparTopN, type EditavelFicha } from "./report-renderer";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

beforeAll(() => {
  // recharts (ResponsiveContainer) usa ResizeObserver, ausente no jsdom.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const entry: BuilderReportEntry = {
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
        colunas: [
          { key: "produtoNome", header: "Produto", tipo: "texto" },
          { key: "valorTotal", header: "Valor", tipo: "moeda" },
        ],
      },
      filtros: [],
    },
  ],
};

describe("agruparTopN , agrupa a cauda categorica em 'Outros'", () => {
  const muitos = Array.from({ length: 15 }, (_, i) => ({ rotulo: `C${i}`, valor: 15 - i }));

  it("nao mexe quando ha poucas categorias (<= n)", () => {
    const poucas = [{ rotulo: "A", valor: 3 }, { rotulo: "B", valor: 1 }];
    expect(agruparTopN(poucas, 12)).toEqual([{ rotulo: "A", valor: 3 }, { rotulo: "B", valor: 1 }]);
  });

  it("ordena por valor e limita a n linhas, somando o resto em 'Outros'", () => {
    const out = agruparTopN(muitos, 5);
    expect(out).toHaveLength(5);
    expect(out[0].rotulo).toBe("C0"); // maior valor (15)
    expect(out[4].rotulo).toBe("Outros");
    // top 4 = 15+14+13+12 = 54; total = 15..1 = 120; outros = 120-54 = 66
    expect(out[4].valor).toBe(66);
  });

  it("'Outros' so aparece quando ha cauda", () => {
    const exatos = Array.from({ length: 5 }, (_, i) => ({ rotulo: `C${i}`, valor: 5 - i }));
    const out = agruparTopN(exatos, 5);
    expect(out.some((r) => r.rotulo === "Outros")).toBe(false);
  });
});

describe("ReportRenderer", () => {
  it("renderiza a DataTable com as linhas resolvidas", () => {
    const dados: Record<string, SecaoResolvida> = {
      s1: { estado: "ok", dado: [{ produtoNome: "Esteira", valorTotal: 1000 }] },
    };
    render(<ReportRenderer entry={entry} dados={dados} />);
    expect(screen.getByText("Saldo por produto")).toBeInTheDocument();
    expect(screen.getByText("Esteira")).toBeInTheDocument();
  });

  it("mostra aviso quando a secao esta em erro", () => {
    const dados: Record<string, SecaoResolvida> = {
      s1: { estado: "erro", erro: "sem_acesso_dominio" },
    };
    render(<ReportRenderer entry={entry} dados={dados} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("compoe relatorio rico (KPIRow + BarChart + DataTable) sem [object Object]", () => {
    const rico: BuilderReportEntry = {
      ...entry,
      titulo: "Relatorio de Produtos",
      secoes: [
        { id: "kpi", template: "KPIRow", fato: "fato_estoque_saldo", shapeDerivado: "kpis", config: { titulo: "Indicadores" }, filtros: [] },
        { id: "bar", template: "BarChart", fato: "fato_estoque_saldo", shapeDerivado: "agregacaoCategorica", config: {}, filtros: [] },
        { id: "tab", template: "DataTable", fato: "fato_estoque_saldo", shapeDerivado: "tabela", config: {}, filtros: [] },
      ],
    };
    const dados: Record<string, SecaoResolvida> = {
      kpi: {
        estado: "ok",
        dado: { totalProdutos: 5, valorTotal: 1000 },
        campos: [
          { key: "totalProdutos", label: "Produtos", tipo: "numero" },
          { key: "valorTotal", label: "Valor total", tipo: "moeda" },
        ],
      },
      bar: {
        estado: "ok",
        dado: [{ rotulo: "Cardio", valor: 300 }],
        campos: [
          { key: "rotulo", label: "Categoria", tipo: "texto" },
          { key: "valor", label: "Valor", tipo: "moeda" },
        ],
      },
      tab: {
        estado: "ok",
        // Linha COM campo aninhado: a tabela nao pode renderizar "[object Object]".
        dado: [{ produtoNome: "Esteira", valorTotal: 1000, detalhePorLocal: [{ a: 1 }] }],
        campos: [
          { key: "produtoNome", label: "Produto", tipo: "texto" },
          { key: "valorTotal", label: "Valor", tipo: "moeda" },
        ],
      },
    };
    const { container } = render(<ReportRenderer entry={rico} dados={dados} />);
    expect(screen.getByText("Produtos")).toBeInTheDocument();
    expect(screen.getByText("Valor total")).toBeInTheDocument();
    expect(screen.getByLabelText(/gr[aá]fico de barras/i)).toBeInTheDocument();
    // Cada grafico/tabela vem num Card com titulo (config.titulo ou padrao).
    expect(screen.getByText("Comparacao por categoria")).toBeInTheDocument();
    expect(screen.getByText("Detalhe")).toBeInTheDocument();
    expect(screen.getByText("Esteira")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\[object Object\]/);
  });

  it("agrupa secoes irmas (mesmo grupoId) lado a lado; metade vazia nao derruba a outra", () => {
    const comGrupo: BuilderReportEntry = {
      ...entry,
      titulo: "Movimentacao",
      secoes: [
        { id: "line", template: "LineChart", fato: "fato_estoque_movimento", shapeDerivado: "serieTemporal", config: { titulo: "Movimentacao mensal", grupoId: "g1" }, filtros: [] },
        { id: "pie", template: "PieChart", fato: "fato_estoque_marca", shapeDerivado: "agregacaoCategorica", config: { titulo: "Valor por marca", grupoId: "g1" }, filtros: [] },
      ],
    };
    const dados: Record<string, SecaoResolvida> = {
      line: { estado: "vazio" },
      pie: {
        estado: "ok",
        dado: [{ rotulo: "MATRIX", valor: 100 }],
        campos: [
          { key: "rotulo", label: "Marca", tipo: "texto" },
          { key: "valor", label: "Valor", tipo: "moeda" },
        ],
      },
    };
    render(<ReportRenderer entry={comGrupo} dados={dados} />);
    expect(screen.getByTestId("secao-grupo")).toBeInTheDocument();
    // metade vazia mostra placeholder; a outra metade renderiza
    expect(screen.getByText(/sem dados para esta secao/i)).toBeInTheDocument();
    expect(screen.getByText("Valor por marca")).toBeInTheDocument();
  });

  it("renderiza um Funnel (pipeline por etapa) com os estagios", () => {
    const comFunnel: BuilderReportEntry = {
      ...entry,
      titulo: "Pipeline comercial",
      dominio: "comercial",
      secoes: [
        { id: "fun", template: "Funnel", fato: "fato_comercial_etapa", shapeDerivado: "agregacaoCategorica", config: { titulo: "Pedidos por etapa" }, filtros: [] },
      ],
    };
    const dados: Record<string, SecaoResolvida> = {
      fun: {
        estado: "ok",
        dado: [
          { rotulo: "Orcamento", valor: 1000 },
          { rotulo: "Pedido", valor: 400 },
        ],
        campos: [
          { key: "rotulo", label: "Etapa", tipo: "texto" },
          { key: "valor", label: "Valor", tipo: "moeda" },
        ],
      },
    };
    render(<ReportRenderer entry={comFunnel} dados={dados} />);
    expect(screen.getByText("Pedidos por etapa")).toBeInTheDocument();
    expect(screen.getByText("Orcamento")).toBeInTheDocument();
    expect(screen.getByText("Pedido")).toBeInTheDocument();
    expect(screen.getByLabelText(/funil/i)).toBeInTheDocument();
  });

  it("renderiza um Waterfall (DRE em cascata)", () => {
    const comCascata: BuilderReportEntry = {
      ...entry,
      titulo: "DRE",
      dominio: "financeiro",
      secoes: [
        { id: "dre", template: "Waterfall", fato: "fato_financeiro_resultado", shapeDerivado: "cascata", config: { titulo: "Resultado em cascata" }, filtros: [] },
      ],
    };
    const dados: Record<string, SecaoResolvida> = {
      dre: {
        estado: "ok",
        dado: [
          { rotulo: "Receitas", valor: 1000, tipo: "positivo" },
          { rotulo: "Custos", valor: 400, tipo: "negativo" },
          { rotulo: "Resultado", valor: 600, tipo: "total" },
        ],
      },
    };
    render(<ReportRenderer entry={comCascata} dados={dados} />);
    expect(screen.getByText("Resultado em cascata")).toBeInTheDocument();
    expect(screen.getByLabelText(/cascata/i)).toBeInTheDocument();
  });

  it("renderiza um Combo (serie temporal: realizado barra + previsto linha)", () => {
    const comCombo: BuilderReportEntry = {
      ...entry,
      titulo: "Fluxo",
      dominio: "financeiro",
      secoes: [
        { id: "cmb", template: "Combo", fato: "fato_financeiro_movimento", shapeDerivado: "serieTemporal", config: { titulo: "Realizado x Previsto" }, filtros: [] },
      ],
    };
    const dados: Record<string, SecaoResolvida> = {
      cmb: {
        estado: "ok",
        dado: [
          { mes: "2026-01", realizado: 100, previsto: 120 },
          { mes: "2026-02", realizado: 130, previsto: 140 },
        ],
        campos: [
          { key: "mes", label: "Mes", tipo: "texto" },
          { key: "realizado", label: "Realizado", tipo: "moeda" },
          { key: "previsto", label: "Previsto", tipo: "moeda" },
        ],
      },
    };
    render(<ReportRenderer entry={comCombo} dados={dados} />);
    expect(screen.getByText("Realizado x Previsto")).toBeInTheDocument();
    expect(screen.getByLabelText(/combinado/i)).toBeInTheDocument();
  });

  it("KPIRow mostra o subtitulo por metrica (config.subtitulos)", () => {
    const comSub: BuilderReportEntry = {
      ...entry,
      secoes: [
        { id: "kpi", template: "KPIRow", fato: "fato_estoque_saldo", shapeDerivado: "kpis", config: { titulo: "Indicadores", subtitulos: { valorTotal: "Valor do estoque no momento" } }, filtros: [] },
      ],
    };
    const dados: Record<string, SecaoResolvida> = {
      kpi: { estado: "ok", dado: { valorTotal: 1000 }, campos: [{ key: "valorTotal", label: "Valor total", tipo: "moeda" }] },
    };
    render(<ReportRenderer entry={comSub} dados={dados} />);
    expect(screen.getByText("Valor do estoque no momento")).toBeInTheDocument();
  });

  describe("seletor de cor (modo edicao)", () => {
    const grafico: BuilderReportEntry = {
      ...entry,
      secoes: [
        { id: "bar", template: "BarChart", fato: "fato_estoque_saldo", shapeDerivado: "agregacaoCategorica", config: {}, filtros: [] },
      ],
    };
    const dados: Record<string, SecaoResolvida> = {
      bar: {
        estado: "ok",
        dado: [{ rotulo: "Cardio", valor: 300 }],
        campos: [
          { key: "rotulo", label: "Categoria", tipo: "texto" },
          { key: "valor", label: "Valor", tipo: "moeda" },
        ],
      },
    };
    const noopEd = (): EditavelFicha => ({
      onMover: jest.fn(),
      onRemover: jest.fn(),
      onRenomear: jest.fn(),
      onCor: jest.fn(),
    });

    it("nao mostra o seletor fora do modo edicao", () => {
      render(<ReportRenderer entry={grafico} dados={dados} />);
      expect(screen.queryByLabelText("Escolher cor da secao")).not.toBeInTheDocument();
    });

    it("abre a paleta e dispara onCor com o token escolhido", () => {
      const ed = noopEd();
      render(<ReportRenderer entry={grafico} dados={dados} editavel={ed} />);
      fireEvent.click(screen.getByLabelText("Escolher cor da secao"));
      fireEvent.click(screen.getByLabelText("Esmeralda"));
      expect(ed.onCor).toHaveBeenCalledWith("bar", "emerald");
    });

    it("\"Cor padrao\" dispara onCor com null", () => {
      const ed = noopEd();
      render(<ReportRenderer entry={grafico} dados={dados} editavel={ed} />);
      fireEvent.click(screen.getByLabelText("Escolher cor da secao"));
      fireEvent.click(screen.getByText("Cor padrao"));
      expect(ed.onCor).toHaveBeenCalledWith("bar", null);
    });
  });
});

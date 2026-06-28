/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportRenderer, type EditavelFicha } from "./report-renderer";
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

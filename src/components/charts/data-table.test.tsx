/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { DataTable, type ColumnDef } from "./data-table";

// Mock do downloadCsv para evitar URL.createObjectURL no jsdom
jest.mock("./export-csv", () => {
  const actual = jest.requireActual("./export-csv");
  return {
    ...actual,
    downloadCsv: jest.fn(),
  };
});
import { downloadCsv } from "./export-csv";
const mockDownloadCsv = jest.mocked(downloadCsv);

interface Row extends Record<string, unknown> {
  produto: string;
  saldo: number;
}
const cols: ColumnDef<Row>[] = [
  { key: "produto", header: "Produto", tipo: "texto" },
  { key: "saldo", header: "Saldo", tipo: "numero" },
];
const rows: Row[] = [
  { produto: "Esteira", saldo: 5 },
  { produto: "Anilha", saldo: -2 },
  { produto: "Bicicleta", saldo: 10 },
];

// ---------------------------------------------------------------------------
// Render básico
// ---------------------------------------------------------------------------
describe("DataTable render", () => {
  it("renderiza cabeçalhos e linhas", () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(screen.getByText("Produto")).toBeInTheDocument();
    expect(screen.getByText("Esteira")).toBeInTheDocument();
  });
  it("formata números negativos em pt-BR sem casas decimais supérfluas", () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(screen.getByText("-2")).toBeInTheDocument();
  });
  it("renderiza o estado de preparo", () => {
    render(<DataTable columns={cols} rows={[]} estado="preparando" />);
    expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
  });
  it("exibe contador de linhas", () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(screen.getByText(/3 linhas/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Busca em todas as colunas (c2)
// ---------------------------------------------------------------------------
describe("DataTable busca (c2)", () => {
  async function typeAndWait(input: HTMLElement, value: string) {
    fireEvent.change(input, { target: { value } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
  }

  it("filtra por texto em coluna texto", async () => {
    render(<DataTable columns={cols} rows={rows} searchable />);
    await typeAndWait(screen.getByPlaceholderText("Pesquisar…"), "este");
    expect(screen.getByText("Esteira")).toBeInTheDocument();
    expect(screen.queryByText("Anilha")).not.toBeInTheDocument();
  });

  it("filtra por número convertido para string", async () => {
    render(<DataTable columns={cols} rows={rows} searchable />);
    await typeAndWait(screen.getByPlaceholderText("Pesquisar…"), "10");
    expect(screen.getByText("Bicicleta")).toBeInTheDocument();
    expect(screen.queryByText("Esteira")).not.toBeInTheDocument();
    expect(screen.queryByText("Anilha")).not.toBeInTheDocument();
  });

  it("exibe estado vazio quando nada casa", async () => {
    render(<DataTable columns={cols} rows={rows} searchable />);
    await typeAndWait(screen.getByPlaceholderText("Pesquisar…"), "zzz");
    expect(screen.getByText(/sem dados para exibir/i)).toBeInTheDocument();
  });

  it("busca é case-insensitive", async () => {
    render(<DataTable columns={cols} rows={rows} searchable />);
    await typeAndWait(screen.getByPlaceholderText("Pesquisar…"), "ESTEIRA");
    expect(screen.getByText("Esteira")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Multi-sort (c1)
// ---------------------------------------------------------------------------
describe("DataTable multi-sort (c1)", () => {
  it("ordena coluna numérica asc e mostra aria-sort=ascending", () => {
    render(<DataTable columns={cols} rows={rows} />);
    const headerBtn = screen.getByRole("button", { name: /Ordenar por Saldo/i });
    fireEvent.click(headerBtn); // asc
    const ths = screen.getAllByRole("columnheader");
    expect(ths[1]).toHaveAttribute("aria-sort", "ascending");
  });

  it("segundo clique cicla para desc", () => {
    render(<DataTable columns={cols} rows={rows} />);
    const headerBtn = screen.getByRole("button", { name: /Ordenar por Saldo/i });
    fireEvent.click(headerBtn); // asc
    fireEvent.click(headerBtn); // desc
    const ths = screen.getAllByRole("columnheader");
    expect(ths[1]).toHaveAttribute("aria-sort", "descending");
  });

  it("terceiro clique remove a ordenação (aria-sort=none)", () => {
    render(<DataTable columns={cols} rows={rows} />);
    const headerBtn = screen.getByRole("button", { name: /Ordenar por Saldo/i });
    fireEvent.click(headerBtn); // asc
    fireEvent.click(headerBtn); // desc
    fireEvent.click(headerBtn); // sem ordenação
    const ths = screen.getAllByRole("columnheader");
    expect(ths[1]).toHaveAttribute("aria-sort", "none");
  });

  it("ordena coluna textual — Anilha vem primeiro na asc", () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /Ordenar por Produto/i }));
    const cells = screen.getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("Anilha");
  });
});

// ---------------------------------------------------------------------------
// Colunas visíveis
// ---------------------------------------------------------------------------
describe("DataTable colunas", () => {
  it("botão Colunas está presente", () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(
      screen.getByRole("button", { name: /gerenciar colunas/i }),
    ).toBeInTheDocument();
  });
  it("renderiza um checkbox por coluna dentro do popover", () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /gerenciar colunas/i }));
    expect(
      screen.getByRole("checkbox", { name: /mostrar coluna produto/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /mostrar coluna saldo/i }),
    ).toBeInTheDocument();
  });
  it("checkbox da única coluna tem aria-disabled", () => {
    const umaCol: ColumnDef<Row>[] = [
      { key: "produto", header: "Produto", tipo: "texto" },
    ];
    render(<DataTable columns={umaCol} rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /gerenciar colunas/i }));
    const checkbox = screen.getByRole("checkbox", {
      name: /mostrar coluna produto/i,
    });
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
  });
});

// ---------------------------------------------------------------------------
// Modo compacto
// ---------------------------------------------------------------------------
describe("DataTable compacto", () => {
  it("botão Compacto está presente e é toggleável", () => {
    render(<DataTable columns={cols} rows={rows} />);
    const btn = screen.getByRole("button", { name: /compacto/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });
});

// ---------------------------------------------------------------------------
// Linhas expansíveis (c3)
// ---------------------------------------------------------------------------
describe("DataTable linhas expansíveis (c3)", () => {
  it("sem expandDetail, não há chevron nem aria-expanded", () => {
    render(<DataTable columns={cols} rows={rows} />);
    const dataRows = screen.getAllByRole("row").slice(1); // remove thead
    for (const r of dataRows) {
      expect(r).not.toHaveAttribute("aria-expanded");
    }
  });

  it("com expandDetail retornando conteúdo, linha tem aria-expanded=false inicial", () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        expandDetail={() => <p>Detalhe</p>}
      />,
    );
    const dataRows = screen.getAllByRole("row").slice(1);
    expect(dataRows[0]).toHaveAttribute("aria-expanded", "false");
  });

  it("clique na linha expande o detalhe", () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        expandDetail={() => <p>ConteudoDrillDown</p>}
      />,
    );
    const dataRows = screen.getAllByRole("row").slice(1);
    fireEvent.click(dataRows[0]);
    expect(dataRows[0]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("ConteudoDrillDown").length).toBeGreaterThan(0);
  });

  it("segundo clique na mesma linha fecha o detalhe", () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        expandDetail={() => <p>ConteudoDrillDown</p>}
      />,
    );
    const dataRows = screen.getAllByRole("row").slice(1);
    fireEvent.click(dataRows[0]);
    fireEvent.click(dataRows[0]);
    expect(dataRows[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("ConteudoDrillDown")).not.toBeInTheDocument();
  });

  it("linha com expandDetail retornando null não exibe aria-expanded", () => {
    render(
      <DataTable
        columns={cols}
        rows={rows}
        expandDetail={(r) => (r.produto === "Esteira" ? <p>SóEsteira</p> : null)}
      />,
    );
    const dataRows = screen.getAllByRole("row").slice(1);
    // Linha "Anilha" (segunda) não deve ter aria-expanded
    expect(dataRows[1]).not.toHaveAttribute("aria-expanded");
  });
});

// ---------------------------------------------------------------------------
// Exportação CSV (c5)
// ---------------------------------------------------------------------------
describe("DataTable exportar CSV (c5)", () => {
  beforeEach(() => {
    mockDownloadCsv.mockClear();
  });

  it("botão Exportar está presente", () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(
      screen.getByRole("button", { name: /exportar tabela/i }),
    ).toBeInTheDocument();
  });

  it("clique no botão chama downloadCsv", () => {
    render(<DataTable columns={cols} rows={rows} exportFilename="teste" />);
    fireEvent.click(screen.getByRole("button", { name: /exportar tabela/i }));
    expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
    const [csvContent, filename] = mockDownloadCsv.mock.calls[0] as [string, string];
    expect(filename).toMatch(/^teste-/);
    expect(csvContent).toContain("Produto;Saldo");
  });

  it("CSV exportado respeita busca aplicada", async () => {
    render(
      <DataTable columns={cols} rows={rows} searchable exportFilename="filtrado" />,
    );
    fireEvent.change(screen.getByPlaceholderText("Pesquisar…"), {
      target: { value: "Esteira" },
    });
    await waitFor(() => expect(screen.getByText("Esteira")).toBeInTheDocument());
    // Espera debounce de 250ms
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    fireEvent.click(screen.getByRole("button", { name: /exportar tabela/i }));
    const [csvContent] = mockDownloadCsv.mock.calls[0] as [string, string];
    expect(csvContent).toContain("Esteira");
    expect(csvContent).not.toContain("Anilha");
  });
});

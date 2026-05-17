/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTable, type ColumnDef } from "./data-table";

interface Row extends Record<string, unknown> { produto: string; saldo: number; }
const cols: ColumnDef<Row>[] = [
  { key: "produto", header: "Produto", tipo: "texto" },
  { key: "saldo", header: "Saldo", tipo: "numero" },
];
const rows: Row[] = [
  { produto: "Esteira", saldo: 5 },
  { produto: "Anilha", saldo: -2 },
];

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
    expect(screen.getByText(/2 linhas/i)).toBeInTheDocument();
  });
});

describe("DataTable busca", () => {
  it("filtra as linhas pelo texto digitado", () => {
    render(<DataTable columns={cols} rows={rows} searchable />);
    fireEvent.change(screen.getByPlaceholderText("Pesquisar…"), {
      target: { value: "este" },
    });
    expect(screen.getByText("Esteira")).toBeInTheDocument();
    expect(screen.queryByText("Anilha")).not.toBeInTheDocument();
  });
  it("exibe estado vazio quando nada casa", () => {
    render(<DataTable columns={cols} rows={rows} searchable />);
    fireEvent.change(screen.getByPlaceholderText("Pesquisar…"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText(/sem dados para exibir/i)).toBeInTheDocument();
  });
});

describe("DataTable ordenação", () => {
  it("ordena coluna numérica ascendente e descendente ao clicar no header", () => {
    render(<DataTable columns={cols} rows={rows} />);
    const headerBtn = screen.getByRole("button", { name: /Saldo/ });
    fireEvent.click(headerBtn); // asc
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toContain("-2");
    const ths = screen.getAllByRole("columnheader");
    expect(ths[1]).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(headerBtn); // desc
    expect(screen.getAllByRole("columnheader")[1]).toHaveAttribute(
      "aria-sort", "descending",
    );
  });
  it("ordena coluna textual", () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /Produto/ }));
    const firstCell = screen.getAllByRole("cell")[0];
    expect(firstCell).toHaveTextContent("Anilha");
  });
});

describe("DataTable colunas", () => {
  it("botão Colunas está presente", () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(screen.getByRole("button", { name: /gerenciar colunas/i })).toBeInTheDocument();
  });
  it("renderiza um checkbox por coluna dentro do popover", () => {
    render(<DataTable columns={cols} rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /gerenciar colunas/i }));
    // Deve existir um checkbox para "Produto" e um para "Saldo"
    expect(screen.getByRole("checkbox", { name: /mostrar coluna produto/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mostrar coluna saldo/i })).toBeInTheDocument();
  });
  it("checkbox da única coluna tem aria-disabled", () => {
    // Com apenas 1 coluna, o checkbox deve estar aria-disabled
    const umaCol: ColumnDef<Row>[] = [{ key: "produto", header: "Produto", tipo: "texto" }];
    render(<DataTable columns={umaCol} rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /gerenciar colunas/i }));
    const checkbox = screen.getByRole("checkbox", { name: /mostrar coluna produto/i });
    // base-ui usa aria-disabled ao invés do atributo disabled nativo
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
  });
});

describe("DataTable compacto", () => {
  it("botão Compacto está presente e é toggleável", () => {
    render(<DataTable columns={cols} rows={rows} />);
    const btn = screen.getByRole("button", { name: /compacto/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });
});

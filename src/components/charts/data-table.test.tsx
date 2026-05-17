/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTable, type ColumnDef } from "./data-table";

interface Row { produto: string; saldo: number; }
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
  it("formata números negativos em pt-BR", () => {
    render(<DataTable columns={cols} rows={rows} />);
    expect(screen.getByText("-2,00")).toBeInTheDocument();
  });
  it("renderiza o estado de preparo", () => {
    render(<DataTable columns={cols} rows={[]} estado="preparando" />);
    expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
  });
});

describe("DataTable ordenação", () => {
  it("ordena coluna numérica ascendente e descendente ao clicar no header", () => {
    render(<DataTable columns={cols} rows={rows} />);
    const headerBtn = screen.getByRole("button", { name: /Saldo/ });
    fireEvent.click(headerBtn); // asc
    let cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells).toContain("-2,00");
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

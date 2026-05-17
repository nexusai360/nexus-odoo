/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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

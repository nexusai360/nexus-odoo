/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportDataTable } from "./report-data-table";

const columns = [
  { key: "produtoNome", header: "Produto", tipo: "texto" as const },
  { key: "valorTotal", header: "Valor", tipo: "moeda" as const },
];

describe("ReportDataTable , drilldown", () => {
  it("linha com __detalhe abre/fecha a sub-tabela ao clicar", () => {
    const rows = [
      {
        produtoNome: "Esteira",
        valorTotal: 1000,
        __detalhe: [{ local: "Matriz DF", saldo: 2 }],
      },
    ];
    render(<ReportDataTable columns={columns} rows={rows} searchable={false} />);
    // detalhe escondido inicialmente
    expect(screen.queryByText("Matriz DF")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /abrir detalhe da linha/i }));
    expect(screen.getByText("Matriz DF")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /abrir detalhe da linha/i }));
    expect(screen.queryByText("Matriz DF")).not.toBeInTheDocument();
  });

  it("linha sem __detalhe nao tem chevron de drilldown", () => {
    render(
      <ReportDataTable columns={columns} rows={[{ produtoNome: "Halter", valorTotal: 50 }]} searchable={false} />,
    );
    expect(screen.queryByRole("button", { name: /abrir detalhe/i })).not.toBeInTheDocument();
    expect(screen.getByText("Halter")).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";

const listarDimensoesFiltro = jest.fn();
jest.mock("@/lib/actions/relatorio-filtros", () => ({
  listarDimensoesFiltro: () => listarDimensoesFiltro(),
}));

import { BuilderReportFilters } from "./builder-report-filters";

beforeEach(() => {
  listarDimensoesFiltro.mockReset();
  listarDimensoesFiltro.mockResolvedValue({
    armazens: [{ id: 5, nome: "Matriz DF" }],
    familias: [{ id: 2, nome: "Cardio" }],
  });
});

describe("BuilderReportFilters", () => {
  it("mostra recortes (armazem + familia) quando o fato de saldo esta presente", async () => {
    render(<BuilderReportFilters fatos={["fato_estoque_saldo"]} filtros={{}} onChange={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Armazém")).toBeInTheDocument();
      expect(screen.getByText("Família")).toBeInTheDocument();
    });
  });

  it("nao renderiza nada quando nenhum fato aceita recorte", () => {
    const { container } = render(
      <BuilderReportFilters fatos={["fato_estoque_marca"]} filtros={{}} onChange={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

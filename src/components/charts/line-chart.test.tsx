/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { LineChartCard } from "./line-chart";

describe("LineChartCard", () => {
  it("renderiza o container multi-série", () => {
    const { container } = render(
      <LineChartCard
        data={[{ mes: "2026-01", entrada: 10, saida: 4 }]}
        config={{
          xKey: "mes", formato: "inteiro",
          series: [
            { key: "entrada", label: "Entradas" },
            { key: "saida", label: "Saídas" },
          ],
        }}
      />,
    );
    expect(container.querySelector("[data-slot=line-chart]")).toBeInTheDocument();
  });
  it("renderiza o estado vazio", () => {
    render(
      <LineChartCard data={[]} config={{ xKey: "x", formato: "inteiro", series: [] }}
        estado="vazio" />,
    );
    expect(screen.getByText(/sem dado no período/i)).toBeInTheDocument();
  });
});

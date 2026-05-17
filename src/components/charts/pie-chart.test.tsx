/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PieChartCard } from "./pie-chart";

describe("PieChartCard render", () => {
  it("renderiza o container do gráfico", () => {
    const { container } = render(
      <PieChartCard
        data={[{ rotulo: "Esteiras", valor: 100 }]}
        config={{ nameKey: "rotulo", valueKey: "valor", formato: "moeda" }}
      />,
    );
    expect(container.querySelector("[data-slot=pie-chart]")).toBeInTheDocument();
  });
  it("renderiza o estado de erro com botão de repetir", () => {
    render(
      <PieChartCard data={[]} config={{ nameKey: "n", valueKey: "v", formato: "moeda" }}
        estado="erro" />,
    );
    expect(screen.getByRole("button", { name: /repetir/i })).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { BarChartCard } from "./bar-chart";

describe("BarChartCard", () => {
  it("renderiza o container do gráfico com dados", () => {
    const { container } = render(
      <BarChartCard
        data={[{ rotulo: "Galpão A", valor: 100 }]}
        config={{ xKey: "rotulo", yKey: "valor", formato: "moeda" }}
      />,
    );
    expect(container.querySelector("[data-slot=bar-chart]")).toBeInTheDocument();
  });
  it("renderiza o estado de preparo", () => {
    render(
      <BarChartCard data={[]} config={{ xKey: "x", yKey: "y", formato: "inteiro" }}
        estado="preparando" />,
    );
    expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import {
  ChartSkeleton, ChartPreparing, ChartEmpty, ChartError,
} from "./chart-states";

describe("chart-states", () => {
  it("ChartSkeleton renderiza um placeholder animado", () => {
    const { container } = render(<ChartSkeleton />);
    expect(container.querySelector("[data-slot=skeleton]")).toBeInTheDocument();
  });
  it("ChartPreparing exibe a mensagem de preparo", () => {
    render(<ChartPreparing />);
    expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
  });
  it("ChartEmpty exibe a mensagem de sem dado", () => {
    render(<ChartEmpty />);
    expect(screen.getByText(/sem dados para exibir/i)).toBeInTheDocument();
  });
  it("ChartError exibe a mensagem e o botão de repetir", () => {
    const onRetry = jest.fn();
    render(<ChartError message="Falha" onRetry={onRetry} />);
    expect(screen.getByText("Falha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /repetir/i })).toBeInTheDocument();
  });
});

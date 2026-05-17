/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DirectionFilter } from "./direction-filter";

describe("DirectionFilter", () => {
  it("renderiza o rótulo e o trigger do select", () => {
    render(<DirectionFilter value="" onChange={() => {}} />);
    expect(screen.getByText("Sentido")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("exibe o valor selecionado", () => {
    render(<DirectionFilter value="entrada" onChange={() => {}} />);
    expect(screen.getByText("Entradas")).toBeInTheDocument();
  });
  it("abre o popup ao clicar no trigger", () => {
    render(<DirectionFilter value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });
});

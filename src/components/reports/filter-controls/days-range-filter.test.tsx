/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DaysRangeFilter } from "./days-range-filter";

describe("DaysRangeFilter", () => {
  it("renderiza o rótulo e o trigger do select", () => {
    render(<DaysRangeFilter value="30" onChange={() => {}} />);
    expect(screen.getByText("Faixa de dias parado")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("exibe a faixa selecionada", () => {
    render(<DaysRangeFilter value="60" onChange={() => {}} />);
    expect(screen.getByText("+60 dias")).toBeInTheDocument();
  });
  it("abre o popup com as faixas ao clicar", () => {
    render(<DaysRangeFilter value="30" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "+90 dias" })).toBeInTheDocument();
  });
});

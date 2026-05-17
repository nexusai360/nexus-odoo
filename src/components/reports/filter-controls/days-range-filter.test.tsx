/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DaysRangeFilter } from "./days-range-filter";

describe("DaysRangeFilter", () => {
  it("renderiza as faixas 30/60/90+", () => {
    render(<DaysRangeFilter value="30" onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "+30 dias" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "+60 dias" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "+90 dias" })).toBeInTheDocument();
  });
  it("dispara onChange ao selecionar", () => {
    const onChange = jest.fn();
    render(<DaysRangeFilter value="30" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "90" } });
    expect(onChange).toHaveBeenCalledWith("90");
  });
});

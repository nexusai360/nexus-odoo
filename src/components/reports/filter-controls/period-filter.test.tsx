/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { PeriodFilter } from "./period-filter";

describe("PeriodFilter", () => {
  it("renderiza dois campos de mês", () => {
    render(<PeriodFilter de="2026-01" ate="2026-03" onChange={() => {}} />);
    const inputs = screen.getAllByDisplayValue(/2026-0/);
    expect(inputs).toHaveLength(2);
  });
  it("dispara onChange ao mudar o mês inicial", () => {
    const onChange = jest.fn();
    render(<PeriodFilter de="2026-01" ate="2026-03" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-02" } });
    expect(onChange).toHaveBeenCalledWith({ de: "2026-02", ate: "2026-03" });
  });
});

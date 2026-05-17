/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { DirectionFilter } from "./direction-filter";

describe("DirectionFilter", () => {
  it("renderiza as opções Todos/Entradas/Saídas", () => {
    render(<DirectionFilter value="" onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "Todos os sentidos" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Entradas" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Saídas" })).toBeInTheDocument();
  });
  it("dispara onChange ao selecionar", () => {
    const onChange = jest.fn();
    render(<DirectionFilter value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "entrada" } });
    expect(onChange).toHaveBeenCalledWith("entrada");
  });
});

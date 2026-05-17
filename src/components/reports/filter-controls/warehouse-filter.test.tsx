/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { WarehouseFilter } from "./warehouse-filter";

const opcoes = [{ id: 3, nome: "Galpão A" }, { id: 4, nome: "Galpão B" }];

describe("WarehouseFilter", () => {
  it("renderiza as opções incluindo 'Todos'", () => {
    render(<WarehouseFilter value="" onChange={() => {}} options={opcoes} />);
    expect(screen.getByRole("option", { name: "Todos os armazéns" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Galpão A" })).toBeInTheDocument();
  });
  it("dispara onChange ao selecionar", () => {
    const onChange = jest.fn();
    render(<WarehouseFilter value="" onChange={onChange} options={opcoes} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith("4");
  });
});

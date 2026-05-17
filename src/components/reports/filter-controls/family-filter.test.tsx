/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { FamilyFilter } from "./family-filter";

const opcoes = [{ id: 2, nome: "Esteiras" }, { id: 5, nome: "Anilhas" }];

describe("FamilyFilter", () => {
  it("renderiza a opção 'Todas as famílias'", () => {
    render(<FamilyFilter value="" onChange={() => {}} options={opcoes} />);
    expect(screen.getByRole("option", { name: "Todas as famílias" })).toBeInTheDocument();
  });
  it("dispara onChange ao selecionar", () => {
    const onChange = jest.fn();
    render(<FamilyFilter value="" onChange={onChange} options={opcoes} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith("2");
  });
});

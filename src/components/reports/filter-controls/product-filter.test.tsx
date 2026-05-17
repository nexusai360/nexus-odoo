/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductFilter } from "./product-filter";

const opcoes = [
  { id: 1, nome: "Esteira X" },
  { id: 2, nome: "Anilha Y" },
];

describe("ProductFilter", () => {
  it("renderiza o campo de busca", () => {
    render(<ProductFilter value="" onChange={() => {}} options={opcoes} />);
    expect(screen.getByPlaceholderText(/produto/i)).toBeInTheDocument();
  });
  it("dispara onChange com o id ao escolher uma opção filtrada", () => {
    const onChange = jest.fn();
    render(<ProductFilter value="" onChange={onChange} options={opcoes} />);
    fireEvent.change(screen.getByPlaceholderText(/produto/i), {
      target: { value: "esteira" },
    });
    fireEvent.click(screen.getByText("Esteira X"));
    expect(onChange).toHaveBeenCalledWith("1");
  });
});

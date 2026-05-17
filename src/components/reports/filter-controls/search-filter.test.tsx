/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchFilter } from "./search-filter";

describe("SearchFilter", () => {
  it("renderiza o campo de texto", () => {
    render(<SearchFilter value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/pesquisar/i)).toBeInTheDocument();
  });
  it("dispara onChange ao digitar", () => {
    const onChange = jest.fn();
    render(<SearchFilter value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/pesquisar/i), {
      target: { value: "esteira" },
    });
    expect(onChange).toHaveBeenCalledWith("esteira");
  });
});

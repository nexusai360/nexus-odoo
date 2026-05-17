/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SearchFilter } from "./search-filter";

describe("SearchFilter", () => {
  it("renderiza o campo de texto", () => {
    render(<SearchFilter value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/pesquisar/i)).toBeInTheDocument();
  });
  it("dispara onChange após o debounce ao digitar", () => {
    jest.useFakeTimers();
    const onChange = jest.fn();
    render(<SearchFilter value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/pesquisar/i), {
      target: { value: "esteira" },
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledWith("esteira");
    jest.useRealTimers();
  });
});

/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Sparkline } from "./sparkline";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("Sparkline", () => {
  it("renderiza um mini-grafico acessivel quando ha serie", () => {
    render(<Sparkline data={[1, 3, 2, 5]} ariaLabel="Tendencia de custo" />);
    expect(screen.getByLabelText("Tendencia de custo")).toBeInTheDocument();
  });

  it("serie vazia ou achatada vira placeholder (sem role img), preservando altura", () => {
    const { container } = render(<Sparkline data={[0, 0, 0]} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // placeholder aria-hidden ocupa o espaco (sem layout shift)
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

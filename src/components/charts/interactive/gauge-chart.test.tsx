/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { InteractiveGaugeChart, valorMedidor } from "./gauge-chart";

describe("valorMedidor", () => {
  it("clampa o valor entre 0 e max e calcula o percentual", () => {
    expect(valorMedidor(9, 100)).toEqual({ safeValue: 9, pct: 9 });
    expect(valorMedidor(150, 100)).toEqual({ safeValue: 100, pct: 100 });
    expect(valorMedidor(-5, 100)).toEqual({ safeValue: 0, pct: 0 });
  });

  it("max invalido cai para 100", () => {
    expect(valorMedidor(40, 0).pct).toBe(40);
  });
});

describe("InteractiveGaugeChart", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it("mostra o valor central formatado e o rotulo", () => {
    render(<InteractiveGaugeChart value={9} label="Produtos negativos" />);
    expect(screen.getByText("9%")).toBeInTheDocument();
    expect(screen.getByText("Produtos negativos")).toBeInTheDocument();
  });

  it("expoe aria-label acessivel", () => {
    render(<InteractiveGaugeChart value={9} label="Saude" />);
    expect(screen.getByLabelText(/Saude/i)).toBeInTheDocument();
  });
});

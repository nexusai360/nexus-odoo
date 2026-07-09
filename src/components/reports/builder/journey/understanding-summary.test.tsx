/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { UnderstandingSummary } from "./understanding-summary";

describe("UnderstandingSummary", () => {
  it("renderiza o texto natural do entendimento", () => {
    render(<UnderstandingSummary texto="voce quer o estoque parado por marca com valor imobilizado" />);
    expect(screen.getByText(/estoque parado por marca/i)).toBeInTheDocument();
  });

  it("sem texto, nao renderiza nada (e sem rotulos tecnicos de dimensao)", () => {
    const { container } = render(<UnderstandingSummary texto="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nao expoe rotulos tecnicos das dimensoes (Objetivo/recorte/temporalidade)", () => {
    const { container } = render(<UnderstandingSummary texto="um resumo qualquer" />);
    const txt = container.textContent ?? "";
    expect(txt).not.toMatch(/recorte|temporalidade/i);
    expect(txt).not.toMatch(/\bObjetivo\b/);
  });
});

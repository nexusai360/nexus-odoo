/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Heatmap, intensidadeHeatmap } from "./heatmap";

describe("intensidadeHeatmap", () => {
  it("normaliza pelo maximo (0 quando vazio, piso 0.08 quando ha valor)", () => {
    expect(intensidadeHeatmap(0, 100)).toBe(0);
    expect(intensidadeHeatmap(100, 100)).toBe(1);
    expect(intensidadeHeatmap(1, 100)).toBe(0.08); // piso de visibilidade
    expect(intensidadeHeatmap(5, 0)).toBe(0); // max 0 -> sem intensidade
  });
});

describe("Heatmap", () => {
  it("renderiza os 7 dias da semana e a grade", () => {
    render(
      <Heatmap
        data={[
          { dow: 1, hour: 9, total: 10 },
          { dow: 3, hour: 14, total: 5 },
        ]}
        valueLabel="pedido(s)"
      />,
    );
    expect(screen.getByText("seg")).toBeInTheDocument();
    expect(screen.getByText("sáb")).toBeInTheDocument();
    // a celula com dado expoe o total no title (tooltip)
    expect(screen.getByTitle(/seg 09h: 10 pedido\(s\)/i)).toBeInTheDocument();
  });
});

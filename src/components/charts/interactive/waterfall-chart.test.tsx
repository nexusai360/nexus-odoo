/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { InteractiveWaterfallChart, buildWaterfallBars } from "./waterfall-chart";

describe("buildWaterfallBars", () => {
  const passos = [
    { rotulo: "Receitas", valor: 1000, tipo: "positivo" as const },
    { rotulo: "Aluguel", valor: 300, tipo: "negativo" as const },
    { rotulo: "Salarios", valor: 200, tipo: "negativo" as const },
    { rotulo: "Resultado", valor: 500, tipo: "total" as const },
  ];

  it("acumula a partir do zero: positivo sobe, negativo desce", () => {
    const bars = buildWaterfallBars(passos);
    expect(bars[0]).toMatchObject({ rotulo: "Receitas", base: 0, delta: 1000, cumulativo: 1000 });
    expect(bars[1]).toMatchObject({ rotulo: "Aluguel", base: 700, delta: 300, cumulativo: 700 });
    expect(bars[2]).toMatchObject({ rotulo: "Salarios", base: 500, delta: 200, cumulativo: 500 });
  });

  it("o passo total reancora no zero (barra absoluta do resultado)", () => {
    const bars = buildWaterfallBars(passos);
    expect(bars[3]).toMatchObject({ rotulo: "Resultado", base: 0, delta: 500, cumulativo: 500, tipo: "total" });
  });

  it("resultado negativo: base negativa, delta positiva", () => {
    const bars = buildWaterfallBars([
      { rotulo: "Receitas", valor: 100, tipo: "positivo" },
      { rotulo: "Custos", valor: 300, tipo: "negativo" },
      { rotulo: "Resultado", valor: -200, tipo: "total" },
    ]);
    expect(bars[2]).toMatchObject({ base: -200, delta: 200, cumulativo: -200 });
  });

  it("entrada vazia retorna lista vazia", () => {
    expect(buildWaterfallBars([])).toEqual([]);
  });
});

describe("InteractiveWaterfallChart", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it("renderiza um grafico de cascata acessivel", () => {
    render(
      <InteractiveWaterfallChart
        passos={[
          { rotulo: "Receitas", valor: 1000, tipo: "positivo" },
          { rotulo: "Resultado", valor: 1000, tipo: "total" },
        ]}
        formatValue={(v) => `R$ ${v}`}
      />,
    );
    expect(screen.getByLabelText(/cascata/i)).toBeInTheDocument();
  });

  it("mostra estado vazio quando nao ha passos", () => {
    render(<InteractiveWaterfallChart passos={[]} emptyMessage="Sem DRE." />);
    expect(screen.getByText("Sem DRE.")).toBeInTheDocument();
  });
});

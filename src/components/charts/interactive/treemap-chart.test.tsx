/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { InteractiveTreemapChart, prepararTreemap } from "./treemap-chart";

describe("prepararTreemap", () => {
  it("ordena por valor desc e descarta nao-positivos", () => {
    const out = prepararTreemap([
      { name: "A", value: 10 },
      { name: "Z", value: 0 },
      { name: "B", value: 50 },
      { name: "N", value: -3 },
    ]);
    expect(out.map((d) => d.name)).toEqual(["B", "A"]);
    expect(out.every((d) => d.value > 0)).toBe(true);
  });

  it("entrada vazia (ou so zeros) retorna lista vazia", () => {
    expect(prepararTreemap([])).toEqual([]);
    expect(prepararTreemap([{ name: "A", value: 0 }])).toEqual([]);
  });
});

describe("InteractiveTreemapChart", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it("renderiza um treemap acessivel", () => {
    render(
      <InteractiveTreemapChart
        data={[
          { name: "Cliente A", value: 1000 },
          { name: "Cliente B", value: 400 },
        ]}
        formatValue={(v) => `R$ ${v}`}
      />,
    );
    expect(screen.getByLabelText(/treemap|mapa de arvore/i)).toBeInTheDocument();
  });

  it("mostra estado vazio quando nao ha dados", () => {
    render(<InteractiveTreemapChart data={[]} emptyMessage="Sem categorias." />);
    expect(screen.getByText("Sem categorias.")).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { InteractiveComboChart, splitComboSeries } from "./combo-chart";

describe("splitComboSeries", () => {
  it("a primeira serie vira barra; o resto, linhas", () => {
    const { bars, lines } = splitComboSeries([
      { key: "realizado", label: "Realizado" },
      { key: "previsto", label: "Previsto" },
      { key: "meta", label: "Meta" },
    ]);
    expect(bars.map((s) => s.key)).toEqual(["realizado"]);
    expect(lines.map((s) => s.key)).toEqual(["previsto", "meta"]);
  });

  it("uma unica serie vira barra, sem linhas", () => {
    const { bars, lines } = splitComboSeries([{ key: "realizado", label: "Realizado" }]);
    expect(bars.map((s) => s.key)).toEqual(["realizado"]);
    expect(lines).toEqual([]);
  });

  it("sem series, ambos vazios", () => {
    expect(splitComboSeries([])).toEqual({ bars: [], lines: [] });
  });
});

describe("InteractiveComboChart", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it("renderiza um grafico combinado acessivel", () => {
    render(
      <InteractiveComboChart
        data={[
          { name: "jan", realizado: 100, previsto: 120 },
          { name: "fev", realizado: 130, previsto: 140 },
        ]}
        series={[
          { key: "realizado", label: "Realizado" },
          { key: "previsto", label: "Previsto" },
        ]}
        formatValue={(v) => `R$ ${v}`}
      />,
    );
    expect(screen.getByLabelText(/combinado/i)).toBeInTheDocument();
  });

  it("mostra estado vazio quando nao ha dados", () => {
    render(
      <InteractiveComboChart data={[]} series={[{ key: "realizado", label: "Realizado" }]} emptyMessage="Sem serie." />,
    );
    expect(screen.getByText("Sem serie.")).toBeInTheDocument();
  });
});

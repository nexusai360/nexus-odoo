/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { InteractiveFunnelChart, buildFunnelSegments } from "./funnel-chart";

describe("buildFunnelSegments", () => {
  it("ordena por valor decrescente e da 100% de largura ao topo", () => {
    const segs = buildFunnelSegments([
      { name: "Pedido", value: 200 },
      { name: "Lead", value: 1000 },
      { name: "Orcamento", value: 500 },
    ]);
    expect(segs.map((s) => s.name)).toEqual(["Lead", "Orcamento", "Pedido"]);
    expect(segs[0].widthPct).toBe(100);
    // largura relativa ao topo (maior estagio)
    expect(segs[1].widthPct).toBe(50);
    expect(segs[2].widthPct).toBe(20);
  });

  it("sharePct e a fatia do total", () => {
    const segs = buildFunnelSegments([
      { name: "A", value: 750 },
      { name: "B", value: 250 },
    ]);
    expect(segs[0].sharePct).toBe(75);
    expect(segs[1].sharePct).toBe(25);
  });

  it("entrada vazia retorna lista vazia", () => {
    expect(buildFunnelSegments([])).toEqual([]);
  });

  it("tudo zero nao gera NaN (largura 0)", () => {
    const segs = buildFunnelSegments([
      { name: "A", value: 0 },
      { name: "B", value: 0 },
    ]);
    expect(segs.every((s) => s.widthPct === 0 && s.sharePct === 0)).toBe(true);
  });
});

describe("InteractiveFunnelChart", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it("renderiza um estagio por categoria com rotulo", () => {
    render(
      <InteractiveFunnelChart
        data={[
          { name: "Lead", value: 1000 },
          { name: "Pedido", value: 200 },
        ]}
        formatValue={(v) => `R$ ${v}`}
      />,
    );
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Pedido")).toBeInTheDocument();
    expect(screen.getByText("R$ 1000")).toBeInTheDocument();
  });

  it("mostra estado vazio quando nao ha dados", () => {
    render(<InteractiveFunnelChart data={[]} emptyMessage="Sem etapas." />);
    expect(screen.getByText("Sem etapas.")).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PieChartCard, agruparOutros } from "./pie-chart";

describe("agruparOutros", () => {
  it("mantém 5 fatias intactas", () => {
    const data = [1, 2, 3, 4, 5].map((n) => ({ rotulo: `F${n}`, valor: n }));
    expect(agruparOutros(data, "rotulo", "valor")).toHaveLength(5);
  });
  it("reduz 7 fatias a 6 (top-5 + Outros)", () => {
    const data = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ rotulo: `F${n}`, valor: n }));
    const r = agruparOutros(data, "rotulo", "valor");
    expect(r).toHaveLength(6);
    const outros = r.find((f) => f.rotulo === "Outros");
    expect(outros?.valor).toBe(1 + 2); // as 2 menores: 1, 2 (top-5 = {7,6,5,4,3})
  });
});

describe("PieChartCard render", () => {
  it("renderiza o container do gráfico", () => {
    const { container } = render(
      <PieChartCard
        data={[{ rotulo: "Esteiras", valor: 100 }]}
        config={{ nameKey: "rotulo", valueKey: "valor", formato: "moeda" }}
      />,
    );
    expect(container.querySelector("[data-slot=pie-chart]")).toBeInTheDocument();
  });
  it("renderiza o estado de erro com botão de repetir", () => {
    render(
      <PieChartCard data={[]} config={{ nameKey: "n", valueKey: "v", formato: "moeda" }}
        estado="erro" />,
    );
    expect(screen.getByRole("button", { name: /repetir/i })).toBeInTheDocument();
  });
});

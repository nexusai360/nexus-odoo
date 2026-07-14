/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

// O bug que este teste trava: quando uma categoria responde por 100% do total, a fatia vai de
// 0 a 2π. O ponto inicial e o final do arco COINCIDEM, e o SVG entende isso como "não desenhe
// nada": o gráfico some da tela. Foi assim que a tela de pagamentos apareceu vazia (uma única
// forma de pagamento com 100%).
//
// Um donut de uma fatia só não é caso de borda exótico: acontece em todo recorte que filtra
// até sobrar uma categoria, e é justamente quando o gráfico precisaria mostrar algo.
import { render } from "@testing-library/react";

import { DonutChart } from "./donut-chart";

/** Extrai os `d` dos paths de fatia (o SVG do donut é desenhado com <path d="M ... A ...">). */
function pathsDeFatia(container: HTMLElement): string[] {
  return [...container.querySelectorAll("path")]
    .map((p) => p.getAttribute("d") ?? "")
    .filter((d) => d.includes("A")); // arcos, não a máscara/furo do donut
}

describe("DonutChart , a fatia de 100% precisa aparecer", () => {
  it("uma unica categoria (100%) desenha um arco visivel", () => {
    const { container } = render(
      <DonutChart data={[{ label: "Boleto", valor: 1_000_000 }]} />,
    );
    const paths = pathsDeFatia(container);
    expect(paths.length).toBeGreaterThan(0);

    // O arco tem que ter comprimento: se o ponto inicial e o final coincidem, o navegador
    // nao pinta nada. Um circulo completo precisa de DOIS arcos (o SVG nao fecha 360 graus
    // num arco so).
    const d = paths.join(" ");
    const arcos = (d.match(/A /g) ?? []).length;
    expect(arcos).toBeGreaterThanOrEqual(2);
  });

  it("duas categorias continuam desenhando uma fatia cada", () => {
    const { container } = render(
      <DonutChart
        data={[
          { label: "Boleto", valor: 700 },
          { label: "Pix", valor: 300 },
        ]}
      />,
    );
    expect(pathsDeFatia(container).length).toBe(2);
  });

  it("lista vazia nao quebra", () => {
    const { container } = render(<DonutChart data={[]} />);
    expect(container).toBeTruthy();
  });
});

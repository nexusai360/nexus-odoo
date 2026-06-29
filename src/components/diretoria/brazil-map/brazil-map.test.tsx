/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";

import { BrazilMap, corPorIntensidade } from "./brazil-map";

// framer-motion: render motion.path como path simples no jsdom
jest.mock("framer-motion", () => ({
  motion: { path: "path" },
  useReducedMotion: () => true,
}));

// @svg-maps/brazil é ESM (node_modules não é transformado pelo jest); mockamos
// com as 27 UFs reais para testar o componente. No app, o import real funciona
// via bundler do Next.
jest.mock("@svg-maps/brazil", () => {
  const ufs: [string, string][] = [
    ["ac", "Acre"], ["al", "Alagoas"], ["ap", "Amapá"], ["am", "Amazonas"],
    ["ba", "Bahia"], ["ce", "Ceará"], ["df", "Distrito Federal"], ["es", "Espírito Santo"],
    ["go", "Goiás"], ["ma", "Maranhão"], ["mt", "Mato Grosso"], ["ms", "Mato Grosso do Sul"],
    ["mg", "Minas Gerais"], ["pa", "Pará"], ["pb", "Paraíba"], ["pr", "Paraná"],
    ["pe", "Pernambuco"], ["pi", "Piauí"], ["rj", "Rio de Janeiro"], ["rn", "Rio Grande do Norte"],
    ["rs", "Rio Grande do Sul"], ["ro", "Rondônia"], ["rr", "Roraima"], ["sc", "Santa Catarina"],
    ["sp", "São Paulo"], ["se", "Sergipe"], ["to", "Tocantins"],
  ];
  return {
    __esModule: true,
    default: {
      viewBox: "0 0 613 639",
      locations: ufs.map(([id, name]) => ({ id, name, path: "M0 0 L1 1 Z" })),
    },
  };
});

describe("corPorIntensidade", () => {
  it("rampa de UM tom (roxo hsl 263), saturação variando por intensidade", () => {
    expect(corPorIntensidade(0)).toContain("hsl(263");
    expect(corPorIntensidade(1)).toContain("hsl(263");
    expect(corPorIntensidade(0)).not.toBe(corPorIntensidade(1));
    expect(corPorIntensidade(0.5)).not.toBe(corPorIntensidade(0));
  });
  it("faz clamp fora de [0,1]", () => {
    expect(corPorIntensidade(-5)).toBe(corPorIntensidade(0));
    expect(corPorIntensidade(5)).toBe(corPorIntensidade(1));
  });
});

describe("BrazilMap", () => {
  const data = [
    { uf: "SP", valor: 1000 },
    { uf: "MG", valor: 500 },
  ];

  it("renderiza os 27 estados como botões", () => {
    render(<BrazilMap data={data} metric="Faturamento" />);
    const paths = screen.getAllByRole("button");
    // 27 paths do mapa + 2 itens de ranking (SP, MG)
    expect(paths.length).toBeGreaterThanOrEqual(27);
  });

  it("estado com dado tem aria-label com o valor formatado", () => {
    render(<BrazilMap data={data} metric="Faturamento" />);
    expect(
      screen.getByLabelText(/São Paulo, Faturamento R\$/),
    ).toBeInTheDocument();
  });

  it("clicar num estado chama onSelect com a UF", () => {
    const onSelect = jest.fn();
    render(<BrazilMap data={data} metric="Faturamento" onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText(/São Paulo, Faturamento/));
    expect(onSelect).toHaveBeenCalledWith(["SP"]);
  });

  it("seleção respeita o máximo (2): a 3ª empurra a 1ª", () => {
    const onSelect = jest.fn();
    render(
      <BrazilMap
        data={[
          { uf: "SP", valor: 3 },
          { uf: "MG", valor: 2 },
          { uf: "RJ", valor: 1 },
        ]}
        onSelect={onSelect}
        maxSelection={2}
      />,
    );
    fireEvent.click(screen.getByLabelText(/São Paulo/));
    fireEvent.click(screen.getByLabelText(/Minas Gerais/));
    fireEvent.click(screen.getByLabelText(/Rio de Janeiro/));
    expect(onSelect).toHaveBeenLastCalledWith(["MG", "RJ"]);
  });

  it("estado vazio mostra aviso e não quebra", () => {
    render(<BrazilMap data={[]} />);
    expect(screen.getByText(/Sem dados no período/)).toBeInTheDocument();
  });
});

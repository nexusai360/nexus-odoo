/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptionCards } from "./option-cards";
import type { OpcaoCard } from "@/lib/reports/builder/journey/state";

const opcoes: OpcaoCard[] = [
  { id: "bar", rotulo: "Barras", descricao: "Comparar categorias", tipoVisual: "BarChart" },
  { id: "tab", rotulo: "Tabela", descricao: "Detalhe linha a linha", tipoVisual: "DataTable" },
];

describe("OptionCards", () => {
  it("renderiza um card por opcao com rotulo e descricao", () => {
    render(<OptionCards titulo="Como visualizar?" opcoes={opcoes} onSelecionar={() => {}} />);
    expect(screen.getByText("Como visualizar?")).toBeInTheDocument();
    expect(screen.getByText("Barras")).toBeInTheDocument();
    expect(screen.getByText("Tabela")).toBeInTheDocument();
  });

  it("clicar dispara onSelecionar com id e rotulo", () => {
    const onSelecionar = jest.fn();
    render(<OptionCards titulo="t" opcoes={opcoes} onSelecionar={onSelecionar} />);
    fireEvent.click(screen.getByText("Barras"));
    expect(onSelecionar).toHaveBeenCalledWith("bar", "Barras");
  });

  it("lista vazia nao renderiza nada", () => {
    const { container } = render(<OptionCards titulo="t" opcoes={[]} onSelecionar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

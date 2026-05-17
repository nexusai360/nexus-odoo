/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { KPICard } from "./kpi-card";

describe("KPICard", () => {
  it("renderiza valor e rótulo formatados", () => {
    render(<KPICard valor={1234} rotulo="Produtos parados" formato="inteiro" />);
    expect(screen.getByText("Produtos parados")).toBeInTheDocument();
    expect(screen.getByText("1.234")).toBeInTheDocument();
  });
  it("renderiza o estado de preparo", () => {
    render(<KPICard valor={0} rotulo="X" formato="inteiro" estado="preparando" />);
    expect(screen.getByText(/ainda sendo preparado/i)).toBeInTheDocument();
  });
  it("formata moeda em pt-BR", () => {
    render(<KPICard valor={2500.5} rotulo="Valor" formato="moeda" />);
    expect(screen.getByText(/R\$\s?2\.500,50/)).toBeInTheDocument();
  });
});

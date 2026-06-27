/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { JourneySummary } from "./journey-summary";
import type { ResumoJornada } from "@/lib/reports/builder/journey/state";

const resumo: ResumoJornada = {
  itens: [
    { dimensao: "objetivo", texto: "ver o estoque parado por marca" },
    { dimensao: "visualizacao", texto: "DataTable sobre fato_estoque_parados" },
  ],
};

describe("JourneySummary", () => {
  it("lista os itens do resumo", () => {
    render(<JourneySummary resumo={resumo} onAjustar={() => {}} onGerar={() => {}} />);
    expect(screen.getByText(/ver o estoque parado por marca/i)).toBeInTheDocument();
    expect(screen.getByText(/DataTable sobre fato_estoque_parados/i)).toBeInTheDocument();
  });

  it("'ajustar' por item dispara onAjustar com a dimensao", () => {
    const onAjustar = jest.fn();
    render(<JourneySummary resumo={resumo} onAjustar={onAjustar} onGerar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /ajustar objetivo/i }));
    expect(onAjustar).toHaveBeenCalledWith("objetivo");
  });

  it("botao Gerar dispara onGerar", () => {
    const onGerar = jest.fn();
    render(<JourneySummary resumo={resumo} onAjustar={() => {}} onGerar={onGerar} />);
    fireEvent.click(screen.getByRole("button", { name: /gerar relatorio/i }));
    expect(onGerar).toHaveBeenCalled();
  });

  it("enquanto gerando, o botao fica desabilitado e muda o texto", () => {
    render(<JourneySummary resumo={resumo} onAjustar={() => {}} onGerar={() => {}} gerando />);
    const btn = screen.getByRole("button", { name: /montando seu relatorio/i });
    expect(btn).toBeDisabled();
  });
});

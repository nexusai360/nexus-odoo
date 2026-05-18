/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportTour } from "./report-tour";
import type { TourStep } from "./report-tour";

const steps: TourStep[] = [
  { target: null, title: "Passo 1", description: "Desc 1" },
  { target: null, title: "Passo 2", description: "Desc 2" },
  { target: null, title: "Passo 3", description: "Desc 3" },
];

describe("ReportTour", () => {
  it("não renderiza quando inactive", () => {
    render(<ReportTour steps={steps} active={false} onClose={jest.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renderiza o primeiro passo quando active=true", () => {
    render(<ReportTour steps={steps} active={true} onClose={jest.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Passo 1")).toBeInTheDocument();
    expect(screen.getByText("Desc 1")).toBeInTheDocument();
  });

  it("exibe contador '1 / 3' no primeiro passo", () => {
    render(<ReportTour steps={steps} active={true} onClose={jest.fn()} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("avança para o próximo passo ao clicar em Próximo", () => {
    render(<ReportTour steps={steps} active={true} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /próximo passo/i }));
    expect(screen.getByText("Passo 2")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("volta ao passo anterior ao clicar em Anterior", () => {
    render(<ReportTour steps={steps} active={true} onClose={jest.fn()} />);
    // Avança para o passo 2
    fireEvent.click(screen.getByRole("button", { name: /próximo passo/i }));
    expect(screen.getByText("Passo 2")).toBeInTheDocument();
    // Volta
    fireEvent.click(screen.getByRole("button", { name: /passo anterior/i }));
    expect(screen.getByText("Passo 1")).toBeInTheDocument();
  });

  it("não exibe botão Anterior no primeiro passo", () => {
    render(<ReportTour steps={steps} active={true} onClose={jest.fn()} />);
    expect(screen.queryByRole("button", { name: /passo anterior/i })).toBeNull();
  });

  it("exibe botão 'Concluir' no último passo", () => {
    render(<ReportTour steps={steps} active={true} onClose={jest.fn()} />);
    // Avança até o último passo
    fireEvent.click(screen.getByRole("button", { name: /próximo passo/i }));
    fireEvent.click(screen.getByRole("button", { name: /próximo passo/i }));
    expect(screen.getByRole("button", { name: /concluir tour/i })).toBeInTheDocument();
  });

  it("chama onClose(true) ao concluir o tour", () => {
    const onClose = jest.fn();
    render(<ReportTour steps={steps} active={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /próximo passo/i }));
    fireEvent.click(screen.getByRole("button", { name: /próximo passo/i }));
    fireEvent.click(screen.getByRole("button", { name: /concluir tour/i }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("chama onClose(false) ao clicar em Pular", () => {
    const onClose = jest.fn();
    render(<ReportTour steps={steps} active={true} onClose={onClose} />);
    // Clica no primeiro botão "Pular" (o do footer)
    const pulares = screen.getAllByRole("button", { name: /pular/i });
    fireEvent.click(pulares[0]);
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("chama onClose(false) ao clicar no X de fechar", () => {
    const onClose = jest.fn();
    render(<ReportTour steps={steps} active={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /pular tour/i }));
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("barra de progresso avança a cada passo", () => {
    render(<ReportTour steps={steps} active={true} onClose={jest.fn()} />);
    const progressBar = screen.getByLabelText(/progresso/i);
    // Passo 1: 1/3 ≈ 33%
    expect(progressBar).toHaveAttribute("aria-label", "Progresso: 1 de 3");

    fireEvent.click(screen.getByRole("button", { name: /próximo passo/i }));
    expect(screen.getByLabelText("Progresso: 2 de 3")).toBeInTheDocument();
  });

  it("reinicia para o passo 0 quando active muda de false para true", () => {
    const { rerender } = render(
      <ReportTour steps={steps} active={true} onClose={jest.fn()} />,
    );
    // Avança
    fireEvent.click(screen.getByRole("button", { name: /próximo passo/i }));
    expect(screen.getByText("Passo 2")).toBeInTheDocument();

    // Fecha e reabre
    rerender(<ReportTour steps={steps} active={false} onClose={jest.fn()} />);
    rerender(<ReportTour steps={steps} active={true} onClose={jest.fn()} />);
    expect(screen.getByText("Passo 1")).toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { GeracaoOverlay } from "./geracao-overlay";

describe("GeracaoOverlay", () => {
  afterEach(() => jest.useRealTimers());

  it("mostra a barra com a largura do pct e uma frase da fase", () => {
    render(<GeracaoOverlay pct={40} fase="blueprint" />);
    // a primeira frase de blueprint
    expect(screen.getByText(/Entendendo o que vale/i)).toBeInTheDocument();
  });

  it("troca a frase a cada 2.5s (timer local)", () => {
    jest.useFakeTimers();
    render(<GeracaoOverlay pct={20} fase="blueprint" />);
    expect(screen.getByText(/Entendendo o que vale/i)).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByText(/Escolhendo os gráficos/i)).toBeInTheDocument();
  });

  it("mostra a honestidade (omitidos) quando concluido em 100%", () => {
    render(<GeracaoOverlay pct={100} fase="validacao" omitidos={["LineChart sobre vendas"]} />);
    expect(screen.getByText(/ainda nao tem fonte/i)).toBeInTheDocument();
  });

  it("nao mostra omitidos antes de concluir", () => {
    render(<GeracaoOverlay pct={50} fase="blueprint" omitidos={["x"]} />);
    expect(screen.queryByText(/ainda nao tem fonte/i)).not.toBeInTheDocument();
  });
});

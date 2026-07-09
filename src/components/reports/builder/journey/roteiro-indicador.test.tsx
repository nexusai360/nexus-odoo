/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { RoteiroIndicador } from "./roteiro-indicador";

describe("RoteiroIndicador", () => {
  it("mostra 'Pergunta X de N' com X = respondidas + 1", () => {
    render(<RoteiroIndicador total={7} respondidas={2} />);
    expect(screen.getByText("Pergunta 3 de 7")).toBeInTheDocument();
  });

  it("renderiza um segmento por etapa do total", () => {
    const { container } = render(<RoteiroIndicador total={5} respondidas={2} />);
    const dots = container.querySelectorAll("span.rounded-full");
    expect(dots.length).toBe(5);
  });

  it("quando cumprido, mostra mensagem de pronto", () => {
    render(<RoteiroIndicador total={4} respondidas={4} />);
    expect(screen.getByText(/tudo certo/i)).toBeInTheDocument();
  });

  it("nao renderiza com total invalido", () => {
    const { container } = render(<RoteiroIndicador total={0} respondidas={0} />);
    expect(container.firstChild).toBeNull();
  });
});

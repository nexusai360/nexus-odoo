/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { BuilderChat } from "./builder-chat";

const MENSAGENS = [
  { id: "1", role: "user" as const, content: "estoque por armazem" },
  { id: "2", role: "assistant" as const, content: "Montei uma tabela de saldo." },
];

describe("BuilderChat", () => {
  it("renderiza mensagens do usuario e do assistente", () => {
    render(<BuilderChat mensagens={MENSAGENS} pensando={false} onEnviar={() => {}} />);
    expect(screen.getByText("estoque por armazem")).toBeInTheDocument();
    expect(screen.getByText("Montei uma tabela de saldo.")).toBeInTheDocument();
  });

  it("envia o texto digitado ao clicar em enviar e limpa o campo", () => {
    const onEnviar = jest.fn();
    render(<BuilderChat mensagens={[]} pensando={false} onEnviar={onEnviar} />);
    const campo = screen.getByPlaceholderText(/construa com o agente nex/i) as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "saldo por familia" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    expect(onEnviar).toHaveBeenCalledWith("saldo por familia");
    expect(campo.value).toBe("");
  });

  it("nao envia quando o campo esta vazio", () => {
    const onEnviar = jest.fn();
    render(<BuilderChat mensagens={[]} pensando={false} onEnviar={onEnviar} />);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it("mostra a animacao de pensando e bloqueia o envio", () => {
    const onEnviar = jest.fn();
    render(<BuilderChat mensagens={MENSAGENS} pensando={true} onEnviar={onEnviar} />);
    expect(screen.getByTestId("builder-pensando")).toBeInTheDocument();
    const campo = screen.getByPlaceholderText(/construa com o agente nex/i);
    fireEvent.change(campo, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it("mostra o microfone quando o audio esta habilitado", () => {
    render(<BuilderChat mensagens={[]} pensando={false} onEnviar={() => {}} audioEnabled />);
    expect(screen.getByRole("button", { name: /gravar audio/i })).toBeInTheDocument();
  });

  it("oculta o microfone quando o audio esta desabilitado", () => {
    render(<BuilderChat mensagens={[]} pensando={false} onEnviar={() => {}} />);
    expect(screen.queryByRole("button", { name: /gravar audio/i })).not.toBeInTheDocument();
  });
});

/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { RelatoriosMeus } from "./relatorios-meus";

const ITENS = [
  { id: "sr1", titulo: "Saldo por armazem", atualizadoEm: "2026-06-26T03:00:00Z" },
  { id: "sr2", titulo: "Valor por familia", atualizadoEm: "2026-06-25T03:00:00Z" },
];

describe("RelatoriosMeus", () => {
  it("lista os relatorios do usuario com link para a rota dinamica", () => {
    render(<RelatoriosMeus itens={ITENS} podeConstruir={true} />);
    const link = screen.getByRole("link", { name: /saldo por armazem/i });
    expect(link).toHaveAttribute("href", "/relatorios/d/sr1");
    expect(screen.getByText("Valor por familia")).toBeInTheDocument();
  });

  it("mostra o botao Novo relatorio para quem pode construir", () => {
    render(<RelatoriosMeus itens={[]} podeConstruir={true} />);
    const novo = screen.getByRole("link", { name: /novo relatorio/i });
    expect(novo).toHaveAttribute("href", "/relatorios-2/construtor");
  });

  it("oculta o botao Novo relatorio para quem nao pode construir", () => {
    render(<RelatoriosMeus itens={ITENS} podeConstruir={false} />);
    expect(screen.queryByRole("link", { name: /novo relatorio/i })).not.toBeInTheDocument();
  });

  it("mostra estado vazio quando nao ha relatorios", () => {
    render(<RelatoriosMeus itens={[]} podeConstruir={true} />);
    expect(screen.getByText(/voce ainda nao criou relatorios/i)).toBeInTheDocument();
  });
});

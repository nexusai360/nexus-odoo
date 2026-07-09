/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { RelatoriosMeus } from "./relatorios-meus";

// O modal de detalhe puxa server actions; mock para o jsdom nao tocar prisma.
jest.mock("@/lib/actions/saved-report", () => ({
  obterDetalheRelatorio: jest.fn(async () => ({ ok: false, error: "x" })),
  renomearRelatorio: jest.fn(),
  definirVisibilidadeRelatorio: jest.fn(),
  listarUsuariosParaCompartilhar: jest.fn(async () => ({ ok: true, usuarios: [] })),
}));

const ITENS = [
  { id: "sr1", titulo: "Saldo por armazem", atualizadoEm: "2026-06-26T03:00:00Z", compartilhado: false },
  { id: "sr2", titulo: "Valor por familia", atualizadoEm: "2026-06-25T03:00:00Z", compartilhado: true },
];

describe("RelatoriosMeus", () => {
  it("lista os relatorios como cards clicaveis e mostra o status", () => {
    render(<RelatoriosMeus itens={ITENS} podeConstruir={true} />);
    expect(screen.getByRole("button", { name: /saldo por armazem/i })).toBeInTheDocument();
    expect(screen.getByText("Valor por familia")).toBeInTheDocument();
    // Badges de status.
    expect(screen.getByText("Privado")).toBeInTheDocument();
    expect(screen.getByText("Compartilhado")).toBeInTheDocument();
  });

  it("clicar no card abre o modal de detalhe", () => {
    render(<RelatoriosMeus itens={ITENS} podeConstruir={true} />);
    fireEvent.click(screen.getByRole("button", { name: /saldo por armazem/i }));
    expect(screen.getByRole("dialog", { name: /detalhes do relatorio/i })).toBeInTheDocument();
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

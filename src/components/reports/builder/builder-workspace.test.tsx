/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BuilderWorkspace } from "./builder-workspace";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

const construirRelatorio = jest.fn();
const previsualizarSecoes = jest.fn();
const push = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/lib/actions/builder", () => ({
  construirRelatorio: (...a: unknown[]) => construirRelatorio(...a),
  previsualizarSecoes: (...a: unknown[]) => previsualizarSecoes(...a),
}));

const FICHA: BuilderReportEntry = {
  id: "rascunho",
  titulo: "Saldo por armazem",
  dominio: "estoque",
  schemaVersion: 1,
  tipo: "tela_cheia",
  parametros: [],
  secoes: [
    {
      id: "secao-1",
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
      filtros: [],
    },
  ],
};

beforeEach(() => {
  construirRelatorio.mockReset();
  previsualizarSecoes.mockReset();
  push.mockReset();
  previsualizarSecoes.mockResolvedValue({ tipo: "ok", dados: { "secao-1": { estado: "ok", dado: [] } } });
});

describe("BuilderWorkspace", () => {
  it("envia o prompt e mostra as mensagens de usuario e assistente", async () => {
    construirRelatorio.mockResolvedValue({
      ok: true,
      ficha: FICHA,
      mensagem: "Montei a tabela de saldo.",
      savedId: "sr1",
      etag: "e1",
    });
    render(<BuilderWorkspace />);
    const campo = screen.getByPlaceholderText(/construa com o agente nex/i);
    fireEvent.change(campo, { target: { value: "saldo por armazem" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));

    expect(screen.getByText("saldo por armazem")).toBeInTheDocument();
    expect(await screen.findByText("Montei a tabela de saldo.")).toBeInTheDocument();
    await waitFor(() => expect(construirRelatorio).toHaveBeenCalledTimes(1));
    expect(construirRelatorio.mock.calls[0][0]).toMatchObject({ prompt: "saldo por armazem" });
  });

  it("habilita abrir relatorio apos salvar e navega para a rota dinamica", async () => {
    construirRelatorio.mockResolvedValue({
      ok: true,
      ficha: FICHA,
      mensagem: "Pronto.",
      savedId: "sr1",
      etag: "e1",
    });
    render(<BuilderWorkspace />);
    fireEvent.change(screen.getByPlaceholderText(/construa com o agente nex/i), {
      target: { value: "saldo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    const abrir = await screen.findByRole("button", { name: /abrir relatorio/i });
    expect(abrir).toBeEnabled();
    fireEvent.click(abrir);
    expect(push).toHaveBeenCalledWith("/relatorios/d/sr1");
  });

  it("repassa a segunda chamada com savedId+etag para atualizar o mesmo rascunho", async () => {
    construirRelatorio
      .mockResolvedValueOnce({ ok: true, ficha: FICHA, mensagem: "1", savedId: "sr1", etag: "e1" })
      .mockResolvedValueOnce({ ok: true, ficha: FICHA, mensagem: "2", savedId: "sr1", etag: "e2" });
    render(<BuilderWorkspace />);
    const campo = screen.getByPlaceholderText(/construa com o agente nex/i);
    fireEvent.change(campo, { target: { value: "primeiro" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await screen.findByText("1");
    fireEvent.change(campo, { target: { value: "segundo" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await screen.findByText("2");
    expect(construirRelatorio.mock.calls[1][0]).toMatchObject({ savedId: "sr1", etag: "e1" });
  });
});

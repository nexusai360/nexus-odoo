/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { BuilderPreview } from "./builder-preview";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

const previsualizarSecoes = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/actions/builder", () => ({
  previsualizarSecoes: (...a: unknown[]) => previsualizarSecoes(...a),
}));
jest.mock("@/lib/actions/relatorio-filtros", () => ({
  listarDimensoesFiltro: jest.fn().mockResolvedValue({ armazens: [], familias: [] }),
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

beforeEach(() => previsualizarSecoes.mockReset());

describe("BuilderPreview", () => {
  it("mostra estado vazio quando nao ha ficha", () => {
    render(<BuilderPreview ficha={null} />);
    expect(screen.getByText(/o preview do relatorio aparece aqui/i)).toBeInTheDocument();
    expect(previsualizarSecoes).not.toHaveBeenCalled();
  });

  it("mostra aviso para ficha invalida e nao chama o servidor", () => {
    render(<BuilderPreview ficha={{ ...FICHA, titulo: "" }} />);
    expect(screen.getByText(/ainda nao da para visualizar/i)).toBeInTheDocument();
    expect(previsualizarSecoes).not.toHaveBeenCalled();
  });

  it("resolve e renderiza o relatorio para ficha valida", async () => {
    previsualizarSecoes.mockResolvedValue({
      tipo: "ok",
      dados: {
        "secao-1": {
          estado: "ok",
          dado: [{ produtoNome: "Halter 10kg" }],
        },
      },
    });
    render(<BuilderPreview ficha={FICHA} />);
    expect(await screen.findByText("Saldo por armazem")).toBeInTheDocument();
    await waitFor(() => expect(previsualizarSecoes).toHaveBeenCalledTimes(1));
  });
});

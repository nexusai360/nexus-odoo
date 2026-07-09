/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { BuilderWorkspace } from "./builder-workspace";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/actions/builder-conversation", () => ({
  getBuilderConversationMessages: jest.fn(async () => ({ ok: true, messages: [] })),
  arquivarBuilderConversaAction: jest.fn(async () => ({ ok: true })),
  exportarBuilderConversaTxt: jest.fn(async () => ({ ok: false, error: "vazio" })),
}));
jest.mock("@/lib/actions/builder", () => ({
  previsualizarSecoes: jest.fn(async () => ({ tipo: "ok", dados: {} })),
  salvarFichaEditada: jest.fn(async () => ({ ok: true, etag: "v2" })),
}));
jest.mock("@/lib/actions/relatorio-filtros", () => ({
  listarDimensoesFiltro: jest.fn().mockResolvedValue({ armazens: [], familias: [] }),
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => push.mockReset());

describe("BuilderWorkspace", () => {
  it("conversa nova abre na ENTREVISTA imersiva (sem card/header, sem preview, sem 'Abrir relatorio')", () => {
    render(<BuilderWorkspace />);
    // Tela limpa: composer presente (a IA ja saudou via mensagem canned).
    expect(screen.getByPlaceholderText(/construa com o agente nex/i)).toBeInTheDocument();
    // Fase entrevista: NAO mostra o preview 2-pane.
    expect(screen.queryByText(/o preview do relatorio aparece aqui/i)).not.toBeInTheDocument();
    // Sem o header do workspace (que so existe no refino).
    expect(screen.queryByRole("button", { name: /abrir relatorio/i })).not.toBeInTheDocument();
  });

  it("relatorio salvo abre no REFINO (2-pane com preview), 'Abrir relatorio' navega para /relatorios-2/d/<id>", () => {
    render(
      <BuilderWorkspace
        initialSavedId="sr-1"
        initialFicha={{
          id: "rascunho",
          titulo: "Saldo",
          dominio: "estoque",
          schemaVersion: 1,
          tipo: "tela_cheia",
          parametros: [],
          secoes: [],
        }}
      />,
    );
    const abrir = screen.getByRole("button", { name: /abrir relatorio/i });
    expect(abrir).not.toBeDisabled();
    abrir.click();
    expect(push).toHaveBeenCalledWith("/relatorios-2/d/sr-1");
  });
});

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
  it("renderiza chat (welcome) + preview vazio e 'Abrir relatorio' desabilitado sem ficha", () => {
    render(<BuilderWorkspace />);
    expect(screen.getByText(/construa com o agente nex/i)).toBeInTheDocument();
    expect(screen.getByText(/o preview do relatorio aparece aqui/i)).toBeInTheDocument();
    const abrir = screen.getByRole("button", { name: /abrir relatorio/i });
    expect(abrir).toBeDisabled();
  });

  it("habilita 'Abrir relatorio' e navega para /relatorios-2/d/<id> quando ha ficha salva", () => {
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

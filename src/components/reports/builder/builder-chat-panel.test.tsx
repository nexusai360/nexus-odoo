/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { BuilderChatPanel } from "./builder-chat-panel";

// Actions sao server-only; mock para o jsdom nao puxar prisma/auth.
jest.mock("@/lib/actions/builder-conversation", () => ({
  getBuilderConversationMessages: jest.fn(async () => ({ ok: true, messages: [] })),
  arquivarBuilderConversaAction: jest.fn(async () => ({ ok: true })),
  exportarBuilderConversaTxt: jest.fn(async () => ({ ok: false, error: "vazio" })),
}));

// ResizeObserver nao existe no jsdom.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const noop = () => {};

describe("BuilderChatPanel", () => {
  it("mostra o welcome e o composer quando nao ha conversa", () => {
    render(
      <BuilderChatPanel
        conversationId={null}
        onConversationCreated={noop}
        onCleared={noop}
        onDone={noop}
      />,
    );
    expect(screen.getByText(/construa com o agente nex/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/construa com o agente nex/i)).toBeInTheDocument();
    // Header com o menu de 3 pontos.
    expect(screen.getByRole("button", { name: /mais opcoes/i })).toBeInTheDocument();
  });

  it("abre o menu de 3 pontos com Limpar conversa e Baixar .txt", () => {
    render(
      <BuilderChatPanel
        conversationId={null}
        onConversationCreated={noop}
        onCleared={noop}
        onDone={noop}
        podeExportar
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /mais opcoes/i }));
    expect(screen.getByRole("menuitem", { name: /limpar conversa/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /baixar conversa/i })).toBeInTheDocument();
  });
});

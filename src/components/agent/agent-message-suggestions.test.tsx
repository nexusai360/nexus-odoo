/** @jest-environment jsdom */
/**
 * B2. Sugestões DENTRO da bolha (chevron igual ao Raciocínio) + selo "usada"
 * na sugestão clicada. Bloco gated: só renderiza com a prop `suggestions`.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentMessage } from "./agent-message";

describe("AgentMessage (sugestões na bolha)", () => {
  test("sem a prop suggestions, nenhum bloco de Sugestões aparece", () => {
    render(<AgentMessage role="assistant" content="resposta" reveal={false} />);
    expect(screen.queryByText(/Sugestões ·/)).toBeNull();
  });

  test("header colapsado mostra contagem; expande e revela os chips", async () => {
    const user = userEvent.setup();
    render(
      <AgentMessage
        role="assistant"
        content="resposta"
        reveal={false}
        suggestions={["Ver estoque", "Ver financeiro"]}
        clickedSuggestion="Ver estoque"
      />,
    );

    const header = screen.getByRole("button", { name: /Sugestões ·/ });
    // singular/plural: 2 sugestões
    expect(header.textContent).toContain("2 sugestões");
    // começa colapsado: chips ainda não no DOM
    expect(screen.queryByText("Ver financeiro")).toBeNull();

    await user.click(header);

    expect(screen.getByText("Ver estoque")).toBeDefined();
    expect(screen.getByText("Ver financeiro")).toBeDefined();
  });

  test("a sugestão clicada ganha o selo 'usada'; as demais não", async () => {
    const user = userEvent.setup();
    render(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        suggestions={["Ver estoque", "Ver financeiro"]}
        clickedSuggestion="Ver estoque"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Sugestões ·/ }));

    // selo "usada" aparece exatamente uma vez (na clicada)
    expect(screen.getAllByText("usada")).toHaveLength(1);
  });

  test("sem clickedSuggestion, nenhum selo 'usada'", async () => {
    const user = userEvent.setup();
    render(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        suggestions={["A", "B"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Sugestões ·/ }));
    expect(screen.queryByText("usada")).toBeNull();
  });

  test("lâmpada só aparece quando alguma sugestão foi clicada", () => {
    const { rerender } = render(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        suggestions={["A", "B"]}
      />,
    );
    // ninguém clicou: sem lâmpada acesa
    expect(screen.queryByLabelText("Uma sugestão foi clicada")).toBeNull();

    rerender(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        suggestions={["A", "B"]}
        clickedSuggestion="A"
      />,
    );
    // alguém clicou: lâmpada acesa presente
    expect(screen.getByLabelText("Uma sugestão foi clicada")).toBeDefined();
  });

  test("voto do usuário vira badge de canto (monitorVote)", () => {
    render(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        monitorVote={{ rating: "CORRETO" }}
      />,
    );
    expect(screen.getByLabelText("Voto do usuário: Correto")).toBeDefined();
  });

  test("singular: 1 sugestão", () => {
    render(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        suggestions={["Única"]}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Sugestões ·/ }).textContent,
    ).toContain("1 sugestão");
  });
});

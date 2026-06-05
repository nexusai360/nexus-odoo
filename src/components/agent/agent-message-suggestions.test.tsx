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

  test("a sugestão clicada é distinguida só por título/contraste (sem selo de texto)", async () => {
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

    // não há mais selo textual "usada"
    expect(screen.queryByText("usada")).toBeNull();
    // a clicada carrega o title indicador (acessibilidade), as demais não
    expect(screen.getByText("Ver estoque").getAttribute("title")).toBe(
      "Sugestão clicada pelo usuário",
    );
    expect(screen.getByText("Ver financeiro").getAttribute("title")).toBeNull();
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

  test("voto do usuário vira badge de canto (monitorVote), sem comentário", () => {
    render(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        monitorVote={{ rating: "CORRETO" }}
      />,
    );
    expect(screen.getByLabelText("Avaliação do usuário: Correto")).toBeDefined();
  });

  test("voto com comentário: badge vira clicável e revela o texto", async () => {
    const user = userEvent.setup();
    render(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        monitorVote={{ rating: "PARCIAL", comment: "faltou listar os negativos" }}
      />,
    );
    const badge = screen.getByRole("button", {
      name: /Avaliação do usuário: Parcial\. Tem comentário/,
    });
    // comentário escondido até clicar
    expect(screen.queryByText("faltou listar os negativos")).toBeNull();
    await user.click(badge);
    expect(screen.getByText("faltou listar os negativos")).toBeDefined();
  });

  test("perícia vira chip clicável só com ícone + status (sem a palavra Perícia)", () => {
    render(
      <AgentMessage
        role="assistant"
        content="r"
        reveal={false}
        monitorPericia={{ label: "Correto", color: "#10b981", href: "/x?eval=1" }}
      />,
    );
    // a palavra "Perícia" NÃO aparece como texto (só ícone + status)
    expect(screen.queryByText("Perícia")).toBeNull();
    expect(screen.getByText("Correto")).toBeDefined();
    // o nome completo vive no title (acessível)
    const link = screen.getByRole("link");
    expect(link).toHaveProperty("href");
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

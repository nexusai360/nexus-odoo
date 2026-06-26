/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BuilderModelCard } from "./builder-model-card";

const salvarModeloConstrutor = jest.fn();

jest.mock("@/lib/actions/builder-config", () => ({
  salvarModeloConstrutor: (...a: unknown[]) => salvarModeloConstrutor(...a),
}));

const MODELS = {
  openai: [
    { value: "gpt-5-mini", label: "GPT-5 mini" },
    { value: "gpt-5", label: "GPT-5" },
  ],
  anthropic: [{ value: "claude-haiku-4-5", label: "Claude Haiku 4.5" }],
};

function setup() {
  render(
    <BuilderModelCard
      initialProvider="openai"
      initialModel="gpt-5-mini"
      providers={["openai", "anthropic"]}
      modelsByProvider={MODELS}
    />,
  );
}

beforeEach(() => salvarModeloConstrutor.mockReset());

describe("BuilderModelCard", () => {
  it("mostra o modelo atual configurado", () => {
    setup();
    expect(screen.getByText("GPT-5 mini")).toBeInTheDocument();
  });

  it("salva o provider+model atuais ao clicar em salvar", async () => {
    salvarModeloConstrutor.mockResolvedValue({ ok: true });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /salvar modelo/i }));
    await waitFor(() =>
      expect(salvarModeloConstrutor).toHaveBeenCalledWith({
        provider: "openai",
        model: "gpt-5-mini",
      }),
    );
    expect(await screen.findByText(/salvo/i)).toBeInTheDocument();
  });

  it("mostra erro quando a gravacao falha", async () => {
    salvarModeloConstrutor.mockResolvedValue({ ok: false, error: "Acesso negado" });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /salvar modelo/i }));
    expect(await screen.findByText(/acesso negado/i)).toBeInTheDocument();
  });
});

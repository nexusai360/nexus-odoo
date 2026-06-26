/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { BuilderModelCard } from "./builder-model-card";
import type { ModelEntry } from "@/lib/agent/llm/catalog";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/actions/builder-config", () => ({
  salvarModeloConstrutor: jest.fn(async () => ({ ok: true })),
}));

const M = (id: string, label: string): ModelEntry =>
  ({
    id,
    provider: "openai",
    label,
    tier: "low",
    pricing: { inputPerMTok: 0.25, outputPerMTok: 2 },
    use: "conversação",
    audio: false,
    vision: true,
    deprecated: false,
  }) as ModelEntry;

const PROPS = {
  initial: { provider: "openai", model: "gpt-5-mini", credentialId: "cred-1" },
  providers: ["openai"] as ("openai" | "anthropic" | "gemini" | "openrouter")[],
  credentialsByProvider: {
    openai: [{ id: "cred-1", label: "Nexus", maskedSuffix: "••••DFYA" }],
  },
  modelsByProvider: {
    openai: [M("gpt-5-mini", "GPT-5 mini"), M("gpt-5", "GPT-5")],
  },
};

describe("BuilderModelCard (padrao router)", () => {
  it("mostra titulo e o modelo configurado, no padrao Provedor/Modelo/Chave", () => {
    render(<BuilderModelCard {...PROPS} />);
    expect(screen.getByText("Construtor de relatorios")).toBeInTheDocument();
    expect(screen.getByText("GPT-5 mini")).toBeInTheDocument();
    expect(screen.getByText("Provedor")).toBeInTheDocument();
    expect(screen.getByText("Modelo")).toBeInTheDocument();
    expect(screen.getByText("Chave de API")).toBeInTheDocument();
  });

  it("NAO tem botao salvar (aplica na hora, igual aos outros blocos)", () => {
    render(<BuilderModelCard {...PROPS} />);
    expect(screen.queryByRole("button", { name: /salvar modelo/i })).not.toBeInTheDocument();
  });

  it("mostra aviso quando nao ha provedor com chave", () => {
    render(<BuilderModelCard {...PROPS} providers={[]} credentialsByProvider={{}} />);
    expect(screen.getByText(/nenhuma chave de api cadastrada/i)).toBeInTheDocument();
  });
});

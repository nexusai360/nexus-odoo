/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/relatorios/saldo-produto",
  useSearchParams: () => new URLSearchParams("armazemId=1"),
}));

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock("@/lib/actions/report-presets", () => ({
  listarPresets: jest.fn(),
  criarPreset: jest.fn(),
  excluirPreset: jest.fn(),
  alternarFavorito: jest.fn(),
}));

import { listarPresets, criarPreset } from "@/lib/actions/report-presets";
import type { PresetItem } from "@/lib/actions/report-presets";
import { PresetsPopover } from "./presets-popover";
import { toast } from "sonner";

const mockListarPresets = jest.mocked(listarPresets);
const mockCriarPreset = jest.mocked(criarPreset);
const mockToast = jest.mocked(toast);

const samplePreset: PresetItem = {
  id: "p1",
  reportId: "saldo-produto",
  nome: "Preset Alpha",
  searchParams: "armazemId=1",
  favorito: false,
  criadoEm: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListarPresets.mockResolvedValue({ success: true, data: [] });
});

describe("PresetsPopover", () => {
  it("renderiza o botão Presets", () => {
    render(<PresetsPopover reportId="saldo-produto" />);
    expect(screen.getByRole("button", { name: /presets/i })).toBeInTheDocument();
  });

  it("não exibe badge quando não há presets", () => {
    render(<PresetsPopover reportId="saldo-produto" />);
    // badge não deve estar presente (nenhum número próximo ao texto)
    const btn = screen.getByRole("button", { name: /presets/i });
    expect(btn.textContent).not.toMatch(/\d/);
  });

  it("abre o popover ao clicar no botão", async () => {
    render(<PresetsPopover reportId="saldo-produto" />);
    fireEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() => {
      expect(screen.getByText("Meus presets")).toBeInTheDocument();
    });
  });

  it("exibe mensagem vazia quando não há presets", async () => {
    render(<PresetsPopover reportId="saldo-produto" />);
    fireEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() => {
      expect(screen.getByText(/nenhum preset salvo/i)).toBeInTheDocument();
    });
  });

  it("lista presets carregados do servidor", async () => {
    mockListarPresets.mockResolvedValue({
      success: true,
      data: [samplePreset],
    });
    render(<PresetsPopover reportId="saldo-produto" />);
    fireEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() => {
      expect(screen.getByText("Preset Alpha")).toBeInTheDocument();
    });
  });

  it("exibe campo de nome ao clicar em Salvar atual", async () => {
    render(<PresetsPopover reportId="saldo-produto" />);
    fireEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() => screen.getByText("Salvar atual"));
    fireEvent.click(screen.getByText("Salvar atual"));
    expect(screen.getByPlaceholderText("Nome do preset")).toBeInTheDocument();
  });

  it("exibe erro quando nome está vazio ao salvar", async () => {
    render(<PresetsPopover reportId="saldo-produto" />);
    fireEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() => screen.getByText("Salvar atual"));
    fireEvent.click(screen.getByText("Salvar atual"));
    fireEvent.click(screen.getByText("Salvar"));
    expect(screen.getByRole("alert")).toHaveTextContent(/nome obrigatório/i);
  });

  it("salva preset com sucesso e exibe toast", async () => {
    mockCriarPreset.mockResolvedValue({
      success: true,
      data: { ...samplePreset, nome: "Meu Preset" },
    });
    render(<PresetsPopover reportId="saldo-produto" />);
    fireEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() => screen.getByText("Salvar atual"));
    fireEvent.click(screen.getByText("Salvar atual"));
    fireEvent.change(screen.getByPlaceholderText("Nome do preset"), {
      target: { value: "Meu Preset" },
    });
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Preset salvo");
    });
  });

  it("exibe toast de erro quando salvar falha", async () => {
    mockCriarPreset.mockResolvedValue({
      success: false,
      error: "Erro ao salvar preset",
    });
    render(<PresetsPopover reportId="saldo-produto" />);
    fireEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() => screen.getByText("Salvar atual"));
    fireEvent.click(screen.getByText("Salvar atual"));
    fireEvent.change(screen.getByPlaceholderText("Nome do preset"), {
      target: { value: "Preset" },
    });
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Erro ao salvar preset");
    });
  });

  it("cancela a criação ao clicar em Cancelar", async () => {
    render(<PresetsPopover reportId="saldo-produto" />);
    fireEvent.click(screen.getByRole("button", { name: /presets/i }));
    await waitFor(() => screen.getByText("Salvar atual"));
    fireEvent.click(screen.getByText("Salvar atual"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(
      screen.queryByPlaceholderText("Nome do preset"),
    ).not.toBeInTheDocument();
  });
});

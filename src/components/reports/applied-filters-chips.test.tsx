/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppliedFiltersChips } from "./applied-filters-chips";

// Mock next/navigation
const mockPush = jest.fn();
const mockSearchParams = new URLSearchParams("armazemId=3&familiaId=5");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/relatorios/saldo-produto",
  useSearchParams: () => mockSearchParams,
}));

const chips = [
  { param: "armazemId", rotulo: "Armazém", valorLabel: "Galpão A" },
  { param: "familiaId", rotulo: "Família", valorLabel: "Cardio" },
];

describe("AppliedFiltersChips", () => {
  beforeEach(() => mockPush.mockClear());

  it("não renderiza quando não há chips", () => {
    const { container } = render(<AppliedFiltersChips chips={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza um chip por filtro com rótulo e valor", () => {
    render(<AppliedFiltersChips chips={chips} />);
    expect(screen.getByText(/Armazém:/)).toBeInTheDocument();
    expect(screen.getByText(/Cardio/)).toBeInTheDocument();
  });

  it("exibe botão 'Limpar todos' apenas quando há mais de 1 chip", () => {
    render(<AppliedFiltersChips chips={chips} />);
    expect(screen.getByLabelText("Limpar todos os filtros")).toBeInTheDocument();
  });

  it("não exibe 'Limpar todos' com apenas 1 chip", () => {
    render(<AppliedFiltersChips chips={[chips[0]!]} />);
    expect(
      screen.queryByLabelText("Limpar todos os filtros"),
    ).not.toBeInTheDocument();
  });

  it("remove o param correto ao clicar no X de um chip", () => {
    render(<AppliedFiltersChips chips={chips} />);
    fireEvent.click(screen.getByLabelText("Remover filtro Armazém"));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/relatorios/saldo-produto"),
    );
    const url = mockPush.mock.calls[0][0] as string;
    // armazemId removido, familiaId preservado
    expect(url).not.toContain("armazemId");
    expect(url).toContain("familiaId");
  });

  it("remove todos os params ao clicar em 'Limpar todos'", () => {
    render(<AppliedFiltersChips chips={chips} />);
    fireEvent.click(screen.getByLabelText("Limpar todos os filtros"));
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).not.toContain("armazemId");
    expect(url).not.toContain("familiaId");
  });

  it("chip tem aria-label descritivo no botão X", () => {
    render(<AppliedFiltersChips chips={[chips[1]!]} />);
    expect(
      screen.getByLabelText("Remover filtro Família"),
    ).toBeInTheDocument();
  });
});

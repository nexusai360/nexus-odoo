/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { PeriodBar } from "./period-bar";
import type { PeriodoResolvido } from "@/lib/reports/periodo";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/relatorios/entradas-saidas",
  useSearchParams: () => new URLSearchParams("armazemId=7"),
}));

const PERIODO_3M: PeriodoResolvido = { preset: "3meses", de: null, ate: null };

describe("PeriodBar", () => {
  beforeEach(() => push.mockClear());

  it("renderiza 5 pílulas num radiogroup", () => {
    render(<PeriodBar periodo={PERIODO_3M} />);
    expect(screen.getByRole("radiogroup", { name: "Período" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("marca a pílula do preset ativo", () => {
    render(<PeriodBar periodo={PERIODO_3M} />);
    expect(
      screen.getByRole("radio", { name: "Últimos 3 meses" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Este mês" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("clicar numa pílula grava o período na URL preservando os demais params", () => {
    render(<PeriodBar periodo={PERIODO_3M} />);
    fireEvent.click(screen.getByRole("radio", { name: "Este mês" }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("periodo=mes");
    expect(url).toContain("armazemId=7");
  });

  it("trocar para um preset não deixa de/ate na URL", () => {
    const custom: PeriodoResolvido = {
      preset: "custom",
      de: "2026-01",
      ate: "2026-03",
    };
    render(<PeriodBar periodo={custom} />);
    fireEvent.click(screen.getByRole("radio", { name: "Tudo" }));
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("periodo=tudo");
    expect(url).not.toContain("de=");
    expect(url).not.toContain("ate=");
  });
});

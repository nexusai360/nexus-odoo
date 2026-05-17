/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ReportFilters } from "./report-filters";
import type { ReportFilter } from "@/lib/reports/types";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/relatorios/saldo-produto",
  useSearchParams: () => new URLSearchParams(""),
}));

describe("ReportFilters", () => {
  it("renderiza um controle por filtro declarado", () => {
    const filtros: ReportFilter[] = [{ tipo: "armazem" }];
    render(
      <ReportFilters
        filtros={filtros}
        options={{ armazens: [], familias: [] }}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("não renderiza nada quando não há filtros", () => {
    const { container } = render(
      <ReportFilters filtros={[]} options={{ armazens: [], familias: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

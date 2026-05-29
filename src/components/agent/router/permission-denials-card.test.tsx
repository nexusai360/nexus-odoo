/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

// O grafico usa recharts (ResizeObserver/SVG); mock leve para o jsdom.
jest.mock("@/components/charts/interactive/bar-chart", () => ({
  InteractiveBarChart: (props: { data: Array<{ name: string }> }) => (
    <div data-testid="bar-chart" data-bars={props.data.length} />
  ),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { PermissionDenialsCard } from "./permission-denials-card";
import type { PermissionDenialStats } from "@/lib/actions/agent-permission-denials";

const EMPTY: PermissionDenialStats = { total: 0, byDomain: [], recent: [] };

describe("PermissionDenialsCard", () => {
  it("estado vazio mostra mensagem e nao renderiza chart", () => {
    render(<PermissionDenialsCard stats={EMPTY} period="7d" />);
    expect(screen.getByText(/Nenhuma recusa no período/i)).toBeInTheDocument();
    expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
  });

  it("uma recusa: KPI total = 1 e chart com 1 barra", () => {
    const stats: PermissionDenialStats = {
      total: 1,
      byDomain: [{ domain: "financeiro", label: "Financeiro", count: 1 }],
      recent: [
        {
          userId: "u1",
          userName: "Ana",
          questionSnippet: "saldo bancário?",
          deniedDomains: ["financeiro"],
          timestamp: new Date("2026-05-29T10:00:00Z"),
        },
      ],
    };
    render(<PermissionDenialsCard stats={stats} period="24h" />);
    // total, modulos distintos e usuarios recentes valem todos 1 neste caso.
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Recusas \(24h\)/i)).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-bars", "1");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("saldo bancário?")).toBeInTheDocument();
  });

  it("varias recusas: KPI total reflete soma e tabela lista usuarios", () => {
    const stats: PermissionDenialStats = {
      total: 5,
      byDomain: [
        { domain: "financeiro", label: "Financeiro", count: 3 },
        { domain: "fiscal", label: "Fiscal", count: 2 },
      ],
      recent: [
        {
          userId: "u1",
          userName: "Ana",
          questionSnippet: "pergunta 1",
          deniedDomains: ["financeiro"],
          timestamp: new Date("2026-05-29T10:00:00Z"),
        },
        {
          userId: "u2",
          userName: "Bruno",
          questionSnippet: "pergunta 2",
          deniedDomains: ["fiscal"],
          timestamp: new Date("2026-05-29T09:00:00Z"),
        },
      ],
    };
    render(<PermissionDenialsCard stats={stats} period="30d" />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart")).toHaveAttribute("data-bars", "2");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
  });
});

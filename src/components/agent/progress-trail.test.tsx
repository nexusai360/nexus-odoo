/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { ProgressTrail, type ProgressStep } from "./progress-trail";

describe("ProgressTrail", () => {
  test("passo running mostra 'Consultando', concluído mostra 'Consultou'", () => {
    const steps: ProgressStep[] = [
      { id: "1", label: "faturamento", state: "done" },
      { id: "2", label: "estoque", state: "running" },
    ];
    render(<ProgressTrail steps={steps} />);
    expect(screen.getByText(/Consultou faturamento/)).toBeDefined();
    expect(screen.getByText(/Consultando estoque/)).toBeDefined();
  });

  test("não expõe id técnico nem a sigla MCP", () => {
    const { container } = render(
      <ProgressTrail
        steps={[{ id: "1", label: "faturamento", state: "done" }]}
      />,
    );
    expect(container.textContent).not.toContain("_");
    expect(container.textContent ?? "").not.toContain("MCP");
  });

  test("com muitos passos, colapsa o meio", () => {
    const steps: ProgressStep[] = Array.from({ length: 7 }, (_, i) => ({
      id: String(i),
      label: "estoque",
      state: "done" as const,
    }));
    render(<ProgressTrail steps={steps} />);
    expect(screen.getByText(/e mais 4 etapas/)).toBeDefined();
  });

  test("lista vazia não renderiza nada", () => {
    const { container } = render(<ProgressTrail steps={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

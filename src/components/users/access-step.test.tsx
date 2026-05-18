/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccessStep } from "./access-step";

// jsdom não implementa PointerEvent; o Checkbox do base-ui o dispara no clique.
if (typeof PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {}
  // @ts-expect-error polyfill mínimo para o ambiente de teste
  global.PointerEvent = PointerEventPolyfill;
}

describe("AccessStep", () => {
  it("renderiza um checkbox por domínio", () => {
    render(
      <AccessStep
        selected={[]}
        onChange={() => {}}
        grantable={["estoque", "financeiro", "fiscal", "comercial"]}
      />,
    );
    // AccessStep renderiza um checkbox por domínio de REPORT_DOMAINS (9),
    // independentemente de quantos estão em `grantable`.
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);
  });
  it("desabilita os domínios não concedíveis", () => {
    render(
      <AccessStep selected={[]} onChange={() => {}} grantable={["estoque"]} />,
    );
    const estoque = screen.getByRole("checkbox", { name: /estoque/i });
    const fiscal = screen.getByRole("checkbox", { name: /fiscal/i });
    expect(estoque).not.toHaveAttribute("aria-disabled", "true");
    expect(fiscal).toHaveAttribute("aria-disabled", "true");
  });
  it("dispara onChange ao marcar um domínio", () => {
    const onChange = jest.fn();
    render(
      <AccessStep selected={[]} onChange={onChange} grantable={["estoque"]} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /estoque/i }));
    expect(onChange).toHaveBeenCalledWith(["estoque"]);
  });
  it("exibe aviso quando nenhum domínio está selecionado", () => {
    render(
      <AccessStep selected={[]} onChange={() => {}} grantable={["estoque"]} />,
    );
    expect(screen.getByText(/não verá nenhum relatório/i)).toBeInTheDocument();
  });
});

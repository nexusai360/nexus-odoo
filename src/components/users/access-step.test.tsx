/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccessStep } from "./access-step";

describe("AccessStep", () => {
  it("renderiza um checkbox por domínio", () => {
    render(
      <AccessStep
        selected={[]}
        onChange={() => {}}
        grantable={["estoque", "financeiro", "fiscal", "comercial"]}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });
  it("desabilita os domínios não concedíveis", () => {
    render(
      <AccessStep selected={[]} onChange={() => {}} grantable={["estoque"]} />,
    );
    const estoque = screen.getByRole("checkbox", { name: /estoque/i });
    const fiscal = screen.getByRole("checkbox", { name: /fiscal/i });
    expect(estoque).toBeEnabled();
    expect(fiscal).toBeDisabled();
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

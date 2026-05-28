/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { AccessDeniedBanner } from "./access-denied-banner";

describe("AccessDeniedBanner", () => {
  it("mostra mensagem de Usuarios quando denied=admin", () => {
    render(<AccessDeniedBanner kind="denied" role="admin" />);
    expect(
      screen.getByText(/não tem permissão para acessar Usuários/i),
    ).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeNull();
  });

  it("mostra mensagem generica quando denied=super_admin", () => {
    render(<AccessDeniedBanner kind="denied" role="super_admin" />);
    expect(
      screen.getByText(/não tem permissão para acessar essa área/i),
    ).not.toBeNull();
  });

  it("mostra mensagem de no_domains", () => {
    render(<AccessDeniedBanner kind="no_domains" />);
    expect(
      screen.getByText(/acesso aos relatórios ainda não foi configurado/i),
    ).not.toBeNull();
  });

  it("dismiss esconde o banner", () => {
    render(<AccessDeniedBanner kind="no_domains" />);
    expect(screen.queryByRole("alert")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

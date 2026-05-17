/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomRangePopover } from "./custom-range-popover";
import type { PeriodoResolvido } from "@/lib/reports/periodo";

/**
 * O Positioner do Popover do base-ui depende de layout real e quebra no jsdom.
 * Mock fiel do wrapper `ui/popover`: preserva o estado `open`/`onOpenChange`
 * controlado (gatilho abre; conteúdo aparece só quando aberto), exercitando
 * toda a lógica do CustomRangePopover sem o posicionamento de terceiros.
 */
jest.mock("@/components/ui/popover", () => {
  const React = require("react");
  const Ctx = React.createContext({ open: false, onOpenChange: () => {} });
  return {
    Popover: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (v: boolean) => void;
      children: React.ReactNode;
    }) =>
      React.createElement(Ctx.Provider, { value: { open, onOpenChange } }, children),
    PopoverTrigger: ({ render }: { render: React.ReactElement }) => {
      const { onOpenChange } = React.useContext(Ctx);
      return React.cloneElement(render, { onClick: () => onOpenChange(true) });
    },
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = React.useContext(Ctx);
      return open ? React.createElement("div", null, children) : null;
    },
  };
});

const PERIODO_3M: PeriodoResolvido = { preset: "3meses", de: null, ate: null };

function abrir(onAplicar = jest.fn()) {
  render(
    <CustomRangePopover periodo={PERIODO_3M} onAplicar={onAplicar}>
      <button type="button">Personalizado</button>
    </CustomRangePopover>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
  return onAplicar;
}

describe("CustomRangePopover", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-17T12:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("abre o popover com a grade de 12 meses", () => {
    abrir();
    for (const mes of ["janeiro", "junho", "dezembro"]) {
      expect(
        screen.getByRole("button", { name: `${mes} de 2026` }),
      ).toBeInTheDocument();
    }
  });

  it("Aplicar começa desabilitado sem intervalo", () => {
    abrir();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  it("desabilita meses futuros", () => {
    abrir();
    // Mês corrente fixado em 2026-05 → julho/2026 é futuro.
    expect(
      screen.getByRole("button", { name: "julho de 2026" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "março de 2026" }),
    ).not.toBeDisabled();
  });

  it("seleciona dois meses e aplica em ordem crescente", () => {
    const onAplicar = abrir();
    fireEvent.click(screen.getByRole("button", { name: "março de 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "janeiro de 2026" }));
    const aplicar = screen.getByRole("button", { name: "Aplicar" });
    expect(aplicar).toBeEnabled();
    fireEvent.click(aplicar);
    expect(onAplicar).toHaveBeenCalledWith("2026-01", "2026-03");
  });
});

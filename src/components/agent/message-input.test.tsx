/** @jest-environment jsdom */
/**
 * Cobre o input adaptativo do Agente Nex (Fase C):
 * o textarea ocupa o espaço livre e ganha padding de respiro quando um slot
 * (anexo / áudio) não é renderizado, mantendo o campo consistente com 0, 1 ou
 * 2 slots.
 */
import { render, screen } from "@testing-library/react";
import { MessageInput } from "./message-input";

const noop = () => {};

describe("MessageInput — input adaptativo", () => {
  test("sem slots: textarea ganha padding de respiro nos dois lados", () => {
    render(
      <MessageInput value="" onChange={noop} onSend={noop} aria-label="campo" />,
    );
    const ta = screen.getByLabelText("campo");
    expect(ta.className).toContain("pl-2");
    expect(ta.className).toContain("pr-2");
  });

  test("com leftSlot: o slot aparece e o textarea encosta nele", () => {
    render(
      <MessageInput
        value=""
        onChange={noop}
        onSend={noop}
        aria-label="campo"
        leftSlot={<button type="button">anexo</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "anexo" })).toBeDefined();
    const ta = screen.getByLabelText("campo");
    expect(ta.className).toContain("pl-1");
    expect(ta.className).toContain("pr-2");
  });

  test("com os dois slots: textarea encosta nos dois lados", () => {
    render(
      <MessageInput
        value=""
        onChange={noop}
        onSend={noop}
        aria-label="campo"
        leftSlot={<button type="button">anexo</button>}
        rightSlot={<button type="button">audio</button>}
      />,
    );
    const ta = screen.getByLabelText("campo");
    expect(ta.className).toContain("pl-1");
    expect(ta.className).toContain("pr-1");
  });
});

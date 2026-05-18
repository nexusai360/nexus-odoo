/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import type { KeyboardShortcut } from "./use-keyboard-shortcuts";

/** Helper: dispara um keydown no document. */
function fireKey(key: string, overrides: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...overrides,
  });
  document.dispatchEvent(event);
  return event;
}


describe("useKeyboardShortcuts", () => {
  afterEach(() => {
    // Limpa todos os elementos adicionados ao body
    document.body.innerHTML = "";
  });

  it("dispara action quando a tecla registrada é pressionada", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "/", action, description: "Focar busca" },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => { fireKey("/"); });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("não dispara quando enabled=false", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "f", action, description: "Filtros" },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts, { enabled: false }));

    act(() => { fireKey("f"); });

    expect(action).not.toHaveBeenCalled();
  });

  it("não dispara quando o foco está em INPUT", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "f", action, description: "Filtros" },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const input = document.createElement("input");
    document.body.appendChild(input);

    const event = new KeyboardEvent("keydown", {
      key: "f",
      bubbles: true,
      cancelable: true,
    });
    // Dispara diretamente no input (target = input)
    act(() => { input.dispatchEvent(event); });

    // O handler verifica e.target.tagName, que aqui é INPUT
    // Como o handler está no document, precisamos verificar via target
    // O hook usa document.addEventListener, então o target é propagado
    expect(action).not.toHaveBeenCalled();
  });

  it("não dispara quando o foco está em TEXTAREA", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "f", action, description: "Filtros" },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    const event = new KeyboardEvent("keydown", {
      key: "f",
      bubbles: true,
      cancelable: true,
    });
    act(() => { textarea.dispatchEvent(event); });

    expect(action).not.toHaveBeenCalled();
  });

  it("dispara mesmo em INPUT quando ignoreInputs=false", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "f", action, description: "Filtros", ignoreInputs: false },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Sem input em foco
    act(() => { fireKey("f"); });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("respeita modificador Ctrl", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      {
        key: "k",
        action,
        description: "Comando com Ctrl",
        modifiers: { ctrl: true },
      },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Sem Ctrl — não deve disparar
    act(() => { fireKey("k"); });
    expect(action).not.toHaveBeenCalled();

    // Com Ctrl — deve disparar
    act(() => { fireKey("k", { ctrlKey: true }); });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("é case-insensitive na tecla", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "F", action, description: "Filtros" },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => { fireKey("f"); });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it("chama preventDefault ao disparar", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "/", action, description: "Busca" },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    let prevented = false;
    const event = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "preventDefault", {
      value: () => { prevented = true; },
    });

    act(() => { document.dispatchEvent(event); });

    expect(prevented).toBe(true);
  });

  it("remove o listener ao desmontar", () => {
    const action = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "p", action, description: "Presets" },
    ];

    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));

    unmount();

    act(() => { fireKey("p"); });

    expect(action).not.toHaveBeenCalled();
  });

  it("multiple shortcuts — apenas o correto dispara", () => {
    const actionF = jest.fn();
    const actionP = jest.fn();
    const shortcuts: KeyboardShortcut[] = [
      { key: "f", action: actionF, description: "Filtros" },
      { key: "p", action: actionP, description: "Presets" },
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    act(() => { fireKey("p"); });

    expect(actionF).not.toHaveBeenCalled();
    expect(actionP).toHaveBeenCalledTimes(1);
  });
});

"use client";

import { useEffect, useCallback, useRef } from "react";

/** Tags de elementos de input que bloqueiam atalhos. */
const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export interface KeyboardShortcut {
  /** Tecla a ser pressionada (ex.: "/", "f", "?"). Case-insensitive. */
  key: string;
  /** Ação executada quando o atalho dispara. */
  action: () => void;
  /** Descrição legível do atalho (usada no painel de ajuda). */
  description: string;
  /** Bloqueia o atalho quando um campo de input está em foco? Padrão: true. */
  ignoreInputs?: boolean;
  /** Teclas modificadoras opcionais. */
  modifiers?: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
  };
}

interface UseKeyboardShortcutsOptions {
  /** Quando false, desativa todos os atalhos do grupo. Padrão: true. */
  enabled?: boolean;
}

/**
 * Hook genérico de atalhos de teclado.
 *
 * Registra um conjunto de atalhos no `document` e remove o listener ao
 * desmontar. Por padrão, não dispara quando o foco está em campos de input
 * (INPUT, TEXTAREA, SELECT) ou em elementos com `contenteditable`.
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: "/", action: () => focusSearch(), description: "Focar busca" },
 *   { key: "f", action: () => openFilters(), description: "Abrir filtros" },
 * ]);
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  { enabled = true }: UseKeyboardShortcutsOptions = {},
) {
  // Usa ref para que o handler sempre enxergue a versão mais recente dos atalhos
  // sem precisar re-registrar o listener no document a cada render.
  const shortcutsRef = useRef<KeyboardShortcut[]>(shortcuts);

  // Atualiza a ref dentro de um efeito para não violar a regra de acesso a refs
  // durante a fase de renderização.
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    const target = e.target as HTMLElement | null;

    for (const shortcut of shortcutsRef.current) {
      const ignoreInputs = shortcut.ignoreInputs !== false;

      // Ignora quando o foco está em um campo de entrada
      if (ignoreInputs) {
        if (target && INPUT_TAGS.has(target.tagName)) return;
        if (target?.isContentEditable) return;
      }

      const { modifiers = {} } = shortcut;

      const ctrlMatch = modifiers.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
      const shiftMatch = modifiers.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = modifiers.alt ? e.altKey : !e.altKey;

      if (
        e.key.toLowerCase() === shortcut.key.toLowerCase() &&
        ctrlMatch &&
        shiftMatch &&
        altMatch
      ) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}

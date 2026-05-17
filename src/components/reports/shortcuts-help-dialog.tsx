"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { KeyboardShortcut } from "@/hooks/use-keyboard-shortcuts";

interface ShortcutsHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: KeyboardShortcut[];
}

/** Formata a exibição visual de uma tecla de atalho. */
function KeyBadge({ shortcut }: { shortcut: KeyboardShortcut }) {
  const { key, modifiers = {} } = shortcut;
  const keys: string[] = [];

  if (modifiers.ctrl) keys.push("Ctrl");
  if (modifiers.alt) keys.push("Alt");
  if (modifiers.shift) keys.push("Shift");

  // Nomes legíveis para teclas especiais
  const keyLabel = key === "?" ? "?" : key === "/" ? "/" : key.toUpperCase();
  keys.push(keyLabel);

  return (
    <span className="flex items-center gap-1" aria-label={keys.join(" + ")}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-foreground shadow-[0_1px_0_0_hsl(var(--border))]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/**
 * Diálogo que lista todos os atalhos de teclado registrados na tela.
 * Aberto com a tecla `?`.
 */
export function ShortcutsHelpDialog({
  open,
  onOpenChange,
  shortcuts,
}: ShortcutsHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="shortcuts-desc">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription id="shortcuts-desc">
            Atalhos disponíveis nesta tela. Não funcionam quando um campo de
            texto está em foco.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border/50" role="list">
          {shortcuts.map((s, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="text-sm text-foreground">{s.description}</span>
              <KeyBadge shortcut={s} />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

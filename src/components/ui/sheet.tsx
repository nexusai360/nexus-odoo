"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Sheet — drawer lateral genérico (lado direito).
 *
 * Comportamento:
 * - Wrapper sobre `Dialog` da `@base-ui/react/dialog` (focus trap + body scroll
 *   lock nativos).
 * - Slide-in pela direita via framer-motion (spring); em `< 640 px` ocupa
 *   `w-full` (max-sm).
 * - Backdrop com blur sutil (z-index 1890); popup z-index 1900.
 * - ESC fecha (cumpre `escape-routes` / `modal-escape`); clique fora também.
 * - Header / Body / Footer expostos como subcomponentes para layout flexível.
 */

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  /** Largura do drawer em px. Default 360. */
  width?: number;
}

export function Sheet({
  open,
  onOpenChange,
  children,
  className,
  width = 360,
}: SheetProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <BaseDialog.Portal keepMounted={false}>
            <BaseDialog.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[1890] bg-black/50 backdrop-blur-sm"
                />
              }
            />
            <BaseDialog.Popup
              aria-modal="true"
              render={
                <motion.aside
                  role="dialog"
                  aria-modal="true"
                  initial={{ x: width }}
                  animate={{ x: 0 }}
                  exit={{ x: width }}
                  transition={{ type: "spring", damping: 32, stiffness: 280 }}
                  style={{ width }}
                  className={cn(
                    "fixed inset-y-0 right-0 z-[1900] flex max-w-full flex-col border-l border-border bg-card shadow-2xl shadow-black/40 outline-none",
                    "max-sm:!w-full",
                    className,
                  )}
                />
              }
            >
              {children}
            </BaseDialog.Popup>
          </BaseDialog.Portal>
        ) : null}
      </AnimatePresence>
    </BaseDialog.Root>
  );
}

export function SheetHeader({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0 flex-1 font-heading text-base font-semibold text-foreground">
        {children}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function SheetBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)}>
      {children}
    </div>
  );
}

export function SheetFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

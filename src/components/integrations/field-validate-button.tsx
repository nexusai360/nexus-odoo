"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Botão "certinho" de validação ao lado de um campo (F5.1). Roxo enquanto o
 * valor ainda não é válido (e ao clicar revela o erro abaixo); verde quando o
 * campo está válido, dando o feedback positivo. A validação em si vive no campo;
 * este botão só dispara o "touched" e reflete o estado.
 */
export function FieldValidateButton({
  valid,
  onClick,
  label,
}: {
  valid: boolean;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors",
        valid
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
      )}
    >
      <Check className="h-4 w-4" aria-hidden />
    </button>
  );
}

"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estado visual do botão de confirmação do campo. */
export type FieldConfirmVariant = "idle" | "pending" | "confirmed" | "error";

/**
 * Botão de confirmação ao lado de um campo (F5.1), no espírito do "+" do perfil:
 * o valor digitado só é "aplicado" quando o usuário clica aqui (gerando um toast).
 * Enquanto não confirma, o valor não vale (some ao sair do campo). Estados (tudo
 * em roxo, sem verde, para não variar de cor):
 *  - `pending`  : há alteração a confirmar , roxo PREENCHIDO com o "certinho". Clicar aplica.
 *  - `confirmed`: já aplicado, sem alteração , roxo suave com o "certinho".
 *  - `error`    : valor inválido , vermelho com X. Clicar revela o erro.
 *  - `idle`     : roxo suave (não chega a aparecer , o botão some quando o campo está vazio).
 *
 * `onMouseDown` previne o blur do input: assim, clicar no botão confirma em vez de
 * disparar o "reverter ao sair do campo".
 */
export function FieldValidateButton({
  variant,
  onClick,
  label,
}: {
  variant: FieldConfirmVariant;
  onClick?: () => void;
  label: string;
}) {
  const Icon = variant === "error" ? X : Check;
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors",
        variant === "confirmed" && "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
        variant === "pending" &&
          "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        variant === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        variant === "idle" && "border-primary/40 bg-primary/10 text-primary",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

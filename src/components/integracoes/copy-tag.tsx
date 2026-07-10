"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Tag clicável que copia um valor para a área de transferência.
 *
 * Usada nos cards de webhook para os endereços (URL completa) e para o número
 * da empresa. Regras:
 *  - o TEXTO exibido pode ser formatado (ex.: `+55 61 99563-0029`);
 *  - o VALOR copiado é o `value` cru (ex.: só dígitos, no caso do telefone);
 *  - só trunca quando falta espaço de verdade (`min-w-0` + `truncate` no pai),
 *    nunca por largura fixa.
 */
export interface CopyTagProps {
  /** Texto exibido na tag. */
  children: React.ReactNode;
  /** Valor que vai para a área de transferência. */
  value: string;
  /** Rótulo acessível (ex.: "Copiar endereço de recebimento"). */
  label: string;
  className?: string;
}

export function CopyTag({ children, value, label, className }: CopyTagProps) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy(e: React.MouseEvent) {
    // O card inteiro pode ter clique próprio: a tag não propaga.
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponível: o valor continua visível para seleção manual
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={handleCopy}
            aria-label={label}
            className={cn(
              "inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-mono transition-colors",
              copied
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border bg-muted text-foreground hover:border-foreground/30 hover:bg-accent",
              className,
            )}
          />
        }
      >
        <span className="truncate">{children}</span>
        {copied && <Check className="h-3 w-3 shrink-0" aria-hidden />}
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copiado!" : label}</TooltipContent>
    </Tooltip>
  );
}

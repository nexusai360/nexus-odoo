"use client"

import * as React from "react"
import { Maximize2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

/**
 * Textarea do design system com botão de expandir em tela cheia (SPEC §3.1).
 *
 * Renderiza um `<Textarea>` normal com um botão-ícone `Maximize2` discreto no
 * canto superior-direito. Ao clicar, abre um `Dialog` largo e alto com o mesmo
 * conteúdo , o estado do texto (`value`/`onChange`) é controlado pelo pai, de
 * modo que a edição no modal e no campo compartilham o mesmo estado.
 */
export interface ExpandableTextareaProps {
  value: string
  onChange: (value: string) => void
  /** Rótulo do campo , também vira o título do modal. */
  label?: string
  placeholder?: string
  rows?: number
  disabled?: boolean
  id?: string
  /** Classes extras aplicadas ao `<textarea>` em ambos os contextos. */
  className?: string
  maxLength?: number
  "aria-describedby"?: string
}

export function ExpandableTextarea({
  value,
  onChange,
  label,
  placeholder,
  rows = 8,
  disabled = false,
  id,
  className,
  maxLength,
  "aria-describedby": ariaDescribedBy,
}: ExpandableTextareaProps) {
  const [open, setOpen] = React.useState(false)

  // Tamanho do modal proporcional ao maxLength do campo. Campos com muito
  // texto (50k+) abrem em tela quase cheia; campos curtos (1k) abrem menores
  // para não passar uma sensação de exagero.
  const modalSize = React.useMemo(() => {
    const cap = maxLength ?? Number.POSITIVE_INFINITY
    if (cap <= 1000) return "h-[42vh] w-[min(56vw,540px)]"
    if (cap <= 5000) return "h-[55vh] w-[min(70vw,720px)]"
    if (cap <= 10000) return "h-[72vh] w-[min(84vw,1000px)]"
    return "h-[90vh] w-[min(96vw,1400px)]"
  }, [maxLength])

  return (
    <div className="relative">
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        maxLength={maxLength}
        aria-describedby={ariaDescribedBy}
        className={cn("pr-10", className)}
      />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Expandir em tela cheia"
              disabled={disabled}
              onClick={() => setOpen(true)}
              className="absolute top-2 right-2 cursor-pointer text-muted-foreground hover:text-foreground"
            />
          }
        >
          <Maximize2 className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Expandir em tela cheia</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn("flex max-w-none sm:max-w-none flex-col", modalSize)}>
          <DialogHeader>
            <DialogTitle>{label ?? "Editar texto"}</DialogTitle>
          </DialogHeader>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <Textarea
              value={value}
              onChange={(e) => onChange(e.currentTarget.value)}
              placeholder={placeholder}
              disabled={disabled}
              maxLength={maxLength}
              autoFocus
              className={cn("h-full flex-1 resize-none pb-9", className)}
            />
            {maxLength !== undefined && (
              <div
                aria-live="polite"
                className={cn(
                  "pointer-events-none absolute bottom-2 right-3 inline-flex items-center gap-1 rounded-md border bg-card/90 px-2 py-0.5 text-[11px] font-medium tabular-nums backdrop-blur-sm transition-colors",
                  value.length >= maxLength
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : value.length / maxLength >= 0.9
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-border text-muted-foreground",
                )}
              >
                {value.length.toLocaleString("pt-BR")}/{maxLength.toLocaleString("pt-BR")}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

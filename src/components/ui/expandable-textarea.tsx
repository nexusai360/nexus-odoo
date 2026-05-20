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
 * conteúdo — o estado do texto (`value`/`onChange`) é controlado pelo pai, de
 * modo que a edição no modal e no campo compartilham o mesmo estado.
 */
export interface ExpandableTextareaProps {
  value: string
  onChange: (value: string) => void
  /** Rótulo do campo — também vira o título do modal. */
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
        <DialogContent className="flex h-[90vh] w-[min(96vw,1400px)] max-w-none flex-col">
          <DialogHeader>
            <DialogTitle>{label ?? "Editar texto"}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            autoFocus
            className={cn("h-full flex-1 resize-none", className)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input de mensagem compartilhado (SPEC §3.10 / §D8) , usado na bubble do
 * Agente Nex e no Playground.
 *
 * É um `<textarea>` de uma única linha que cresce conforme o usuário digita,
 * até `maxRows`, e então rola internamente. Enter envia; Shift+Enter quebra
 * linha. Aceita `slots` opcionais para botões à esquerda e à direita (anexo,
 * microfone, enviar).
 */
export interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  /** Disparado por Enter (sem Shift) ou por um botão de envio externo. */
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  /** Máximo de linhas antes de rolar internamente. Default 6. */
  maxRows?: number
  /** Slot renderizado à esquerda do campo (ex.: botão de anexo). */
  leftSlot?: React.ReactNode
  /** Slot renderizado à direita do campo (ex.: microfone + enviar). */
  rightSlot?: React.ReactNode
  className?: string
  id?: string
  "aria-label"?: string
}

export function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder,
  maxRows = 6,
  leftSlot,
  rightSlot,
  className,
  id,
  "aria-label": ariaLabel,
}: MessageInputProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  // Auto-grow: ajusta a altura ao conteúdo, limitado a maxRows.
  const resize = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    const cs = window.getComputedStyle(el)
    const lineHeight = parseFloat(cs.lineHeight) || 20
    const padding =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    const maxHeight = lineHeight * maxRows + padding
    const next = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [maxRows])

  React.useEffect(() => {
    resize()
  }, [value, resize])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && value.trim().length > 0) onSend()
    }
  }

  return (
    <div
      className={cn(
        // h-10 alinha verticalmente com o botão de enviar (h-10) por fora.
        "flex min-h-10 items-center gap-1 rounded-xl border border-input bg-background px-2 py-0 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        disabled && "opacity-60",
        className,
      )}
    >
      {leftSlot && <div className="flex shrink-0 items-center">{leftSlot}</div>}
      <textarea
        ref={ref}
        id={id}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex-1 resize-none self-center bg-transparent py-1.5 text-sm leading-5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
          // Input adaptativo: o textarea (flex-1) já ocupa o espaço livre quando
          // um slot some. O padding condicional garante que o texto não cole na
          // borda quando não há ícone adjacente, mantendo o campo visualmente
          // consistente com 0, 1 ou 2 slots.
          leftSlot ? "pl-1" : "pl-2",
          rightSlot ? "pr-1" : "pr-2",
        )}
      />
      {rightSlot && <div className="flex shrink-0 items-center gap-1">{rightSlot}</div>}
    </div>
  )
}

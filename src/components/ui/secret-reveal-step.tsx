"use client"

import * as React from "react"
import { Check, Copy, Eye, EyeOff, ShieldAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

/**
 * Passo de exibição de um segredo recém-gerado, exibido UMA ÚNICA VEZ
 * (SPEC §2.4). Pensado para ser o passo final de um wizard/modal de criação
 * de webhook, API key ou token, não uma tarja solta.
 *
 * Mostra o segredo num campo monospace read-only, com botões de copiar e de
 * ocultar/mostrar, e um botão de confirmação ("Já copiei") que dispara
 * `onAcknowledge`, quem fecha o fluxo.
 */
export interface SecretRevealStepProps {
  /** O segredo em claro a exibir. */
  secret: string
  /** Rótulo do campo (ex.: "Token", "Secret do webhook"). */
  label?: string
  /** Texto do botão de confirmação. Default "Concluir". */
  acknowledgeLabel?: string
  /** Disparado quando o usuário confirma que copiou o segredo. */
  onAcknowledge: () => void
  className?: string
}

export function SecretRevealStep({
  secret,
  label = "Segredo",
  acknowledgeLabel = "Concluir",
  onAcknowledge,
  className,
}: SecretRevealStepProps) {
  const [show, setShow] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard indisponível, o usuário ainda pode selecionar manualmente
    }
  }

  const masked = "•".repeat(Math.min(secret.length, 48))

  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            Copie agora, ele não aparece de novo
          </p>
          <p className="text-xs text-muted-foreground">
            Guarde em local seguro: não dá para ver depois de fechar.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-stretch gap-2">
          <code className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-input bg-background px-3 font-mono text-xs whitespace-nowrap">
            {show ? secret : masked}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={show ? "Ocultar segredo" : "Mostrar segredo"}
            onClick={() => setShow((s) => !s)}
            className="cursor-pointer"
          >
            {show ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copiar segredo"
            onClick={handleCopy}
            className="cursor-pointer"
          >
            {copied ? (
              <Check className="size-4 text-emerald-600 dark:text-emerald-500" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
        {copied && (
          <p className="text-xs text-emerald-600 dark:text-emerald-500">
            Copiado!
          </p>
        )}
      </div>

      <Button
        type="button"
        onClick={onAcknowledge}
        className="w-full cursor-pointer"
      >
        {acknowledgeLabel}
      </Button>
    </div>
  )
}

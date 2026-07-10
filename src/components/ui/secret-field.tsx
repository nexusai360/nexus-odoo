"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Campo de segredo RESERVADO: nasce mascarado, com botão de mostrar e de
 * copiar, dentro de um bloco de aviso. É o mesmo tratamento visual do
 * `SecretRevealStep`, mas sem o botão de confirmação , serve para exibir um
 * token dentro de uma etapa de formulário, não como passo final de um wizard.
 */
export interface SecretFieldProps {
  /** O segredo em claro. */
  secret: string;
  /** Rótulo do campo (ex.: "Token de recebimento"). */
  label: string;
  /** Explica para que serve o token. */
  descricao: string;
  /** Aviso destacado (validade, exibição única, etc.). */
  aviso: string;
  className?: string;
}

export function SecretField({ secret, label, descricao, aviso, className }: SecretFieldProps) {
  const [show, setShow] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível: o usuário ainda pode revelar e selecionar
    }
  }

  const masked = "•".repeat(Math.min(secret.length || 48, 48));

  return (
    <div
      className={cn("space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4", className)}
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="sr-only">{label}</Label>
        <div className="flex items-stretch gap-2">
          <code className="flex h-9 min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded-lg border border-input bg-background px-3 font-mono text-xs">
            {secret ? (show ? secret : masked) : "gerando…"}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={show ? "Ocultar token" : "Mostrar token"}
            disabled={!secret}
            onClick={() => setShow((s) => !s)}
            className="cursor-pointer"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copiar token"
            disabled={!secret}
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
        {copied && <p className="text-xs text-emerald-600 dark:text-emerald-500">Copiado!</p>}
      </div>

      <p className="text-xs text-amber-700 dark:text-amber-400">{aviso}</p>
    </div>
  );
}
